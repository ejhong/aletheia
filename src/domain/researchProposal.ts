import { z } from "zod";
import { unknownFields } from "./validation.ts";
import {
  CatalogClaimSchema, FeaturedClaimSchema, EvidenceSchema,
  SourceSchema, ResearchOpportunitySchema, StudySchema,
} from "./schema.ts";

const text = z.string().trim().min(1);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const recordSchemas = {
  source: SourceSchema.strict(),
  evidence: EvidenceSchema.strict(),
  claim: z.discriminatedUnion("tier", [CatalogClaimSchema.strict(), FeaturedClaimSchema.strict()]),
  research: ResearchOpportunitySchema.strict(),
  study: StudySchema.strict(),
};
export type RecordKind = keyof typeof recordSchemas;

/** A short passage actually retrieved by an adapter. These are receipts,
 * not a claim that a quotation establishes the proposed interpretation. */
export const PassageSchema = z.object({
  sourceId: text,
  url: z.url(),
  retrievedAt: z.iso.datetime(),
  responseHash: hash,
  textHash: hash,
  extractor: text,
  locator: text,
  quote: text.max(1500),
}).strict();

const ChangeSchema = z.object({
  kind: z.enum(["source", "evidence", "claim", "research", "study"]),
  recordId: text,
  beforeHash: hash.nullable(),
  after: z.record(z.string(), z.unknown()),
  rationale: text,
  passages: z.array(PassageSchema).max(8).default([]),
}).strict().superRefine((change, ctx) => {
  const parsed = recordSchemas[change.kind].safeParse(change.after);
  if (!parsed.success) ctx.addIssue({ code: "custom", message: parsed.error.message });
  else if (parsed.data.id !== change.recordId)
    ctx.addIssue({ code: "custom", message: "record id differs from change target" });
  else for (const field of unknownFields(change.after, parsed.data))
    ctx.addIssue({ code: "custom", message: `unknown record field: ${field}` });
});

export const ResearchProposalSchema = z.object({
  version: z.literal(1),
  case: text,
  basis: z.object({ contentHash: hash, inputsHash: hash }).strict(),
  runId: text,
  generatedAt: z.iso.datetime(),
  model: text,
  promptVersion: text,
  intent: z.enum(["add", "correct", "link", "supersede", "reconsider"]),
  title: text,
  rationale: text,
  priorDecisionIds: z.array(hash).default([]),
  // The first claim needs a theme even in an empty case. Existing theme
  // meanings cannot be overwritten by this intake operation.
  themeAdditions: z.record(z.string(), text).default({}),
  changes: z.array(ChangeSchema).min(1).max(20),
}).strict().superRefine((proposal, ctx) => {
  const targets = proposal.changes.map(c => `${c.kind}:${c.recordId}`);
  if (new Set(targets).size !== targets.length)
    ctx.addIssue({ code: "custom", message: "more than one change to the same record" });
  if (proposal.intent === "reconsider" && !proposal.priorDecisionIds.length)
    ctx.addIssue({ code: "custom", message: "reconsideration must name the earlier decision" });
});
export type ResearchProposal = z.infer<typeof ResearchProposalSchema>;
