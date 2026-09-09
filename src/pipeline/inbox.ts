import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { titleContainment, TITLE_NEAR } from "../domain/keys.ts";
import { findCase } from "../domain/load.ts";
import type { LoadedCase } from "../domain/schema.ts";
import { MODELS } from "../../scripts/lib/models.mjs";
import { pdfText } from "./fetch.ts";
import { appendYamlItems } from "./ledger-write.ts";
import { defaultLister, openAlexSearch, resolveReferences, type Reference, type ReferenceLister, type Resolved, type Searcher } from "./references.ts";
import { closeRun, openRun, writeWorkingFile, type RunOutcome } from "./store.ts";

/**
 * `aletheia inbox <case>` — the founder's door as a producer (docs/AUTOMATION.md,
 * step 4b / 5). Whatever was dropped for a case — notes in the founder's
 * words, link lists, documents — becomes one report-shaped working file the
 * `draft` verb consumes exactly as it consumes a research report: the
 * supplied text verbatim, every work it names resolved to a locator through
 * OpenAlex, so the drafter proposes records from the primaries and the
 * verifier checks every quote against retrieved text. Nothing supplied is a
 * record; the supplied text is the supplier's words, labelled as such.
 *
 * Provenance before intake (AGENTS.md §3.15): a document enters only with a
 * statement of who supplied it and on what footing — `editor` (the
 * founder's or a contributor's own work), `published` (a URL where it is
 * public), or `from` with `permission` (who granted it, when, by what
 * channel). Anything else stays in the inbox with the reason.
 */

export type ItemKind = "commentary" | "links" | "document";

export interface InboxItem {
  /** Path of the item; for a PDF with a sidecar note, the PDF. */
  file: string;
  sidecar?: string;
  name: string;
  kind: ItemKind;
  meta: Record<string, unknown>;
  text: string;
  pages?: number;
  supplier: string;
  /** The document's own title: the sidecar's `title`, else its first heading. */
  title: string;
  /** The ledger source this document is, when its title matches one: its propositions may anchor claims. */
  ledgerSource?: string;
  /** The narrative input this document was registered as (sidecar `role: founding_narrative | founding_research`). */
  registeredAs?: string;
}

/** The document's title: the sidecar's `title`, else the first substantial line after the page marker. */
export function titleOf(meta: Record<string, unknown>, text: string): string {
  if (typeof meta.title === "string" && meta.title.trim()) return meta.title.trim();
  return text.replace(/^\[p\. 1\]\s*/, "").split("\n").find((l) => l.trim().length > 8)?.trim().slice(0, 200) ?? "";
}

export function parseFrontMatter(text: string): { meta: Record<string, unknown>; body: string } {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: text };
  let meta: Record<string, unknown> = {};
  try {
    meta = (parseYaml(m[1]) as Record<string, unknown>) ?? {};
  } catch {
    // Malformed front matter is body text; nothing is guessed.
  }
  return { meta, body: text.slice(m[0].length) };
}

export function detectType(meta: Record<string, unknown>, body: string, isDocumentFile: boolean): ItemKind | "empty" {
  if (meta.type === "commentary" || meta.type === "links" || meta.type === "document") return meta.type;
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return "empty";
  const linkish = lines.filter((l) => /^https?:\/\//.test(l) || /^[-*]\s*\[?.*https?:\/\//.test(l));
  if (linkish.length >= Math.max(1, Math.ceil(lines.length * 0.6))) return "links";
  if (isDocumentFile || (body.length > 4000 && !meta.editor)) return "document";
  return "commentary";
}

/** Who supplied an item and on what footing, or null when the statement is missing. */
export function supplierOf(meta: Record<string, unknown>): string | null {
  if (typeof meta.editor === "string" && meta.editor) return `${meta.editor} (own work)`;
  if (typeof meta.from === "string" && meta.from && typeof meta.permission === "string" && meta.permission) return `${meta.from} — permission: ${meta.permission}`;
  if (typeof meta.published === "string" && meta.published) return `published at ${meta.published}${typeof meta.from === "string" ? `; supplied by ${meta.from}` : ""}`;
  return null;
}

const TEXT_EXT = new Set([".md", ".txt"]);
const DOC_CAP = 300_000;

/** The items dropped for one case (its folder, or a `case:` front matter), each with its statement of provenance — and those left behind, with why. */
export async function readInbox(caseDir: string, root = process.cwd()): Promise<{ items: InboxItem[]; left: { name: string; reason: string }[] }> {
  const inbox = path.join(root, "inbox");
  const items: InboxItem[] = [];
  const left: { name: string; reason: string }[] = [];
  if (!fs.existsSync(inbox)) return { items, left };
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== "processed") walk(full);
      } else if (e.name !== "README.md" && !e.name.startsWith(".")) files.push(full);
    }
  };
  walk(inbox);
  const stems = new Map(files.map((f) => [f.replace(/\.[^.]+$/, ""), f]));
  const consumed = new Set<string>();
  for (const file of files) {
    if (consumed.has(file)) continue;
    const ext = path.extname(file).toLowerCase();
    const name = path.relative(inbox, file);
    const inCaseDir = path.relative(inbox, file).split(path.sep)[0] === caseDir;
    let meta: Record<string, unknown> = {};
    let body = "";
    let pages: number | undefined;
    let sidecar: string | undefined;
    if (TEXT_EXT.has(ext)) {
      // A note whose stem matches a PDF is that PDF's sidecar, handled with it.
      const pdf = files.find((f) => f !== file && f.replace(/\.[^.]+$/, "") === file.replace(/\.[^.]+$/, "") && path.extname(f).toLowerCase() === ".pdf");
      if (pdf) continue;
      ({ meta, body } = parseFrontMatter(fs.readFileSync(file, "utf8")));
    } else if (ext === ".pdf") {
      const side = stems.get(file.replace(/\.[^.]+$/, ""));
      const sideFile = files.find((f) => f !== file && f.replace(/\.[^.]+$/, "") === file.replace(/\.[^.]+$/, "") && TEXT_EXT.has(path.extname(f).toLowerCase()));
      void side;
      if (sideFile) {
        sidecar = sideFile;
        consumed.add(sideFile);
        meta = parseFrontMatter(fs.readFileSync(sideFile, "utf8")).meta;
      }
      try {
        const r = await pdfText(new Uint8Array(fs.readFileSync(file)));
        body = r.text;
        pages = r.pages;
      } catch (e) {
        left.push({ name, reason: `PDF could not be read: ${(e as Error).message}` });
        continue;
      }
      if (!body.replace(/\[p\. \d+\]/g, "").trim()) {
        left.push({ name, reason: "PDF has no text layer (a scan needs OCR)" });
        continue;
      }
    } else {
      continue; // other binaries are not this case's, or anyone's, until converted
    }
    const itemCase = typeof meta.case === "string" ? meta.case : inCaseDir ? caseDir : null;
    if (itemCase !== caseDir) continue;
    const kind = detectType(meta, body, ext === ".pdf");
    if (kind === "empty") {
      left.push({ name, reason: "empty" });
      continue;
    }
    const supplier = supplierOf(meta);
    if (kind === "document" && !supplier) {
      left.push({ name, reason: "no statement of provenance: add front matter (or a sidecar note of the same name) with `editor:` for your own work, `published:` with the URL where it is public, or `from:` and `permission:` for supplied material" });
      continue;
    }
    items.push({ file, sidecar, name, kind, meta, text: body.length > DOC_CAP ? body.slice(0, DOC_CAP) + `\n\n[truncated at ${DOC_CAP} characters of ${body.length}]` : body, pages, supplier: supplier ?? "the founder (note in the inbox)", title: titleOf(meta, body) });
  }
  return { items, left };
}

/** The ledger source a document is, by its title (the first heading or the sidecar's title) — or null. */
export function ledgerSourceOf(item: Pick<InboxItem, "text" | "meta">, sources: { id: string; title: string }[]): string | null {
  const title = titleOf(item.meta, item.text);
  if (title.length < 8) return null;
  let best: { id: string; score: number } | null = null;
  for (const s of sources) {
    const score = titleContainment(title, s.title);
    if (score >= TITLE_NEAR && (!best || score > best.score)) best = { id: s.id, score };
  }
  return best?.id ?? null;
}

/** The report the drafter reads: supplied text verbatim, then every named work with its resolved locator. */
/** A founding-role document is told to the drafter as such whichever footing it enters on: new to the ledger, or the ledger's own source. */
function registeredNote(it: InboxItem): string {
  return it.registeredAs ? ` It is also registered as founding input ${it.registeredAs}: the edition drafter reads it for framing and voice.` : "";
}

export function composeReport(slug: string, runId: string, date: string, items: InboxItem[], resolved: Map<string, Resolved[]>): string {
  const head =
    `<!-- Inbox intake — material supplied through the founder's door; working material, never citable as such (docs/AUTOMATION.md).\n` +
    `     runId ${runId} · case ${slug} · ${date} · ${items.length} item(s)\n` +
    `     The supplied text below is its supplier's words, on the footing stated. Unless an item says it is itself a ledger source, it is not one: propose records only from the published works it names or links, each retrieved and verified. -->\n\n`;
  const parts = [`# Intake — ${slug} (${date})`, ``];
  for (const it of items) {
    parts.push(`## ${it.kind}: ${it.name}`, ``, `Supplied by ${it.supplier}${it.pages ? `; PDF, ${it.pages} pages` : ""}${typeof it.meta.provenance === "string" ? `; provenance: ${it.meta.provenance}` : ""}.`, ``);
    if (it.ledgerSource) {
      parts.push(`THIS DOCUMENT IS THE LEDGER'S SOURCE ${it.ledgerSource}. Its propositions may be proposed as claims anchored to ${it.ledgerSource} — one proposition each, a verbatim quote from the text below, and the \`[p. N]\` page as the locator — and what it states may enter as evidence records on ${it.ledgerSource}, direction and strength honest to what kind of source it is. The verifier reads this same text for ${it.ledgerSource}.${registeredNote(it)}`, ``);
    } else if (it.kind === "document" && typeof it.meta.editor === "string") {
      parts.push(`THIS DOCUMENT IS NEW TO THE LEDGER AND SUPPLIED BY ITS AUTHOR (${it.meta.editor}). Propose it as a Source record (title "${it.title}", author, date, sourceType, an identifier naming where it is published and how it was written), and propose its propositions as claims anchored to that provisional source — one proposition each, a verbatim quote from the text below, the \`[p. N]\` page as the locator. The verifier reads this same text for that source.${registeredNote(it)}`, ``);
    }
    if (it.kind === "commentary") parts.push(`The supplier's words, verbatim — the authoritative editorial statement:`, ``);
    parts.push(it.text.trim(), ``);
    const refs = resolved.get(it.name) ?? [];
    if (refs.length) {
      parts.push(`### Works this item names, resolved`, ``);
      for (const r of refs) {
        const who = r.reference.authors.length ? ` (${r.reference.authors.slice(0, 3).join(", ")}${r.reference.year ? `, ${r.reference.year}` : ""})` : r.reference.year ? ` (${r.reference.year})` : "";
        parts.push(`- ${r.reference.title}${who}${r.url ? ` → ${r.url}` : ""} — ${r.note}${r.matched && r.matched !== r.reference.title ? ` (OpenAlex title: "${r.matched}")` : ""}`);
      }
      parts.push(``);
    }
  }
  return head + parts.join("\n");
}

export interface InboxOptions {
  dryRun?: boolean;
  root?: string;
  deps?: { list?: ReferenceLister; search?: Searcher; now?: () => Date; cases?: () => LoadedCase[] };
}

export interface InboxOutcome extends RunOutcome {
  items: number;
  left: { name: string; reason: string }[];
  reportFile?: string;
}

/**
 * The permission to publish a supplied document, recorded with the rigor
 * §3.15 asks of provenance: who granted it, on what date, by what channel,
 * and where the statement is held. The grant is the supplier's own
 * statement of footing (front matter or sidecar), which the intake moves to
 * inbox/processed/<runId>/ and commits — that file is the correspondence.
 */
export function permissionRecord(it: InboxItem, date: string, runId: string): string {
  const statement = path.basename(it.sidecar ?? it.file);
  const held = `held at inbox/processed/${runId}/${statement}`;
  if (typeof it.meta.editor === "string" && it.meta.editor) return `Own work of ${it.meta.editor}, who supplied it for publication as a founding input: granted by ${it.meta.editor} on ${date} through the inbox statement \`${statement}\` (editor: ${it.meta.editor}), ${held}.`;
  if (typeof it.meta.from === "string" && typeof it.meta.permission === "string") return `Supplied by ${it.meta.from} with permission to publish and cite — ${it.meta.permission} — recorded on ${date} through the inbox statement \`${statement}\`, ${held}.`;
  if (typeof it.meta.published === "string") return `Public at ${it.meta.published}; supplied${typeof it.meta.from === "string" ? ` by ${it.meta.from}` : ""} on ${date} through the inbox statement \`${statement}\`, ${held}.`;
  throw new Error(`${it.name}: no footing on which to publish it as a founding input`);
}

export async function runInbox(caseKey: string, opts: InboxOptions = {}): Promise<InboxOutcome> {
  const root = opts.root ?? process.cwd();
  const now = opts.deps?.now ?? (() => new Date());
  const loaded = findCase(caseKey, opts.deps?.cases?.());
  const { items, left } = await readInbox(loaded.dir, root);
  const notesOut: string[] = [];
  const run = openRun("inbox", loaded.record.slug, { model: MODELS.reader.model, promptVersion: "references-v1" }, { now: now(), root });
  const { runId, date } = run;
  for (const it of items) {
    if (it.kind !== "document") continue;
    const id = ledgerSourceOf(it, loaded.sources);
    if (id) it.ledgerSource = id;
  }
  // A document the sidecar declares a founding input is registered as one: committed beside the case's
  // other originals with its text extraction, and added to the inputs manifest — unless already there.
  const registered: string[] = [];
  for (const it of items) {
    const role = it.meta.role;
    if (it.kind !== "document" || (role !== "founding_narrative" && role !== "founding_research")) continue;
    const already = loaded.narrativeInputs.find((n) => path.basename(n.file) === path.basename(it.file) || (it.title && n.title.toLowerCase() === it.title.toLowerCase()));
    if (already) {
      it.registeredAs = already.id;
      continue;
    }
    if (opts.dryRun) continue;
    const rel = path.join("research", loaded.dir, path.basename(it.file));
    const dest = path.join(root, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (!fs.existsSync(dest)) fs.copyFileSync(it.file, dest);
    fs.writeFileSync(`${dest}.txt`, `[Text extraction of the PDF by the pipeline (pdfjs), ${date}; ${it.pages ?? "?"} pages; page markers [p. N]. The PDF beside this file is the original.]\n\n${it.text}`);
    const n = Math.max(0, ...loaded.narrativeInputs.map((x) => Number(x.id.match(/-IN(\d+)$/)?.[1] ?? 0)), ...registered.map((x) => Number(x.match(/-IN(\d+)$/)?.[1] ?? 0)));
    const id = `${loaded.record.id.split("-")[0]}-IN${String(n + 1).padStart(3, "0")}`;
    const license = typeof it.meta.license === "string" && it.meta.license.trim() ? it.meta.license : permissionRecord(it, date, runId);
    appendYamlItems(path.join(root, "content", "cases", loaded.dir, "inputs", "manifest.yaml"), [
      { id, title: it.title, role, file: rel, origin: `Supplied through the inbox on ${date} (run ${runId}) by ${it.supplier}${typeof it.meta.provenance === "string" ? `; ${it.meta.provenance}` : ""}. Read by the pipeline from the text extraction committed beside the file.`, license },
    ]);
    registered.push(id);
    it.registeredAs = id;
    notesOut.push(`${it.name}: registered as founding input ${id} (${rel})`);
  }
  if (items.length === 0) return { ...closeRun(run, "rested", { reason: left.length ? `nothing ready: ${left.map((l) => `${l.name} — ${l.reason}`).join("; ")}` : "the inbox holds nothing for this case" }), items: 0, left };

  const resolved = new Map<string, Resolved[]>();
  if (!opts.dryRun) {
    const list = opts.deps?.list ?? defaultLister;
    const search = opts.deps?.search ?? openAlexSearch;
    for (const it of items) {
      let refs: Reference[] = [];
      try {
        refs = await list(it.text, run.meter);
      } catch (e) {
        return { ...closeRun(run, "failed", { reason: `listing references in ${it.name}: ${(e as Error).message}` }), items: items.length, left };
      }
      resolved.set(it.name, await resolveReferences(refs, search));
    }
  }
  const report = composeReport(loaded.record.slug, runId, date, items, resolved);
  const reportFile = writeWorkingFile(runId, "report.md", report, root);
  const manifest = items.map((it) => ({
    name: it.name,
    kind: it.kind,
    title: it.title,
    supplier: it.supplier,
    registeredAs: it.registeredAs ?? null,
    pages: it.pages ?? null,
    bytes: fs.statSync(it.file).size,
    sha256: crypto.createHash("sha256").update(fs.readFileSync(it.file)).digest("hex"),
    sidecar: it.sidecar ? path.relative(path.join(root, "inbox"), it.sidecar) : null,
    ledgerSource: it.ledgerSource ?? null,
    document: it.kind === "document" ? `documents/${path.basename(it.file).replace(/\.[^.]+$/, "")}.txt` : null,
    references: (resolved.get(it.name) ?? []).length,
    resolved: (resolved.get(it.name) ?? []).filter((r) => r.url).length,
  }));
  writeWorkingFile(runId, "manifest.yaml", stringifyYaml({ runId, case: loaded.record.slug, date, items: manifest, left }), root);
  for (const it of items) if (it.kind === "document") writeWorkingFile(runId, `documents/${path.basename(it.file).replace(/\.[^.]+$/, "")}.txt`, it.text, root);
  if (opts.dryRun) {
    return { ...closeRun(run, "dry-run", { reason: `${items.length} item(s) would be taken in (references not listed on a dry run); report written under proposals/${runId}/; nothing moved` }), items: items.length, left, reportFile };
  }
  // The originals move to processed/<runId>/, so the run is revertable by its id.
  const processed = path.join(root, "inbox", "processed", runId);
  fs.mkdirSync(processed, { recursive: true });
  for (const it of items) {
    for (const f of [it.file, it.sidecar].filter((x): x is string => Boolean(x))) {
      fs.renameSync(f, path.join(processed, path.relative(path.join(root, "inbox"), f).split(path.sep).join("__")));
    }
  }
  const refsTotal = [...resolved.values()].flat();
  return {
    ...closeRun(run, "completed", { reason: `${items.length} item(s) taken in; ${refsTotal.length} work(s) named, ${refsTotal.filter((r) => r.url).length} resolved to locators${notesOut.length ? `; ${notesOut.join("; ")}` : ""}${left.length ? `; left in the inbox: ${left.map((l) => l.name).join(", ")}` : ""}` }),
    items: items.length,
    left,
    reportFile,
  };
}
