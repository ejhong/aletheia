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
      { id: "A1", caseSlug: "alpha" }, // fills alpha to its cap
      { id: "A2", caseSlug: "alpha" }, // deferred: case cap (A1 just filled it)
      { id: "B1", caseSlug: "beta" }, // deferred: case cap (already full)
      { id: "C1", caseSlug: "gamma" }, // fills the run budget
      { id: "D1", caseSlug: "delta" }, // deferred: run budget spent
    ];
    const { selected, deferred } = applyBudgets(
      advancing,
      { alpha: 1, beta: 2 },
      { maxFreezesPerRun: 2, maxActivePerCase: 2 },
    );
    expect(selected.map((s) => s.id)).toEqual(["A1", "C1"]);
    expect(deferred.find((d) => d.id === "A2")?.reason).toContain(
      "uncollected studies",
    );
    expect(deferred.find((d) => d.id === "B1")?.reason).toContain(
      "uncollected studies",
    );
    expect(deferred.find((d) => d.id === "D1")?.reason).toContain("run budget");
  });
});

describe("bench v2: agenda file parsing", () => {
  it("round-trips the renderProposalFile format, fail-closed per block", async () => {
    const { parseAgendaFile } = await import("../../scripts/lib/bench-core.mjs");
    const text = [
      "# Agenda proposals — transients — 2026-08-31",
      "",
      "PROPOSALS ONLY. …",
      "",
      "## 1. [study] Chance-alignment null calibration",
      "",
      "**Question / truth condition:** Do the alignments exceed chance?",
      "",
      "**Closest existing:** TRN-C104, TRN-E018 — no null model exists.",
      "",
      "**What it would settle:** Whether the alignment argument survives.",
      "",
      "**Effort:** analysis",
      "",
      "## 2. [claim] A malformed block with no question",
      "",
      "**Effort:** desk",
      "",
    ].join("\n");
    const parsed = parseAgendaFile(text, { caseSlug: "transients", runDir: "2026-08-31-agenda-x" });
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      id: "2026-08-31-agenda-x/transients/1",
      kind: "study",
      title: "Chance-alignment null calibration",
      effortTier: "analysis",
    });
  });
});
