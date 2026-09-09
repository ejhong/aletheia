import { describe, expect, it } from "vitest";
import { caseActivity, excerpt } from "./activity.ts";
import { loadAllCases } from "./load.ts";
import { describeRun } from "./runs.ts";
import { claimConcurrence, seatRelation } from "./standing.ts";
import type { RunRecord } from "./intake.ts";

const run = (over: Partial<RunRecord>): RunRecord => ({
  runId: "2026-09-09-verify-x-000000", verb: "verify", case: "x", date: "2026-09-09", model: "m", promptVersion: "p", inputHash: null, outcome: "completed",
  cost: { calls: 1, inputTokens: 1, outputTokens: 1, usd: 1.5 }, ...over,
});

describe("the latest strip", () => {
  it("says what a run did in a reader's words, from the record it left", () => {
    expect(describeRun(run({ notes: 'wrote {"sources":1,"evidence":6,"claims":50,"research":5}; 36 rejected' }))).toBe("admitted 50 claims, 6 evidence, 1 sources, 5 research; 36 refused");
    expect(describeRun(run({ notes: 'wrote {"sources":0,"evidence":0,"claims":0,"research":0}; 0 rejected' }))).toBe("admitted nothing; 0 refused");
    expect(describeRun(run({ notes: 'wrote {"sources":2,"evidence":11,"claims":6,"research":2}; 0 rejected; 1 correction(s) applied' }))).toBe("admitted 6 claims, 11 evidence, 2 sources, 2 research; 0 refused; 1 correction(s) applied");
    expect(describeRun(run({ verb: "inbox", notes: "1 item(s) taken in; 39 work(s) named, 0 resolved to locators" }))).toBe("1 item(s) taken in");
    expect(describeRun(run({ verb: "check", notes: "5 of 5 seat(s) installed" }))).toBe("5 of 5 seats judged the case blind");
    expect(describeRun(run({ verb: "edition", notes: "new assessment" }))).toBe("a new edition with a new assessment");
    expect(describeRun(run({ verb: "report", model: "claude-fable-5-1", notes: undefined }))).toBe("research pass (claude-fable-5-1)");
  });

  it("takes whole sentences up to the limit", () => {
    expect(excerpt("One. Two is longer. Three.", 12)).toBe("One.");
    expect(excerpt("One. Two is longer. Three.", 20)).toBe("One. Two is longer.");
    expect(excerpt("A single very long sentence that runs past the limit without a full stop anywhere near", 30)).toMatch(/…$/);
  });

  it("derives a case's recent activity from the records the loop wrote", () => {
    const c = loadAllCases().find((x) => x.record.slug === "vasocomputation")!;
    const a = caseActivity(c);
    expect(a.edition.runId).toBe(c.editions.at(-1)!.runId);
    expect(a.edition.excerpt.length).toBeLessThanOrEqual(361);
    expect(a.sittings.length).toBeGreaterThan(0);
    expect(a.sittings.length).toBeLessThanOrEqual(5);
    expect(a.sittings.every((s) => s.summary.length > 0 && /^\d{4}-\d\d-\d\d$/.test(s.date))).toBe(true);
    // newest first
    expect([...a.sittings].sort((p, q) => q.date.localeCompare(p.date) || q.runId.localeCompare(p.runId)).map((s) => s.runId)).toEqual(a.sittings.map((s) => s.runId));
  });
});

describe("one rule for the page", () => {
  it("a seat concurs within one step and disputes beyond it; a claim is exact, adjacent, or split by the same rule", () => {
    expect(seatRelation("mixed", "unresolved")).toBe("concurs");
    expect(seatRelation("contradicted", "unresolved")).toBe("disputes");
    expect(claimConcurrence("unresolved", ["unresolved", "unresolved"])).toBe("exact");
    expect(claimConcurrence("unresolved", ["mixed", "weakly_supported", "unresolved"])).toBe("adjacent");
    expect(claimConcurrence("unresolved", ["contradicted", "contradicted", "mixed"])).toBe("split"); // one of three within a step is not a majority
    expect(claimConcurrence("weakly_supported", ["mixed", "contradicted", "weakly_supported"])).toBe("adjacent"); // all three within one step of weakly supported
  });
});
