/**
 * Run records (proposals/<runId>/run.yaml): what each verb did, when, at
 * what cost, with what outcome. Read here by the domain so the pages and
 * the pipeline see the same records; the pipeline's store writes them.
 */
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { ProposalSchema, RunRecordSchema, type Proposal, type RunRecord } from "./intake.ts";

export const proposalsDir = (root = process.cwd()) => path.join(root, "proposals");
export function runDir(runId: string, root = process.cwd()): string {
  return path.join(proposalsDir(root), runId);
}

/** A run's proposal envelope, when it wrote one. */
export function readProposal(runId: string, root = process.cwd()): Proposal | null {
  const f = path.join(runDir(runId, root), "proposal.yaml");
  if (!fs.existsSync(f)) return null;
  return ProposalSchema.parse(parseYaml(fs.readFileSync(f, "utf8")));
}

/** Every run record, oldest first (date, then runId). Unparsable records are skipped, never repaired. */
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

/**
 * The files a run's record says it wrote that are not in the repository, by name. A run's record is what the verb
 * did; what is published is what passed the gate. A check the gate refuses, or one withheld before it reaches the
 * gate, leaves its run with the file named and absent (2026-09-30: the Google seat's check of Cast, Not Carved,
 * which gave as a primary text's own what the ledger holds secondhand).
 */
export function unpublishedFiles(run: Pick<RunRecord, "wrote">, root = process.cwd()): string[] {
  return (run.wrote ?? []).filter((file) => !fs.existsSync(path.join(root, file))).map((file) => path.basename(file));
}

/** `describeRun`, with what of the run's output is not published: a reader should not take what a verb did for what the site shows. */
export function describeRunAsPublished(run: RunRecord, root = process.cwd()): string {
  const absent = unpublishedFiles(run, root).length;
  if (!absent) return describeRun(run);
  const wrote = run.wrote!.length;
  const noun = run.verb === "check" ? "check" : "file";
  const what = wrote === 1 ? `the one ${noun} it wrote is not published` : absent === wrote ? `none of the ${wrote} ${noun}s it wrote is published` : `${absent} of the ${wrote} ${noun}s it wrote ${absent === 1 ? "is" : "are"} not published`;
  return `${describeRun(run)}; ${what}`;
}

/** A run's notes in a reader's words: what the verb did, from the record it left. */
export function describeRun(run: RunRecord): string {
  const notes = run.notes ?? "";
  if (run.verb === "verify") {
    const m = notes.match(/wrote (\{[^}]*\})(?:; (\d+) rejected)?/);
    if (m) {
      try {
        const w = JSON.parse(m[1]) as Record<string, number>;
        const parts = (["claims", "evidence", "sources", "research"] as const).filter((k) => w[k]).map((k) => `${w[k]} ${k}`);
        const refused = m[2] ? `${m[2]} refused` : "";
        const corrections = notes.match(/(\d+) correction\(s\) applied/)?.[1];
        return [parts.length ? `admitted ${parts.join(", ")}` : "admitted nothing", refused, corrections ? `${corrections} correction(s) applied` : ""].filter(Boolean).join("; ");
      } catch {
        /* fall through to the notes */
      }
    }
  }
  if (run.verb === "inbox") return notes.split(";")[0] || "took in the inbox";
  if (run.verb === "report") return `research pass${run.model ? ` (${run.model})` : ""}`;
  if (run.verb === "draft") return notes || "drafted a proposal";
  if (run.verb === "edition") return notes === "new assessment" ? "a new edition with a new assessment" : notes || "a new edition";
  if (run.verb === "check") return notes.replace(/\b(\d+) seat\(s\) installed/, (_, n: string) => `${n} seat${n === "1" ? "" : "s"} judged the case blind`) || "the panel judged the case";
  return notes || run.verb;
}
