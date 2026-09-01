import { describe, expect, it } from "vitest";
import {
  assessmentMovementDates,
  classifyCase,
  dueThisRun,
  movementDates,
} from "../../scripts/lib/yield-core.mjs";

const run = (
  date: string,
  caseVerdict: string,
  claims: Record<string, string>,
  role: "draft" | "check" = "draft",
) => ({
  date,
  role,
  caseAssessment: { verdict: caseVerdict },
  claimAssessments: Object.entries(claims).map(([claimId, verdict]) => ({
    claimId,
    verdict,
  })),
});

describe("yield: verdict-moving events", () => {
  it("counts the first assessment and any verdict change; ignores no-ops", () => {
    const dates = assessmentMovementDates([
      run("2026-01-01", "unresolved", { C1: "mixed" }),
      run("2026-02-01", "unresolved", { C1: "mixed" }), // no movement
      run("2026-03-01", "unresolved", { C1: "supported" }), // claim moved
      run("2026-04-01", "mixed", { C1: "supported" }), // case moved
    ]);
    expect(dates).toEqual(["2026-01-01", "2026-03-01", "2026-04-01"]);
  });

  it("excludes blind check runs — judgment about the case is not movement of it", () => {
    const dates = assessmentMovementDates([
      run("2026-01-01", "unresolved", {}),
      run("2026-02-01", "contradicted", {}, "check"),
    ]);
    expect(dates).toEqual(["2026-01-01"]);
  });

  it("merges history, studies, and featured-claim events, deduplicated", () => {
    const dates = movementDates({
      assessmentRuns: [run("2026-01-01", "unresolved", {})],
      history: [
        { date: "2026-01-01", kind: "content" }, // dedupes with the run
        { date: "2026-02-10", kind: "content" },
        { date: "2026-02-11", kind: "housekeeping" }, // excluded
      ],
      studies: [
        { date: "2026-03-01", rows: [{ cells: {} }] },
        { date: "2026-03-05", rows: [] }, // freeze only — not yet movement
      ],
      claims: [
        { tier: "featured", origin: { date: "2026-04-01" } },
        { tier: "catalog", origin: { date: "2026-04-02" } }, // excluded
      ],
    });
    expect(dates).toEqual([
      "2026-01-01",
      "2026-02-10",
      "2026-03-01",
      "2026-04-01",
    ]);
  });

  it("classifies bands by recency of movement", () => {
    const base = {
      assessmentRuns: [],
      studies: [],
      claims: [],
    };
    expect(
      classifyCase(
        { ...base, history: [{ date: "2026-08-25", kind: "content" }] },
        "2026-09-01",
      ),
    ).toMatchObject({ band: "hot", attention: "weekly" });
    expect(
      classifyCase(
        { ...base, history: [{ date: "2026-06-01", kind: "content" }] },
        "2026-09-01",
      ),
    ).toMatchObject({ band: "warm", attention: "monthly" });
    expect(
      classifyCase(
        { ...base, history: [{ date: "2025-09-01", kind: "content" }] },
        "2026-09-01",
      ),
    ).toMatchObject({ band: "cool", attention: "quarterly" });
    expect(classifyCase({ ...base, history: [] }, "2026-09-01")).toMatchObject({
      band: "cool",
      lastMoved: null,
      daysSinceMovement: null,
    });
  });

  it("hot is always due; warm and cool recur without stored state", () => {
    expect(dueThisRun("hot", "2026-09-01")).toBe(true);
    // Deterministic: the same date always gives the same answer.
    expect(dueThisRun("warm", "2026-09-01")).toBe(
      dueThisRun("warm", "2026-09-01"),
    );
    // Warm fires on ~13 weeks of the year; cool on ~4. Count over a year.
    let warm = 0;
    let cool = 0;
    for (let m = 1; m <= 12; m++) {
      for (const d of [3, 10, 17, 24]) {
        const date = `2026-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        if (dueThisRun("warm", date)) warm++;
        if (dueThisRun("cool", date)) cool++;
      }
    }
    expect(warm).toBeGreaterThanOrEqual(8);
    expect(warm).toBeLessThanOrEqual(16);
    expect(cool).toBeGreaterThanOrEqual(2);
    expect(cool).toBeLessThanOrEqual(6);
  });
});
