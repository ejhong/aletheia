import { describe, expect, it } from "vitest";
import { chainCron, cronHuman, operationsView } from "./operations.ts";
import { answerFrom, joinPages, parseReviewNoteTitle } from "../lib/harvest-parse.mjs";

describe("the operations page", () => {
  it("reads the chain's schedule from the workflow and says it in words", () => {
    expect(cronHuman("17 6 * * 1")).toBe("weekly, Mondays at 06:17 UTC");
    expect(cronHuman("0 13 * * 1,4")).toBe("Mondays and Thursdays at 13:00 UTC");
    expect(cronHuman("30 5 * * *")).toBe("daily at 05:30 UTC");
    expect(cronHuman("0 0 1 * *")).toMatch(/^on the schedule/);
    const cron = chainCron();
    expect(cron === null || /^\d+ \d+ \* \* /.test(cron)).toBe(true);
  });

  it("derives the state, the spend against the caps in force, and the sittings from the files the loop writes", () => {
    const ops = operationsView(process.cwd(), "2026-09-09");
    expect(["live", "paused"]).toContain(ops.operation.state);
    expect(["exemption", "crunch", "standing"]).toContain(ops.spend.caps.phase);
    expect(ops.spend.day.rows).toBeGreaterThan(0);
    expect(ops.spend.allTime.calls).toBeGreaterThanOrEqual(ops.spend.month.rows);
    expect(ops.sittings.length).toBeGreaterThan(0);
    expect(ops.sittings.length).toBeLessThanOrEqual(24);
    const dates = ops.sittings.map((s) => s.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(Array.isArray(ops.reviewNotes)).toBe(true);
    for (const n of ops.reviewNotes) {
      if (n.state === "closed") expect(n.answer === null || (n.answer && n.answer.url.startsWith("https://"))).toBe(true); // a receipt or a visible absence, never closure as the answer
    }
  });

  it("reads a review note's title as the review-notes script writes it, and refuses any other shape", () => {
    expect(parseReviewNoteTitle("Review note on #223 — GPT-5.6 Sol (OpenAI): §3.15, §3.8 (provenance)")).toEqual({ pr: 223, seat: "GPT-5.6 Sol (OpenAI)", rules: ["§3.15", "§3.8"], paradigm: "provenance" });
    expect(parseReviewNoteTitle("Review note on #215 — GPT-5.6 Sol (OpenAI): §3.15 (check-weakening)")).toEqual({ pr: 215, seat: "GPT-5.6 Sol (OpenAI)", rules: ["§3.15"], paradigm: "check-weakening" });
    expect(parseReviewNoteTitle("Something else entirely")).toBeNull();
  });
});

describe("the answer on the record", () => {
  it("is the last comment by a recognized answerer, never a passer-by's, never closure", () => {
    const c = (login: string, body: string, at: string) => ({ user: { login }, body, created_at: at, html_url: `https://example.org/${login}/${at}` });
    const comments = [c("someone", "drive-by", "2026-09-09T01:00:00Z"), c("ejhong", "Answered on the record.", "2026-09-09T02:00:00Z"), c("someone", "later remark", "2026-09-09T03:00:00Z")];
    expect(answerFrom(comments, ["ejhong", "aletheia-maintenance-bot"])).toEqual({ by: "ejhong", at: "2026-09-09", excerpt: "Answered on the record.", url: "https://example.org/ejhong/2026-09-09T02:00:00Z" });
    expect(answerFrom([c("someone", "only a remark", "2026-09-09T01:00:00Z")], ["ejhong"])).toBeNull();
    expect(answerFrom([], ["ejhong"])).toBeNull();
  });
  it("joins the pages gh prints into one list", () => {
    expect(joinPages('[{"a":1},{"a":2}]\n[{"a":3}]')).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }]);
    expect(joinPages("[]")).toEqual([]);
    expect(joinPages("")).toEqual([]);
  });
});
