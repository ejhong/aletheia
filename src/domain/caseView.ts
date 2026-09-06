import { catalogClaims, displayAssessment, liveClaims, lastContentUpdate } from "./load";
import { isFeatured, type AssessmentRun, type Claim, type FeaturedClaim, type LoadedCase } from "./schema";
import type { RatificationStatus } from "./load";
import { claimAssessmentIds } from "../../scripts/lib/claim-assessment-scope.mjs";

/** A display projection. The underlying proposition and its history never change. */
export type FeaturedClaimView = FeaturedClaim & {
  assessment: {
    runId: string;
    date: string;
    standing: RatificationStatus;
    treatment: boolean;
  } | null;
};

function claimView(
  claim: Claim,
  run: AssessmentRun | null,
  standing: RatificationStatus,
  assessmentAdopted: boolean,
): FeaturedClaimView | null {
  const evaluation = run?.claimAssessments.find((a) => a.claimId === claim.id);
  // Bare overlays cannot promote a catalog record or replace its editorial
  // interpretation. The edition adopting that assessment faces the normal gate.
  const treatment = assessmentAdopted ? evaluation?.treatment : undefined;
  const base = isFeatured(claim) ? claim : treatment && evaluation && {
    ...claim, ...treatment, tier: "featured" as const,
    credibility: evaluation.verdict, credibilitySummary: evaluation.reasoning,
    parentClaimIds: [], dependsOnClaimIds: [],
  };
  if (!base) return null;
  return {
    ...base,
    ...treatment,
    credibility: evaluation?.verdict ?? base.credibility,
    credibilitySummary: evaluation?.reasoning ?? base.credibilitySummary,
    assessment:
      run && evaluation ? { runId: run.runId, date: run.date, standing, treatment: Boolean(treatment) } : null,
  };
}

/** One read model for the essay, its claims, and its review status.
 * Existing records remain the migration source; no assessment is invented.
 */
export function caseView(loaded: LoadedCase) {
  const shown = displayAssessment(loaded);
  const edition = loaded.editions.at(-1) ?? null;
  const assessed = new Set(claimAssessmentIds(loaded.claims, edition?.featuredClaimIds));
  const allFeatured = liveClaims(loaded).flatMap(claim => {
    const view = claimView(claim, shown?.run ?? null, shown?.ratification.status ?? "unratified",
      Boolean(edition && assessed.has(claim.id)));
    return view ? [view] : [];
  });
  const catalog = catalogClaims(loaded).filter(claim => !allFeatured.some(view => view.id === claim.id));
  return {
    record: loaded.record,
    article: loaded.overviewMarkdown,
    assessment: shown,
    featured: edition ? edition.featuredClaimIds.map(id => allFeatured.find(c => c.id === id)!) : allFeatured,
    allFeatured,
    catalog,
    claims: [...allFeatured, ...catalog],
    edition,
    editionStale: Boolean(edition && edition.basis.ledgerHash !== loaded.ledgerHash),
    lastUpdated: lastContentUpdate(loaded),
    version: loaded.contentHash.slice(0, 12),
    isStarting:
      loaded.claims.length === 0 && loaded.evidence.length === 0 && !shown,
  };
}
