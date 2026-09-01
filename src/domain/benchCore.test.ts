import { describe, expect, it } from "vitest";
import {
  advances,
  applyBudgets,
  parseSeatScores,
  tallyProposal,
} from "../../scripts/lib/bench-core.mjs";

const seat = (rows: Record<string, [string, string | null]>) => {
  const parsed = {
    scores: Object.entries(rows).map(([id, [score, concern]]) => ({
      id,
      score,
      constitutionalConcern: concern,
      reasoning: "r",
    })),
  };
  return parseSeatScores(parsed);
};

describe("bench v2: panel-scored advancement", () => {
  it("parses fail-closed: bad rows skipped, empty is empty", () => {
    const m = parseSeatScores({
      scores: [
        { id: "P1", score: "high", constitutionalConcern: null },
        { id: "P2", score: "amazing" }, // bad score → skipped
        { score: "high" }, // no id → skipped
        { id: "P3", score: "low", constitutionalConcern: "   " }, // blank concern → null
      ],
    });
    expect(m.size).toBe(2);
    expect(m.get("P3")?.concern).toBeNull();
    expect(parseSeatScores({ nonsense: true }).size).toBe(0);
  });

  it("advances on 4 highs, no concerns; a lone lukewarm seat cannot starve", () => {
    const seats: Array<[string, ReturnType<typeof seat>]> = [
      ["a", seat({ P1: ["high", null] })],
      ["b", seat({ P1: ["high", null] })],
      ["c", seat({ P1: ["high", null] })],
      ["d", seat({ P1: ["high", null] })],
      ["e", seat({ P1: ["medium", null] })], // the ornery seat
    ];
    const t = tallyProposal("P1", seats);
    expect(t.highs).toBe(4);
    expect(advances(t)).toBe(true);
  });

  it("one substantiated concern blocks even at five highs", () => {
    const seats: Array<[string, ReturnType<typeof seat>]> = [
      ["a", seat({ P1: ["high", null] })],
      ["b", seat({ P1: ["high", null] })],
      ["c", seat({ P1: ["high", null] })],
      ["d", seat({ P1: ["high", null] })],
      ["e", seat({ P1: ["high", "grades a living person's culpability"] })],
    ];
    expect(advances(tallyProposal("P1", seats))).toBe(false);
  });

  it("a thin panel cannot advance anything", () => {
    const seats: Array<[string, ReturnType<typeof seat>]> = [
      ["a", seat({ P1: ["high", null] })],
      ["b", seat({ P1: ["high", null] })],
      ["c", seat({ P1: ["high", null] })],
      ["d", seat({})], // failed for this row
      ["e", seat({})],
    ];
    const t = tallyProposal("P1", seats);
    expect(t.seats.filter((s) => s.score !== null)).toHaveLength(3);
    expect(advances(t)).toBe(false);
  });

  it("budgets: run cap and per-case active cap, with reasons", () => {
    const advancing = [
      { id: "A1", caseSlug: "alpha" },
      { id: "A2", caseSlug: "alpha" },
      { id: "B1", caseSlug: "beta" },
      { id: "C1", caseSlug: "gamma" },
    ];
    const { selected, deferred } = applyBudgets(
      advancing,
      { alpha: 1, beta: 2 },
      { maxFreezesPerRun: 2, maxActivePerCase: 2 },
    );
    expect(selected.map((s) => s.id)).toEqual(["A1", "C1"]);
    expect(deferred.find((d) => d.id === "B1")?.reason).toContain(
      "uncollected studies",
    );
    expect(deferred.find((d) => d.id === "A2")?.reason).toContain("run budget");
  });
});
