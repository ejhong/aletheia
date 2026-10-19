import { describe, expect, it } from "vitest";
import { sessionCapFor } from "./status.ts";

// The standing caps of 2026-11-01 (config/budget.yaml).
const caps = { perSession: 10, perDay: 15, perMonth: 60 };

describe("the month's pace", () => {
  it("lets the first session of a month spend the session's cap", () => {
    expect(sessionCapFor({ ...caps, spentToday: 0, spentMonth: 0, today: "2026-11-01" })).toMatchObject({ sessionCap: 10, nextSession: null });
  });

  it("holds the next scheduled session until the month is back on its pace", () => {
    const r = sessionCapFor({ ...caps, spentToday: 0, spentMonth: 10, today: "2026-11-02" });
    expect(r.sessionCap).toBe(0);
    expect(r.pace).toBeCloseTo(4);
    // $10 is the month's share of five days out of thirty.
    expect(r.nextSession).toBe("2026-11-05");
    expect(sessionCapFor({ ...caps, spentToday: 0, spentMonth: 10, today: "2026-11-05" }).sessionCap).toBe(10);
  });

  it("lets a session started by hand run ahead of the pace, within the caps", () => {
    expect(sessionCapFor({ ...caps, spentToday: 0, spentMonth: 10, today: "2026-11-02", ahead: true })).toMatchObject({ sessionCap: 10, nextSession: null });
    expect(sessionCapFor({ ...caps, spentToday: 12, spentMonth: 55, today: "2026-11-02", ahead: true }).sessionCap).toBe(3);
  });

  it("is never more than what the day or the month leaves", () => {
    expect(sessionCapFor({ ...caps, spentToday: 12, spentMonth: 12, today: "2026-11-20" }).sessionCap).toBe(3);
    expect(sessionCapFor({ ...caps, spentToday: 0, spentMonth: 56, today: "2026-11-30" }).sessionCap).toBe(4);
  });

  it("names the first of the next month when the month's money is spent", () => {
    expect(sessionCapFor({ ...caps, spentToday: 0, spentMonth: 61, today: "2026-11-29" })).toMatchObject({ sessionCap: 0, nextSession: "2026-12-01" });
    expect(sessionCapFor({ ...caps, spentToday: 0, spentMonth: 61, today: "2026-12-29" }).nextSession).toBe("2027-01-01");
  });

  it("counts the days of the month it is in", () => {
    // February 2027 has 28 days: $30 is the share of fourteen.
    expect(sessionCapFor({ ...caps, spentToday: 0, spentMonth: 30, today: "2027-02-10" }).nextSession).toBe("2027-02-14");
  });
});
