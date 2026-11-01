import { describe, expect, it } from "vitest";
import { MAX_ROUNDS, planSession, roundsForOperator, type OpenChange } from "./operator.ts";
import type { ReviewBlob } from "./review.ts";

/**
 * Nothing waits on a person, and nothing is argued forever: a change the reviewers hold or send back is answered
 * before new work, and one answered twice without publishing is withdrawn.
 */

const round = (commit: string, outcome: ReviewBlob["outcome"]): ReviewBlob => ({
  commit,
  date: "2099-01-01",
  protocol: "review-v1",
  outcome,
  reason: "r",
  seats: [{ seat: "openai", label: "GPT", model: "m", verdict: "worse", harm: outcome === "hold" ? { kind: "fabrication", where: "X-E001", why: "not in the source" } : null, notes: ["tighten the opening"], summary: "s" }],
});
const change = (number: number, rounds: ReviewBlob[], over: Partial<OpenChange> = {}): OpenChange => ({ number, title: `t${number}`, branch: `operator/2099-01-0${number}-1`, head: rounds.at(-1)?.commit ?? "h", draft: false, rounds, ...over });

describe("a session's mode", () => {
  it("answers the oldest change the reviewers held or sent back, at its reviewed head", () => {
    const plan = planSession([change(7, [round("a", "revise")]), change(5, [round("b", "hold")])]);
    expect(plan.mode).toBe("answer");
    if (plan.mode === "answer") expect(plan.change.number).toBe(5);
  });
  it("waits on a change whose latest commit is not yet reviewed, one judged better, and one too few reviewers answered", () => {
    const plan = planSession([change(1, [round("a", "hold")], { head: "b" }), change(2, [round("c", "publish")]), change(3, [round("d", "undecided")]), change(4, [])]);
    expect(plan.mode).toBe("new");
    if (plan.mode === "new") expect(plan.waiting.map((w) => w.number)).toEqual([1, 2, 3, 4]);
  });
  it("withdraws a change answered twice without publishing, and leaves others' branches alone", () => {
    const tired = change(3, Array.from({ length: MAX_ROUNDS }, (_, i) => round(`c${i}`, "revise")));
    const founders = change(9, [round("f", "hold")], { branch: "founder/amend" });
    const plan = planSession([tired, founders]);
    expect(plan.mode).toBe("new");
    expect(plan.withdraw.map((c) => c.number)).toEqual([3]);
  });
  it("shows the operator every round, with each harm and note", () => {
    const text = roundsForOperator(change(5, [round("abcdef123456", "hold")]));
    expect(text).toContain("### Round 1 (commit abcdef1234, 2099-01-01): hold");
    expect(text).toContain("HARM (fabrication) at X-E001: not in the source");
    expect(text).toContain("- tighten the opening");
  });
  it("answers a change the quote check held, and shows each failure with what answers it", () => {
    // 2026-10-28: the check's hold carried no record, so the planner read it as "not yet reviewed" and nothing answered it.
    const held: ReviewBlob = { commit: "q", date: "2099-01-01", protocol: "review-v1", outcome: "hold", reason: "held until answered: the quote check failed (1 failure)", seats: [], checks: ["x X-E004: quoted passage not found in the text of SRC-A"] };
    const plan = planSession([change(4, [held])]);
    expect(plan.mode).toBe("answer");
    const text = roundsForOperator(change(4, [held]));
    expect(text).toContain("### Round 1 (commit q, 2099-01-01): hold — held until answered: the quote check failed (1 failure)");
    expect(text).toContain("- x X-E004: quoted passage not found in the text of SRC-A");
    expect(text).toMatch(/never by a reply/);
    expect(text).toMatch(/check-quotes --fresh/);
  });
});
