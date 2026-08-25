import { describe, expect, it } from "vitest";
import {
  applyDuplicateGuard,
  validateTriageReply,
} from "../../scripts/lib/triage.mjs";

/**
 * The triage step decides what surfaced literature deserves — the two
 * pieces that must not fail quietly are the reply validation (a half-valid
 * reply must triage nothing, because a skipped item is indistinguishable
 * from a deliberate archive) and the duplicate guard (a flagged possible
 * duplicate must never import, whatever the model says).
 */

const ok = (index: number, decision = "archive") => ({
  index,
  decision,
  reason: "tangential to the case",
});

describe("validateTriageReply — fail-closed", () => {
  it("accepts a complete, well-formed reply in any order", () => {
    const { decisions, errors } = validateTriageReply(
      [ok(2, "import"), ok(0), ok(1, "shelf")],
      3,
    );
    expect(errors).toEqual([]);
    expect(decisions?.map((d: { decision: string }) => d.decision)).toEqual([
      "archive",
      "shelf",
      "import",
    ]);
  });

  it("returns NO decisions when any item is left unjudged", () => {
    const { decisions, errors } = validateTriageReply([ok(0)], 2);
    expect(decisions).toBeNull();
    expect(errors).toContain("item 1 not judged");
  });

  it("rejects unknown decisions, duplicate indexes, and missing reasons", () => {
    const { decisions, errors } = validateTriageReply(
      [
        { index: 0, decision: "promote", reason: "r" },
        ok(1),
        ok(1),
        { index: 2, decision: "archive", reason: "  " },
      ],
      3,
    );
    expect(decisions).toBeNull();
    expect(errors.some((e: string) => e.includes('unknown decision "promote"'))).toBe(
      true,
    );
    expect(errors.some((e: string) => e.includes("judged twice"))).toBe(true);
    expect(errors.some((e: string) => e.includes("missing reason"))).toBe(true);
  });

  it("rejects a non-array reply and out-of-range indexes", () => {
    expect(validateTriageReply({ 0: "archive" }, 1).decisions).toBeNull();
    const { decisions, errors } = validateTriageReply([ok(5), ok(0)], 1);
    expect(decisions).toBeNull();
    expect(errors.some((e: string) => e.includes("out of range"))).toBe(true);
  });
});

describe("applyDuplicateGuard", () => {
  const items = [
    { title: "genuinely new", possibleDuplicateOf: undefined },
    {
      title: "same work, new venue",
      possibleDuplicateOf: "SRC-BRUEHL-VILLARROEL-2025 — title overlap 0.9",
    },
  ];

  it("downgrades an import of a flagged possible duplicate to archive", () => {
    const out = applyDuplicateGuard(items, [
      { index: 0, decision: "import", reason: "new data" },
      { index: 1, decision: "import", reason: "new data" },
    ]);
    expect(out[0].decision).toBe("import");
    expect(out[1].decision).toBe("archive");
    expect(out[1].reason).toContain("downgraded from import");
    expect(out[1].reason).toContain("SRC-BRUEHL-VILLARROEL-2025");
  });

  it("leaves non-import decisions on flagged duplicates untouched", () => {
    const out = applyDuplicateGuard(items, [
      { index: 1, decision: "shelf", reason: "useful reading" },
    ]);
    expect(out[0].decision).toBe("shelf");
  });
});
