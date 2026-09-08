import fs from "node:fs";
import path from "node:path";
import { Document, isSeq, parseDocument } from "yaml";
import type { ChangeLogEntry } from "../domain/schema.ts";

/**
 * Appending records to the hand-written ledger files with their comments
 * and formatting preserved (the yaml Document API). Records are appended,
 * never rewritten; a correction is a later record or an explicit
 * correction in a proposal the panel sees.
 */

export type LedgerFile = "claims.yaml" | "evidence.yaml" | "sources.yaml" | "research.yaml" | "images.yaml";

export function appendRecords(
  caseDir: string,
  file: LedgerFile,
  records: unknown[],
  root = process.cwd(),
): number {
  if (records.length === 0) return 0;
  const p = path.join(root, "content", "cases", caseDir, file);
  let doc: Document;
  if (fs.existsSync(p)) {
    doc = parseDocument(fs.readFileSync(p, "utf8"));
    if (doc.contents === null) doc.contents = doc.createNode([]) as never;
    if (!isSeq(doc.contents)) throw new Error(`${p} is not a YAML list`);
  } else {
    doc = new Document([]);
  }
  for (const r of records) (doc.contents as { items: unknown[] }).items.push(doc.createNode(r));
  fs.writeFileSync(p, doc.toString({ lineWidth: 0 }));
  return records.length;
}

export function appendHistory(caseDir: string, entry: ChangeLogEntry, root = process.cwd()): void {
  appendRecords(caseDir, "history.yaml" as LedgerFile, [entry], root);
}

export function writeYamlFile(file: string, header: string, value: unknown): void {
  const doc = new Document(value);
  doc.commentBefore = header.replace(/^# ?/gm, " ").trimEnd();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, doc.toString({ lineWidth: 0 }));
}
