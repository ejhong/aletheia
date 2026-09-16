import { describe, expect, it } from "vitest";
import { arbiterData, parkedOnBudget, pickForRejudge } from "../lib/arbiter-core.mjs";

/** A PR parked on the weekly budget alone is re-judged when the window has room (scripts/rejudge-parked.mjs);
 *  these are the decisions that script makes, pure. */

const comment = (verdict: string, reason: string) =>
  `<!-- aletheia-arbiter -->\n## Constitutional arbiter\n\n**${reason}**\n\n<!-- aletheia-arbiter-data ${JSON.stringify({ verdict, reason, seats: [{ seat: "x", reasoning: "braces } --> inside" }] })} -->`;

describe("re-judging PRs parked on the weekly budget", () => {
  it("reads the arbiter's data block and recognises a budget park, and only that", () => {
    expect(parkedOnBudget(comment("park", "5 of 5 seats affirm compliance; no seat finds a violation — but the weekly autonomous content-merge budget is spent (10/10, 12 supervised excluded); parked until the window rolls"))).toBe(true);
    expect(parkedOnBudget(comment("park", "2 seats find a violation: GPT-5.6 Sol (OpenAI); Grok 4.5 (xAI)"))).toBe(false);
    expect(parkedOnBudget(comment("pass", "5 of 5 seats affirm compliance"))).toBe(false);
    expect(parkedOnBudget("<!-- aletheia-arbiter -->\nno data block")).toBe(false);
    expect(parkedOnBudget(undefined)).toBe(false);
    expect(arbiterData(comment("pass", "r"))?.seats[0].reasoning).toBe("braces } --> inside");
  });
  it("picks the oldest parked PRs first, one per free slot", () => {
    const parked = [{ number: 305 }, { number: 303 }, { number: 310 }];
    expect(pickForRejudge(parked, 2).map((p) => p.number)).toEqual([303, 305]);
    expect(pickForRejudge(parked, 0)).toEqual([]);
    expect(pickForRejudge(parked, -1)).toEqual([]);
  });
});
