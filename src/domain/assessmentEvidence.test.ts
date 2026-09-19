import { describe, expect, it } from "vitest";
import type { AssessmentRun } from "./schema.ts";
import { assessmentEvidenceErrors } from "../pipeline/edition.ts";

/** An assessment names an evidence record only for a claim it is attached to, and only records that exist, are not
 *  refused and are not provisional (edition protocol v10 — review note #358: the builder-attribution record cited for
 *  the chronology; an anchor-only claim counted among what the case shows). */
const loaded = {
  record: { id: "GEO-001" },
  evidence: [
    { id: "GEO-E001", claimIds: ["GEO-C001"], reviewState: "ai_extracted" },
    { id: "GEO-E002", claimIds: ["GEO-C002"], reviewState: "ai_extracted" },
    { id: "GEO-E003", claimIds: ["GEO-C001"], reviewState: "rejected" },
    { id: "GEO-E004", claimIds: ["GEO-C001"], reviewState: "provisional" },
  ],
} as never;
const run = (over: { synthesis?: string; whatIsClaimed?: string; note?: string; reasoning?: string; summary?: string }) =>
  ({
    caseAssessment: {
      synthesis: over.synthesis ?? "Carried by GEO-E001.", steelman: "s", whatIsClaimed: over.whatIsClaimed ?? "w", whereDisagreementLives: "d", whatWouldSettleIt: "t", bestConventionalExplanation: "b",
      components: [{ label: "dating", state: "established", ...(over.note ? { note: over.note } : {}) }],
    },
    claimAssessments: [{ claimId: "GEO-C001", verdict: "well_supported", confidence: "high", reasoning: over.reasoning ?? "GEO-E001 quotes the excavators.", treatment: { plainLanguage: "p", importance: "major", diagnosticity: "high", diagnosticitySummary: over.summary ?? "s", strongestObjection: "o", whatWouldChangeOurMind: [] } }],
  }) as unknown as AssessmentRun;

describe("assessmentEvidenceErrors", () => {
  it("passes an assessment that cites live records for the claims they are attached to", () => {
    expect(assessmentEvidenceErrors(run({ note: "dated by GEO-E001" }), loaded)).toEqual([]);
  });
  it("a claim's reasoning may lean on a live record attached to another claim (the disclosed-basis rule); which claim a citation is for is the protocol's and the panel's", () => {
    expect(assessmentEvidenceErrors(run({ reasoning: "Dated by GEO-E001; GEO-E002, on the sibling claim, bears on it too." }), loaded)).toEqual([]);
    expect(assessmentEvidenceErrors(run({ summary: "See GEO-E002." }), loaded)).toEqual([]);
  });
  it("refuses ids the case does not hold, refused records and provisional records, wherever they are named", () => {
    const errors = assessmentEvidenceErrors(run({ synthesis: "GEO-E009 and GEO-E003", whatIsClaimed: "GEO-E004 shows it", note: "GEO-E003" }), loaded);
    expect(errors).toEqual([
      "assessment synthesis names GEO-E009, which this case does not hold",
      "assessment synthesis names GEO-E003, a refused record that carries nothing",
      "assessment whatIsClaimed names GEO-E004, a provisional record that carries no weight (edition protocol v9)",
      "assessment components[0] (dating) names GEO-E003, a refused record that carries nothing",
    ]);
  });
  it("case-level prose may name a live record without saying which claim: existence is all that is checked there", () => {
    expect(assessmentEvidenceErrors(run({ synthesis: "GEO-E002 dates it", note: "GEO-E002" }), loaded)).toEqual([]);
  });
});
