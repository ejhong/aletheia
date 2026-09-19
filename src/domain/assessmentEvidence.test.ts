import { describe, expect, it } from "vitest";
import type { AssessmentRun } from "./schema.ts";
import { assessmentEvidenceErrors } from "../pipeline/edition.ts";

/** An assessment names an evidence record only if the case holds it, live and read — in any of its strings, at any
 *  depth, whatever the id's prefix (edition protocol v10 — review notes #358 and #360). Which claim a citation is for
 *  is the protocol's rule and the panel's reading. */
const loaded = {
  evidence: [
    { id: "GEO-E001", claimIds: ["GEO-C001"], reviewState: "ai_extracted" },
    { id: "GEO-E002", claimIds: ["GEO-C002"], reviewState: "ai_extracted" },
    { id: "GEO-E003", claimIds: ["GEO-C001"], reviewState: "rejected" },
    { id: "GEO-E004", claimIds: ["GEO-C001"], reviewState: "provisional" },
  ],
} as never;
const run = (over: Partial<{ synthesis: string; whatIsClaimed: string; note: string; reasoning: string; summary: string; plain: string; change: string[] }> = {}) =>
  ({
    caseAssessment: {
      synthesis: over.synthesis ?? "Carried by GEO-E001.", steelman: "s", whatIsClaimed: over.whatIsClaimed ?? "w", whereDisagreementLives: "d", whatWouldSettleIt: "t", bestConventionalExplanation: "b",
      loadBearing: ["GEO-C001"], weakestLinks: [],
      components: [{ label: "dating", state: "established", ...(over.note ? { note: over.note } : {}) }],
    },
    claimAssessments: [{ claimId: "GEO-C001", verdict: "well_supported", confidence: "high", reasoning: over.reasoning ?? "GEO-E001 quotes the excavators.", treatment: { plainLanguage: over.plain ?? "p", importance: "major", diagnosticity: "high", diagnosticitySummary: over.summary ?? "s", strongestObjection: "o", whatWouldChangeOurMind: over.change ?? [] } }],
  }) as unknown as AssessmentRun;

describe("assessmentEvidenceErrors", () => {
  it("passes an assessment that names only live records of the case", () => {
    expect(assessmentEvidenceErrors(run({ note: "dated by GEO-E001", change: ["a redating that moves GEO-E001"] }), loaded)).toEqual([]);
  });
  it("a claim's reasoning may lean on a live record attached to another claim: which claim a citation is for is the protocol's and the panel's", () => {
    expect(assessmentEvidenceErrors(run({ reasoning: "Dated by GEO-E001; GEO-E002, on the sibling claim, bears on it too." }), loaded)).toEqual([]);
  });
  it("refuses ids the case does not hold, refused records and provisional records, in whichever field they are named", () => {
    expect(assessmentEvidenceErrors(run({ synthesis: "GEO-E009 and GEO-E003", whatIsClaimed: "GEO-E004 shows it", note: "GEO-E003" }), loaded)).toEqual([
      "assessment caseAssessment.synthesis names GEO-E009, which this case does not hold",
      "assessment caseAssessment.synthesis names GEO-E003, a refused record that carries nothing",
      "assessment caseAssessment.whatIsClaimed names GEO-E004, a provisional record that carries no weight (edition protocol v9)",
      "assessment caseAssessment.components[0].note names GEO-E003, a refused record that carries nothing",
    ]);
  });
  it("reaches every string at any depth — the treatment's plain language and its what-would-change list included (review note #360)", () => {
    expect(assessmentEvidenceErrors(run({ plain: "as GEO-E004 shows", change: ["nothing", "a reading of GEO-E003"] }), loaded)).toEqual([
      "assessment claimAssessments[GEO-C001].treatment.plainLanguage names GEO-E004, a provisional record that carries no weight (edition protocol v9)",
      "assessment claimAssessments[GEO-C001].treatment.whatWouldChangeOurMind[1] names GEO-E003, a refused record that carries nothing",
    ]);
  });
  it("an evidence id with another case's prefix, or from nowhere, is one this case does not hold", () => {
    expect(assessmentEvidenceErrors(run({ summary: "TRN-E012 and AMZ-E001 say so" }), loaded)).toEqual([
      "assessment claimAssessments[GEO-C001].treatment.diagnosticitySummary names TRN-E012, which this case does not hold",
      "assessment claimAssessments[GEO-C001].treatment.diagnosticitySummary names AMZ-E001, which this case does not hold",
    ]);
  });
});
