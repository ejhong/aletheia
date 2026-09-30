/**
 * What would change if "weakly supported" and "provisionally supported" were one step apart on the scale, and not
 * two (AGENTS.md §3.15). A description for a decision the founder left to the operator on 2026-09-30; no model was
 * asked anything. Two readings:
 *
 *  1. every panel on the tree that can speak, against the judgment it checks, under the rule as it is and under
 *     the rule with that one pair brought within a step;
 *  2. the nine runs of the experiment on verdict definitions (../2026-09-30-verdict-definitions/), where four seats
 *     were each asked the same question three times: a seat against itself, and the standing each run would give.
 *
 *   node proposals/assessment-experiments/2026-09-30-two-words-on-the-scale/count.mts
 */
import { findCase, loadAllCases } from "../../../src/domain/load.ts";
import { adoptedAssessment, currentEdition } from "../../../src/domain/editions.ts";
import { currentChecks, latestCheckPerModel, RATIFICATION_MIN_PANEL, withinOneStep } from "../../../src/domain/standing.ts";
import type { AssessmentRun, AssessmentState } from "../../../src/domain/schema.ts";
import { unevidencedClaims } from "../../../src/pipeline/check.ts";
import { arms, reply, SEATS } from "../2026-09-30-verdict-definitions/lib.mts";

type Near = (a: AssessmentState, b: AssessmentState) => boolean;
const PAIR = new Set<AssessmentState>(["weakly_supported", "provisionally_supported"]);
const isPair = (a: AssessmentState, b: AssessmentState) => a !== b && PAIR.has(a) && PAIR.has(b);
/** The rule as it would be: the rule as it is, and that one pair. */
const asProposed: Near = (a, b) => withinOneStep(a, b) || isPair(a, b);
const split = (own: AssessmentState, seats: AssessmentState[], near: Near) => seats.filter((v) => near(v, own)).length * 2 <= seats.length;

/** The standing's rule (src/domain/standing.ts, `ratification`), over given verdicts, with the nearness rule a parameter. */
function standing(judgment: AssessmentRun, caseVerdicts: AssessmentState[], verdictsOn: (id: string) => AssessmentState[], near: Near): string {
  const agreeing = caseVerdicts.filter((v) => near(v, judgment.caseAssessment.verdict)).length;
  const restsOn = judgment.caseAssessment.loadBearing.filter((id) => {
    const own = judgment.claimAssessments.find((ca) => ca.claimId === id)?.verdict;
    const seats = verdictsOn(id);
    return own !== undefined && seats.length > 0 && split(own, seats, near);
  });
  return agreeing < caseVerdicts.length - 1 || restsOn.length ? `contested (${restsOn.join(", ") || "on the case verdict"})` : `ratified ${agreeing} of ${caseVerdicts.length}`;
}

console.log("## 1. The panels on the tree\n");
console.log("| Case | Standing as the rule is | With the two words one step apart | Claims split: now, then |");
console.log("|---|---|---|---|");
const kinds = new Map<string, { all: number; unevidenced: number }>();
const total = { verdicts: 0, far: 0, pair: 0, claims: 0, splitNow: 0, splitThen: 0 };
for (const c of loadAllCases()) {
  const judgment = adoptedAssessment(c);
  if (!judgment) continue;
  const checks = currentChecks(c, latestCheckPerModel(c));
  if (checks.length < RATIFICATION_MIN_PANEL) continue;
  const own = new Map(judgment.claimAssessments.map((ca) => [ca.claimId, ca.verdict]));
  const verdictsOn = (id: string) => checks.map((r) => r.claimAssessments.find((ca) => ca.claimId === id)?.verdict).filter((v) => v !== undefined);
  const featured = currentEdition(c).featuredClaimIds;
  const unevidenced = new Set(unevidencedClaims(c, featured));
  let now = 0, then = 0;
  for (const id of featured) {
    const base = own.get(id);
    const seats = verdictsOn(id);
    if (!base || seats.length === 0) continue;
    total.claims++;
    for (const v of seats) {
      total.verdicts++;
      if (withinOneStep(v, base)) continue;
      total.far++;
      const kind = [v, base].sort().join(" / ");
      const tally = kinds.get(kind) ?? { all: 0, unevidenced: 0 };
      tally.all++;
      if (unevidenced.has(id)) tally.unevidenced++;
      kinds.set(kind, tally);
      if (isPair(v, base)) total.pair++;
    }
    if (split(base, seats, withinOneStep)) now++;
    if (split(base, seats, asProposed)) then++;
  }
  total.splitNow += now;
  total.splitThen += then;
  const caseVerdicts = checks.map((r) => r.caseAssessment.verdict);
  console.log(`| ${c.record.title} | ${standing(judgment, caseVerdicts, verdictsOn, withinOneStep)} | ${standing(judgment, caseVerdicts, verdictsOn, asProposed)} | ${now}, ${then} |`);
}
console.log(`\nFeatured claims compared: ${total.claims}. Split as the rule is: ${total.splitNow}. Split with the two words one step apart: ${total.splitThen}.`);
console.log(`Seat verdicts on those claims: ${total.verdicts}. More than one step from the judgment: ${total.far}. Of those, one word of the pair against the other: ${total.pair}.`);
console.log(`The kinds of verdict more than one step from the judgment, most frequent first, each with how many fall on claims that have no evidence record: ${[...kinds].sort((a, b) => b[1].all - a[1].all).map(([k, t]) => `${k} ${t.all} (${t.unevidenced})`).join("; ")}.`);

console.log("\n## 2. The experiment's runs on Deep Memory, read under both rules\n");
const c = findCase("deep-memory");
const judgment = adoptedAssessment(c)!;
const opus = c.assessmentRuns.filter((r) => r.role === "check" && /-check-opus-/.test(r.runId)).sort((a, b) => a.runId.localeCompare(b.runId)).at(-1)!;
console.log(`Against the judgment as it stands (${judgment.runId}), with the Anthropic seat's check of the same ledger (${opus.runId}).\n`);
console.log("| Arm | Seat | Claims where its three answers are within one step of each other: now | then |");
console.log("|---|---|---|---|");
const runsOut: string[] = [];
for (const [arm, runs] of Object.entries(arms())) {
  for (const seat of SEATS) {
    const replies = runs.map((r) => reply(r, seat));
    const ids = [...replies[0].claims.keys()];
    const steady = (near: Near) => ids.filter((id) => { const v = replies.map((r) => r.claims.get(id)!); return v.every((a) => v.every((b) => near(a, b))); }).length;
    console.log(`| ${arm.split(" — ")[0]} | ${seat} | ${steady(withinOneStep)} of ${ids.length} | ${steady(asProposed)} of ${ids.length} |`);
  }
  for (const run of runs) {
    const seats = SEATS.map((s) => reply(run, s));
    const verdictsOn = (id: string) => [...seats.map((s) => s.claims.get(id)), opus.claimAssessments.find((ca) => ca.claimId === id)?.verdict].filter((v): v is AssessmentState => v !== undefined);
    const caseVerdicts = [...seats.map((s) => s.verdict), opus.caseAssessment.verdict];
    runsOut.push(`| ${arm.split(" — ")[0]} | ${run.slice(-6)} | ${standing(judgment, caseVerdicts, verdictsOn, withinOneStep)} | ${standing(judgment, caseVerdicts, verdictsOn, asProposed)} |`);
  }
}
console.log("\n| Arm | Run | Standing the run would give, as the rule is | With the two words one step apart |");
console.log("|---|---|---|---|");
for (const r of runsOut) console.log(r);
