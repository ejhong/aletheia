/** Shared by the experiment's scripts: read a check run's raw seat replies as assessment runs. */
import fs from "node:fs";
import path from "node:path";
import { parseYamlReply } from "../../../src/lib/yaml-reply.mjs";
import type { AssessmentState } from "../../../src/domain/schema.ts";

export const here = path.dirname(new URL(import.meta.url).pathname);
export const root = path.resolve(here, "../../..");
/** The four seats of the experiment, by the name the roster and the reply files give them. */
export const SEATS = ["openai", "gemini", "xai", "venice"] as const;
export const RANK: Record<string, number> = { contradicted: 1, weakly_supported: 2, unresolved: 2.5, presently_untestable: 2.5, mixed: 3, provisionally_supported: 4, well_supported: 5, established: 6 };

export interface Reply { run: string; seat: string; verdict: AssessmentState; claims: Map<string, AssessmentState>; raw: Record<string, unknown> }

/** A run's directory: the experiment's own (arms A and B), or the sitting's under proposals/ (the runs of 2026-09-28). */
export const runDir = (run: string) => [path.join(here, "runs", run), path.join(root, "proposals", run)].find((d) => fs.existsSync(d))!;

/** One seat's reply in one run, as the seat gave it (no reply in these runs needed its repair round). */
export function reply(run: string, seat: string): Reply {
  const raw = parseYamlReply(fs.readFileSync(path.join(runDir(run), `seat-${seat}.yaml`), "utf8")) as { caseAssessment: { verdict: AssessmentState }; claimAssessments: { claimId: string; verdict: AssessmentState }[] };
  return { run, seat, verdict: raw.caseAssessment.verdict, claims: new Map(raw.claimAssessments.map((c) => [c.claimId, c.verdict])), raw: raw as unknown as Record<string, unknown> };
}

export const arms = (): Record<string, string[]> => JSON.parse(fs.readFileSync(path.join(here, "arms.json"), "utf8"));
export const pct = (n: number, d: number) => `${n}/${d} (${Math.round((100 * n) / d)}%)`;
