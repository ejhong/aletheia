import { describe, expect, it } from "vitest";
import {
  ARBITER_MIN_COMPLIES,
  capDiff,
  tallyVerdict,
  validateVote,
} from "../../scripts/lib/arbiter-core.mjs";

/**
 * This logic will eventually replace the founder's merge tap, so the tests
 * are about the failure directions: a malformed or missing vote must never
 * count toward passing, and a lone substantiated objection must park.
 */

const ok = (vote: string, rules: string[] = ["§3.8"]) => ({
  vote,
  rules,
  reasoning: "a sufficiently long concrete reasoning about the diff at hand",
});

describe("validateVote — fail closed", () => {
  it("accepts a well-formed vote", () => {
    const v = validateVote("Seat", ok("complies", []));
    expect(v.vote).toBe("complies");
  });

  it("turns garbage into an explicit unsure, never a pass", () => {
    for (const junk of [null, "yes", { vote: "approve" }, { vote: "complies" }]) {
      const v = validateVote("Seat", junk);
      expect(v.vote).toBe("unsure");
      expect(v.reasoning).toMatch(/invalid reply/);
    }
  });

  it("rejects violates-without-particulars — an unactionable accusation is unsure", () => {
    const v = validateVote("Seat", { ...ok("violates"), rules: [] });
    expect(v.vote).toBe("unsure");
  });

  it("requires non-trivial reasoning", () => {
    const v = validateVote("Seat", { ...ok("complies", []), reasoning: "ok" });
    expect(v.vote).toBe("unsure");
  });
});

describe("tallyVerdict — the asymmetric rule", () => {
  const seats = (votes: string[]) =>
    votes.map((vote, i) =>
      validateVote(`Seat${i}`, ok(vote, vote === "violates" ? ["§3.8"] : [])),
    );

  it("5 complies passes; 4 complies + 1 unsure passes", () => {
    expect(tallyVerdict(seats(["complies", "complies", "complies", "complies", "complies"])).outcome).toBe("pass");
    expect(tallyVerdict(seats(["complies", "complies", "complies", "complies", "unsure"])).outcome).toBe("pass");
  });

  it("a single substantiated violation parks, even against four complies", () => {
    const t = tallyVerdict(seats(["complies", "complies", "complies", "complies", "violates"]));
    expect(t.outcome).toBe("park");
    expect(t.reason).toMatch(/§3.8/);
  });

  it("two unsures park — below the compliance threshold", () => {
    expect(tallyVerdict(seats(["complies", "complies", "complies", "unsure", "unsure"])).outcome).toBe("park");
  });

  it("a shrunken panel cannot pass", () => {
    expect(
      tallyVerdict(seats(Array(ARBITER_MIN_COMPLIES - 1).fill("complies"))).outcome,
    ).toBe("park");
  });

  it("failed seats stay in the denominator as unsure", () => {
    const votes = [
      ...seats(["complies", "complies", "complies"]),
      validateVote("Dead seat", undefined),
      validateVote("Dead seat 2", undefined),
    ];
    const t = tallyVerdict(votes);
    expect(t.outcome).toBe("park");
    expect(t.counts.unsure).toBe(2);
  });
});

describe("capDiff — truncation is loud", () => {
  const section = (name: string, size: number) =>
    `diff --git a/${name} b/${name}\n` + "x".repeat(size) + "\n";

  it("small diffs pass through with an empty omission list", () => {
    const d = section("a.ts", 100);
    expect(capDiff(d)).toEqual({ text: d, omitted: [] });
  });

  it("names every file the panel will not see", () => {
    const d = section("kept.ts", 100) + section("dropped/one.ts", 900) + section("dropped/two.ts", 900);
    const { text, omitted } = capDiff(d, 500);
    expect(text).toContain("kept.ts");
    expect(omitted).toEqual(["dropped/one.ts", "dropped/two.ts"]);
  });
});
