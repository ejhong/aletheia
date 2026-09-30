/**
 * Descriptions added after the runs (not in DESIGN.md, and reported as such): between which words a seat's three
 * verdicts on one claim fell, and how far a seat's median over three runs agrees with its median over three others.
 *   node proposals/assessment-experiments/2026-09-30-verdict-definitions/describe.mts
 */
import { withinOneStep } from "../../../src/domain/standing.ts";
import type { AssessmentState } from "../../../src/domain/schema.ts";
import { arms, RANK, reply, SEATS } from "./lib.mts";

const median = (vs: AssessmentState[]) => [...vs].sort((a, b) => RANK[a] - RANK[b])[Math.floor(vs.length / 2)];
for (const [arm, runs] of Object.entries(arms())) {
  console.log(`\n== ${arm}`);
  for (const seat of SEATS) {
    const checks = runs.map((r) => reply(r, seat));
    const spreads: Record<string, number> = {};
    for (const id of checks[0].claims.keys()) {
      const words = [...new Set(checks.map((c) => c.claims.get(id)!))].sort((a, b) => RANK[a] - RANK[b]);
      if (words.length > 1) spreads[words.join(" / ")] = (spreads[words.join(" / ")] ?? 0) + 1;
    }
    console.log(`${seat.padEnd(7)} claims where its three verdicts differ: ${Object.entries(spreads).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n}× ${k}`).join("; ") || "none"}`);
  }
}
const [S, A, B] = Object.values(arms());
console.log("\n== a seat's median of three runs, against another three");
for (const seat of SEATS) {
  const of = (runs: string[]) => runs.map((r) => reply(r, seat));
  const ids = [...of(S)[0].claims.keys()];
  const med = (runs: string[]) => new Map(ids.map((id) => [id, median(of(runs).map((c) => c.claims.get(id)!))]));
  const agree = (x: Map<string, AssessmentState>, y: Map<string, AssessmentState>) => `exact ${ids.filter((id) => x.get(id) === y.get(id)).length}/25, within one step ${ids.filter((id) => withinOneStep(x.get(id)!, y.get(id)!)).length}/25`;
  console.log(`${seat.padEnd(7)} v2 median 09-28 vs v2 median 09-30: ${agree(med(S), med(A))} | first run 09-28 vs first run 09-30: ${agree(of(S)[0].claims, of(A)[0].claims)} | v2 median vs v3 median, 09-30: ${agree(med(A), med(B))}`);
}

// How much of the disagreement beyond one step is one pair of words.
console.log("\n== beyond one step, and the pair weakly supported / provisionally supported");
let allBeyond = 0, allPair = 0;
for (const [arm, runs] of Object.entries(arms())) {
  let beyond = 0, pair = 0;
  for (const seat of SEATS) {
    const checks = runs.map((r) => reply(r, seat));
    for (const id of checks[0].claims.keys()) {
      const words = checks.map((c) => c.claims.get(id)!);
      if (words.every((a) => words.every((b) => withinOneStep(a, b)))) continue;
      beyond++;
      if (words.includes("weakly_supported") && words.includes("provisionally_supported")) pair++;
    }
  }
  allBeyond += beyond; allPair += pair;
  console.log(`${arm}: ${beyond} of 100 seat-claims have verdicts more than one step apart; in ${pair} of them the seat said both "weakly supported" and "provisionally supported"`);
}
console.log(`all arms: ${allPair} of ${allBeyond}`);
