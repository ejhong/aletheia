import { describe, expect, it } from "vitest";
import {
  ARBITER_MIN_COMPLIES,
  capDiff,
  CONTENT_MERGES_PER_WEEK,
  rateLimitGate,
  splitMergeLanes,
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

  it("drops mechanically-guarded files before canon content, regardless of position", () => {
    // Regression for the dry-period parks: positional truncation dropped
    // sources.yaml while keeping bulky append-only overlays.
    const d =
      section("content/cases/x/assessments/2026-01-01-check-opus.yaml", 600) +
      section("content/cases/x/sources.yaml", 300) +
      section("scripts/arbiter.mjs", 200);
    const { text, omitted } = capDiff(d, 700);
    expect(text).toContain("sources.yaml");
    expect(text).toContain("scripts/arbiter.mjs");
    expect(omitted).toEqual(["content/cases/x/assessments/2026-01-01-check-opus.yaml"]);
  });

  it("a bulky unclassified section cannot starve the content tier", () => {
    // Regression: unrecognized paths default to tier 0, and strict
    // tier-0-first filling let one large working directory spend the
    // whole budget — every content/ file landed in `omitted` and the
    // panel could only report that it had not seen the change.
    const d =
      section("working-papers/big-draft.md", 900) +
      section("content/cases/x/claims.yaml", 200) +
      section("content/cases/x/sources.yaml", 150);
    const { text, omitted } = capDiff(d, 1000);
    expect(text).toContain("content/cases/x/claims.yaml");
    expect(text).toContain("content/cases/x/sources.yaml");
    expect(omitted).toEqual(["working-papers/big-draft.md"]);
  });

  it("reserve a tier does not spend flows to the others in scrutiny order", () => {
    // Tier 0 exceeds its reserve, tier 1 leaves most of its own unspent:
    // the second pass must hand that slack to the remaining tier-0
    // section before tier 2 sees any of it.
    const d =
      section("scripts/a.mjs", 300) +
      section("scripts/b.mjs", 300) +
      section("content/cases/x/claims.yaml", 100) +
      section("inbox/z.yaml", 500);
    const { text, omitted } = capDiff(d, 900);
    expect(text).toContain("scripts/a.mjs");
    expect(text).toContain("scripts/b.mjs");
    expect(text).toContain("content/cases/x/claims.yaml");
    expect(omitted).toEqual(["inbox/z.yaml"]);
  });
});

describe("rateLimitGate", () => {
  const pass = { outcome: "pass", counts: { complies: 5, violates: 0, unsure: 0 }, reason: "5 of 5" };
  const park = { outcome: "park", counts: { complies: 2, violates: 0, unsure: 3 }, reason: "only 2 of 5" };

  it("parks a passing content change once the weekly budget is spent", () => {
    const v = rateLimitGate(pass, { touchesContent: true, mergesThisWeek: CONTENT_MERGES_PER_WEEK });
    expect(v.outcome).toBe("park");
    expect(v.rateLimited).toBe(true);
  });

  it("never throttles code/docs changes, and never upgrades a park", () => {
    expect(rateLimitGate(pass, { touchesContent: false, mergesThisWeek: 99 }).outcome).toBe("pass");
    expect(rateLimitGate(park, { touchesContent: true, mergesThisWeek: 0 }).outcome).toBe("park");
  });

  it("leaves a passing change alone under budget", () => {
    expect(rateLimitGate(pass, { touchesContent: true, mergesThisWeek: CONTENT_MERGES_PER_WEEK - 1 }).outcome).toBe("pass");
  });

  it("names the supervised exclusions in the park reason", () => {
    const v = rateLimitGate(pass, {
      touchesContent: true,
      mergesThisWeek: CONTENT_MERGES_PER_WEEK,
      supervisedExcluded: 3,
    });
    expect(v.reason).toContain("3 supervised excluded");
  });
});

/**
 * The lane split decides what the throttle is measuring, so the tests are
 * about the failure direction: an unreadable or unmarked commit must count
 * (an under-counting throttle is no throttle), and only an explicit,
 * well-formed declaration may buy an exemption.
 */
describe("splitMergeLanes", () => {
  const c = (hash: string, message: string) => ({ hash, message });

  it("counts an ordinary merge and excludes a declared supervised one", () => {
    const { autonomous, supervised } = splitMergeLanes([
      c("a1", "Content response 2026-09-02: reassessment and panels\n"),
      c("b2", "VASO-S001 collection\n\nSupervised-by: founder-directed session\n"),
    ]);
    expect(autonomous).toEqual(["a1"]);
    expect(supervised).toEqual(["b2"]);
  });

  it("counts by default: no message, empty message, or a near-miss trailer", () => {
    const { autonomous, supervised } = splitMergeLanes([
      c("a1", ""),
      { hash: "a2" } as { hash: string; message?: string },
      c("a3", "mentions Supervised-by: nothing at the line start? no — inline only"),
      c("a4", "Supervised-by:\n"),
    ]);
    expect(autonomous).toEqual(["a1", "a2", "a3", "a4"]);
    expect(supervised).toEqual([]);
  });

  it("accepts the trailer as a real trailer line, indented or not", () => {
    const { supervised } = splitMergeLanes([
      c("b1", "title\n\nSupervised-by: founder\n"),
      c("b2", "title\n\n  Supervised-by: founder\n"),
    ]);
    expect(supervised).toEqual(["b1", "b2"]);
  });

  it("drops entries with no hash and de-duplicates", () => {
    const { autonomous } = splitMergeLanes([
      c("a1", "x"),
      c("a1", "x"),
      { hash: "", message: "x" },
    ]);
    expect(autonomous).toEqual(["a1"]);
  });
});
