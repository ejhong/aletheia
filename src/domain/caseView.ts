import { displayAssessment, featuredClaims, lastContentUpdate } from "./load";
import type { AssessmentRun, FeaturedClaim, LoadedCase } from "./schema";
import type { RatificationStatus } from "./load";

/** A display projection. The underlying proposition and its history never change. */
export type FeaturedClaimView = FeaturedClaim & {
  assessment: {
    runId: string;
    date: string;
    standing: RatificationStatus;
  } | null;
};

export function claimView(
  claim: FeaturedClaim,
  run: AssessmentRun | null,
  standing: RatificationStatus,
): FeaturedClaimView {
  const evaluation = run?.claimAssessments.find((a) => a.claimId === claim.id);
  return {
    ...claim,
    credibility: evaluation?.verdict ?? claim.credibility,
    credibilitySummary: evaluation?.reasoning ?? claim.credibilitySummary,
    assessment:
      run && evaluation ? { runId: run.runId, date: run.date, standing } : null,
  };
}

/** One read model for the essay, its claims, and its review status.
 * Existing records remain the migration source; no assessment is invented.
 */
export function caseView(loaded: LoadedCase) {
  const shown = displayAssessment(loaded);
  return {
    record: loaded.record,
    article: loaded.overviewMarkdown,
    assessment: shown,
    featured: featuredClaims(loaded).map((claim) =>
      claimView(
        claim,
        shown?.run ?? null,
        shown?.ratification.status ?? "unratified",
      ),
    ),
    lastUpdated: lastContentUpdate(loaded),
    version: loaded.contentHash.slice(0, 12),
    isStarting:
      loaded.claims.length === 0 && loaded.evidence.length === 0 && !shown,
  };
}
