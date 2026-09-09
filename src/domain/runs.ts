/**
 * Run records (proposals/<runId>/run.yaml): what each verb did, when, at
 * what cost, with what outcome. Read here by the domain so the pages and
 * the pipeline see the same records; the pipeline's store writes them.
 */
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { RunRecordSchema, type RunRecord } from "./intake.ts";

export const proposalsDir = (root = process.cwd()) => path.join(root, "proposals");

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
  if (run.verb === "check") return notes.replace(/seat\(s\) installed/, "seats judged the case blind") || "the panel judged the case";
  return notes || run.verb;
}
