/**
 * The experiment's measures (DESIGN.md), computed from the seats' raw replies.
 *   node proposals/assessment-experiments/2026-09-30-verdict-definitions/analyse.mts
 */
import { withinOneStep } from "../../../src/domain/standing.ts";
import { arms, pct, reply, SEATS } from "./lib.mts";

for (const [arm, runs] of Object.entries(arms())) {
  console.log(`\n== arm ${arm}: ${runs.join(", ")}`);
  for (const seat of SEATS) {
    const checks = runs.map((r) => reply(r, seat));
    const ids = [...checks[0].claims.keys()].filter((id) => checks.every((c) => c.claims.has(id)));
    const exact = ids.filter((id) => new Set(checks.map((c) => c.claims.get(id))).size === 1).length;
    const near = ids.filter((id) => checks.every((a) => checks.every((b) => withinOneStep(a.claims.get(id)!, b.claims.get(id)!)))).length;
    console.log(`${seat.padEnd(7)} exact ${pct(exact, ids.length).padEnd(13)} within one step ${pct(near, ids.length).padEnd(13)} case verdicts: ${checks.map((c) => c.verdict).join(", ")}${new Set(checks.map((c) => c.verdict)).size === 1 ? " (same)" : " (DIFFER)"}`);
  }
  // Panel agreement: each seat's first run in the arm, every pair of seats, every claim.
  const first = SEATS.map((s) => reply(runs[0], s));
  let pairs = 0, within = 0, same = 0;
  for (let i = 0; i < first.length; i++) for (let j = i + 1; j < first.length; j++) for (const [id, v] of first[i].claims) {
    const w = first[j].claims.get(id); if (!w) continue;
    pairs++; if (withinOneStep(v, w)) within++; if (v === w) same++;
  }
  console.log(`panel (first run, ${first.length} seats): pairs within one step ${pct(within, pairs)}, the same word ${pct(same, pairs)}`);
}
