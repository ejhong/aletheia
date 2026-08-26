/**
 * Pure eligibility logic for the reconciliation loop
 * (scripts/reconcile-contested.mjs), extracted for tests.
 *
 * Mirrors the ratification rules in src/domain/load.ts — which is the
 * authority; a change there must be reflected here. The principle: the
 * SAME disagreements that make a standing "contested" make a case
 * eligible for reconciliation. Those are (a) a case-verdict dispute by
 * two or more seats, and (b) a load-bearing claim where fewer than a
 * strict majority of the judging seats land within one step of the
 * draft's verdict on the graded scale — open verdicts (unresolved,
 * presently_untestable) are off the scale and must match exactly.
 */

const gradedScale = {
  established: 6,
  well_supported: 5,
  provisionally_supported: 4,
  mixed: 3,
  weakly_supported: 2,
  contradicted: 1,
};

/** Seats whose case verdict differs from the draft's. */
export function caseVerdictDissenters(draft, checks) {
  return checks.filter(
    (r) => r.caseAssessment.verdict !== draft.caseAssessment.verdict,
  );
}

/**
 * Load-bearing claims where the panel splits against the draft — the
 * plain-node mirror of the contested-load-bearing rule in ratification().
 */
export function contestedLoadBearingClaims(draft, checks) {
  const out = [];
  for (const claimId of draft.caseAssessment.loadBearing ?? []) {
    const own = draft.claimAssessments?.find(
      (ca) => ca.claimId === claimId,
    )?.verdict;
    if (!own) continue;
    const verdicts = checks
      .map((r) => r.claimAssessments?.find((ca) => ca.claimId === claimId))
      .filter((ca) => ca !== undefined)
      .map((ca) => ca.verdict);
    if (verdicts.length === 0) continue;
    const near = verdicts.filter((v) => {
      if (v === own) return true;
      const a = gradedScale[v];
      const b = gradedScale[own];
      return a !== undefined && b !== undefined && Math.abs(a - b) <= 1;
    }).length;
    if (near * 2 <= verdicts.length) out.push(claimId);
  }
  return out;
}

/**
 * Per-claim dissent packet for the split claims: the house verdict beside
 * each seat's verdict and reasoning, so a reconsideration can engage
 * claim-level dissent the way it engages case-verdict dissent.
 */
export function claimDissentPacket(draft, checks, claimIds, seatName) {
  return claimIds.map((claimId) => ({
    claimId,
    houseVerdict: draft.claimAssessments?.find((ca) => ca.claimId === claimId)
      ?.verdict,
    seats: checks
      .map((r) => {
        const ca = r.claimAssessments?.find((x) => x.claimId === claimId);
        return ca
          ? {
              seat: seatName(r.model),
              verdict: ca.verdict,
              reasoning: ca.reasoning,
            }
          : null;
      })
      .filter((x) => x !== null),
  }));
}
