import { describe, expect, it } from "vitest";
import { commandOf, digestTrace, hostOf, sourceOf, traceLine, traceSection } from "./trace.ts";

/**
 * A session's trace, as Claude Code streams it (`--output-format stream-json --verbose`): a message a line. The
 * shapes are Claude Code's: tool calls are `tool_use` blocks in the model's turns, their results `tool_result` blocks
 * with `is_error`, and the final report lists what the permissions refused under `permission_denials`.
 */
const PRIVATE = "Jonathan Q. Privateperson"; // stands for a name a site does not print
const init = { type: "system", subtype: "init", model: "claude-opus-5-5", permissionMode: "dontAsk", cwd: "/w", tools: ["Bash"], session_id: "s" };
const call = (id: string, name: string, input: object) => ({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id, name, input }] }, parent_tool_use_id: null, session_id: "s" });
const back = (id: string, content: string, is_error = false) => ({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content, is_error }] }, parent_tool_use_id: null, session_id: "s" });
const report = { type: "result", subtype: "success", is_error: false, duration_ms: 5_760_000, num_turns: 91, result: "done", session_id: "s", total_cost_usd: 4.409777, usage: {} };
const SCIENCEDIRECT = { url: "https://www.sciencedirect.com/science/article/pii/S0012821X12345678", prompt: "the abstract" };

const session = [
  init,
  call("t1", "Bash", { command: "node scripts/site.ts status" }),
  back("t1", "Budget …"),
  call("t2", "WebFetch", { url: "https://www.example-news.com/2026/10/jonathan-q-privateperson-named?ref=x", prompt: `what does it say about ${PRIVATE}?` }),
  back("t2", `An article naming ${PRIVATE}.`),
  call("t3", "WebFetch", SCIENCEDIRECT),
  back("t3", "403 Forbidden", true),
  call("t4", "WebFetch", SCIENCEDIRECT),
  back("t4", "403 Forbidden", true),
  call("t5", "Bash", { command: 'node scripts/site.ts read "10.1073/pnas.1204453109" --find "platinum anomaly"' }),
  back("t5", "[p. 3] …platinum anomaly…"),
  call("t6", "Bash", { command: "node scripts/site.ts read https://www.courtlistener.com/docket/123/united-states-v-privateperson/ --page 2" }),
  back("t6", `${PRIVATE} …`),
  call("t7", "Bash", { command: "npm test" }),
  back("t7", "Exit code 1\n1 failed", true),
  call("t8", "Edit", { file_path: "/w/content/cases/x/claims.yaml", old_string: "a", new_string: PRIVATE }),
  back("t8", "ok"),
  call("t9", "Bash", { command: "npm test" }),
  back("t9", "passed"),
  call("t10", "Bash", { command: "cat notes-about-jonathan.txt" }),
  back("t10", "Permission to use Bash has been denied.", true),
  call("t11", "WebSearch", { query: `${PRIVATE} pipe bomb` }),
  back("t11", "results"),
  { type: "system", subtype: "compact_boundary", compact_metadata: { trigger: "auto", pre_tokens: 150000 } },
  call("t12", "Write", { file_path: "/w/runs/r/log.md", content: `# log\n${PRIVATE}` }),
  back("t12", "ok"),
];
const trace = (lines: object[]) => lines.map((m) => JSON.stringify(m)).join("\n");
const finished = trace([...session, { ...report, permission_denials: [{ tool_name: "Bash", tool_use_id: "t10", tool_input: { command: "cat notes-about-jonathan.txt" } }] }]);

describe("the digest of a session's trace", () => {
  const d = digestTrace(finished);

  it("says how the session ended, from its first message and its final report", () => {
    expect(d).toMatchObject({ version: 1, ended: "success", model: "claude-opus-5-5", permissionMode: "dontAsk", turns: 91, minutes: 96, usd: 4.4098, compactions: 1, unreadableLines: 0 });
  });

  it("counts every call by tool, telling a call that failed from one the permissions refused", () => {
    expect(d.tools).toEqual([
      { tool: "Bash", calls: 6, failed: 1, refused: 1 },
      { tool: "WebFetch", calls: 3, failed: 2, refused: 0 },
      { tool: "Edit", calls: 1, failed: 0, refused: 0 },
      { tool: "WebSearch", calls: 1, failed: 0, refused: 0 },
      { tool: "Write", calls: 1, failed: 0, refused: 0 },
    ]);
    expect(d.commands).toEqual([
      { command: "node scripts/site.ts read", calls: 2, failed: 0, refused: 0 },
      { command: "npm test", calls: 2, failed: 1, refused: 0 },
      { command: "cat", calls: 1, failed: 0, refused: 1 },
      { command: "node scripts/site.ts status", calls: 1, failed: 0, refused: 0 },
    ]);
  });

  it("keeps the hosts fetched and the sources read, the files edited, and the calls repeated after failing", () => {
    expect(d.fetched).toEqual([
      { host: "sciencedirect.com", calls: 2, failed: 2 },
      { host: "example-news.com", calls: 1, failed: 0 },
    ]);
    expect(d.read).toEqual([
      { source: "10.1073/pnas.1204453109", calls: 1, failed: 0 },
      { source: "courtlistener.com", calls: 1, failed: 0 },
    ]);
    expect(d.filesEdited).toBe(2);
    expect(d.repeatedFailures).toBe(1);
  });

  it("keeps nothing the session read or wrote: no name, no query, no path, no quotation", () => {
    const kept = JSON.stringify(d).toLowerCase();
    for (const text of ["jonathan", "privateperson", "pipe bomb", "platinum", "united-states", "notes-about", "claims.yaml", "pii", "abstract"]) expect(kept, text).not.toContain(text);
  });

  it("digests a session cut off before its final report, and a line cut off mid-message", () => {
    const cut = digestTrace(`${trace(session)}\n{"type":"assistant","message":{"content":[{"type":"tool_u`);
    expect(cut).toMatchObject({ ended: "cut_off", turns: null, minutes: null, usd: null, unreadableLines: 1 });
    // With no report to say what was refused, a refused call is counted as failed.
    expect(cut.tools.find((t) => t.tool === "Bash")).toEqual({ tool: "Bash", calls: 6, failed: 2, refused: 0 });
    expect(digestTrace("")).toMatchObject({ ended: "cut_off", tools: [], unreadableLines: 0 });
  });

  it("counts a tool call once, however many lines carry it", () => {
    const twice = trace([init, call("t1", "Read", { file_path: "/w/a" }), call("t1", "Read", { file_path: "/w/a" }), back("t1", "a"), report]);
    expect(digestTrace(twice).tools).toEqual([{ tool: "Read", calls: 1, failed: 0, refused: 0 }]);
  });
});

describe("the names a digest keeps", () => {
  it("a command's program, and for node, npm, npx and git their verb, never an argument", () => {
    expect(commandOf("node scripts/site.ts check-quotes --base origin/main")).toBe("node scripts/site.ts check-quotes");
    expect(commandOf("node scripts/add-commons-image.mjs 'File:A Person.jpg'")).toBe("node scripts/add-commons-image.mjs");
    expect(commandOf("npx vitest run src/engine/trace.test.ts")).toBe("npx vitest run");
    expect(commandOf("npx tsc --noEmit")).toBe("npx tsc");
    expect(commandOf("npm run build")).toBe("npm run build");
    expect(commandOf("git show HEAD:content/cases/x/claims.yaml")).toBe("git show");
    expect(commandOf("git log --oneline -5")).toBe("git log");
    expect(commandOf("echo jonathan privateperson")).toBe("echo");
    expect(commandOf("ls content/cases")).toBe("ls");
    expect(commandOf("FOO=bar node scripts/site.ts status")).toBe("(other)");
    expect(commandOf(undefined)).toBe("(other)");
  });

  it("a URL's host, without www. and without its path", () => {
    expect(hostOf("https://www.Example.org/people/jonathan?q=1")).toBe("example.org");
    expect(hostOf("not a url")).toBe("(other)");
    expect(hostOf(42)).toBe("(other)");
  });

  it("a source read as its DOI, or its host", () => {
    expect(sourceOf("10.1038/s41586-024-07000-0")).toBe("10.1038/s41586-024-07000-0");
    expect(sourceOf("https://doi.org/10.1126/science.abc1234")).toBe("10.1126/science.abc1234");
    expect(sourceOf("'https://www.justice.gov/opa/pr/some-person-charged'")).toBe("justice.gov");
    expect(sourceOf("10.1234/has spaces")).toBe("(other)");
  });
});

describe("the digest as it is said", () => {
  const d = digestTrace(finished);
  it("in a line, for the next session's status", () => {
    expect(traceLine("2099-01-01-session-site-000000", d)).toBe(
      "2099-01-01-session-site-000000: ended success (91 turns, $4.41, 12 tool calls); failed: WebFetch 2 of 3 (sciencedirect.com 2), Bash 1 of 6 (npm test 1); refused: Bash 1 (cat 1); repeated after failing: 1",
    );
    expect(traceLine("r", digestTrace(trace([init, report])))).toBe("r: ended success (91 turns, $4.41, 0 tool calls); nothing failed");
  });

  it("in a section beneath the session's log, as the workflow's record and not the operator's", () => {
    const s = traceSection("2099-01-01-session-site-000000", d);
    expect(s).toContain("### What the session did");
    expect(s).toContain("`runs/2099-01-01-session-site-000000/trace.yaml`");
    expect(s).toContain("- **Ended:** success, after 91 turns, 96 minutes, $4.41 (claude-opus-5-5, permission mode dontAsk); its context was compacted once.");
    expect(s).toContain("- **Failed:** WebFetch 2 of 3 (sciencedirect.com 2); Bash 1 of 6 (`npm test` 1). Repeated after failing: 1.");
    expect(s).toContain("- **Refused by the session's permissions:** Bash 1 (`cat` 1).");
    expect(s).toContain("- **Sources read with `site read`:** 10.1073/pnas.1204453109, courtlistener.com.");
    expect(s).toContain("- **Pages fetched, by host:** sciencedirect.com (2), example-news.com.");
    expect(s).toContain("- **Files written or edited:** 2.");
    expect(traceSection("r", digestTrace(""))).toContain("- **Ended:** cut off before its final report.");
  });
});
