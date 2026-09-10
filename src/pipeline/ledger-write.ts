import fs from "node:fs";
import path from "node:path";
import { Document, isSeq, parse as parseYaml, parseDocument, stringify as stringifyYaml } from "yaml";
import type { ChangeLogEntry } from "../domain/schema.ts";

/**
 * Appending to the hand-written ledger files without touching a byte of
 * what is already there. Re-serializing a parsed document reflows folded
 * text and pads flow sequences (the first materialized proposal turned a
 * 36-line addition into a 519-line diff), so items are appended as text:
 * the file is parsed only to prove it is a YAML list, and the new items are
 * serialized on their own and written after the existing content. Records
 * are appended, never rewritten; a correction is a later record or an
 * explicit correction in a proposal the panel sees.
 */

export type LedgerFile = "claims.yaml" | "evidence.yaml" | "sources.yaml" | "research.yaml" | "images.yaml";

/** Append `items` to the YAML list in `file` (created with `header` when absent), preserving existing bytes. */
export function appendYamlItems(file: string, items: unknown[], header?: string): number {
  if (items.length === 0) return 0;
  const block = stringifyYaml(items, { lineWidth: 0 });
  if (!fs.existsSync(file)) {
    const doc = new Document(items);
    if (header) doc.commentBefore = header.replace(/^# ?/gm, " ").trimEnd();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, doc.toString({ lineWidth: 0 }));
    return items.length;
  }
  const text = fs.readFileSync(file, "utf8");
  const existing = parseYaml(text);
  if (existing === null || existing === undefined) {
    // Comments only, or empty: keep them, start the list below.
    fs.writeFileSync(file, `${text.replace(/\s*$/, "")}\n\n${block}`);
    return items.length;
  }
  if (!Array.isArray(existing)) throw new Error(`${file} is not a YAML list`);
  if (existing.length === 0 && /\[\s*\]\s*$/.test(text)) {
    // An empty flow list `[]` cannot be appended to; replace it with the block.
    fs.writeFileSync(file, `${text.replace(/\[\s*\]\s*$/, "")}${block}`);
    return items.length;
  }
  fs.writeFileSync(file, `${text.replace(/\s*$/, "")}\n\n${block}`);
  return items.length;
}

export function appendRecords(caseDir: string, file: LedgerFile, records: unknown[], root = process.cwd()): number {
  return appendYamlItems(path.join(root, "content", "cases", caseDir, file), records);
}

export function appendHistory(caseDir: string, entry: ChangeLogEntry, root = process.cwd()): void {
  appendYamlItems(path.join(root, "content", "cases", caseDir, "history.yaml"), [entry]);
}

export function writeYamlFile(file: string, header: string, value: unknown): void {
  const doc = new Document(value);
  doc.commentBefore = header.replace(/^# ?/gm, " ").trimEnd();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, doc.toString({ lineWidth: 0 }));
}

/** True when `text` parses to a YAML list — the shape every ledger file must keep. */
export function isYamlList(text: string): boolean {
  const doc = parseDocument(text);
  return doc.contents === null || isSeq(doc.contents);
}

// ------------------------------------------------------------ corrections

/**
 * Change one field of one record in place, every other byte untouched. The
 * record is found by its `- id:` line, the field by its indented key; the
 * old scalar (plain, quoted, or block) is replaced by a fresh serialization
 * of the new value. Fails closed when the record or field is missing, when
 * the current value is not the one the correction was written against
 * (`from`), or when the edited file does not parse to the old document with
 * exactly that one change.
 */
export function setField(file: string, id: string, field: string, from: unknown, to: unknown): void {
  const text = fs.readFileSync(file, "utf8");
  const before = parseYaml(text) as Record<string, unknown>[];
  if (!Array.isArray(before)) throw new Error(`${file} is not a YAML list`);
  const idx = before.findIndex((r) => r && r.id === id);
  if (idx === -1) throw new Error(`${path.basename(file)} has no record ${id}`);
  if (JSON.stringify(before[idx][field] ?? null) !== JSON.stringify(from ?? null)) {
    throw new Error(`${id}.${field} is not the value the correction was written against; current: ${JSON.stringify(before[idx][field] ?? null).slice(0, 160)}`);
  }
  const lines = text.split("\n");
  const startLine = lines.findIndex((l) => new RegExp(`^- id: ${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`).test(l));
  if (startLine === -1) throw new Error(`${path.basename(file)}: record ${id} does not start with a plain "- id:" line and cannot be edited in place`);
  let endLine = startLine + 1;
  while (endLine < lines.length && !/^- /.test(lines[endLine])) endLine++;
  const fieldLine = lines.slice(startLine + 1, endLine).findIndex((l) => new RegExp(`^  ${field}:`).test(l));
  const replacement = stringifyYaml({ [field]: to }, { lineWidth: 0 })
    .replace(/\n$/, "")
    .split("\n")
    .map((l) => `  ${l}`);
  let edited: string;
  if (fieldLine === -1) {
    // An absent field (the correction's `from` is null/undefined) is added at the end of the record.
    if (from !== undefined && from !== null) throw new Error(`${id} has no field ${field} written at the record's indent`);
    let insertAt = endLine;
    while (insertAt > startLine + 1 && lines[insertAt - 1].trim() === "") insertAt--;
    edited = [...lines.slice(0, insertAt), ...replacement, ...lines.slice(insertAt)].join("\n");
  } else {
    const fStart = startLine + 1 + fieldLine;
    let fEnd = fStart + 1;
    while (fEnd < endLine && !/^  [A-Za-z_][A-Za-z0-9_]*:/.test(lines[fEnd]) && !/^\s*#/.test(lines[fEnd])) fEnd++;
    edited = [...lines.slice(0, fStart), ...replacement, ...lines.slice(fEnd)].join("\n");
  }
  const after = parseYaml(edited) as Record<string, unknown>[];
  const expected = before.map((r, i) => (i === idx ? { ...r, [field]: to } : r));
  if (JSON.stringify(after) !== JSON.stringify(expected)) {
    throw new Error(`${path.basename(file)}: editing ${id}.${field} in place would change more than that field; nothing written`);
  }
  fs.writeFileSync(file, edited);
}

export interface Correction {
  record: string;
  field: string;
  from: unknown;
  to: unknown;
  reason: string;
}

const FILE_OF_PREFIX: Record<string, LedgerFile> = { C: "claims.yaml", E: "evidence.yaml", R: "research.yaml" };

/** The ledger file a record id lives in: SRC-… sources; IMG-… images; <CASE>-C… claims, -E… evidence, -R… research. */
export function ledgerFileFor(id: string): LedgerFile | null {
  if (id.startsWith("SRC-")) return "sources.yaml";
  if (id.startsWith("IMG-")) return "images.yaml";
  const m = id.match(/-([CER])\d+$/);
  return m ? FILE_OF_PREFIX[m[1]] : null;
}

/**
 * Apply a proposal's corrections to the case, one history entry for all of
 * them. A correction whose `from` no longer matches is not applied and is
 * reported — the ledger moved under it, and someone must look.
 */
/** A value as the history line shows it: a string whole and quoted, anything else as JSON, an absent field as null — a reader reconstructs the change from the line (review note #276: an object had printed as "[object Object]", a long string cut at eighty characters). */
export function shown(value: unknown): string {
  if (value === undefined || value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  return JSON.stringify(value);
}

export function applyCorrections(
  caseDir: string,
  corrections: Correction[],
  ctx: { date: string; actor: string; proposalRef: string; root?: string },
): { applied: Correction[]; skipped: { correction: Correction; reason: string }[] } {
  const root = ctx.root ?? process.cwd();
  const applied: Correction[] = [];
  const skipped: { correction: Correction; reason: string }[] = [];
  for (const c of corrections) {
    const file = ledgerFileFor(c.record);
    if (!file) {
      skipped.push({ correction: c, reason: `no ledger file for record id ${c.record}` });
      continue;
    }
    try {
      setField(path.join(root, "content", "cases", caseDir, file), c.record, c.field, c.from, c.to);
      applied.push(c);
    } catch (e) {
      skipped.push({ correction: c, reason: (e as Error).message });
    }
  }
  if (applied.length) {
    appendHistory(
      caseDir,
      {
        date: ctx.date,
        change: `Correction${applied.length === 1 ? "" : "s"} applied from ${ctx.proposalRef}: ${applied.map((c) => `${c.record}.${c.field} — ${shown(c.from)} → ${shown(c.to)}`).join("; ")}.`,
        reason: applied.map((c) => `${c.record}: ${c.reason}`).join(" | "),
        actor: ctx.actor,
        aiAssisted: true,
        kind: "content",
      },
      root,
    );
  }
  return { applied, skipped };
}
