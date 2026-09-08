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
