import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readTraces, sessionSpendRows, TraceDigestSchema, traceSummary, writeTrace } from "./session.ts";
import { digestTrace } from "./trace.ts";

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

/** A session's trace digest is data from the session's machine: kept only when it is a digest, read back the same. */
describe("a session's trace digest", () => {
  const trace = [
    { type: "system", subtype: "init", model: "claude-opus-5-5", permissionMode: "dontAsk" },
    { type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "WebFetch", input: { url: "https://www.example.org/a/person" } }] } },
    { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "403", is_error: true }] } },
    { type: "result", subtype: "success", is_error: false, num_turns: 3, duration_ms: 60_000, total_cost_usd: 0.5, permission_denials: [] },
  ]
    .map((m) => JSON.stringify(m))
    .join("\n");
  const root = () => fs.mkdtempSync(path.join(os.tmpdir(), "trace-"));

  it("is kept as runs/<run>/trace.yaml once checked, and read back for the status and the pull request", () => {
    const r = root();
    expect(writeTrace("2099-01-01-session-site-000000", digestTrace(trace), r)).toBe("runs/2099-01-01-session-site-000000/trace.yaml");
    const [t] = readTraces(r);
    expect(t).toMatchObject({ runId: "2099-01-01-session-site-000000", digest: { ended: "success", fetched: [{ host: "example.org", calls: 1, failed: 1 }] } });
    expect(traceSummary("2099-01-01-session-site-000000", r)).toContain("- **Failed:** WebFetch 1 of 1 (example.org 1).");
    expect(traceSummary("2099-01-01-session-site-000001", r)).toContain("The session left no digest of its trace");
  });

  it("is refused when it holds anything but counts and the names the digest keeps", () => {
    const d = digestTrace(trace);
    const refused = [
      { ...d, commands: [{ command: "echo jonathan privateperson", calls: 1, failed: 0, refused: 0 }] },
      { ...d, fetched: [{ host: "example.org/a/person", calls: 1, failed: 0 }] },
      { ...d, read: [{ source: "A Person's Diary", calls: 1, failed: 0 }] },
      { ...d, tools: [{ tool: "Bash with a note", calls: 1, failed: 0, refused: 0 }] },
      { ...d, note: "anything at all" },
      { ...d, turns: -1 },
    ];
    for (const x of refused) expect(() => writeTrace("2099-01-01-session-site-000000", x, root()), JSON.stringify(x).slice(0, 80)).toThrow();
    expect(TraceDigestSchema.safeParse(d).success).toBe(true);
  });

  it("is read oldest first, by the date and the clock in the run id, and one that is not a digest is passed over", () => {
    const r = root();
    writeTrace("2099-01-01-session-zeta-000100", digestTrace(trace), r);
    writeTrace("2099-01-01-session-alpha-000200", digestTrace(trace), r);
    fs.mkdirSync(path.join(r, "runs", "2099-01-02-session-site-000000"), { recursive: true });
    fs.writeFileSync(path.join(r, "runs", "2099-01-02-session-site-000000", "trace.yaml"), "version: 1\nended: [not, a, digest\n");
    expect(readTraces(r).map((t) => t.runId)).toEqual(["2099-01-01-session-zeta-000100", "2099-01-01-session-alpha-000200"]);
  });
});
