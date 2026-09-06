import { z } from "zod";
import { AssessmentRunSchema, EditionSchema } from "./schema.ts";
import { unknownFields } from "./validation.ts";

const ProposedAssessment = z.unknown().transform((raw, ctx) => {
  const parsed = AssessmentRunSchema.strict().safeParse(raw);
  if (!parsed.success) {
    ctx.addIssue({ code: "custom", message: parsed.error.message });
    return z.NEVER;
  }
  for (const field of unknownFields(raw, parsed.data))
    ctx.addIssue({ code: "custom", message: `unknown assessment field: ${field}` });
  return parsed.data;
});

/** The assessment and its reader-facing edition advance in one reviewed bundle. */
export const EditionProposalSchema = z.object({
  case: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  edition: EditionSchema,
  assessment: ProposedAssessment.optional(),
}).strict().superRefine((proposal, ctx) => {
  if (proposal.assessment && (proposal.assessment.role === "check" ||
    proposal.assessment.humanReviewed || !proposal.assessment.generatedAt))
    ctx.addIssue({ code: "custom", message: "new edition assessments must be timestamped AI drafts" });
});
export type EditionProposal = z.infer<typeof EditionProposalSchema>;
