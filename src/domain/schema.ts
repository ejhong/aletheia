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

/**
 * Claim tiers.
 *
 * - `featured` — full editorial treatment: plain-language gloss, the two
 *   assessment axes, objections, relationships. The original claim shape.
 * - `catalog` — a lightweight, honestly-unreviewed backlog record: one
 *   atomic statement anchored to a source, with provenance. Validation
 *   deliberately does not demand featured-level richness here.
 *
 * Promotion is a one-field edit: flip `tier` to `featured` and the build
 * fails loudly listing exactly which editorial fields are still missing.
 */
export const ClaimTier = z.enum(["featured", "catalog"]);
export type ClaimTier = z.infer<typeof ClaimTier>;

/** Where in a source a claim is anchored. Never invent a locator. */
export const SourceAnchorSchema = z.object({
  /** Exact-as-possible locator, e.g. "Fóti Ch 5, pp ~135–137". */
  locator: z.string().min(3),
  /** Verbatim quote from the source (required for pipeline extractions). */
  quote: z.string().optional(),
  /** Optional link to a Source record in sources.yaml. */
  sourceId: z.string().optional(),
});
export type SourceAnchor = z.infer<typeof SourceAnchorSchema>;

const claimCore = {
  id: z.string().regex(/^[A-Z]+-C\d{3}$/, "Claim id like GEO-C001"),
  statement: z.string().min(10),
  theme: z.string(),
  rung: Rung,
  reviewState: ReviewState,
  rejectionReason: z.string().optional(),
  origin: OriginSchema,
};

const tombstoneRule = {
  check: (c: { reviewState: ReviewState; rejectionReason?: string }) =>
    c.reviewState !== "rejected" || Boolean(c.rejectionReason),
  message: "rejected claims must carry a rejectionReason (tombstone rule)",
};

export const FeaturedClaimSchema = z
  .object({
    ...claimCore,
    tier: z.literal("featured"),
    plainLanguage: z.string().min(10),
    claimType: ClaimType,
    importance: Importance,
    sourceAnchor: SourceAnchorSchema.optional(),
    credibility: AssessmentState,
    credibilitySummary: z.string(),
    diagnosticity: z.enum(["high", "moderate", "low", "indeterminate"]),
    diagnosticitySummary: z.string(),
    parentClaimIds: z.array(z.string()).default([]),
    dependsOnClaimIds: z.array(z.string()).default([]),
    strongestObjection: z.string(),
    whatWouldChangeOurMind: z.array(z.string()).default([]),
  })
  .refine(tombstoneRule.check, { message: tombstoneRule.message });
export type FeaturedClaim = z.infer<typeof FeaturedClaimSchema>;

export const CatalogClaimSchema = z
  .object({
    ...claimCore,
    tier: z.literal("catalog"),
    /** Catalog claims must be source-anchored; richness is optional. */
    sourceAnchor: SourceAnchorSchema,
    claimType: ClaimType.optional(),
    /**
     * Near-duplicate / dependent-extraction grouping: claims sharing a
     * group must not be counted as independent evidence.
     */
    independenceGroup: z.string().optional(),
    plainLanguage: z.string().min(10).optional(),
  })
  .refine(tombstoneRule.check, { message: tombstoneRule.message });
export type CatalogClaim = z.infer<typeof CatalogClaimSchema>;

export const ClaimSchema = z.discriminatedUnion("tier", [
  FeaturedClaimSchema,
  CatalogClaimSchema,
]);
export type Claim = z.infer<typeof ClaimSchema>;

export function isFeatured(claim: Claim): claim is FeaturedClaim {
  return claim.tier === "featured";
}

export function isCatalog(claim: Claim): claim is CatalogClaim {
  return claim.tier === "catalog";
}

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

/**
 * Image records. HARD RULE, enforced below: AI-generated images may never be
 * plates — anything a reader could mistake for the record must be real
 * imagery with provenance. Generated imagery is confined to editorial roles
 * (cover, texture) and always credited as such.
 */
export const ImageRole = z.enum(["cover", "plate", "texture"]);
export type ImageRole = z.infer<typeof ImageRole>;

export const ImageSource = z.enum(["generated", "commons", "user"]);
export type ImageSource = z.infer<typeof ImageSource>;

export const ImageSchema = z
  .object({
    id: z.string().regex(/^IMG-[A-Z0-9-]+$/, "Image id like IMG-GEO-P01"),
    role: ImageRole,
    file: z.string().startsWith("/images/"),
    /** Decorative textures may use an empty alt; covers and plates may not. */
    alt: z.string(),
    source: ImageSource,
    license: z.string().min(2),
    licenseUrl: z.string().url().optional(),
    credit: z.string().min(2),
    /** Generated images only. */
    prompt: z.string().optional(),
    styleVersion: z.string().optional(),
    model: z.string().optional(),
    /** Plates only. */
    plateNumber: z.number().int().positive().optional(),
    depicts: z.string().optional(),
    /**
     * Plates only. What kind of real imagery this is, for the caption label.
     * Defaults to "photograph"; set it when the plate is a published figure of
     * another kind (a micrograph, a structural rendering, a map, a scan) so the
     * caption never calls something a photograph that isn't one.
     */
    mediaType: z.string().optional(),
    provenance: z
      .object({
        photographer: z.string(),
        date: z.string().optional(),
        sourceUrl: z.string().url(),
        originalTitle: z.string().optional(),
      })
      .optional(),
    claimIds: z.array(z.string()).default([]),
  })
  .superRefine((img, ctx) => {
    if (img.role !== "texture" && img.alt.trim().length < 5) {
      ctx.addIssue({
        code: "custom",
        message: `${img.id}: covers and plates need a real alt text`,
      });
    }
    if (img.source === "generated") {
      if (img.role === "plate") {
        ctx.addIssue({
          code: "custom",
          message: `${img.id}: AI-generated images must never be plates (evidence imagery). This is a hard rule.`,
        });
      }
      for (const field of ["prompt", "styleVersion", "model"] as const) {
        if (!img[field]) {
          ctx.addIssue({
            code: "custom",
            message: `${img.id}: generated images must record ${field}`,
          });
        }
      }
    }
    if (img.role === "plate") {
      if (!img.plateNumber)
        ctx.addIssue({
          code: "custom",
          message: `${img.id}: plates need a plateNumber`,
        });
      if (!img.depicts)
        ctx.addIssue({
          code: "custom",
          message: `${img.id}: plates need a depicts description`,
        });
      if (!img.provenance)
        ctx.addIssue({
          code: "custom",
          message: `${img.id}: plates need provenance (photographer, sourceUrl)`,
        });
    }
  });
export type ImageRecord = z.infer<typeof ImageSchema>;

export function romanNumeral(n: number): string {
  const table: [number, string][] = [
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let out = "";
  let rest = n;
  for (const [value, glyph] of table) {
    while (rest >= value) {
      out += glyph;
      rest -= value;
    }
  }
  return out;
}

/**
 * Literature-watch configuration — an optional `watch.yaml` per case.
 *
 * Each query drives the weekly `scripts/watch-literature.mjs` run, which
 * searches arXiv and Crossref (and optionally OpenAlex) for newly
 * published/indexed items and surfaces them as DISCOVERY-ONLY proposals
 * under `proposals/watch/<runId>/`. Nothing enters sources.yaml
 * automatically; every surfaced item is labeled unverified.
 */
export const WatchSource = z.enum(["arxiv", "crossref", "openalex"]);
export type WatchSource = z.infer<typeof WatchSource>;

export const WatchQuerySchema = z.object({
  /** Stable slug for the query — cursor state and dedup key on the run side. */
  id: z.string().regex(/^[a-z0-9-]+$/, "watch query id like trigger-point-imaging"),
  /** Free-text search string sent to each API. */
  query: z.string().min(3),
  /** Which APIs to search. Default: arXiv + Crossref (both free, keyless). */
  sources: z.array(WatchSource).min(1).default(["arxiv", "crossref"]),
  /** Optional author filter: keep items with at least one matching author. */
  authors: z.array(z.string().min(2)).optional(),
  /**
   * Optional keyword filter: keep items whose title or abstract contains at
   * least one of these (case-insensitive). Tames broad queries.
   */
  keywords: z.array(z.string().min(2)).optional(),
  /** Why this query exists — shown in the proposal for the reviewer. */
  note: z.string().optional(),
});
export type WatchQuery = z.infer<typeof WatchQuerySchema>;

export const WatchConfigSchema = z
  .object({
    queries: z.array(WatchQuerySchema).min(1),
  })
  .superRefine((cfg, ctx) => {
    const seen = new Set<string>();
    for (const q of cfg.queries) {
      if (seen.has(q.id)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate watch query id ${q.id}`,
        });
      }
      seen.add(q.id);
    }
  });
export type WatchConfig = z.infer<typeof WatchConfigSchema>;

/**
 * Curated learning resources — an optional `resources.yaml` per case.
 *
 * These are reading-guide materials (talks, books, explainers), NOT evidence:
 * evidence lives in sources.yaml/evidence.yaml. Real links only — a curated
 * resource must carry a URL and an honest verification label, same vocabulary
 * as sources.
 */
export const CuratedResourceType = z.enum([
  "book",
  "talk",
  "explainer",
  "article",
  "course",
  "podcast",
  "reference",
]);
export type CuratedResourceType = z.infer<typeof CuratedResourceType>;

export const curatedResourceTypeLabels: Record<CuratedResourceType, string> = {
  book: "Book",
  talk: "Talk",
  explainer: "Explainer",
  article: "Article",
  course: "Course",
  podcast: "Podcast",
  reference: "Reference",
};

export const CuratedResourceSchema = z.object({
  title: z.string().min(3),
  url: z.string().url(),
  type: CuratedResourceType,
  /** Author, speaker, or publishing organization. */
  by: z.string().optional(),
  year: z.string().optional(),
  /** One line on why it is worth the reader's time. */
  note: z.string().optional(),
  verification: SourceVerification,
  verificationNote: z.string().optional(),
});
export type CuratedResource = z.infer<typeof CuratedResourceSchema>;

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
  images: ImageRecord[];
  /** Optional literature-watch config (watch.yaml). */
  watch: WatchConfig | null;
  /** Optional curated reading-guide entries (resources.yaml). */
  curatedResources: CuratedResource[];
}
