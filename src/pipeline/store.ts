import fs from "node:fs";
import path from "node:path";
import { Document, isSeq, parse as parseYaml, parseDocument, stringify as stringifyYaml } from "yaml";
import {
  DispositionSchema,
  ProposalSchema,
  RunRecordSchema,
  type Disposition,
  type Proposal,
  type RunRecord,
  type Verb,
} from "../domain/intake.ts";
import { hhmmssUTC } from "../../scripts/lib/overlay-ids.mjs";

/**
 * The intake store (docs/AUTOMATION.md, "The layout"): one directory per
 * run under proposals/<runId>/ holding the proposal envelope, the run
 * record, and any working material (report.md, novelty.md); and the
 * per-case append-only dispositions.yaml. Nothing else remembers anything.
 *
 * Run ids are minted the way overlay ids are (scripts/lib/overlay-ids.mjs):
 * date, verb, case, and a UTC time — unique without a filesystem probe and
 * monotonic within a day.
 */

export const proposalsDir = (root = process.cwd()) => path.join(root, "proposals");

export function newRunId(verb: Verb, caseSlug: string, now = new Date()): string {
  return `${now.toISOString().slice(0, 10)}-${verb}-${caseSlug}-${hhmmssUTC(now)}`;
}

export function runDir(runId: string, root = process.cwd()): string {
  return path.join(proposalsDir(root), runId);
}

export function writeProposal(proposal: Proposal, root = process.cwd()): string {
  const parsed = ProposalSchema.parse(proposal);
  const dir = runDir(parsed.runId, root);
  fs.mkdirSync(dir, { recursive: true });
  const header = `# Proposal — a change to domain records, in one envelope (docs/AUTOMATION.md).\n# Never citable; nothing here is a record until adopted through the gate.\n`;
  fs.writeFileSync(path.join(dir, "proposal.yaml"), header + stringifyYaml(parsed, { lineWidth: 0 }));
  return dir;
}

export function writeRun(run: RunRecord, root = process.cwd()): string {
  const parsed = RunRecordSchema.parse(run);
  const dir = runDir(parsed.runId, root);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "run.yaml"), stringifyYaml(parsed, { lineWidth: 0 }));
  return dir;
}

export function writeWorkingFile(runId: string, name: string, text: string, root = process.cwd()): string {
  const dir = runDir(runId, root);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, text);
  return file;
}

/** Every run record under proposals/, oldest first. Directories without run.yaml are ignored. */
export function readRuns(root = process.cwd()): RunRecord[] {
  const dir = proposalsDir(root);
  if (!fs.existsSync(dir)) return [];
  const runs: RunRecord[] = [];
  for (const name of fs.readdirSync(dir)) {
    const f = path.join(dir, name, "run.yaml");
    if (!fs.existsSync(f)) continue;
    const parsed = RunRecordSchema.safeParse(parseYaml(fs.readFileSync(f, "utf8")));
    if (parsed.success) runs.push(parsed.data);
  }
  return runs.sort((a, b) => a.date.localeCompare(b.date) || a.runId.localeCompare(b.runId));
}

export function readProposal(runId: string, root = process.cwd()): Proposal | null {
  const f = path.join(runDir(runId, root), "proposal.yaml");
  if (!fs.existsSync(f)) return null;
  return ProposalSchema.parse(parseYaml(fs.readFileSync(f, "utf8")));
}

const DISPOSITIONS_HEADER = `# Dispositions — every candidate ever considered for this case, and what
# became of it (docs/AUTOMATION.md, "Memory records decisions in context").
# Append-only. Six words: in, duplicate, irrelevant, blocked, failed,
# excluded. A row is a dated judgment against the ledger as it stood, not a
# verdict: a later row for the same key supersedes it, and producers are
# handed the declined set with reasons so they can re-propose by naming
# what changed. Keys are mechanical (src/domain/keys.ts).
`;

/** Append rows to a case's dispositions.yaml, preserving existing comments. Rows are validated first. */
export function appendDispositions(caseDir: string, rows: Disposition[], root = process.cwd()): number {
  if (rows.length === 0) return 0;
  const parsed = rows.map((r) => DispositionSchema.parse(r));
  const file = path.join(root, "content", "cases", caseDir, "dispositions.yaml");
  let doc: Document;
  if (fs.existsSync(file)) {
    doc = parseDocument(fs.readFileSync(file, "utf8"));
    if (!isSeq(doc.contents)) throw new Error(`${file} is not a YAML list`);
  } else {
    doc = new Document([]);
    doc.commentBefore = DISPOSITIONS_HEADER.replace(/^# ?/gm, " ").trimEnd();
  }
  for (const row of parsed) (doc.contents as { items: unknown[] }).items.push(doc.createNode(row));
  fs.writeFileSync(file, doc.toString({ lineWidth: 0 }));
  return parsed.length;
}
