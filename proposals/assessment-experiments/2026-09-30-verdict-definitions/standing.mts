/**
 * What standing each run would have given Deep Memory (added after the runs; not in DESIGN.md): the four seats'
 * replies from one run, with the Anthropic seat's one check of the same ledger, put through the site's own rule.
 *   node proposals/assessment-experiments/2026-09-30-verdict-definitions/standing.mts
 */
import { findCase } from "../../../src/domain/load.ts";
import { AssessmentRunSchema } from "../../../src/domain/schema.ts";
import { ratification } from "../../../src/domain/standing.ts";
import { VENDORS } from "../../../src/lib/vendors.mjs";
import { arms, reply, SEATS } from "./lib.mts";

const loaded = findCase("deep-memory");
const opus = loaded.assessmentRuns.find((r) => r.runId === "2026-09-30-check-opus-053723")!;
const others = loaded.assessmentRuns.filter((r) => r.role !== "check");
for (const [arm, runs] of Object.entries(arms())) {
  console.log(`\n== ${arm}`);
  for (const run of runs) {
    // Each reply stamped as the check verb stamps one (src/pipeline/check.ts): the same ledger, the seat's own label.
    const seats = SEATS.map((s) => AssessmentRunSchema.parse({ ...reply(run, s).raw, runId: `${run}-${s}`, producedBy: run, date: run.slice(0, 10), promptVersion: "check", humanReviewed: false, role: "check", model: `${VENDORS[s].label} — independent check run via ${VENDORS[s].model}`, basis: { ledgerHash: loaded.ledgerHash } }));
    const r = ratification({ ...loaded, assessmentRuns: [...others, ...seats, opus] })!;
    console.log(`${run.slice(-6)}: ${r.status.padEnd(10)} ${r.agreeing}/${r.panel} within one step on the case verdict; ${r.reason} | case verdicts: ${seats.map((s) => s.caseAssessment.verdict).join(", ")}, ${opus.caseAssessment.verdict} (Anthropic, one check)`);
  }
}
