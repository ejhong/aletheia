import { describe, expect, it } from "vitest";
import {
  caseVerdictDissenters,
  claimDissentPacket,
  contestedLoadBearingClaims,
} from "../../scripts/lib/reconcile-core.mjs";

/**
 * The reconciliation loop's eligibility must mirror what makes a standing
 * "contested" in load.ts ratification() — most importantly the shape that
 * used to slip through: a unanimous case verdict over a split load-bearing
 * claim (the live vasocomputation state).
 */

const draft = (
  caseVerdict: string,
  loadBearing: string[],
  claimVerdicts: Record<string, string>,
) => ({
  caseAssessment: { verdict: caseVerdict, loadBearing },
  claimAssessments: Object.entries(claimVerdicts).map(
    ([claimId, verdict]) => ({ claimId, verdict }),
  ),
});

const check = (
  model: string,
  caseVerdict: string,
  claimVerdicts: Record<string, string> = {},
) => ({
  model,
  caseAssessment: { verdict: caseVerdict },
  claimAssessments: Object.entries(claimVerdicts).map(
    ([claimId, verdict]) => ({ claimId, verdict, reasoning: `${model} on ${claimId}` }),
  ),
});

describe("reconciliation eligibility mirrors contested standing", () => {
  it("counts case-verdict dissenters", () => {
    const d = draft("mixed", [], {});
    const checks = [
      check("alpha", "mixed"),
      check("beta", "contradicted"),
      check("gamma", "unresolved"),
    ];
    expect(
      caseVerdictDissenters(d, checks).map((c: { model: string }) => c.model),
    ).toEqual(["beta", "gamma"]);
  });

  it("flags the vasocomputation shape: unanimous case verdict, split load-bearing claim", () => {
    // House holds an open verdict on C1; four of five seats grade it.
    // Open verdicts must match exactly, so only one seat is "near".
    const d = draft("unresolved", ["C1"], { C1: "unresolved" });
    const checks = [
      check("alpha", "unresolved", { C1: "weakly_supported" }),
      check("beta", "unresolved", { C1: "weakly_supported" }),
      check("gamma", "unresolved", { C1: "weakly_supported" }),
      check("delta", "unresolved", { C1: "weakly_supported" }),
      check("epsilon", "unresolved", { C1: "unresolved" }),
    ];
    expect(caseVerdictDissenters(d, checks)).toHaveLength(0);
    expect(contestedLoadBearingClaims(d, checks)).toEqual(["C1"]);
  });

  it("within-one-step majorities on the graded scale are not splits", () => {
    const d = draft("mixed", ["C1"], { C1: "mixed" });
    const checks = [
      check("alpha", "mixed", { C1: "provisionally_supported" }), // one step up
      check("beta", "mixed", { C1: "weakly_supported" }), // one step down
      check("gamma", "mixed", { C1: "mixed" }),
      check("delta", "mixed", { C1: "contradicted" }), // two steps — far
    ];
    expect(contestedLoadBearingClaims(d, checks)).toEqual([]);
  });

  it("ignores claims the panel never judged and claims off the load-bearing list", () => {
    const d = draft("mixed", ["C1"], { C1: "mixed", C2: "mixed" });
    const checks = [
      check("alpha", "mixed", { C2: "contradicted" }),
      check("beta", "mixed", { C2: "contradicted" }),
    ];
    // C1: no seat judged it (skip); C2: split but not load-bearing.
    expect(contestedLoadBearingClaims(d, checks)).toEqual([]);
  });

  it("builds the per-claim dissent packet with house verdict and seat reasonings", () => {
    const d = draft("unresolved", ["C1"], { C1: "unresolved" });
    const checks = [
      check("alpha (Vendor)", "unresolved", { C1: "weakly_supported" }),
      check("beta (Vendor)", "unresolved", {}),
    ];
    expect(claimDissentPacket(d, checks, ["C1"], (m: string) => m.split(" ")[0])).toEqual([
      {
        claimId: "C1",
        houseVerdict: "unresolved",
        seats: [
          {
            seat: "alpha",
            verdict: "weakly_supported",
            reasoning: "alpha (Vendor) on C1",
          },
        ],
      },
    ]);
  });
});
