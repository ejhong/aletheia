/**
 * The experiment's measures (DESIGN.md), computed from assessment files.
 *   node proposals/assessment-experiments/2026-09-30-verdict-definitions/analyse.mts
 * Arms are lists of runs; a run is the check assessments that one check run produced (their `producedBy`).
 */
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { seatKey } from "../../../src/lib/seat-key.mjs";
import { withinOneStep } from "../../../src/domain/standing.ts";
import type { AssessmentState } from "../../../src/domain/schema.ts";

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, "../../..");
interface Check { producedBy: string; seat: string; verdict: AssessmentState; claims: Map<string, AssessmentState> }
const read = (file: string): Check => {
  const a = parse(fs.readFileSync(file, "utf8"));
  return { producedBy: a.producedBy, seat: seatKey(a.model), verdict: a.caseAssessment.verdict, claims: new Map(a.claimAssessments.map((c: { claimId: string; verdict: AssessmentState }) => [c.claimId, c.verdict])) };
};
const filesIn = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".yaml")).map((f) => path.join(dir, f)) : []);
const all = [...filesIn(path.join(root, "content/cases/deep-memory/assessments")), ...filesIn(path.join(here, "runs"))].map(read).filter((c) => c.producedBy);

const arms: Record<string, string[]> = JSON.parse(fs.readFileSync(path.join(here, "arms.json"), "utf8"));
const SEATS = ["openai", "google", "xai", "venice"];
const pct = (n: number, d: number) => `${n}/${d} (${Math.round((100 * n) / d)}%)`;

for (const [arm, runs] of Object.entries(arms)) {
  console.log(`\n== arm ${arm}: ${runs.join(", ")}`);
  const bySeat = new Map<string, Check[]>();
  for (const run of runs) for (const c of all.filter((x) => x.producedBy === run)) bySeat.set(c.seat, [...(bySeat.get(c.seat) ?? []), c]);
  for (const seat of SEATS) {
    const checks = bySeat.get(seat) ?? [];
    if (checks.length !== runs.length) { console.log(`${seat.padEnd(8)} answered ${checks.length} of ${runs.length} runs — not measured`); continue; }
    const ids = [...checks[0].claims.keys()].filter((id) => checks.every((c) => c.claims.has(id)));
    const exact = ids.filter((id) => new Set(checks.map((c) => c.claims.get(id))).size === 1).length;
    const near = ids.filter((id) => checks.every((a) => checks.every((b) => withinOneStep(a.claims.get(id)!, b.claims.get(id)!)))).length;
    console.log(`${seat.padEnd(8)} exact ${pct(exact, ids.length).padEnd(13)} within one step ${pct(near, ids.length).padEnd(13)} case verdicts: ${checks.map((c) => c.verdict).join(", ")}${new Set(checks.map((c) => c.verdict)).size === 1 ? " (same)" : " (DIFFER)"}`);
  }
  // Panel agreement: each seat's first run in the arm, every pair of seats, every claim.
  const first = SEATS.map((s) => (bySeat.get(s) ?? [])[0]).filter(Boolean);
  let pairs = 0, within = 0, same = 0;
  for (let i = 0; i < first.length; i++) for (let j = i + 1; j < first.length; j++) for (const [id, v] of first[i].claims) {
    const w = first[j].claims.get(id); if (!w) continue;
    pairs++; if (withinOneStep(v, w)) within++; if (v === w) same++;
  }
  if (pairs) console.log(`panel (first run, ${first.length} seats): pairs within one step ${pct(within, pairs)}, the same word ${pct(same, pairs)}`);
}
