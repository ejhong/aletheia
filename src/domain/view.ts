import { adoptedAssessment, currentEdition } from "./editions.ts";
import { liveClaims } from "./load.ts";
import { ratification, type Ratification } from "./standing.ts";
import type {
  AssessmentRun,
  AssessmentState,
  CaseComponent,
  Claim,
  ClaimTreatment,
  Edition,
  LoadedCase,
  ResearchPriority,
} from "./schema.ts";

/**
 * The one view the reader-facing pages read (docs/AUTOMATION.md, "The code"):
 * the ledger joined with the current edition. Every live claim appears once,
 * with its judgment from the adopted assessment or none; the featured set
 * and its order come from the edition. Pages hold no logic about how
 * judgments are made — they render this.
 */

export interface ClaimView {
  claim: Claim;
  /** Named in the current edition's featured set. */
  featured: boolean;
  /** Position in the featured order, or null. */
  rank: number | null;
  /** The adopted assessment's credibility verdict for this claim, if any. */
  verdict: AssessmentState | null;
  reasoning: string | null;
  confidence: "high" | "moderate" | "low" | null;
  /** The adopted assessment's treatment — present for every featured claim. */
  treatment: ClaimTreatment | null;
}

/** The dossier header and the other case-level judgments the edition adopts. */
export interface CaseHeader {
  whatIsClaimed: string | null;
  whereDisagreementLives: string | null;
  whatWouldSettleIt: string | null;
  bestConventionalExplanation: string | null;
  components: CaseComponent[];
  researchPriority: ResearchPriority | null;
}

export interface CaseView {
  loaded: LoadedCase;
  edition: Edition;
  /** The assessment the edition adopts; null for a question-only opening. */
  assessment: AssessmentRun | null;
  standing: Ratification | null;
  header: CaseHeader;
  /** Every live claim, in ledger order. */
  claims: ClaimView[];
  /** The edition's featured claims, in the edition's order. */
  featured: ClaimView[];
  /** Live claims the edition does not feature — the explorer's backlog. */
  catalog: ClaimView[];
  article: string;
}

export function caseView(loaded: LoadedCase): CaseView {
  const edition = currentEdition(loaded);
  const assessment = adoptedAssessment(loaded);
  const byClaim = new Map(
    (assessment?.claimAssessments ?? []).map((ca) => [ca.claimId, ca]),
  );
  const rank = new Map(edition.featuredClaimIds.map((id, i) => [id, i]));

  const claims: ClaimView[] = liveClaims(loaded).map((claim) => {
    const ca = byClaim.get(claim.id);
    const r = rank.get(claim.id);
    return {
      claim,
      featured: r !== undefined,
      rank: r ?? null,
      verdict: ca?.verdict ?? null,
      reasoning: ca?.reasoning ?? null,
      confidence: ca?.confidence ?? null,
      treatment: ca?.treatment ?? null,
    };
  });
  const featured = claims
    .filter((c) => c.featured)
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const catalog = claims.filter((c) => !c.featured);

  const ca = assessment?.caseAssessment;
  const header: CaseHeader = {
    whatIsClaimed: ca?.whatIsClaimed ?? null,
    whereDisagreementLives: ca?.whereDisagreementLives ?? null,
    whatWouldSettleIt: ca?.whatWouldSettleIt ?? null,
    bestConventionalExplanation: ca?.bestConventionalExplanation ?? null,
    components: ca?.components ?? [],
    researchPriority: ca?.researchPriority ?? null,
  };

  return {
    loaded,
    edition,
    assessment,
    standing: assessment ? ratification(loaded) : null,
    header,
    claims,
    featured,
    catalog,
    article: edition.article,
  };
}

/** Locate a claim across cases, with the view of the case that holds it. */
export function findClaimView(
  cases: LoadedCase[],
  id: string,
): { view: ClaimView; caseView: CaseView } | null {
  for (const loaded of cases) {
    if (!loaded.claims.some((c) => c.id === id)) continue;
    const cv = caseView(loaded);
    const view = cv.claims.find((c) => c.claim.id === id);
    return view ? { view, caseView: cv } : null;
  }
  return null;
}

/** Human-review coverage over the featured claims, for honest card labels. */
export function reviewCoverage(view: CaseView): { reviewed: number; total: number } {
  return {
    reviewed: view.featured.filter((c) => c.claim.reviewState === "human_reviewed")
      .length,
    total: view.featured.length,
  };
}
