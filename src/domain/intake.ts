import { z } from "zod";
import {
  AssessmentRunSchema,
  ClaimSchema,
  EvidenceSchema,
  ImageSchema,
  ResearchOpportunitySchema,
  SourceSchema,
} from "./schema.ts";

/**
 * The intake objects (docs/AUTOMATION.md, "The objects"): everything that
 * ever tried to enter, and what became of it.
 *
 * - A **Proposal** is a change to domain records in one envelope. Its
 *   candidates are of kinds the ledger already has — source, evidence,
 *   claim, research, study, image — or `edition`, for a proposed change
 *   to selection, framing, or prose. Proposed records are validated with
 *   the ledger's own schemas: a candidate is a complete record or it is
 *   not a candidate.
 * - A **Disposition** is the dated outcome of one candidate in one case.
 *   Six words: in, duplicate, irrelevant, blocked, failed, excluded. Every
 *   row off `in` carries a reason; `reopenIf` says what would change it.
 *   A disposition is a judgment against the ledger as it stood, not a
 *   verdict — producers are handed the declined set with reasons, and may
 *   re-propose by naming what changed.
 * - A **RunRecord** is what every verb writes about itself: what ran, on
 *   what, with which model and protocol, what it cost, how it ended. It is
 *   what the AI-operation views later render.
 */

export const CandidateKind = z.enum([
  "source",
  "evidence",
  "claim",
  "research",
  "study",
  "image",
  "edition",
]);
export type CandidateKind = z.infer<typeof CandidateKind>;

export const DispositionKind = z.enum([
  "in",
  "duplicate",
  "irrelevant",
  "blocked",
  "failed",
  "excluded",
]);
export type DispositionKind = z.infer<typeof DispositionKind>;

export const Verb = z.enum([
  "report",
  "draft",
  "verify",
  "edition",
  "check",
  "panel",
  "inbox",
  "watch",
  "agenda",
  "migration",
]);
export type Verb = z.infer<typeof Verb>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const KEY = /^(doi|arxiv|url|title|text):\S[\s\S]*$/;

export const DispositionSchema = z
  .object({
    /** Mechanical key: doi: | arxiv: | url: | title: | text: (src/domain/keys.ts). */
    key: z.string().regex(KEY, "key like doi:10.1234/abc, url:host/path, or text:normalised statement"),
    kind: CandidateKind,
    disposition: DispositionKind,
    /** For in / duplicate: the ledger record it became or duplicates. */
    as: z.string().optional(),
    /** Required for every disposition except in. */
    reason: z.string().min(3).optional(),
    /** What would make this worth reconsidering (mirrors whatWouldChangeOurMind). */
    reopenIf: z.string().min(3).optional(),
    /** The candidate as observed — a title, a statement, a URL — verbatim. */
    observed: z.string().min(3),
    /** The producer run that raised it (runId). */
    by: z.string().min(1),
    date: z.string().regex(DATE),
    /** For blocked: how to recover the primary. */
    route: z.string().min(3).optional(),
    /** The proposal directory this row came from, when there is one. */
    proposal: z.string().optional(),
  })
  .superRefine((d, ctx) => {
    if ((d.disposition === "in" || d.disposition === "duplicate") && !d.as) {
      ctx.addIssue({ code: "custom", message: `${d.disposition} needs \`as\`: the ledger record` });
    }
    if (d.disposition !== "in" && !d.reason) {
      ctx.addIssue({ code: "custom", message: `${d.disposition} needs a reason` });
    }
  });
export type Disposition = z.infer<typeof DispositionSchema>;

/** The latest row per key — the candidate's current standing. Later in file wins same-date ties. */
export function latestByKey(rows: Disposition[]): Map<string, Disposition> {
  const out = new Map<string, Disposition>();
  for (const row of rows) {
    const prev = out.get(row.key);
    if (!prev || row.date >= prev.date) out.set(row.key, row);
  }
  return out;
}

/** The currently declined candidates: latest row per key, off `in`. */
export function declined(rows: Disposition[]): Disposition[] {
  return [...latestByKey(rows).values()].filter((r) => r.disposition !== "in");
}

export const CostSchema = z.object({
  calls: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  /** Null when no reviewed tariff exists for the model (config/tariffs.yaml). Never estimated. */
  usd: z.number().nonnegative().nullable(),
});
export type Cost = z.infer<typeof CostSchema>;

export const RunRecordSchema = z.object({
  runId: z.string().min(3),
  verb: Verb,
  case: z.string().min(1),
  date: z.string().regex(DATE),
  model: z.string().nullable(),
  promptVersion: z.string().nullable(),
  /** Hash of the packet sent, so unchanged inputs can rest. */
  inputHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  outcome: z.enum(["completed", "failed", "dry-run", "rested"]),
  cost: CostSchema,
  notes: z.string().optional(),
});
export type RunRecord = z.infer<typeof RunRecordSchema>;

export const CorrectionSchema = z.object({
  record: z.string().min(1),
  field: z.string().min(1),
  from: z.unknown(),
  to: z.unknown(),
  reason: z.string().min(3),
});

export const EditionCandidateSchema = z.object({
  rationale: z.string().min(10),
  featuredClaimIds: z.array(z.string()),
  cruxOrder: z.array(z.string()).default([]),
  article: z.string().min(40),
  /** A new judgment, when it changed; absent when the candidate re-adopts the incumbent's assessment. */
  assessment: AssessmentRunSchema.optional(),
});

export const ProposalSchema = z.object({
  runId: z.string().min(3),
  date: z.string().regex(DATE),
  case: z.string().min(1),
  producer: Verb,
  model: z.string().nullable(),
  promptVersion: z.string().nullable(),
  basis: z.object({
    ledgerHash: z.string().regex(/^[a-f0-9]{64}$/),
    inputsHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  }),
  rationale: z.string().min(10),
  /** Proposed records, in the ledger's own shapes. */
  adds: z
    .object({
      sources: z.array(SourceSchema).default([]),
      evidence: z.array(EvidenceSchema).default([]),
      claims: z.array(ClaimSchema).default([]),
      research: z.array(ResearchOpportunitySchema).default([]),
      images: z.array(ImageSchema).default([]),
    })
    .default({ sources: [], evidence: [], claims: [], research: [], images: [] }),
  corrections: z.array(CorrectionSchema).default([]),
  edition: EditionCandidateSchema.optional(),
  /** A disposition for every candidate the run raised, including those not added. */
  dispositions: z.array(DispositionSchema).default([]),
  /** Working material beside the envelope (report.md), never a record. */
  report: z.string().optional(),
});
export type Proposal = z.infer<typeof ProposalSchema>;

export const SpendRowSchema = z.object({
  date: z.string().regex(DATE),
  runId: z.string(),
  verb: Verb,
  case: z.string().nullable(),
  model: z.string(),
  calls: z.number().int().nonnegative(),
  /** Uncached input tokens, at the model's base rate. */
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  /** Prompt-cache reads and writes, priced at their own rates (config/tariffs.yaml). */
  cacheReadTokens: z.number().int().nonnegative().default(0),
  cacheWriteTokens: z.number().int().nonnegative().default(0),
  usd: z.number().nonnegative().nullable(),
});
export type SpendRow = z.infer<typeof SpendRowSchema>;
/** What a caller records; the cache fields default to zero. */
export type SpendRowInput = z.input<typeof SpendRowSchema>;

/**
 * Saturation, derived (docs/AUTOMATION.md): the number of consecutive
 * producer runs for a case whose candidates landed nothing — no `in` row
 * names the run. Never stored, never self-reported. `lastIn` is the date
 * of the most recent `in` row.
 */
export function saturation(
  runs: Pick<RunRecord, "runId" | "verb" | "case" | "date" | "outcome">[],
  rows: Disposition[],
  caseSlug: string,
): { consecutiveEmpty: number; lastIn: string | null; producerRuns: number } {
  const landed = new Set(rows.filter((r) => r.disposition === "in").map((r) => r.by));
  const producers = runs
    .filter((r) => r.case === caseSlug && (r.verb === "report" || r.verb === "draft") && r.outcome === "completed")
    .sort((a, b) => a.date.localeCompare(b.date) || a.runId.localeCompare(b.runId));
  let empty = 0;
  for (let i = producers.length - 1; i >= 0; i--) {
    if (landed.has(producers[i].runId)) break;
    empty++;
  }
  const lastIn = rows
    .filter((r) => r.disposition === "in")
    .map((r) => r.date)
    .sort()
    .at(-1) ?? null;
  return { consecutiveEmpty: empty, lastIn, producerRuns: producers.length };
}
