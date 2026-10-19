import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { canonicalJson } from "../domain/hash.ts";
import { verifyCitations } from "./citations.mjs";
import { doiFromUrl } from "./fetch.ts";
import { quoteOccurs, quotedSpans } from "./quotes.ts";
import { pagesContaining, pagesOf, readSource } from "./read.ts";

/**
 * The quote check (AGENTS.md §3.15: "every quoted passage found in the text
 * of its source"). For every evidence record and claim anchor that a change
 * adds or alters, each quoted span must occur verbatim in the text of the
 * source it cites, read as src/engine/read.ts reads it; a locator that names
 * a page must name the page the passage is on; and a new source's DOI or
 * arXiv id must resolve. Records already on the base were checked when they
 * entered. A record whose text could not be read enters only as
 * `provisional`, which carries no weight anywhere (AGENTS.md §4) and is not
 * checked here.
 *
 * Fail-closed: a span that is not found, a source that cannot be read, an
 * evidence record with no quoted span, a locator on the wrong page — each is
 * a failure, said plainly, and the change does not merge.
 */

interface Rec {
  id: string;
  [k: string]: unknown;
}
type Evidence = Rec & { sourceId: string; sourceStatement: string; exactLocator?: string; reviewState: string };
type Claim = Rec & { reviewState: string; sourceAnchor?: { locator: string; quote?: string; sourceId?: string; also?: { locator: string; quote: string }[] } };
type Source = Rec & { url?: string; archivedUrl?: string; identifier?: string; sourceType?: string; title?: string };

export interface Finding {
  case: string;
  record: string;
  problem: string;
}

export interface QuoteCheckResult {
  checked: { case: string; record: string; spans: number }[];
  failures: Finding[];
  warnings: Finding[];
}

const readYaml = (text: string | null): Rec[] => {
  if (!text) return [];
  const v = parseYaml(text);
  return Array.isArray(v) ? (v as Rec[]) : [];
};

/** A file as the base ref holds it, or null when the base has none. */
function atBase(base: string, file: string, root: string): string | null {
  try {
    return execFileSync("git", ["show", `${base}:${file}`], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return null;
  }
}

/** Records new on HEAD, or changed since the base, by id — compared by what `view` takes of them (all of a record by default). */
export function changedRecords<T extends Rec>(before: Rec[], after: Rec[], view: (r: Rec) => unknown = (r) => r): T[] {
  const was = new Map(before.map((r) => [r.id, canonicalJson(view(r))]));
  return after.filter((r) => was.get(r.id) !== canonicalJson(view(r))) as T[];
}

/** What a quoted passage is: its words, where it is said to be, and the source it is said to be in. A record whose
 *  passage did not change adds none, whatever else about it changed (a migration that drops a field quotes nothing). */
const evidencePassage = (r: Rec) => ({ statement: r.sourceStatement, locator: r.exactLocator, source: r.sourceId, state: r.reviewState });
const claimPassage = (r: Rec) => ({ anchor: r.sourceAnchor, state: r.reviewState });

/** The pages a locator names ("p. 12", "pp. 12–14", "page 7"), or null when it names none. */
export function locatorPages(locator: string | undefined): [number, number] | null {
  const m = /\b(?:pp?\.|pages?)\s*(\d+)(?:\s*[–—-]\s*(\d+))?/i.exec(locator ?? "");
  if (!m) return null;
  const lo = Number(m[1]);
  const hi = m[2] ? Number(m[2]) : lo;
  return hi >= lo ? [lo, hi] : [lo, lo];
}

/** The identifier a source carries as a DOI or an arXiv id, for resolution. */
export function citationOf(source: Source): { kind: "doi" | "arxiv"; id: string } | null {
  const id = String(source.identifier ?? "").trim();
  const doi = /^(?:doi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,9}\/\S+)$/i.exec(id)?.[1] ?? (source.url ? doiFromUrl(source.url) : null);
  if (doi) return { kind: "doi", id: doi };
  const arxiv = /(?:arxiv[:\s]*|arxiv\.org\/(?:abs|pdf)\/)(\d{4}\.\d{4,5})/i.exec(`${id} ${source.url ?? ""}`)?.[1];
  return arxiv ? { kind: "arxiv", id: arxiv } : null;
}

/** What to read for a source: its URL (or its archived copy), and its DOI so an open copy can be found. */
const targetOf = (source: Source) => {
  const c = citationOf(source);
  return { url: source.url ?? source.archivedUrl, doi: c?.kind === "doi" ? c.id : undefined };
};

export interface QuoteCheckOptions {
  base: string;
  root?: string;
  /** Test seam: the text of a source, or null with a reason. */
  read?: (source: Source) => Promise<{ text: string | null; reason?: string }>;
  /** Test seam: resolve citations. */
  resolve?: (cs: { kind: string; id: string }[]) => Promise<{ kind: string; id: string; status: string; note: string }[]>;
}

export async function quoteCheck(opts: QuoteCheckOptions): Promise<QuoteCheckResult> {
  const root = opts.root ?? process.cwd();
  const casesDir = path.join(root, "content", "cases");
  const result: QuoteCheckResult = { checked: [], failures: [], warnings: [] };
  const texts = new Map<string, Promise<{ text: string | null; reason?: string }>>();
  const read =
    opts.read ??
    (async (s: Source) => {
      const r = await readSource(targetOf(s), { root });
      if (r.ok) return { text: r.text };
      // A dead link is common and is not a missing source: the archived copy the record names is the same document.
      if (s.archivedUrl && s.archivedUrl !== s.url) {
        const archived = await readSource({ url: s.archivedUrl }, { root });
        if (archived.ok) return { text: archived.text };
        return { text: null, reason: `${r.reason ?? "not readable"}; its archived copy: ${archived.reason ?? "not readable"}` };
      }
      return { text: null, reason: r.reason ?? "not readable" };
    });
  const textOf = (s: Source) => {
    if (!texts.has(s.id)) texts.set(s.id, read(s));
    return texts.get(s.id)!;
  };

  for (const dir of fs.readdirSync(casesDir).filter((d) => fs.statSync(path.join(casesDir, d)).isDirectory())) {
    const file = (name: string) => path.join("content", "cases", dir, name);
    const now = (name: string) => readYaml(fs.existsSync(path.join(root, file(name))) ? fs.readFileSync(path.join(root, file(name)), "utf8") : null);
    const then = (name: string) => readYaml(atBase(opts.base, file(name), root));
    const sources = new Map((now("sources.yaml") as Source[]).map((s) => [s.id, s]));
    const fail = (record: string, problem: string) => result.failures.push({ case: dir, record, problem });
    const warn = (record: string, problem: string) => result.warnings.push({ case: dir, record, problem });

    // Quoted spans against the text, and the locator's page against where the span is.
    const checkSpans = async (record: string, sourceId: string | undefined, spans: string[], locator: string | undefined) => {
      const source = sourceId ? sources.get(sourceId) : undefined;
      if (!source) return fail(record, sourceId ? `cites ${sourceId}, which sources.yaml does not hold` : "quotes a passage but names no source");
      if (source.sourceType === "workpaper") return warn(record, `cites the study workpaper ${source.id}; its text is the study file, not checked here`);
      const { text, reason } = await textOf(source);
      if (text === null) return fail(record, `the text of ${source.id} could not be read (${reason}); a record whose text cannot be read enters as provisional, with the route to the text`);
      for (const span of spans) if (!quoteOccurs(span, text)) fail(record, `quoted passage not found in the text of ${source.id}: "${span.slice(0, 160)}"`);
      // A locator names the page as the reading tool numbers it (the PDF's own page, [p. N]). A page past the end of
      // the document is a journal's pagination, which the text does not carry: said, not failed.
      const pages = locatorPages(locator);
      if (!pages || !/\[p\. \d+\]/.test(text)) return;
      const last = Math.max(...pagesOf(text).keys());
      if (pages[0] > last) return warn(record, `locator "${locator}" names a page past the document's ${last} (a journal's pagination?); name the page as the reading tool shows it`);
      for (const span of spans) {
        const on = pagesContaining(text, span);
        if (on.length && !on.some((p) => p >= pages[0] && p <= pages[1])) {
          fail(record, `locator "${locator}" names p. ${pages[0] === pages[1] ? pages[0] : `${pages[0]}–${pages[1]}`}; the passage "${span.slice(0, 80)}" is on p. ${on.join(", ")}`);
        }
      }
    };

    for (const e of changedRecords<Evidence>(then("evidence.yaml"), now("evidence.yaml"), evidencePassage)) {
      if (e.reviewState === "rejected" || e.reviewState === "provisional") continue;
      const spans = quotedSpans(e.sourceStatement);
      if (!spans.length) {
        fail(e.id, "an evidence record must quote its source: sourceStatement carries no quoted passage of twelve characters or more");
        continue;
      }
      await checkSpans(e.id, e.sourceId, spans, e.exactLocator);
      result.checked.push({ case: dir, record: e.id, spans: spans.length });
    }
    for (const c of changedRecords<Claim>(then("claims.yaml"), now("claims.yaml"), claimPassage)) {
      if (c.reviewState === "rejected" || c.reviewState === "provisional" || !c.sourceAnchor?.quote) continue;
      const a = c.sourceAnchor;
      await checkSpans(c.id, a.sourceId, [a.quote!], a.locator);
      for (const also of a.also ?? []) await checkSpans(c.id, a.sourceId, [also.quote], also.locator);
      result.checked.push({ case: dir, record: c.id, spans: 1 + (a.also?.length ?? 0) });
    }
    // A new source's identifier resolves: real citations only.
    const fresh = changedRecords<Source>(then("sources.yaml"), [...sources.values()]).filter((s) => !then("sources.yaml").some((b) => b.id === s.id));
    const cites = fresh.map((s) => ({ source: s, c: citationOf(s) })).filter((x): x is { source: Source; c: { kind: "doi" | "arxiv"; id: string } } => x.c !== null);
    if (cites.length) {
      const resolved = await (opts.resolve ?? verifyCitations)(cites.map((x) => x.c));
      for (const r of resolved) {
        const s = cites.find((x) => x.c.id === r.id)!.source;
        if (r.status === "fails") fail(s.id, `${r.kind} ${r.id} does not resolve (${r.note})`);
        else if (r.status === "unchecked") warn(s.id, `${r.kind} ${r.id} could not be checked (${r.note})`);
        else if (/retract|withdraw|concern/i.test(r.note)) warn(s.id, `${r.kind} ${r.id}: ${r.note}`);
      }
    }
  }
  return result;
}

/** The result as a report: what was checked, and every failure and warning in a line. */
export function formatQuoteCheck(r: QuoteCheckResult): string {
  const lines = [`Quote check: ${r.checked.length} record(s) checked, ${r.checked.reduce((n, c) => n + c.spans, 0)} passage(s); ${r.failures.length} failure(s), ${r.warnings.length} warning(s).`];
  for (const f of r.failures) lines.push(`FAIL ${f.case} ${f.record}: ${f.problem}`);
  for (const w of r.warnings) lines.push(`warn ${w.case} ${w.record}: ${w.problem}`);
  return lines.join("\n");
}
