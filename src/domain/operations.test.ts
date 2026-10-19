import { describe, expect, it } from "vitest";
import { cronHuman, operationsView, workflowCron } from "./operations.ts";

describe("the operations page", () => {
  it("reads the operator's schedule from its workflow and says it in words", () => {
    expect(cronHuman("17 6 * * 1")).toBe("weekly, Mondays at 06:17 UTC");
    expect(cronHuman("0 13 * * 1,4")).toBe("Mondays and Thursdays at 13:00 UTC");
    expect(cronHuman("30 5 * * *")).toBe("daily at 05:30 UTC");
    expect(cronHuman("0 0 1 * *")).toMatch(/^on the schedule/);
    const cron = workflowCron();
    expect(cron === null || /^\d+ \d+ \* \* /.test(cron)).toBe(true);
  });

  it("derives the state, the spend against the caps in force, the runs and the reviews from the files the site writes", () => {
    const ops = operationsView(process.cwd(), "2026-09-09");
    expect(["live", "paused"]).toContain(ops.operation.state);
    expect(["exemption", "crunch", "standing"]).toContain(ops.spend.caps.phase);
    expect(ops.spend.day.rows).toBeGreaterThan(0);
    expect(ops.spend.day.usd).toBeGreaterThan(0); // the priced sum, with the unpriced rows counted beside it
    expect(ops.spend.allTime.calls).toBeGreaterThanOrEqual(ops.spend.month.rows);
    expect(ops.sittings.length).toBeGreaterThan(0);
    expect(ops.sittings.length).toBeLessThanOrEqual(24);
    const dates = ops.sittings.map((s) => s.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(Array.isArray(ops.reviews)).toBe(true);
    for (const n of ops.reviewNotes) {
      if (n.state === "closed") expect(n.answer === null || (n.answer && n.answer.url.startsWith("https://"))).toBe(true); // a receipt or a visible absence, never closure as the answer
    }
  });
});
