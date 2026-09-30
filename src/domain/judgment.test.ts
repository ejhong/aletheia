import { describe, expect, it } from "vitest";
import { judgmentChanges, judgmentChangesSentence } from "./judgment.ts";
import type { AssessmentRun, AssessmentState } from "./schema.ts";

/**
 * An edition's account of what it changed in the judgment must not depend
 * on its drafter having noticed. The tests are about the changes a drafter
 * can make without saying so: a priority, a component verdict, a claim the
 * case rests on, a claim dropped from the featured set.
 */
const run = (over: Partial<AssessmentRun["caseAssessment"]> = {}, claims: Record<string, AssessmentState> = { "X-C001": "mixed", "X-C002": "unresolved" }) =>
  ({
    caseAssessment: {
      verdict: "unresolved",
      researchPriority: { level: "medium", reason: "The tests are cheap." },
      components: [
        { label: "Egyptian branch (X-C001)", state: "contradicted" },
        { label: "Andean branch", state: "weakly_supported" },
      ],
      loadBearing: ["X-C001"],
      weakestLinks: [],
      ...over,
    },
    claimAssessments: Object.entries(claims).map(([claimId, verdict]) => ({ claimId, verdict })),
  }) as unknown as Pick<AssessmentRun, "caseAssessment" | "claimAssessments">;
const featured = (...ids: string[]) => ({ featuredClaimIds: ids });

describe("what an edition changes in the judgment", () => {
  it("is nothing when the judgment is restated and the selection kept", () => {
    const restated = run({ synthesis: "The same judgment in other words." } as never);
    expect(judgmentChanges(run(), restated, featured("X-C001", "X-C002"), featured("X-C001", "X-C002"))).toEqual([]);
    expect(judgmentChangesSentence("edition-before", [], false)).toBe("Against edition-before: no case verdict, research priority, claim verdict, component verdict, claim the case rests on or featured claim changed.");
    // The order components are given in is not a change.
    const reordered = run({ components: [...run().caseAssessment.components!].reverse() } as never);
    expect(judgmentChanges(run(), reordered, featured(), featured())).toEqual([]);
  });

  it("two components that trade verdicts are two changes (review note #427: the verdicts taken together are the same)", () => {
    const traded = run({
      components: [
        { label: "Egyptian branch (X-C001)", state: "weakly_supported" },
        { label: "Andean branch", state: "contradicted" },
      ],
    } as never);
    expect(judgmentChanges(run(), traded, featured(), featured())).toEqual([
      `2 component verdict(s) moved: "Egyptian branch (X-C001)" Contradicted → Weakly supported, "Andean branch" Weakly supported → Contradicted`,
    ]);
  });

  it("never says no component changed when a label was not kept: both sides are printed, and nothing is claimed of them", () => {
    // Re-worded with the same verdicts in the same order: the verb cannot know these are the same two components.
    const reworded = run({ components: [{ label: "Some pyramid blocks were cast", state: "contradicted" }, { label: "Some Pumapunku blocks were cast", state: "weakly_supported" }] } as never);
    const changes = judgmentChanges(run(), reworded, featured(), featured());
    expect(changes).toEqual([
      "components re-cut or re-worded, which the verb cannot match one to one: no longer given [Contradicted: Egyptian branch (X-C001); Weakly supported: Andean branch], now given [Contradicted: Some pyramid blocks were cast; Weakly supported: Some Pumapunku blocks were cast]",
    ]);
    expect(judgmentChangesSentence("edition-before", changes, false)).not.toContain("no case verdict");
    // One label kept and regraded, one dropped, one new: the kept one is matched, the others printed.
    const mixed = run({ components: [{ label: "Egyptian branch (X-C001)", state: "mixed" }, { label: "Slow pounding at Aswan", state: "well_supported" }] } as never);
    expect(judgmentChanges(run(), mixed, featured(), featured())).toEqual([
      `1 component verdict(s) moved: "Egyptian branch (X-C001)" Contradicted → Mixed`,
      "components re-cut or re-worded, which the verb cannot match one to one: no longer given [Weakly supported: Andean branch], now given [Well supported: Slow pounding at Aswan]",
    ]);
    // Components given where there were none, and the reverse.
    expect(judgmentChanges(run({ components: [] } as never), run(), featured(), featured())[0]).toContain("no longer given [none], now given [Contradicted: Egyptian branch (X-C001); Weakly supported: Andean branch]");
    // A label given twice names nothing: both lists whole, unless they are the same list.
    const twice = run({ components: [{ label: "Branch", state: "mixed" }, { label: "Branch", state: "contradicted" }] } as never);
    expect(judgmentChanges(twice, twice, featured(), featured())).toEqual([]);
    expect(judgmentChanges(twice, run({ components: [{ label: "Branch", state: "contradicted" }, { label: "Branch", state: "contradicted" }] } as never), featured(), featured())).toEqual([
      "component verdicts were [Mixed: Branch; Contradicted: Branch] and are [Contradicted: Branch; Contradicted: Branch]",
    ]);
  });

  it("names a moved priority, a regraded component and a changed load-bearing set, which a drafter can change without a word", () => {
    const after = run({
      researchPriority: { level: "high", reason: "The tests are cheap and unrun." },
      components: [{ label: "Some pyramid blocks were cast", state: "contradicted" }, { label: "Slow pounding at Aswan", state: "well_supported" }],
      loadBearing: ["X-C002"],
    } as never);
    expect(judgmentChanges(run(), after, featured("X-C001", "X-C002"), featured("X-C001", "X-C002"))).toEqual([
      "research priority medium → high",
      "components re-cut or re-worded, which the verb cannot match one to one: no longer given [Contradicted: Egyptian branch (X-C001); Weakly supported: Andean branch], now given [Contradicted: Some pyramid blocks were cast; Well supported: Slow pounding at Aswan]",
      "claims the case rests on: +X-C002, −X-C001",
    ]);
  });

  it("names the case verdict and every claim verdict that moved, and the featured claims that entered or left", () => {
    const after = run({ verdict: "weakly_supported" } as never, { "X-C001": "contradicted", "X-C002": "unresolved", "X-C003": "mixed" });
    const changes = judgmentChanges(run(), after, featured("X-C001", "X-C002"), featured("X-C001", "X-C003"));
    expect(changes).toEqual([
      "case verdict Unresolved → Weakly supported",
      "1 claim verdict(s) moved: X-C001 Mixed → Contradicted",
      "featured claims: +X-C003, −X-C002",
    ]);
    expect(judgmentChangesSentence("edition-before", changes, false)).toBe(`Against edition-before: ${changes.join("; ")}.`);
  });

  it("an edition that re-adopts the assessment can still change the selection", () => {
    expect(judgmentChanges(run(), null, featured("X-C001", "X-C002"), featured("X-C001"))).toEqual(["featured claims: −X-C002"]);
    expect(judgmentChanges(run(), null, featured("X-C001"), featured("X-C001"))).toEqual([]);
    expect(judgmentChangesSentence("edition-before", [], true)).toBe("Against edition-before: the assessment is re-adopted and the featured set is unchanged.");
    // A first assessment has nothing to be measured against but the selection.
    expect(judgmentChanges(null, run(), featured(), featured("X-C001"))).toEqual(["featured claims: +X-C001"]);
  });
});
