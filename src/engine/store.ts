import fs from "node:fs";
import path from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { RunRecordSchema, type Cost, type RunRecord, type Verb } from "../domain/intake.ts";
import { runsDir } from "../domain/runs.ts";
import { hhmmssUTC, isoDate } from "../lib/overlay-ids.mjs";
import { loadBudget } from "./budget.ts";
import { configFile } from "./config.ts";
import { spendFor, sumCost, type Meter } from "./spend.ts";

export { readRuns, runDir, runsDir } from "../domain/runs.ts";

/**
 * The run store: one directory per run under runs/<runId>/, holding the run
 * record (run.yaml) and whatever working material the run kept beside it —
 * a seat's raw reply, a session's log. Nothing else remembers anything.
 *
 * Run ids are minted the way overlay ids are (src/lib/overlay-ids.mjs):
 * date, verb, subject, and a UTC time — unique without a filesystem probe
 * and monotonic within a day.
 */
export function newRunId(verb: Verb, subject: string, now = new Date()): string {
  return `${isoDate(now)}-${verb}-${subject}-${hhmmssUTC(now)}`;
}

/**
 * The frame every run happens inside: one id, one date, one meter for the
 * spend ledger, and the stamp its run record will carry. `openRun` mints
 * it; `closeRun` writes the record with the outcome, the reason, and the
 * cost — always what the spend ledger holds for the run.
 */
export interface Run {
  runId: string;
  date: string;
  root: string;
  meter: Meter;
  stamp: Pick<RunRecord, "runId" | "verb" | "case" | "date" | "model" | "promptVersion" | "inputHash">;
}

/** What every run returns; a run adds the files it wrote. */
export interface RunOutcome {
  outcome: RunRecord["outcome"];
  runId: string;
  reason?: string;
  cost?: Cost;
  /** The content files the run wrote, as the run record lists them. */
  wrote?: string[];
}

export function openRun(
  verb: Verb,
  subject: string,
  stamp: { model: string | null; promptVersion: string | null; inputHash?: string | null },
  opts: { now?: Date; root?: string; runId?: string } = {},
): Run {
  const now = opts.now ?? new Date();
  const root = opts.root ?? process.cwd();
  const runId = opts.runId ?? newRunId(verb, subject, now);
  const date = isoDate(now);
  return {
    runId,
    date,
    root,
    meter: { runId, verb, case: subject, root },
    stamp: { runId, verb, case: subject, date, model: stamp.model, promptVersion: stamp.promptVersion, inputHash: stamp.inputHash ?? null },
  };
}

/**
 * Write the run record and return the outcome; `model` overrides the stamp
 * when the call answered from another model. A run whose cost passed the
 * per-run ceiling is not undone — the money is spent and the work kept —
 * but the record says so, because the estimate that admitted it was wrong.
 */
export function closeRun(run: Run, outcome: RunRecord["outcome"], extra: { reason?: string; model?: string; wrote?: string[] } = {}): RunOutcome {
  const cost = sumCost(spendFor(run.runId, run.root));
  const cap = fs.existsSync(configFile("budget", run.root)) ? loadBudget(run.root).usd.perRun : null;
  const over = cap !== null && cost.usd !== null && cost.usd > cap ? `OVER THE PER-RUN CEILING: $${cost.usd} spent against $${cap}` : null;
  const reason = [extra.reason, over].filter(Boolean).join(" — ") || undefined;
  if (over) console.error(`${run.runId}: ${over}`);
  const stamp = extra.model === undefined ? run.stamp : { ...run.stamp, model: extra.model };
  const wrote = extra.wrote?.length ? extra.wrote : undefined;
  writeRun({ ...stamp, outcome, cost, ...(reason ? { notes: reason } : {}), ...(wrote ? { wrote } : {}) }, run.root);
  return { outcome, runId: run.runId, ...(reason ? { reason } : {}), cost, ...(wrote ? { wrote } : {}) };
}

export function writeRun(run: RunRecord, root = process.cwd()): string {
  const parsed = RunRecordSchema.parse(run);
  const dir = path.join(runsDir(root), parsed.runId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "run.yaml"), stringifyYaml(parsed, { lineWidth: 0, aliasDuplicateObjects: false }));
  return dir;
}

export function writeWorkingFile(runId: string, name: string, text: string, root = process.cwd()): string {
  const file = path.join(runsDir(root), runId, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}
