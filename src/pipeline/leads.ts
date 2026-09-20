import fs from "node:fs";
import path from "node:path";
import type { Disposition } from "../domain/intake.ts";
import { canonicalUrl, normalizeDoi, titleContainment, TITLE_NEAR } from "../domain/keys.ts";
import { blockedLeads } from "../domain/leads.ts";
import { findCase } from "../domain/load.ts";
import type { LoadedCase, Source } from "../domain/schema.ts";
import { retrieve, type FetchedSource } from "./fetch.ts";
import { authorAgreement, bestMatch, topicOverlap, type Reference } from "./match.ts";
import { multiIndexSearch, type IndexedResult } from "./resolve.ts";
import { closeRun, openRun, runDir, writeWorkingFile, type RunOutcome } from "./store.ts";

/**
 * `aletheia leads <case>` — the leads pass (protocol leads-v1, mechanical: no model is called). A producer names
 * works it cannot open — a report's "Named, not opened", an intake's unresolved references, a drafter's blocked
 * rows — and until 2026-09-20 nothing re-opened them: 153 such rows sat across the cases, 69 on one. This verb
 * takes a case's open leads, oldest first, asks the open indexes for each (OpenAlex, Semantic Scholar, Europe PMC,
 * the Internet Archive), and writes a report in the shape the draft verb already reads: a lead that a document
 * agreed with on the checks named is *resolved*, with the document's locator; documents that may be the work are
 * *candidates*, to be confirmed from the retrieved text; the rest are *still unresolved*, with what was tried. The
 * draft, verify and edition verbs follow as after any report. Verification settles a lead's own row when a source it
 * admits is the document the pass resolved (src/pipeline/verify.ts, settleLeads).
 */

export const LEADS_PROTOCOL = "leads-v1";
/** Leads tried per pass: each resolved or candidate document is a retrieval target for the drafter, capped at 20 there. */
export const LEADS_PER_PASS = 10;
const CANDIDATES_PER_LEAD = 2;

export interface LeadQuery {
  key: string;
  kind: Disposition["kind"];
  observed: string;
  title: string | null;
  authors: string[];
  year: number | null;
  query: string;
  firstBlocked: { date: string; by: string; reopenIf?: string; route?: string };
}

/**
 * The work a blocked row names, read from its `observed` text as producers write it: "Report: '<title> (<who>[,
 * <year>]) — <why it could not be opened>'. <context>", or a bare title. Parentheticals carry the authors and year;
 * "Surname, Given" is turned round so the surname is the last word, as the matcher reads names.
 */
export function leadQuery(row: Disposition): LeadQuery {
  const observed = row.observed.trim();
  const quoted = /^Report:\s*['‘"“](.+?)['’"”]\.?(?:\s|$)/.exec(observed);
  let core = (quoted ? quoted[1] : observed.split(/(?<=[.!?])\s+/)[0]).trim();
  core = core.replace(/\s+[—–-]+\s*(no (OpenAlex|candidate|index|result)|not (found|retrieved|resolved|opened)|blocked|paywalled|unresolved)[^]*$/i, "").trim();
  let authors: string[] = [];
  let year: number | null = null;
  const paren = /\(([^()]{2,120})\)\s*$/.exec(core);
  if (paren) {
    const inner = paren[1];
    const y = /\b(1[5-9]\d{2}|20\d{2})\b/.exec(inner);
    if (y) year = Number(y[1]);
    authors = inner
      .replace(/\b(1[5-9]\d{2}|20\d{2})[a-z]?\b/g, "")
      .split(/;|&|\band\b/)
      .map((s) => s.trim().replace(/^,|,$/g, "").trim())
      .filter((s) => /^[A-Z][A-Za-z'’.\- ,]+$/.test(s) && s.length <= 60)
      .map((s) => (s.includes(",") ? s.split(",").map((p) => p.trim()).reverse().join(" ") : s));
    core = core.slice(0, paren.index).trim();
  }
  const title = core.replace(/^['"“‘]|['"”’]$/g, "").replace(/\s+/g, " ").trim();
  return {
    key: row.key,
    kind: row.kind,
    observed,
    title: title.length >= 8 ? title : null,
    authors,
    year,
    query: [title, authors[0] ?? ""].filter(Boolean).join(" ").slice(0, 200),
    firstBlocked: { date: row.date, by: row.by, ...(row.reopenIf ? { reopenIf: row.reopenIf } : {}), ...(row.route ? { route: row.route } : {}) },
  };
}

export interface LeadCandidate {
  title: string;
  authors: string[];
  year: number | null;
  url: string;
  doi: string | null;
  identifier: string;
  via: string;
  similarity: number;
  /** What agreed, said as it was checked (the same words the lead resolver uses). */
  checks: string[];
}

export type TextNote = { chars: number; via: string } | { chars: 0; reason: string };

export interface LeadOutcome extends LeadQuery {
  resolved: (LeadCandidate & { text: TextNote }) | null;
  candidates: LeadCandidate[];
  /** Why nothing resolved, when nothing did. */
  unresolved?: string;
}

const candidateOf = (hit: IndexedResult, similarity: number, checks: string[]): LeadCandidate => ({
  title: hit.title ?? hit.display_name ?? "",
  authors: (hit.authorships ?? []).map((a) => a.author?.display_name ?? "").filter(Boolean),
  year: hit.publication_year ?? null,
  url: hit.url,
  doi: hit.doi ? (normalizeDoi(hit.doi) ?? null) : null,
  identifier: hit.identifier,
  via: hit.via,
  similarity,
  checks,
});

/** The checks a hit passes against the lead, in the resolver's words; null when the lead gave a year or an author the hit contradicts. */
function checksOf(ref: Reference, hit: IndexedResult): { similarity: number; checks: string[]; agreed: boolean } {
  const title = hit.title ?? hit.display_name ?? "";
  const similarity = Number(titleContainment(ref.title, title).toFixed(2));
  const checks: string[] = [`title containment ${similarity} (${similarity >= TITLE_NEAR ? `at or above the ${TITLE_NEAR} threshold` : `below the ${TITLE_NEAR} threshold`})`];
  let agreed = similarity >= TITLE_NEAR;
  if (ref.year && hit.publication_year) {
    const gap = Math.abs(ref.year - hit.publication_year);
    if (gap <= 1) checks.push(gap === 0 ? `year ${hit.publication_year} exact` : `year within one (the lead said ${ref.year}, the index ${hit.publication_year})`);
    else agreed = false;
  } else if (ref.year) agreed = false;
  const author = ref.authors.length ? authorAgreement(ref, hit) : null;
  if (author) checks.push(`author surname "${author.surname}" found in the index's "${author.name}"`);
  else if (ref.authors.length) agreed = false;
  return { similarity, checks, agreed };
}

/** Rank the index's hits for a lead: the resolver's match first when there is one, then the nearest titles. */
export function rankHits(lead: LeadQuery, hits: IndexedResult[]): { resolved: LeadCandidate | null; candidates: LeadCandidate[] } {
  const ref: Reference = { title: lead.title ?? lead.query, authors: lead.authors, year: lead.year, venue: null, url: null };
  const doiPage = (u: string) => (/^https?:\/\/(dx\.)?doi\.org\//i.test(u) ? 1 : 0);
  const ordered = [...hits].filter((h) => h.title ?? h.display_name).sort((a, b) => doiPage(a.url) - doiPage(b.url));
  const best = bestMatch(ref, ordered);
  let resolved: LeadCandidate | null = null;
  if (best) {
    const c = checksOf(ref, best);
    if (c.agreed) resolved = candidateOf(best, c.similarity, c.checks);
  }
  const scored = ordered
    .filter((h) => !resolved || h.url !== resolved.url)
    .map((h) => {
      const c = checksOf(ref, h);
      const title = h.title ?? h.display_name ?? "";
      const score = c.similarity + (topicOverlap(ref.title, title) ? 0.25 : 0) + (ref.authors.length && authorAgreement(ref, h) ? 0.4 : 0);
      return { h, c, score };
    })
    .filter(({ score }) => score >= 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, CANDIDATES_PER_LEAD);
  return { resolved, candidates: scored.map(({ h, c }) => candidateOf(h, c.similarity, c.checks)) };
}

/** The report the drafter reads: every lead tried, what the indexes returned, and what to do with each. */
export function composeLeadsReport(slug: string, runId: string, date: string, outcomes: LeadOutcome[], total: number): string {
  const head =
    `<!-- Leads reopened — working material, never citable (docs/AUTOMATION.md).\n` +
    `     runId ${runId} · case ${slug} · ${date} · ${outcomes.length} lead(s) tried of ${total} open · protocol ${LEADS_PROTOCOL} (mechanical; no model was called)\n` +
    `     Each lead below is a work an earlier pass named and could not open, exactly as its disposition row records it. A document under\n` +
    `     "Resolved" agreed with the lead on the checks named; a document under "Candidates" may be the work — confirm from the retrieved\n` +
    `     text (title, authors, content) before anchoring anything to it, and disposition a wrong one \`failed\` ("resolved to the wrong work: …").\n` +
    `     Write one disposition row per lead with its \`key\` exactly as given: \`blocked\` again, with the route, when nothing opened. Rows for\n` +
    `     what enters are written by the verifier, which also settles a lead's own row when a source it admits is the document resolved here. -->\n\n`;
  const parts = [`# Leads reopened — ${slug} (${date})`, ``];
  outcomes.forEach((o, i) => {
    parts.push(`## Lead ${i + 1}: ${o.observed}`, ``, `- key: \`${o.key}\` (${o.kind})`, `- first blocked ${o.firstBlocked.date} by ${o.firstBlocked.by}${o.firstBlocked.reopenIf ? `; reopen if: ${o.firstBlocked.reopenIf}` : ""}${o.firstBlocked.route ? `; route: ${o.firstBlocked.route}` : ""}`, `- searched: "${o.query}"`, ``);
    const line = (c: LeadCandidate) => `- ${c.title}${c.authors.length || c.year ? ` (${[c.authors.slice(0, 3).join(", "), c.year ?? ""].filter(Boolean).join(", ")})` : ""} → ${c.url} — ${c.via}; ${c.checks.join("; ")}`;
    if (o.resolved) {
      parts.push(`### Resolved`, ``, `${line(o.resolved)}${"reason" in o.resolved.text ? `; text not retrieved: ${o.resolved.text.reason}` : `; text retrieved (${o.resolved.text.chars} characters${o.resolved.text.via ? `, ${o.resolved.text.via}` : ""})`}`, ``);
    }
    if (o.candidates.length) {
      parts.push(`### Candidates (confirm from the text)`, ``, ...o.candidates.map(line), ``);
    }
    if (!o.resolved && !o.candidates.length) parts.push(`### Still unresolved`, ``, `- ${o.unresolved ?? "nothing the indexes returned agreed with the lead on its title"}`, ``);
  });
  return head + parts.join("\n");
}

export interface LeadsOptions {
  dryRun?: boolean;
  root?: string;
  cap?: number;
  deps?: { search?: (query: string) => Promise<IndexedResult[]>; fetch?: typeof retrieve; now?: () => Date; cases?: () => LoadedCase[] };
}

export interface LeadsOutcome extends RunOutcome {
  tried: number;
  resolved: number;
  /** Resolved documents whose text was retrieved, plus candidates: what the drafter has to read. */
  opened: number;
  candidates: number;
  unresolved: number;
  reportFile?: string;
}

export async function runLeads(caseKey: string, opts: LeadsOptions = {}): Promise<LeadsOutcome> {
  const root = opts.root ?? process.cwd();
  const now = opts.deps?.now ?? (() => new Date());
  const loaded = findCase(caseKey, opts.deps?.cases?.());
  const slug = loaded.record.slug;
  const open = blockedLeads(loaded);
  const run = openRun("leads", slug, { model: null, promptVersion: LEADS_PROTOCOL }, { now: now(), root });
  const { runId, date } = run;
  const zero = { tried: 0, resolved: 0, opened: 0, candidates: 0, unresolved: 0 };
  if (!open.length) return { ...closeRun(run, "rested", { reason: "no leads: nothing a producer named is waiting to be opened" }), ...zero };
  const picked = open.slice(0, opts.cap ?? LEADS_PER_PASS).map(leadQuery);
  if (opts.dryRun) {
    return { ...closeRun(run, "dry-run", { reason: `would try ${picked.length} of ${open.length} open lead(s): ${picked.map((l) => `"${l.query.slice(0, 50)}"`).join(", ")}; nothing searched` }), ...zero, tried: picked.length };
  }
  const search = opts.deps?.search ?? ((q: string) => multiIndexSearch(q));
  const fetcher = opts.deps?.fetch ?? retrieve;
  try {
    const outcomes: LeadOutcome[] = [];
    for (const lead of picked) {
      if (!lead.title) {
        outcomes.push({ ...lead, resolved: null, candidates: [], unresolved: "the row names no work to search for" });
        continue;
      }
      let hits: IndexedResult[] = [];
      try {
        hits = await search(lead.query);
      } catch (err) {
        outcomes.push({ ...lead, resolved: null, candidates: [], unresolved: `the index search failed: ${(err as Error).message.slice(0, 120)}` });
        continue;
      }
      const { resolved, candidates } = rankHits(lead, hits);
      if (!resolved && !candidates.length) {
        outcomes.push({ ...lead, resolved: null, candidates: [], unresolved: hits.length ? `${hits.length} hit(s) from the indexes, none near the title` : "the indexes returned nothing" });
        continue;
      }
      let text: TextNote = { chars: 0, reason: "not fetched" };
      if (resolved) {
        const f: FetchedSource = await fetcher({ url: resolved.url, doi: resolved.doi }, {});
        text = f.ok && f.text ? { chars: f.text.length, via: f.via ?? "" } : { chars: 0, reason: f.reason ?? "no text" };
      }
      outcomes.push({ ...lead, resolved: resolved ? { ...resolved, text } : null, candidates });
    }
    const report = composeLeadsReport(slug, runId, date, outcomes, open.length);
    const reportFile = writeWorkingFile(runId, "report.md", report, root);
    writeWorkingFile(runId, "leads.json", JSON.stringify(outcomes, null, 1), root);
    const counts = {
      tried: outcomes.length,
      resolved: outcomes.filter((o) => o.resolved).length,
      opened: outcomes.filter((o) => (o.resolved && o.resolved.text.chars > 0) || o.candidates.length).length,
      candidates: outcomes.reduce((n, o) => n + o.candidates.length, 0),
      unresolved: outcomes.filter((o) => !o.resolved && !o.candidates.length).length,
    };
    const summary = `leads: tried ${counts.tried} of ${open.length}, resolved ${counts.resolved}, opened ${counts.opened}, candidates ${counts.candidates}, unresolved ${counts.unresolved}`;
    return { ...closeRun(run, "completed", { reason: summary }), ...counts, reportFile };
  } catch (e) {
    return { ...closeRun(run, "failed", { reason: (e as Error).message }), ...zero };
  }
}

/** The lead outcomes a leads run wrote, when the proposal was drafted from one. */
export function leadsOf(reportRunId: string, root = process.cwd()): LeadOutcome[] {
  const f = path.join(runDir(reportRunId, root), "leads.json");
  if (!fs.existsSync(f)) return [];
  try {
    return JSON.parse(fs.readFileSync(f, "utf8")) as LeadOutcome[];
  } catch {
    return [];
  }
}

/**
 * The rows that settle a lead: when verification admits a source that is the document a leads pass *resolved* for
 * that lead — one that agreed with the lead on the checks named — the lead's own row is written `in`, naming the
 * source, mechanically, by locator, so the pool of open leads shrinks without a drafter's say-so. A candidate is
 * not a resolution: a document admitted for its own sake that merely resembled the lead leaves the lead blocked
 * (review note #369 — writing identity into provenance on a 0.5 title match). Only a source-kind lead is settled by
 * a source: a provenance container admits no claim or evidence record (§3.6; review note #368).
 */
export function settleLeads(outcomes: LeadOutcome[], admitted: Pick<Source, "id" | "url" | "identifier">[], stamp: { runId: string; date: string; proposal: string; leadsRunId: string }): Disposition[] {
  const rows: Disposition[] = [];
  const locators = (s: Pick<Source, "url" | "identifier">) => new Set([canonicalUrl(s.url), normalizeDoi(s.identifier), normalizeDoi(s.url)].filter((x): x is string => Boolean(x)));
  for (const o of outcomes) {
    if (o.kind !== "source" || !o.resolved) continue;
    const docs = [o.resolved];
    for (const s of admitted) {
      const mine = locators(s);
      const hit = docs.find((d) => mine.has(canonicalUrl(d.url) ?? "") || (d.doi && mine.has(d.doi)));
      if (!hit) continue;
      rows.push({ key: o.key, kind: o.kind, disposition: "in", as: s.id, observed: o.observed, by: stamp.runId, date: stamp.date, proposal: stamp.proposal, reason: `the lead, reopened by ${stamp.leadsRunId}, resolved to this source (${hit.via}; ${hit.checks.join("; ")})` });
      break;
    }
  }
  return rows;
}
