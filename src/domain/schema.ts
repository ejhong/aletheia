import { z } from "zod";

/** Assessment vocabulary. Grouped into four visual families by `assessmentFamily`. */
export const AssessmentState = z.enum([
  "established",
  "well_supported",
  "provisionally_supported",
  "mixed",
  "weakly_supported",
  "contradicted",
  "unresolved",
  "presently_untestable",
]);
export type AssessmentState = z.infer<typeof AssessmentState>;

export type AssessmentFamily = "supported" | "contested" | "against" | "open";

export function assessmentFamily(state: AssessmentState): AssessmentFamily {
  switch (state) {
    case "established":
    case "well_supported":
    case "provisionally_supported":
      return "supported";
    case "mixed":
    case "weakly_supported":
      return "contested";
    case "contradicted":
      return "against";
    case "unresolved":
    case "presently_untestable":
      return "open";
  }
}

export const assessmentLabels: Record<AssessmentState, string> = {
  established: "Established",
  well_supported: "Well supported",
  provisionally_supported: "Provisionally supported",
  mixed: "Mixed",
  weakly_supported: "Weakly supported",
  contradicted: "Contradicted",
  unresolved: "Unresolved",
  presently_untestable: "Presently untestable",
};

/** Claim provenance / review state. Displayed honestly in the UI. */
export const ReviewState = z.enum([
  "ai_extracted",
  "human_reviewed",
  "disputed",
  "rejected",
]);
export type ReviewState = z.infer<typeof ReviewState>;

export const reviewStateLabels: Record<ReviewState, string> = {
  ai_extracted: "AI-extracted",
  human_reviewed: "Human-reviewed",
  disputed: "Disputed",
  rejected: "Rejected",
};

export const Rung = z.enum(["observation", "mechanism", "attribution"]);
export type Rung = z.infer<typeof Rung>;

export const rungLabels: Record<Rung, string> = {
  observation: "Observation",
  mechanism: "Mechanism",
  attribution: "Attribution",
};

export const rungOrder: Rung[] = ["observation", "mechanism", "attribution"];

export const ClaimType = z.enum([
  "observation",
  "measurement",
  "historical",
  "causal",
  "mechanistic",
  "statistical",
  "interpretive",
  "methodological",
  "existence",
]);

export const Importance = z.enum(["headline", "major", "supporting"]);

export const OriginSchema = z.object({
  /** Where the record came from, e.g. "geo catalog T-003". */
  ref: z.string(),
  extractedBy: z.string(),
  runId: z.string(),
  date: z.string(),
});

export const ClaimSchema = z
  .object({
    id: z.string().regex(/^[A-Z]+-C\d{3}$/, "Claim id like GEO-C001"),
    statement: z.string().min(10),
    plainLanguage: z.string().min(10),
    theme: z.string(),
    rung: Rung,
    claimType: ClaimType,
    importance: Importance,
    reviewState: ReviewState,
    rejectionReason: z.string().optional(),
    origin: OriginSchema,
    credibility: AssessmentState,
    credibilitySummary: z.string(),
    diagnosticity: z.enum(["high", "moderate", "low", "indeterminate"]),
    diagnosticitySummary: z.string(),
    parentClaimIds: z.array(z.string()).default([]),
    dependsOnClaimIds: z.array(z.string()).default([]),
    strongestObjection: z.string(),
    whatWouldChangeOurMind: z.array(z.string()).default([]),
  })
  .refine((c) => c.reviewState !== "rejected" || Boolean(c.rejectionReason), {
    message: "rejected claims must carry a rejectionReason (tombstone rule)",
  });
export type Claim = z.infer<typeof ClaimSchema>;

export const EvidenceDirection = z.enum([
  "supports",
  "undermines",
  "qualifies",
  "context",
]);
export type EvidenceDirection = z.infer<typeof EvidenceDirection>;

export const directionLabels: Record<EvidenceDirection, string> = {
  supports: "Supports",
  undermines: "Undermines",
  qualifies: "Qualifies",
  context: "Context",
};

export const EvidenceSchema = z.object({
  id: z.string().regex(/^[A-Z]+-E\d{3}$/, "Evidence id like GEO-E001"),
  title: z.string(),
  claimIds: z.array(z.string()).min(1),
  sourceId: z.string(),
  direction: EvidenceDirection,
  strength: z.enum(["decisive", "strong", "moderate", "weak"]),
  /** What the source itself states or shows. */
  sourceStatement: z.string(),
  /** What we infer from it. Kept strictly separate. */
  editorInference: z.string().optional(),
  exactLocator: z.string().optional(),
  limitations: z.array(z.string()).default([]),
  reviewState: ReviewState,
  origin: OriginSchema,
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const SourceVerification = z.enum([
  "verified",
  "ai_verified",
  "unverified",
  "placeholder",
]);
export type SourceVerification = z.infer<typeof SourceVerification>;

export const sourceVerificationLabels: Record<SourceVerification, string> = {
  verified: "Verified — held in project library",
  ai_verified: "AI-verified citation",
  unverified: "Unverified",
  placeholder: "Illustrative placeholder",
};

export const SourceSchema = z.object({
  id: z.string().regex(/^SRC-[A-Z0-9-]+$/, "Source id like SRC-MARCIS-2023"),
  title: z.string(),
  authors: z.array(z.string()).default([]),
  organization: z.string().optional(),
  year: z.string().optional(),
  sourceType: z.enum([
    "paper",
    "preprint",
    "book",
    "report",
    "webpage",
    "archive",
    "dataset",
    "artifact_record",
    "other",
  ]),
  identifier: z.string().optional(),
  url: z.string().url().optional(),
  verification: SourceVerification,
  verificationNote: z.string().optional(),
  reliabilityNotes: z.array(z.string()).default([]),
});
export type Source = z.infer<typeof SourceSchema>;

export const ResearchOpportunitySchema = z.object({
  id: z.string().regex(/^[A-Z]+-R\d{3}$/, "Research id like GEO-R001"),
  title: z.string(),
  summary: z.string(),
  claimIds: z.array(z.string()).min(1),
  rfpTopicRef: z.string().optional(),
  track: z.enum(["publication_prize", "small_grant", "either"]),
  effortTier: z.enum(["desk", "field", "lab"]),
  informationGain: z.string(),
});
export type ResearchOpportunity = z.infer<typeof ResearchOpportunitySchema>;

export const ChangeLogEntrySchema = z.object({
  date: z.string(),
  change: z.string(),
  reason: z.string(),
  actor: z.string(),
  aiAssisted: z.boolean(),
});
export type ChangeLogEntry = z.infer<typeof ChangeLogEntrySchema>;

/** One AI assessment run — an append-only overlay, never a mutation of canon. */
export const AssessmentRunSchema = z.object({
  runId: z.string(),
  model: z.string(),
  date: z.string(),
  promptVersion: z.string(),
  humanReviewed: z.boolean(),
  caseAssessment: z.object({
    verdict: AssessmentState,
    /** Claims the featured thesis actually rests on. */
    loadBearing: z.array(z.string()),
    /** Where the argument is most likely to fail. */
    weakestLinks: z.array(z.string()),
    /** The argued structural roll-up over the ladder. Not a score. */
    synthesis: z.string().min(100),
  }),
  claimAssessments: z.array(
    z.object({
      claimId: z.string(),
      verdict: AssessmentState,
      reasoning: z.string(),
      confidence: z.enum(["high", "moderate", "low"]),
    }),
  ),
});
export type AssessmentRun = z.infer<typeof AssessmentRunSchema>;

export const CaseSchema = z.object({
  id: z.string().regex(/^[A-Z]+-\d{3}$/, "Case id like GEO-001"),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string(),
  subtitle: z.string(),
  domain: z.string(),
  status: z.enum(["active", "incubating", "archived"]),
  summary: z.string(),
  /** Dossier header, question 1. */
  whatIsClaimed: z.string(),
  /** Dossier header, question 2 — the central crux. */
  whereDisagreementLives: z.string(),
  /** Dossier header, question 3. */
  whatWouldSettleIt: z.string(),
  bestConventionalExplanation: z.string(),
  themes: z.record(z.string(), z.string()),
  editors: z.array(z.string()),
  lastReviewed: z.string(),
  externalResearch: z
    .object({ label: z.string(), url: z.string().url().nullable() })
    .optional(),
});
export type CaseRecord = z.infer<typeof CaseSchema>;

/** A fully loaded, integrity-checked case. */
export interface LoadedCase {
  record: CaseRecord;
  overviewMarkdown: string;
  claims: Claim[];
  evidence: Evidence[];
  sources: Source[];
  research: ResearchOpportunity[];
  history: ChangeLogEntry[];
  /** Sorted by date ascending; last entry is the latest run. */
  assessmentRuns: AssessmentRun[];
}
