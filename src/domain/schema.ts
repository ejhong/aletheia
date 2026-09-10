import { z } from "zod";
import type { Disposition } from "./intake.ts";

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
  /**
   * The proposition as it circulates fuses separate claims or has no
   * testable truth condition as written (§3.2). Grading it on the truth
   * scale would launder the framing error; the credibility summary states
   * the decomposition instead. Distinct from `unresolved`, where the claim
   * is well-posed but the evidence does not settle it.
   */
  "misframed",
  /**
   * The material the claim rests on cannot be authenticated — an
   * unattributable screenshot, a vanished page with no archive, a document
   * whose chain of custody fails (§3.8). Not `contradicted`: nothing shows
   * the claim false; its support cannot be examined at all.
   */
  "provenance_failure",
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
    case "misframed":
    case "provenance_failure":
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
  misframed: "Misframed",
  provenance_failure: "Provenance failure",
};

/**
 * In-place explanations for assessment states a general reader will not
 * know (interface rule: explain unfamiliar epistemic terms where they
 * appear). Rendered under the credibility badge, like claimTypeCaptions.
 */
export const assessmentStateCaptions: Partial<Record<AssessmentState, string>> =
  {
    misframed:
      "the proposition fuses separate claims or cannot be tested as written — the summary states the decomposition",
    provenance_failure:
      "the material this claim rests on cannot be authenticated — its support cannot be examined, which is not the same as being shown false",
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
  /** What a theory says — its credibility grades the description, not the theory. */
  "theory_description",
  /** Status of a mathematical question — its credibility is not empirical support. */
  "mathematical",
]);
export type ClaimType = z.infer<typeof ClaimType>;

/**
 * Captions rendered under the credibility badge for claim types whose
 * "supported" label could otherwise be misread as empirical confirmation.
 */
export const claimTypeCaptions: Partial<Record<ClaimType, string>> = {
  theory_description:
    "grades the accuracy of the description — not whether the theory is true",
  mathematical:
    "grades the status of a mathematical question — not empirical support",
};

export const Importance = z.enum(["headline", "major", "supporting"]);

export const OriginSchema = z.object({
  /** Where the record came from, e.g. "geo catalog T-003". */
  ref: z.string(),
  extractedBy: z.string(),
  runId: z.string(),
  date: z.string(),
});

/** Where in a source a claim is anchored. Never invent a locator. */
export const SourceAnchorSchema = z.object({
  /** Exact-as-possible locator, e.g. "Fóti Ch 5, pp ~135–137". */
  locator: z.string().min(3),
  /** Verbatim quote from the source (required for pipeline extractions). */
  quote: z.string().optional(),
  /** Optional link to a Source record in sources.yaml. */
  sourceId: z.string().optional(),
  /** Further passages of the same source that state the proposition with the first (a contrast drawn pages apart): each a verbatim quote with its locator, checked and judged together (2026-09-09). */
  also: z.array(z.object({ locator: z.string().min(3), quote: z.string().min(6) })).optional(),
});
export type SourceAnchor = z.infer<typeof SourceAnchorSchema>;

/**
 * Claim genealogy — where and when an allegation or proposition first
 * appeared, kept separate from `origin` (which records how OUR record was
 * produced). For contested public events, tracing a claim to its earliest
 * known appearance is often half the analytical work: it exposes claims
 * born from identity conflation or source fusion, and stops fifty
 * derivative retellings from reading as fifty independent reports.
 * Every field is a statement about the public record and must be sourced
 * or honestly approximate ("first known" means exactly that — earliest
 * appearance found, never asserted as absolute).
 */
export const ClaimGenealogySchema = z.object({
  /** Earliest known appearance: YYYY, YYYY-MM, or YYYY-MM-DD. */
  firstKnown: z.string().regex(/^\d{4}(-\d{2}){0,2}$/),
  /** Where/how it first appeared, e.g. "anonymous Reddit post, later amplified by …". */
  originDescription: z.string().min(10),
  /** Optional Source documenting that first appearance (loader-checked). */
  originSourceId: z.string().optional(),
});
export type ClaimGenealogy = z.infer<typeof ClaimGenealogySchema>;

/**
 * A Claim is a proposition with anchors — and nothing evaluative.
 *
 * The rule (docs/DATA_MODEL.md): on the record, what is true of the record
 * itself — the statement, its rung, its type, where it is anchored, what it
 * depends on, how it entered; in the assessment, anything a new piece of
 * evidence could change — credibility, diagnosticity, importance, the
 * plain-language gloss, the objection, what would change our mind. Those
 * live in the adopted assessment's per-claim treatment and reach the
 * reader through the edition (see EditionSchema). Whether a claim is
 * featured is likewise an edition decision, not a field here.
 */
export const ClaimSchema = z
  .object({
    id: z.string().regex(/^[A-Z]+-C\d{3}$/, "Claim id like GEO-C001"),
    statement: z.string().min(10),
    theme: z.string(),
    rung: Rung,
    /** Optional classification of the proposition itself (not a grade). */
    claimType: ClaimType.optional(),
    /**
     * Where the claim is anchored in a source. Optional here because a
     * claim may instead be anchored by evidence records citing it; the
     * loader requires one or the other for claims dated on or after
     * CLAIM_ANCHOR_REQUIRED_FROM.
     */
    sourceAnchor: SourceAnchorSchema.optional(),
    parentClaimIds: z.array(z.string()).default([]),
    dependsOnClaimIds: z.array(z.string()).default([]),
    /**
     * Competition made explicit (AGENTS.md §6, §3.3): claims this one is an
     * alternative account to, and claims it contradicts. Loader-checked like
     * parents. An edition features competing claims together and says what
     * would decide between them.
     */
    alternativeToClaimIds: z.array(z.string()).optional(),
    contradictsClaimIds: z.array(z.string()).optional(),
    /**
     * Near-duplicate / dependent-extraction grouping: claims sharing a
     * group must not be counted as independent evidence.
     */
    independenceGroup: z.string().optional(),
    reviewState: ReviewState,
    rejectionReason: z.string().optional(),
    origin: OriginSchema,
    /** Optional: earliest known public appearance of the proposition itself. */
    genealogy: ClaimGenealogySchema.optional(),
  })
  .refine(
    (c) => c.reviewState !== "rejected" || Boolean(c.rejectionReason),
    { message: "rejected claims must carry a rejectionReason (tombstone rule)" },
  );
export type Claim = z.infer<typeof ClaimSchema>;

/**
 * From this date every claim must be anchored — a source anchor on the
 * record, or at least one evidence record citing it. Earlier claims are
 * history; six of them (listed in the migration PR of 2026-09-08) carry
 * neither and are not rewritten.
 */
export const CLAIM_ANCHOR_REQUIRED_FROM = "2026-09-08";

/**
 * The per-claim treatment an assessment supplies for the claims the
 * edition features: everything a reader needs beyond the verdict, and
 * everything a new piece of evidence could change. Credibility is the
 * claim assessment's own `verdict` and `reasoning`; the treatment carries
 * the rest of what used to sit on a featured claim record.
 */
export const ClaimTreatmentSchema = z.object({
  plainLanguage: z.string().min(10),
  importance: Importance,
  diagnosticity: z.enum(["high", "moderate", "low", "indeterminate"]),
  diagnosticitySummary: z.string(),
  strongestObjection: z.string(),
  whatWouldChangeOurMind: z.array(z.string()).default([]),
});
export type ClaimTreatment = z.infer<typeof ClaimTreatmentSchema>;

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

/** One change the second reader made to an admitted evidence record at intake, stamped (verify protocol v5). */
export const ReaderActSchema = z.object({
  field: z.enum(["direction", "claimIds"]),
  from: z.union([z.string(), z.array(z.string())]),
  to: z.union([z.string(), z.array(z.string())]),
  model: z.string().min(1),
  runId: z.string().min(1),
  promptVersion: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().min(1),
});
export type ReaderAct = z.infer<typeof ReaderActSchema>;

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
  /**
   * Changes the second reader made to this record at intake (verify protocol v5): the direction it
   * found, the claim links it narrowed — each stamped with model, run id, prompt version and date, and
   * the reader's reason (§3.14, §3.15). `origin` stays the drafter's: the record is theirs, the change
   * is the reader's.
   */
  readerActs: z.array(ReaderActSchema).optional(),
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
    // An AI-authored study workpaper held in this repository (see
    // StudySchema) — the citable container for a study's aggregate
    // findings. Must carry studyId; always honestly labeled.
    "workpaper",
    "other",
  ]),
  identifier: z.string().optional(),
  url: z.string().url().optional(),
  /** A Wayback Machine snapshot of `url`, written when the source was admitted (§3.8: locators that outlive the page). */
  archivedUrl: z.string().url().optional(),
  /**
   * Workpaper sources only: the study this source is the container for.
   * The loader enforces both directions — a workpaper source must name a
   * real study, and only workpaper sources may carry studyId.
   */
  studyId: z.string().optional(),
  verification: SourceVerification,
  verificationNote: z.string().optional(),
  reliabilityNotes: z.array(z.string()).default([]),
  /**
   * §3.10 made structural at the source grain: IDs of sources this one
   * repeats or derives from without adding new evidence — wire copy, an
   * aggregator, a compilation, a later retelling. Loader-checked (targets
   * must exist; no self-reference). A derivative source never adds
   * independent weight to what its parent already establishes; if the
   * parent is only in the ledger as a derivation target, it still needs
   * its own admission (cited, or honestly `background: true`).
   */
  derivedFrom: z.array(z.string()).default([]),
  /**
   * Reading-shelf material: a real, honestly-labeled source kept for the
   * case's reading guide but not (yet) cited by any evidence record or
   * claim anchor. The loader enforces the admission rule both ways: a
   * source that is neither cited nor background fails the build, and a
   * cited source still marked background fails too (AGENTS.md §3.6 —
   * sources are not evidence by themselves; the ledger lists only what
   * carries weight).
   */
  background: z.boolean().default(false),
});
export type Source = z.infer<typeof SourceSchema>;

/**
 * A study row's citation — deliberately the same shape as a source
 * anchor's (free-text citation + optional url/doi/locator + the standard
 * verification label), so mechanical citation verification covers rows
 * with no new code and a decisive row graduating to a full Evidence +
 * Source record is a copy, not a translation. Row citations are inline:
 * they never create Source records, keeping the ledger admission rule
 * strict.
 */
export const StudyRowCitationSchema = z.object({
  text: z.string().min(3),
  url: z.string().url().optional(),
  doi: z.string().optional(),
  locator: z.string().optional(),
  verification: SourceVerification,
});
export type StudyRowCitation = z.infer<typeof StudyRowCitationSchema>;

/**
 * A Study — a pre-registered desk workpaper (§3.12 made structural):
 * frozen inclusion criteria, method, a sourced table, aggregate
 * findings, limitations. Secondary synthesis of published/public
 * material only; a study never grades a claim and never carries a
 * standing — its influence flows through ordinary Evidence records
 * citing the study's workpaper Source, riding the usual gates.
 *
 * The freeze discipline: a study lands in two PRs — the freeze PR
 * (criteria, method, question; zero rows, zero findings; publicly
 * rendered as "pre-registered — collection pending") and the collection
 * PR (rows, findings, limitations). `criteriaHash` is stamped at freeze
 * (by the stamp-study script, retired 2026-09-09) and recomputed by the loader on every
 * build, so any post-freeze edit to the criteria fails the build.
 * Studies are append-only: a correction is a new study carrying
 * `supersedes`, and evidence citing a superseded study's workpaper
 * fails the build until re-pointed.
 */
export const StudySchema = z
  .object({
    id: z.string().regex(/^[A-Z]+-S\d{3}$/, "Study id like GEO-S001"),
    title: z.string(),
    question: z.string().min(10),
    /** The research item(s) this study executes — studies are crux-driven. */
    researchIds: z.array(z.string()).min(1),
    claimIds: z.array(z.string()).default([]),
    criteria: z.object({
      /** Frozen BEFORE collection; the freeze PR predates every row. */
      frozenOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      inclusion: z.array(z.string()).min(1),
      exclusion: z.array(z.string()).default([]),
      /** Literal queries and sources — a re-runnable protocol, not a vibe. */
      searchProtocol: z.string().min(20),
      /**
       * Every candidate the author already knew at freeze time, with its
       * disposition pre-committed — post-freeze discoveries are then
       * visibly discoveries. The hash catches post-freeze edits; this
       * field addresses criteria written around a known population.
       */
      knownCandidates: z
        .array(
          z.object({
            name: z.string(),
            disposition: z.enum(["include", "exclude"]),
            reason: z.string(),
          }),
        )
        .default([]),
      /** sha256 prefix over the criteria (src/domain/studies.ts). */
      criteriaHash: z.string().regex(/^[0-9a-f]{12}$/),
    }),
    method: z.string().min(20),
    columns: z.array(z.string()).min(1),
    rows: z
      .array(
        z.object({
          cells: z.record(z.string(), z.string()),
          citation: StudyRowCitationSchema,
          /** §3.10: note shared origins with other rows where relevant. */
          independenceNote: z.string().optional(),
        }),
      )
      .default([]),
    /**
     * Aggregate findings — plain-language placement, no small-n
     * percentiles (§3.13), stating coverage and the direction of failed
     * searches (§3.11 at study grain). `evidenceId` links the Evidence
     * record that carries a finding into the ledger.
     */
    findings: z
      .array(
        z.object({
          statement: z.string().min(20),
          evidenceId: z.string().optional(),
        }),
      )
      .default([]),
    limitations: z.array(z.string()).default([]),
    runId: z.string(),
    model: z.string(),
    date: z.string(),
    promptVersion: z.string(),
    humanReviewed: z.boolean(),
    supersedes: z.string().optional(),
  })
  .superRefine((s, ctx) => {
    for (const [i, row] of s.rows.entries()) {
      for (const key of Object.keys(row.cells)) {
        if (!s.columns.includes(key)) {
          ctx.addIssue({
            code: "custom",
            message: `rows[${i}] has a cell for undeclared column "${key}"`,
          });
        }
      }
    }
    // A collected study must carry its findings and limitations; a
    // frozen-only study must not smuggle findings in before the rows.
    if (s.rows.length > 0 && s.findings.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "a study with rows must state its aggregate findings",
      });
    }
    if (s.rows.length > 0 && s.limitations.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "a study with rows must state its limitations",
      });
    }
    if (s.rows.length === 0 && s.findings.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: "a study without rows cannot carry findings (freeze first)",
      });
    }
  });
export type Study = z.infer<typeof StudySchema>;

export const ResearchOpportunitySchema = z.object({
  id: z.string().regex(/^[A-Z]+-R\d{3}$/, "Research id like GEO-R001"),
  title: z.string(),
  summary: z.string(),
  claimIds: z.array(z.string()).min(1),
  rfpTopicRef: z.string().optional(),
  track: z.enum(["publication_prize", "small_grant", "either"]),
  effortTier: z.enum(["desk", "field", "lab"]),
  informationGain: z.string(),
  /**
   * How the item entered the ledger, for machine-drafted items (the
   * Bench's endorsement drafter writes the endorsed proposal's id into
   * origin.ref, making the repo its own adoption registry). Optional:
   * hand-written items predate it and need no synthetic provenance.
   */
  origin: OriginSchema.optional(),
});
export type ResearchOpportunity = z.infer<typeof ResearchOpportunitySchema>;

export const ChangeLogEntrySchema = z.object({
  date: z.string(),
  change: z.string(),
  reason: z.string(),
  actor: z.string(),
  aiAssisted: z.boolean(),
  /**
   * `content` (default): evidence, claims, assessments, corrections —
   * what the homepage feed leads with. `housekeeping`: artwork, watch
   * configuration, tooling. Optional so the append-only history files
   * never need rewriting; entries without it are classified for display
   * by `isHousekeepingEntry` in load.ts.
   */
  kind: z.enum(["content", "housekeeping"]).optional(),
});
export type ChangeLogEntry = z.infer<typeof ChangeLogEntrySchema>;

/**
 * The case's second output, alongside the evidence state: how valuable it
 * would be to resolve the uncertainty (importance × neglectedness ×
 * testability ÷ cost), as a plain level with a stated reason — never a
 * false-precision score. "Weak evidence, strong reason to investigate" is
 * a first-class state here, not a contradiction.
 */
export const ResearchPriorityLevel = z.enum(["high", "medium", "low"]);
export type ResearchPriorityLevel = z.infer<typeof ResearchPriorityLevel>;

export const researchPriorityLabels: Record<ResearchPriorityLevel, string> = {
  high: "High research priority",
  medium: "Medium research priority",
  low: "Low research priority",
};

export const ResearchPrioritySchema = z.object({
  level: ResearchPriorityLevel,
  /** One or two sentences: why this level — usually the decisive test's cost and yield. */
  reason: z.string().min(10),
});
export type ResearchPriority = z.infer<typeof ResearchPrioritySchema>;

/**
 * Component verdicts: where a single case verdict would lie by compression,
 * the separable parts of the question carry their own states. Part of the
 * assessment (caseAssessment.components) since 2026-09-08: a judgment,
 * not identity.
 */
export const CaseComponentSchema = z.object({
  label: z.string().min(3),
  state: AssessmentState,
  note: z.string().optional(),
});
export type CaseComponent = z.infer<typeof CaseComponentSchema>;

/** One AI assessment run — an append-only overlay, never a mutation of canon. */
export const AssessmentRunSchema = z.object({
  runId: z.string(),
  /** The pipeline run (proposals/<runId>/run.yaml) that wrote this record; `runId` above is the record's own id (2026-09-10). */
  producedBy: z.string().optional(),
  model: z.string(),
  date: z.string(),
  promptVersion: z.string(),
  humanReviewed: z.boolean(),
  /**
   * `draft` (default): a house assessment run — the candidate narrative the
   * case page displays (unless a human-endorsed run exists).
   * `check`: an independent cross-model judge run, produced blind to all
   * prior assessments by a different model (scripts/cross-model-check.mjs).
   * Check runs never display as the case narrative; they feed the
   * concurrence panel, which reports how far independent models agree with
   * the displayed assessment.
   */
  role: z.enum(["draft", "check"]).default("draft"),
  /**
   * Set only on the one kind of run that carries no new judgment: a
   * mechanical transfer of previously displayed record fields and the named
   * draft's verdicts (the editions migration of 2026-09-08). Names the draft
   * transferred. Exempt from the steelman requirement because it asserts
   * nothing the named draft did not; never written by a model.
   */
  migratedFrom: z.string().optional(),
  /**
   * The ledger this run judged, by content hash (src/domain/hash.ts).
   * Staleness is a hash, not a date: a check run is current while the
   * ledger's hash still equals the one it recorded. Optional because runs
   * from before 2026-09-08 predate the field; the loader falls back to
   * comparing dates for those.
   */
  basis: z.object({ ledgerHash: z.string().regex(/^[a-f0-9]{64}$/) }).optional(),
  caseAssessment: z.object({
    verdict: AssessmentState,
    /**
     * The dossier header — what is claimed, where the disagreement lives,
     * what would settle it — and the best conventional explanation, the
     * component verdicts, and the research priority. Judgments about the
     * case as a whole, so they live here (draft runs) rather than on the
     * case record. Optional because check runs grade only; the edition's
     * adopted draft is expected to carry them.
     */
    whatIsClaimed: z.string().optional(),
    whereDisagreementLives: z.string().optional(),
    whatWouldSettleIt: z.string().optional(),
    bestConventionalExplanation: z.string().optional(),
    components: z.array(CaseComponentSchema).max(6).default([]),
    researchPriority: ResearchPrioritySchema.optional(),
    /** Claims the featured thesis actually rests on. */
    loadBearing: z.array(z.string()),
    /** Where the argument is most likely to fail. */
    weakestLinks: z.array(z.string()),
    /** The argued structural roll-up over the ladder. Not a score. */
    synthesis: z.string().min(100),
    /**
     * The steelman field (docs/AUTOMATION.md, "epistemic counterweights"):
     * the strongest argument FOR the featured hypothesis that this
     * assessment does not answer, stated by the same model that wrote the
     * assessment — a limitations section, not a rebuttal and not a vote.
     * It exists because every seat in this system shares roughly the same
     * mainstream priors, and the constitution forbids seating an advocate
     * (§2: not a believer-versus-skeptic arena): the counterweight is an
     * obligation of disclosure on the assessor itself. It never moves a
     * verdict; it is displayed beside one. A steelman that persists
     * unanswered across runs is a research crux the system is dodging.
     *
     * Optional in the schema because overlays are append-only and history
     * cannot be rewritten; required on every run dated on or after
     * STEELMAN_REQUIRED_FROM (enforced fail-closed in load.ts).
     */
    steelman: z.string().min(40).optional(),
  }),
  claimAssessments: z.array(
    z.object({
      claimId: z.string(),
      verdict: AssessmentState,
      reasoning: z.string(),
      confidence: z.enum(["high", "moderate", "low"]),
      /** Required for every claim the adopting edition features (loader-checked). */
      treatment: ClaimTreatmentSchema.optional(),
    }),
  ),
  /**
   * Reconsideration drafts only (the `edition` verb's reconsideration; formerly scripts/reconcile-contested.mjs, retired 2026-09-09): the
   * runIds of the check runs whose dissents this draft was written with.
   * Ratification treats exactly these checks as engaged — a reconciled
   * draft cannot be ratified until at least one blind check OUTSIDE this
   * list judges it (§3.15: nothing raises standing except fresh
   * independent agreement).
   */
  reconciles: z.array(z.string()).optional(),
});
export type AssessmentRun = z.infer<typeof AssessmentRunSchema>;

/**
 * From this date every assessment run — draft, check, reconsideration —
 * must carry caseAssessment.steelman. Earlier runs are append-only
 * history and are exempt rather than rewritten.
 */
export const STEELMAN_REQUIRED_FROM = "2026-09-04";

/** The steelman requirement as a pure rule, so the loader and tests share it. */
export function steelmanRequirementError(run: {
  runId: string;
  date: string;
  migratedFrom?: string;
  caseAssessment: { steelman?: string };
}): string | null {
  if (run.date < STEELMAN_REQUIRED_FROM) return null;
  // A migration run asserts nothing its source draft did not; the
  // requirement binds judgments, and this is a transfer.
  if (run.migratedFrom) return null;
  if (run.caseAssessment.steelman && run.caseAssessment.steelman.trim().length > 0)
    return null;
  return `assessment run ${run.runId} (${run.date}) is missing caseAssessment.steelman — every run dated on or after ${STEELMAN_REQUIRED_FROM} must state the strongest argument for the featured hypothesis it does not answer`;
}


/**
 * An Edition — the reader's unit, and the case's compression (docs/AUTOMATION.md).
 *
 * One immutable file binds what a reader experiences as one telling: the
 * exact assessment run it adopts (by runId and content hash, so an edited
 * overlay can never silently change the verdict beneath an essay), the
 * featured claim ids in order, the crux order, and the article. The hashes
 * in `basis` record which ledger state and founding inputs the edition was
 * written against; they are provenance, not a gate. Editions are
 * append-only; the current one is the latest by date (loader), and the
 * chain is explicit through `previous`.
 */
const Sha256Hex = z.string().regex(/^[a-f0-9]{64}$/, "sha256 hex digest");

export const EditionSchema = z
  .object({
    runId: z.string().regex(/^[a-z0-9][a-z0-9._-]{1,119}$/),
    /** The pipeline run (proposals/<runId>/run.yaml) that wrote this edition; absent on editions written by hand (2026-09-10). */
    producedBy: z.string().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    model: z.string().min(1),
    promptVersion: z.string().min(1),
    /** Why this edition replaced its predecessor (or how the first was made). */
    rationale: z.string().min(10),
    basis: z.object({ ledgerHash: Sha256Hex, inputsHash: Sha256Hex }),
    /** The edition this one replaced; null for a case's first. */
    previous: z.string().nullable(),
    /** The adopted assessment; null only for a question-only opening. */
    assessment: z.object({ runId: z.string(), hash: Sha256Hex }).nullable(),
    featuredClaimIds: z
      .array(z.string())
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "an edition cannot feature the same claim twice",
      ),
    /** Research item ids, in the order the edition presents them. */
    cruxOrder: z.array(z.string()).default([]),
    /**
     * The case's question as this edition states it (the subtitle a reader
     * sees). The question belongs to the edition, which owns the map: when
     * the inputs move it, the edition restates it and the panel judges the
     * restatement with the rest. Absent, the case file's subtitle — the
     * founding question — stands. The title is the case's name and is the
     * founder's (founder direction, 2026-09-09, in session).
     */
    question: z.string().min(10).optional(),
    /** The serious accounts this edition sets side by side, one line each; the verifier reads relevance against them. */
    accounts: z.array(z.string().min(10)).max(6).optional(),
    /** The article: constrained markdown with [text]{claim=…} and {plate:…} markers. */
    article: z.string().min(40),
  })
  .strict();
export type Edition = z.infer<typeof EditionSchema>;

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
    /** Generated images only: the generation run that produced the file. */
    runId: z.string().optional(),
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
    /**
     * Where real imagery came from. Two legitimate forms, and a plate must
     * satisfy one of them (enforced below):
     *   published  — `sourceUrl` points at the public record it came from;
     *   supplied   — material given directly by a named person, which has
     *                no URL: `suppliedBy` names them and `permission`
     *                records how the right to publish was obtained.
     * The second form exists because provenance is not the same thing as a
     * hyperlink; what it must never be is unrecorded.
     */
    provenance: z
      .object({
        photographer: z.string(),
        date: z.string().optional(),
        sourceUrl: z.string().url().optional(),
        originalTitle: z.string().optional(),
        suppliedBy: z.string().optional(),
        permission: z.string().optional(),
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
          message: `${img.id}: plates need provenance (photographer, plus either sourceUrl or suppliedBy + permission)`,
        });
      else if (
        !img.provenance.sourceUrl &&
        !(img.provenance.suppliedBy && img.provenance.permission)
      )
        ctx.addIssue({
          code: "custom",
          message: `${img.id}: plate provenance needs either a sourceUrl (published material) or both suppliedBy and permission (material supplied directly). Provenance may never be unrecorded.`,
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
 * Each query drove the weekly watch-literature run (retired 2026-09-09; the `report` verb searches now), which
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
   * least one of these (case-insensitive, matched at a word boundary so a
   * stem like `archaeolog` still matches `archaeological`). One flat list is
   * an OR, which is only as narrow as its broadest term.
   */
  keywords: z.array(z.string().min(2)).optional(),
  /**
   * Optional concept filter: an AND of ORs. Each inner array is one concept
   * (any alternative matches); an item must hit EVERY group to be kept.
   *
   * This exists because a flat OR list cannot express "about anaesthesia AND
   * about microtubules" — and the difference is not academic. A single-term
   * match on `anesthe` surfaced seven clinical nerve-block papers under Orch
   * OR, and `nanodiamond` alone surfaced nanodiamond contact lenses under
   * YDIH. Requiring a second concept removes both without touching a real
   * hit. Prefer this over `keywords` for any query aimed at Crossref.
   */
  keywordGroups: z.array(z.array(z.string().min(2)).min(1)).optional(),
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
  /** One paragraph on what the question is — framing, not a judgment. */
  summary: z.string(),
  themes: z.record(z.string(), z.string()),
  editors: z.array(z.string()),
  /**
   * Last human editorial review of the case framing (what is claimed /
   * where disagreement lives / what would settle it). Hand-set; intake
   * and assessment overlays do not update it. The dossier header shows
   * `lastContentUpdate()` from history.yaml instead.
   */
  lastReviewed: z.string(),
  externalResearch: z
    .object({ label: z.string(), url: z.string().url().nullable() })
    .optional(),
});
export type CaseRecord = z.infer<typeof CaseSchema>;

/** A fully loaded, integrity-checked case. */
/**
 * Narrative inputs (docs/AUTOMATION.md, "the anti-drift anchor"): the
 * founding texts a case was built from, committed with the founder's
 * license and consulted by every narrative-revision run so rewrites
 * drink from the original well rather than a fading copy. Inputs are
 * presentation references, never evidence — nothing may be cited from
 * them that is not independently in the ledger.
 */
export const NarrativeInputSchema = z.object({
  id: z.string().regex(/^[A-Z]+-IN\d{3}$/, "Input id like VASO-IN001"),
  title: z.string(),
  role: z.enum(["founding_narrative", "founding_research"]),
  /**
   * Path to the text: case-relative (inputs/…) for snapshots, or
   * repo-relative (research/…) for the founder's committed originals.
   */
  file: z.string(),
  origin: z.string().min(8),
  license: z.string().min(8),
});
export type NarrativeInput = z.infer<typeof NarrativeInputSchema>;

export interface LoadedCase {
  record: CaseRecord;
  /** The case's directory name under content/cases (may differ from the slug). */
  dir: string;
  /** sha256 of the ledger (claims, evidence, sources, research, studies, images) — derived at load, never stored. */
  ledgerHash: string;
  claims: Claim[];
  evidence: Evidence[];
  sources: Source[];
  research: ResearchOpportunity[];
  history: ChangeLogEntry[];
  /** Sorted by date ascending; last entry is the latest run. */
  assessmentRuns: AssessmentRun[];
  /** Sorted by date then runId; the last is the current edition. */
  editions: Edition[];
  /** Append-only: every candidate ever considered for this case (dispositions.yaml). */
  dispositions: Disposition[];
  images: ImageRecord[];
  /** Optional literature-watch config (watch.yaml). */
  watch: WatchConfig | null;
  /** Optional curated reading-guide entries (resources.yaml). */
  curatedResources: CuratedResource[];
  /** Pre-registered desk workpapers (studies/<id>.yaml). */
  studies: Study[];
  /** Founding texts (inputs/manifest.yaml): the anti-drift anchor. */
  narrativeInputs: NarrativeInput[];
}

/**
 * A harvested arbiter verdict — the machine record of one constitutional
 * panel vote on a pull request (scripts/arbiter.mjs embeds the data in the
 * PR comment; scripts/harvest-governance.mjs copies it here after merge or
 * closure so the site can display governance, not just assessments).
 * Verbatim record of a public comment; append-only like all run records.
 */
/** What one seat's reply cost, from the vendor's own usage and the reviewed tariff (usd null when unpriced). */
export const ArbiterSeatCostSchema = z.object({
  model: z.string().optional(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  usd: z.number().nullable(),
});
export const ArbiterSeatSchema = z.object({
  seat: z.string(),
  vote: z.enum(["complies", "violates", "unsure"]),
  rules: z.array(z.string()).default([]),
  reasoning: z.string(),
  /** The kind of violation a seat found (panel protocol v3); absent on complies and unsure. */
  paradigm: z.string().optional(),
  cost: ArbiterSeatCostSchema.optional(),
});
export const ArbiterRecordSchema = z.object({
  pr: z.number().int(),
  title: z.string(),
  url: z.string().url(),
  /** pass | park — the tally's outcome at the time of harvest. */
  verdict: z.enum(["pass", "park"]),
  reason: z.string(),
  /** What happened to the PR: merged (and when) or closed unmerged. */
  outcome: z.enum(["merged", "closed"]),
  outcomeAt: z.string(),
  /** Short sha of the AGENTS.md revision the panel judged against. */
  judgedAgainst: z.string(),
  promptVersion: z.string(),
  seats: z.array(ArbiterSeatSchema).min(1),
  /** The panel's cost for this verdict (since 2026-09-09, when the seats moved onto the metered transport). */
  cost: z
    .object({ seats: z.number().int().nonnegative(), complete: z.boolean().optional(), inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative(), usd: z.number().nullable() })
    .optional(),
  harvestedAt: z.string(),
});
export type ArbiterRecord = z.infer<typeof ArbiterRecordSchema>;

/**
 * A review note, harvested from its GitHub issue (governance/review-notes/):
 * a lone panel objection the change merged over, which the operator answers
 * on the record — a fix or a reply. Mirrors the issue's state at harvest
 * with the last qualifying reply (a recognized answerer's, opening
 * "Answered on the record") as the answer's receipt; a note closed without
 * one is shown as closed without an answer (AGENTS.md §3.15, amendment of
 * 2026-09-09).
 */
export const ReviewNoteRecordSchema = z.object({
  number: z.number().int(),
  title: z.string(),
  url: z.string().url(),
  state: z.enum(["open", "closed"]),
  pr: z.number().int().nullable(),
  seat: z.string().nullable(),
  rules: z.array(z.string()).default([]),
  paradigm: z.string().nullable(),
  /** The PR commit the objection was raised on; the PR's final verdict may differ after a fix. Absent on the first notes. */
  commit: z.string().nullable().optional(),
  createdAt: z.string(),
  closedAt: z.string().nullable(),
  /** The last qualifying reply — a recognized answerer's, opening "Answered on the record" — as the receipt; null means none was written. */
  answer: z.object({ by: z.string(), at: z.string(), excerpt: z.string(), url: z.string().url() }).nullable().optional(),
  harvestedAt: z.string(),
});
export type ReviewNoteRecord = z.infer<typeof ReviewNoteRecordSchema>;
