/**
 * Where the panels of 2026-09-30 part from the judgments they checked: featured claims with an admitted evidence
 * record against featured claims with none. A description, not an experiment: nothing was run for it. It reads the
 * tree it is run on with the site's own functions, so its figures are those of that tree (README.md names the one
 * the figures there were taken from).
 *
 *   node proposals/assessment-experiments/2026-09-30-where-the-panel-splits/count.mts
 */
import { liveEvidence, loadAllCases } from "../../../src/domain/load.ts";
import { adoptedAssessment, currentEdition } from "../../../src/domain/editions.ts";
import { claimConcurrence, currentChecks, latestCheckPerModel, withinOneStep } from "../../../src/domain/standing.ts";
import type { AssessmentState } from "../../../src/domain/schema.ts";

const DAY = "2026-09-30";
/** An evidence record's id as the ledgers write it: GEO-E002, AMZ-E022. */
const EVIDENCE_ID = /\b[A-Z]{2,5}-E\d{3}\b/g;
/** The scale's order (src/domain/standing.ts), used only to say which way a seat differs; a verdict off the scale has no direction. */
const RANK: Partial<Record<AssessmentState, number>> = { established: 6, well_supported: 5, provisionally_supported: 4, mixed: 3, unresolved: 2.5, presently_untestable: 2.5, weakly_supported: 2, contradicted: 1 };
const rank = (v: AssessmentState) => RANK[v] ?? Number.NaN;

const total = { checks: 0, withEvidence: 0, withEvidenceSplit: 0, withNone: 0, withNoneSplit: 0, seatWith: 0, seatWithFar: 0, seatNone: 0, seatNoneFar: 0, onlyHigher: 0, onlyLower: 0, bothWays: 0, cites: 0, notAttached: 0, notAttachedUnnamed: 0 };
const rows: string[] = [];
const splits: string[] = [];

for (const c of loadAllCases()) {
  const judgment = adoptedAssessment(c);
  if (!judgment) continue;
  // The panel a reader sees counted: each seat's latest check, current on the ledger, made on the day.
  const checks = currentChecks(c, latestCheckPerModel(c)).filter((r) => r.date === DAY);
  if (checks.length === 0) continue;
  // Admitted evidence per claim, as the edition packet counts it (src/pipeline/packet.ts): not rejected, not provisional.
  const evidence = new Map<string, number>();
  const attachedTo = new Map<string, Set<string>>();
  for (const e of liveEvidence(c)) {
    attachedTo.set(e.id, new Set(e.claimIds));
    if (e.reviewState === "provisional") continue;
    for (const id of e.claimIds) evidence.set(id, (evidence.get(id) ?? 0) + 1);
  }
  const own = new Map(judgment.claimAssessments.map((ca) => [ca.claimId, ca.verdict]));
  const restsOn = new Set(judgment.caseAssessment.loadBearing);
  const row = { withEvidence: 0, withEvidenceSplit: 0, withNone: 0, withNoneSplit: 0 };
  for (const id of currentEdition(c).featuredClaimIds) {
    const base = own.get(id);
    if (!base) continue;
    const verdicts = checks.map((r) => r.claimAssessments.find((ca) => ca.claimId === id)?.verdict).filter((v) => v !== undefined);
    if (verdicts.length === 0) continue;
    const split = claimConcurrence(base, verdicts) === "split";
    const far = verdicts.filter((v) => !withinOneStep(v, base));
    if ((evidence.get(id) ?? 0) > 0) {
      row.withEvidence++;
      if (split) row.withEvidenceSplit++;
      total.seatWith += verdicts.length;
      total.seatWithFar += far.length;
    } else {
      row.withNone++;
      total.seatNone += verdicts.length;
      total.seatNoneFar += far.length;
      if (split) {
        row.withNoneSplit++;
        // Direction is taken over the seats more than one step from the judgment: they are what makes the claim a
        // split. A seat within one step is not counted either way (review note #454: the first wording said "every
        // seat that differs", which a seat one step below the judgment contradicts).
        const higher = far.filter((v) => rank(v) > rank(base)).length;
        const lower = far.filter((v) => rank(v) < rank(base)).length;
        if (higher && !lower) total.onlyHigher++;
        else if (lower && !higher) total.onlyLower++;
        else total.bothWays++;
        splits.push(`| ${id}${restsOn.has(id) ? " (the case rests on it)" : ""} | ${base} | ${verdicts.join(", ")} |`);
      }
    }
  }
  // Evidence records a seat names in a claim's reasoning: attached to that claim or not, and if not, whether the
  // reasoning names a claim the record is attached to.
  for (const r of checks) {
    total.checks++;
    for (const ca of r.claimAssessments) {
      for (const eid of new Set(ca.reasoning.match(EVIDENCE_ID) ?? [])) {
        const to = attachedTo.get(eid);
        if (!to) continue;
        total.cites++;
        if (to.has(ca.claimId)) continue;
        total.notAttached++;
        if (![...to].some((claimId) => ca.reasoning.includes(claimId))) total.notAttachedUnnamed++;
      }
    }
  }
  rows.push(`| ${c.record.title} | ${checks.length} | ${row.withEvidenceSplit} of ${row.withEvidence} | ${row.withNoneSplit} of ${row.withNone} |`);
  total.withEvidence += row.withEvidence;
  total.withEvidenceSplit += row.withEvidenceSplit;
  total.withNone += row.withNone;
  total.withNoneSplit += row.withNoneSplit;
}

console.log("| Case | Seats | Split, of featured claims with an evidence record | Split, of featured claims with none |");
console.log("|---|---|---|---|");
for (const r of rows) console.log(r);
console.log(`| **All** | ${total.checks} checks | **${total.withEvidenceSplit} of ${total.withEvidence}** | **${total.withNoneSplit} of ${total.withNone}** |`);
console.log(`\nSeat verdicts more than one step from the judgment: ${total.seatWithFar} of ${total.seatWith} on claims with an evidence record, ${total.seatNoneFar} of ${total.seatNone} on claims with none.`);
console.log(`\nOf the ${total.withNoneSplit} splits on claims with none, taking the seats more than one step from the judgment: on ${total.onlyHigher} every such seat grades the claim higher than the judgment, on ${total.onlyLower} every such seat grades it lower, on ${total.bothWays} they go both ways.`);
console.log("\n| Claim | The judgment | The seats |");
console.log("|---|---|---|");
for (const s of splits) console.log(s);
console.log(`\nEvidence records named in the checks' claim reasonings: ${total.cites}. Not attached to the claim being graded: ${total.notAttached}. Of those, in a reasoning that names no claim the record is attached to: ${total.notAttachedUnnamed}.`);
