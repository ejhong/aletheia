import { describe, expect, it } from "vitest";
import { blobFromComment, parseReviewReply, reviewComment, tally, type ReviewReply, type ReviewResult } from "./review.ts";

/**
 * The review's rule is the constitution's (AGENTS.md §3.15, 2026-10-19): a change publishes when at least three
 * reviewers answer, a majority judge it better, at most one judges it worse, and no harm stands; a harm held by any
 * one reviewer holds it; notes never block. The tests are the rule's edges.
 */

const reply = (verdict: ReviewReply["verdict"], harm: ReviewReply["harm"] = null, notes: string[] = []): ReviewReply => ({ verdict, harm, notes, summary: "s" });
const seats = (...rs: (ReviewReply | null)[]) => rs.map((r, i) => ({ seat: `s${i}`, label: `Seat ${i}`, reply: r }));

describe("the tally", () => {
  it("publishes on a majority judging better, at most one worse, no harm", () => {
    expect(tally(seats(reply("better"), reply("better"), reply("better"), reply("worse"))).outcome).toBe("publish");
    expect(tally(seats(reply("better"), reply("better"), reply("no_better"))).outcome).toBe("publish");
    // Notes never block.
    expect(tally(seats(reply("better", null, ["fix the opening"]), reply("better", null, ["a", "b", "c"]), reply("better"))).outcome).toBe("publish");
  });
  it("does not publish what is not judged better by a majority, or what two judge worse", () => {
    expect(tally(seats(reply("better"), reply("no_better"), reply("no_better"), reply("better"))).outcome).toBe("revise"); // 2 of 4 is not a majority
    expect(tally(seats(reply("better"), reply("better"), reply("better"), reply("worse"), reply("worse"))).outcome).toBe("revise");
    expect(tally(seats(reply("worse"), reply("worse"), reply("worse"))).outcome).toBe("revise");
  });
  it("holds on any one harm, whatever the verdicts", () => {
    const t = tally(seats(reply("better"), reply("better"), reply("better"), reply("better", { kind: "fabrication", where: "GEO-E073", why: "the quote is not in the source" })));
    expect(t.outcome).toBe("hold");
    expect(t.harms).toEqual([{ seat: "Seat 3", kind: "fabrication", where: "GEO-E073", why: "the quote is not in the source" }]);
    expect(tally([], [{ kind: "constitution", where: "AGENTS.md", why: "the founder amends it" }]).outcome).toBe("hold");
  });
  it("is undecided when fewer than three answer", () => {
    expect(tally(seats(reply("better"), reply("better"), null, null)).outcome).toBe("undecided");
  });
});

describe("a reviewer's reply", () => {
  it("reads JSON with prose or a fence around it, and refuses what is not the contract", () => {
    const ok = parseReviewReply('Here you go:\n```json\n{"verdict":"better","harm":null,"notes":["n"],"summary":"fine"}\n```');
    expect(ok.reply).toEqual({ verdict: "better", harm: null, notes: ["n"], summary: "fine" });
    expect(parseReviewReply('{"verdict":"great","harm":null,"notes":[],"summary":"x"}').reply).toBeNull();
    expect(parseReviewReply('{"verdict":"better","harm":{"kind":"tone","where":"x","why":"y"},"notes":[],"summary":"x"}').reply).toBeNull();
    expect(parseReviewReply('{"verdict":"better","harm":null,"notes":["1","2","3","4"],"summary":"x"}').reply).toBeNull();
    expect(parseReviewReply("no json here").problem).toMatch(/no JSON/);
  });
});

describe("the review's record", () => {
  it("round-trips through the comment, a closing comment marker in a reviewer's words included", () => {
    const result: ReviewResult = {
      commit: "abc1234567890",
      date: "2099-01-01",
      protocol: "review-v1",
      tally: tally(seats(reply("better"), reply("better"), reply("better", null, ["mind the --> marker"]))),
      seats: [0, 1, 2].map((i) => ({ seat: `s${i}`, label: `Seat ${i}`, model: "m", reply: reply("better", null, i === 2 ? ["mind the --> marker"] : []), cost: { inputTokens: 1, outputTokens: 1, usd: 0.01 } })),
    };
    const body = reviewComment(result);
    expect(body.startsWith("<!-- site-review -->")).toBe(true);
    const blob = blobFromComment(body)!;
    expect(blob.outcome).toBe("publish");
    expect(blob.seats[2].notes).toEqual(["mind the --> marker"]);
    expect(body).toContain("| Seat 0 | better | none |");
  });
});
