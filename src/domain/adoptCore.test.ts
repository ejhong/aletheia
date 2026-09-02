import { describe, expect, it } from "vitest";
import {
  ADOPTION_REF_RE,
  adoptionRef,
  applyAdoptionBudgets,
  isEndorsed,
  mapEffortTier,
  selectEndorsed,
  validateClaimDraft,
  validateResearchDraft,
} from "../../scripts/lib/adopt-core.mjs";

const tally = (over: Record<string, unknown> = {}) => ({
  id: "2026-09-01-agenda-1/geo/1",
  caseSlug: "geo",
  kind: "claim",
  highs: 4,
  advances: false,
  concerns: [] as string[],
  ...over,
});

describe("endorsement rule (the proposals page's rule, verbatim)", () => {
  it("endorses a 4-high non-study with zero concerns", () => {
    expect(isEndorsed(tally())).toBe(true);
    expect(isEndorsed(tally({ kind: "research-item", highs: 5 }))).toBe(true);
  });

  it("studies are never endorsed here — they advance to freezes instead", () => {
    expect(isEndorsed(tally({ kind: "study", advances: true }))).toBe(false);
    expect(isEndorsed(tally({ kind: "study" }))).toBe(false);
  });

  it("three highs is retirement, not endorsement", () => {
    expect(isEndorsed(tally({ highs: 3 }))).toBe(false);
  });

  it("one concern blocks even at five highs", () => {
    expect(isEndorsed(tally({ highs: 5, concerns: ["grades culpability"] }))).toBe(false);
  });

  it("a tally with no concerns array cannot endorse (fail closed)", () => {
    expect(isEndorsed(tally({ concerns: undefined }))).toBe(false);
  });
});

describe("adoption registry marker", () => {
  it("roundtrips through the origin.ref regex", () => {
    const ref = adoptionRef("2026-09-01-agenda-1/geo/2");
    expect(ref.match(ADOPTION_REF_RE)?.[1]).toBe("2026-09-01-agenda-1/geo/2");
  });

  it("selectEndorsed skips already-adopted ids", () => {
    const t1 = tally();
    const t2 = tally({ id: "run/geo/2" });
    const picked = selectEndorsed([t1, t2], new Set([t1.id]));
    expect(picked.map((t: { id: string }) => t.id)).toEqual(["run/geo/2"]);
  });
});

describe("adoption budgets", () => {
  const cand = (id: string, caseSlug: string) => ({ id, caseSlug, title: id });

  it("caps the run and reports the reason", () => {
    const { selected, deferred } = applyAdoptionBudgets(
      [cand("a", "x"), cand("b", "y"), cand("c", "z"), cand("d", "w")],
      { maxPerRun: 3, maxPerCase: 2 },
    );
    expect(selected.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(deferred[0].reason).toContain("run budget");
  });

  it("caps per case so one case cannot eat the run", () => {
    const { selected, deferred } = applyAdoptionBudgets(
      [cand("a", "x"), cand("b", "x"), cand("c", "x")],
      { maxPerRun: 5, maxPerCase: 2 },
    );
    expect(selected.length).toBe(2);
    expect(deferred[0].reason).toContain("case budget");
  });
});

describe("effort tier mapping", () => {
  it("records and analysis are desk work; lab stays lab", () => {
    expect(mapEffortTier("records")).toBe("desk");
    expect(mapEffortTier("analysis")).toBe("desk");
    expect(mapEffortTier("desk")).toBe("desk");
    expect(mapEffortTier("lab")).toBe("lab");
  });
});

describe("research draft validation (fail closed)", () => {
  const liveClaimIds = new Set(["GEO-C001", "GEO-C002"]);
  const good = {
    title: "Obtain the 1987 core log",
    summary: "x".repeat(80),
    claimIds: ["GEO-C001"],
    track: "either",
    effortTier: "desk",
    informationGain: "Either outcome settles the depth dispute cleanly.",
  };

  it("passes a complete draft and returns only model-authored fields", () => {
    const { record, errors } = validateResearchDraft(good, { liveClaimIds });
    expect(errors).toEqual([]);
    expect(record).not.toHaveProperty("id");
    expect(record?.claimIds).toEqual(["GEO-C001"]);
  });

  it("drops on dangling claim ids, bad enums, thin summaries", () => {
    expect(
      validateResearchDraft({ ...good, claimIds: ["GEO-C999"] }, { liveClaimIds }).errors,
    ).toContain("unknown claim GEO-C999");
    expect(
      validateResearchDraft({ ...good, track: "bounty" }, { liveClaimIds }).errors,
    ).toContain("bad track: bounty");
    expect(
      validateResearchDraft({ ...good, effortTier: "records" }, { liveClaimIds }).errors,
    ).toContain("bad effortTier: records");
    expect(
      validateResearchDraft({ ...good, summary: "thin" }, { liveClaimIds }).errors,
    ).toContain("summary too thin");
  });
});

describe("claim draft validation: the anchor is copied, never authored", () => {
  const ctx = {
    themes: new Set(["provenance"]),
    evidenceById: new Map([
      ["GEO-E004", { sourceId: "SRC-CORE-1987", exactLocator: "table 2, row 14" }],
      ["GEO-E005", { sourceId: "SRC-CORE-1987" }],
    ]),
  };
  const good = {
    statement: "The 1987 core log records a depth of 41 meters for sample B.",
    plainLanguage: "The original log says sample B came from 41 meters down.",
    theme: "provenance",
    rung: "observation",
    claimType: "measurement",
    anchorEvidenceId: "GEO-E004",
  };

  it("copies sourceId and locator from the anchor evidence record", () => {
    const { record, errors } = validateClaimDraft(good, ctx);
    expect(errors).toEqual([]);
    expect(record?.sourceAnchor).toEqual({
      sourceId: "SRC-CORE-1987",
      locator: "table 2, row 14",
    });
  });

  it("falls back to an honest via-evidence locator when the record has none", () => {
    const { record } = validateClaimDraft({ ...good, anchorEvidenceId: "GEO-E005" }, ctx);
    expect(record?.sourceAnchor.locator).toBe("as recorded in evidence GEO-E005");
  });

  it("a null anchor defers adoption rather than inventing one", () => {
    const { record, errors } = validateClaimDraft({ ...good, anchorEvidenceId: null }, ctx);
    expect(record).toBeNull();
    expect(errors.join(" ")).toContain("no in-ledger anchor");
  });

  it("drops on unknown anchor, theme, or rung", () => {
    expect(
      validateClaimDraft({ ...good, anchorEvidenceId: "GEO-E999" }, ctx).errors,
    ).toContain("unknown anchor evidence GEO-E999");
    expect(validateClaimDraft({ ...good, theme: "vibes" }, ctx).errors).toContain(
      'unknown theme "vibes"',
    );
    expect(validateClaimDraft({ ...good, rung: "verdict" }, ctx).errors).toContain(
      "bad rung: verdict",
    );
  });
});
