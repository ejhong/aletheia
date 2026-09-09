import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  DispositionSchema,
  ProposalSchema,
  RunRecordSchema,
  type Cost,
  type Disposition,
  type Proposal,
  type RunRecord,
  type Verb,
} from "../domain/intake.ts";
import { hhmmssUTC, isoDate } from "../lib/overlay-ids.mjs";
import { loadBudget } from "./budget.ts";
import { configFile } from "./config.ts";
import { appendYamlItems } from "./ledger-write.ts";
import { spendFor, sumCost, type Meter } from "./spend.ts";

/**
 * The intake store (docs/AUTOMATION.md, "The layout"): one directory per
 * run under proposals/<runId>/ holding the proposal envelope, the run
 * record, and any working material (report.md, novelty.md); and the
 * per-case append-only dispositions.yaml. Nothing else remembers anything.
 *
 * Run ids are minted the way overlay ids are (src/lib/overlay-ids.mjs):
 * date, verb, case, and a UTC time — unique without a filesystem probe and
 * monotonic within a day.
 */

export const proposalsDir = (root = process.cwd()) => path.join(root, "proposals");

export function newRunId(verb: Verb, caseSlug: string, now = new Date()): string {
  return `${isoDate(now)}-${verb}-${caseSlug}-${hhmmssUTC(now)}`;
}

/**
 * The frame every verb runs inside: one id, one date, one meter for the
 * spend ledger, and the stamp its run record will carry. `openRun` mints
 * it; `closeRun` writes the record with the outcome, the reason, and the
 * cost — always what the spend ledger holds for the run: zero for a rest,
 * a failure's spend included, and a dry run's too when it consulted a model.
 */
export interface Run {
  runId: string;
  date: string;
  root: string;
  meter: Meter;
  stamp: Pick<RunRecord, "runId" | "verb" | "case" | "date" | "model" | "promptVersion" | "inputHash">;
}

/** What every verb returns; a verb adds the files it wrote. */
export interface RunOutcome {
  outcome: RunRecord["outcome"];
  runId: string;
  reason?: string;
  cost?: Cost;
}

export function openRun(
  verb: Verb,
  caseSlug: string,
  stamp: { model: string | null; promptVersion: string | null; inputHash?: string | null },
  opts: { now?: Date; root?: string } = {},
): Run {
  const now = opts.now ?? new Date();
  const root = opts.root ?? process.cwd();
  const runId = newRunId(verb, caseSlug, now);
  const date = isoDate(now);
  return {
    runId,
    date,
    root,
    meter: { runId, verb, case: caseSlug, root },
    stamp: { runId, verb, case: caseSlug, date, model: stamp.model, promptVersion: stamp.promptVersion, inputHash: stamp.inputHash ?? null },
  };
}

/**
 * Write the run record and return the outcome; `model` overrides the stamp
 * when the call answered from another model. A run whose ledger cost passed
 * the per-run ceiling is not undone — the money is spent and the work kept —
 * but the record says so, loudly, because the estimate that admitted it was
 * wrong and must be looked at.
 */
export function closeRun(run: Run, outcome: RunRecord["outcome"], extra: { reason?: string; model?: string } = {}): RunOutcome {
  const cost = sumCost(spendFor(run.runId, run.root));
  const cap = fs.existsSync(configFile("budget", run.root)) ? loadBudget(run.root).usd.perRun : null;
  const over = cap !== null && cost.usd !== null && cost.usd > cap ? `OVER THE PER-RUN CEILING: $${cost.usd} spent against $${cap}; the estimate under-read this call` : null;
  const reason = [extra.reason, over].filter(Boolean).join(" — ") || undefined;
  if (over) console.error(`${run.runId}: ${over}`);
  const stamp = extra.model === undefined ? run.stamp : { ...run.stamp, model: extra.model };
  writeRun({ ...stamp, outcome, cost, ...(reason ? { notes: reason } : {}) }, run.root);
  return { outcome, runId: run.runId, ...(reason ? { reason } : {}), cost };
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
  const file = path.join(runDir(runId, root), name);
  fs.mkdirSync(path.dirname(file), { recursive: true }); // `name` may carry a subdirectory (documents/…)
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

/** Append rows to a case's dispositions.yaml, existing bytes untouched. Rows are validated first. */
export function appendDispositions(caseDir: string, rows: Disposition[], root = process.cwd()): number {
  const parsed = rows.map((r) => DispositionSchema.parse(r));
  return appendYamlItems(path.join(root, "content", "cases", caseDir, "dispositions.yaml"), parsed, DISPOSITIONS_HEADER);
}
