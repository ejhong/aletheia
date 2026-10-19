import { describe, expect, it } from "vitest";
import { sessionSpendRows } from "./session.ts";

/** An operator session's cost is what Claude Code reports, per model — never an estimate. */
describe("a session's spend rows", () => {
  const base = { runId: "2099-01-01-session-site-000000", date: "2099-01-01", subject: "site", model: "claude-opus-5-5" };
  it("are one per model Claude Code says it used, priced as it reports", () => {
    const rows = sessionSpendRows({
      ...base,
      report: { modelUsage: { "claude-opus-5-5": { inputTokens: 10, outputTokens: 20, cacheReadInputTokens: 30, cacheCreationInputTokens: 40, costUSD: 1.5 }, "claude-haiku-5-5": { inputTokens: 1, outputTokens: 2, costUSD: 0.01 } } },
    });
    expect(rows.map((r) => [r.model, r.inputTokens, r.cacheReadTokens, r.cacheWriteTokens, r.usd])).toEqual([
      ["claude-opus-5-5", 10, 30, 40, 1.5],
      ["claude-haiku-5-5", 1, 0, 0, 0.01],
    ]);
  });
  it("fall back to the session's totals, and to null dollars when none were reported", () => {
    expect(sessionSpendRows({ ...base, report: { usage: { input_tokens: 5, output_tokens: 6 }, total_cost_usd: 0.25 } })[0]).toMatchObject({ model: "claude-opus-5-5", inputTokens: 5, outputTokens: 6, usd: 0.25 });
    expect(sessionSpendRows({ ...base, report: {} })[0].usd).toBeNull();
  });
});
