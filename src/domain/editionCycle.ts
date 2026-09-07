import { z } from "zod";
import { AssessmentRunSchema, EditionSchema, FeaturedClaimSchema } from "./schema.ts";
import { EditionProposalSchema } from "./editionProposal.ts";

export const EDITION_PROTOCOL = "edition-drafting-v1";
export const EditionOption = z.enum(["incumbent", "revision", "recomposition"]);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const text = z.string().trim().min(10);

/** Models supply arguments, never their own authorship or review receipts. */
export const EditionDraftSchema = z.object({
  article: EditionSchema.shape.article,
  featuredClaimIds: EditionSchema.shape.featuredClaimIds,
  rationale: text,
  caseAssessment: AssessmentRunSchema.shape.caseAssessment.strict().extend({
    steelman: z.string().min(40),
    loadBearing: z.array(FeaturedClaimSchema.shape.id).describe("Existing claim IDs that bear on the thesis; all must be featured."),
    weakestLinks: z.array(FeaturedClaimSchema.shape.id).describe("Existing claim IDs only, not descriptions. Put explanations in synthesis. Use [] if no recorded claim captures the gap."),
  }),
  claimAssessments: z.array(AssessmentRunSchema.shape.claimAssessments.element.strict()
    .extend({ claimId: FeaturedClaimSchema.shape.id })),
}).strict();

export const EditionVoteSchema = z.object({
  preferred: EditionOption,
  reason: text,
  objections: z.array(z.object({ option: EditionOption, reason: text }).strict()),
}).strict();

export const EditionRankingSchema = z.object({
  ranking: z.array(EditionOption).length(3).refine(r => new Set(r).size === 3, "rank every option once"),
  reason: text,
  judgments: z.array(z.object({ option: EditionOption,
    status: z.enum(["complies", "violates", "unsure"]), reason: text,
  }).strict()).length(3).refine(j => new Set(j.map(item => item.option)).size === 3, "judge every option once"),
}).strict();

const DraftSchema = z.object({
  option: z.enum(["revision", "recomposition"]),
  model: z.string().min(1),
  inputHash: hash,
  proposal: EditionProposalSchema.nullable(),
  error: z.string().nullable(),
  // Preserve invalid replies for diagnosis; these never count as candidates.
  rejectedReply: z.string().nullable(),
}).strict().refine(d => Boolean(d.proposal) !== Boolean(d.error), "draft must succeed or fail");

const SeatSchema = z.object({
  vendor: z.string().min(1), model: z.string().min(1), effort: z.string().min(1),
  generatedAt: z.iso.datetime(), inputHash: hash,
  order: z.array(EditionOption).length(3).refine(o => new Set(o).size === 3, "invalid option order"),
  vote: z.union([EditionVoteSchema, EditionRankingSchema]).nullable(), error: z.string().nullable(),
  rejectedReply: z.string().nullable(),
}).strict().refine(s => Boolean(s.vote) !== Boolean(s.error), "seat must answer or fail");
export type EditionSeat = z.infer<typeof SeatSchema>;

/** A preference comparison proposes an edition. It never grants case standing. */
export function editionChoice(seats: EditionSeat[], comparisonVersion = 1) {
  if (new Set(seats.map(s => s.vendor)).size !== seats.length) throw new Error("duplicate edition seat");
  const votes = seats.flatMap(s => s.vote ? [s.vote] : []);
  if (votes.length < 4) return { outcome: "failed" as const, winner: null };
  if (comparisonVersion === 2) {
    const ranks = votes.map(v => EditionRankingSchema.parse(v));
    const eligible = (["revision", "recomposition"] as const).filter(option =>
      ranks.filter(v => v.judgments.some(j => j.option === option && j.status === "complies")).length >= 4 &&
      !ranks.some(v => v.judgments.some(j => j.option === option && j.status === "violates")) &&
      ranks.filter(v => v.ranking.indexOf(option) < v.ranking.indexOf("incumbent")).length >= 4);
    if (eligible.length === 1) return { outcome: "proposed" as const, winner: eligible[0] };
    if (eligible.length === 2) {
      const preferred = ranks.filter(v => v.ranking.indexOf("revision") < v.ranking.indexOf("recomposition")).length;
      if (preferred !== ranks.length / 2) return { outcome: "proposed" as const,
        winner: preferred > ranks.length / 2 ? "revision" as const : "recomposition" as const };
    }
    return { outcome: ranks.some(v => v.judgments.some(j => j.status === "violates")) || eligible.length === 2
      ? "contested" as const : "retained" as const, winner: null };
  }
  const originalVotes = votes.map(v => EditionVoteSchema.parse(v));
  for (const option of EditionOption.options) {
    if (originalVotes.filter(v => v.preferred === option).length >= 4 &&
        !originalVotes.some(v => v.objections.some(o => o.option === option)))
      return option === "incumbent"
        ? { outcome: "retained" as const, winner: null }
        : { outcome: "proposed" as const, winner: option };
  }
  return { outcome: "contested" as const, winner: null };
}

export const EditionCycleSchema = z.object({
  version: z.literal(1), promptVersion: z.literal(EDITION_PROTOCOL),
  case: z.string().min(1), runId: EditionSchema.shape.runId, generatedAt: z.iso.datetime(),
  basis: EditionSchema.shape.basis, reconsider: text.nullable(),
  packetHash: hash,
  rulesHash: hash,
  // Absent on the preserved first trial: never reinterpret its old ballots.
  comparisonVersion: z.literal(2).optional(),
  reusedDraftsFrom: z.string().optional(),
  recordHashes: z.record(z.string(), hash),
  drafts: z.array(DraftSchema).length(2),
  seats: z.array(SeatSchema).max(5),
  outcome: z.enum(["proposed", "retained", "contested", "failed"]),
  winner: z.enum(["revision", "recomposition"]).nullable(),
}).strict().superRefine((cycle, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  if (new Set(cycle.drafts.map(d => d.option)).size !== 2) issue("duplicate edition draft");
  if (new Set(cycle.seats.map(s => s.vendor)).size !== cycle.seats.length) issue("duplicate edition seat");
  else {
    try {
      const result = editionChoice(cycle.seats, cycle.comparisonVersion);
      if (result.outcome !== cycle.outcome || result.winner !== cycle.winner) issue("edition choice disagrees with seats");
    } catch { issue("ballot does not match comparison version"); }
  }
  if (cycle.seats.length && cycle.drafts.some(d => !d.proposal)) issue("comparison requires two valid drafts");
  if (cycle.seats.some(s => s.vote && ("ranking" in s.vote) !== (cycle.comparisonVersion === 2)))
    issue("ballot does not match comparison version");
  for (const draft of cycle.drafts) {
    const p = draft.proposal;
    if (p && (p.case !== cycle.case || p.edition.model !== draft.model ||
        p.edition.promptVersion !== cycle.promptVersion || !p.assessment ||
        p.assessment.model !== draft.model || p.assessment.inputHash !== draft.inputHash))
      issue("candidate authorship or input receipt differs from draft");
  }
});
export type EditionCycle = z.infer<typeof EditionCycleSchema>;
