import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { getCaseBySlug } from "./load.ts";
import { nextAction } from "./schedule.ts";
import type { Evidence } from "./schema.ts";
import type { RunRecord } from "./intake.ts";
import { replaceRecord } from "../pipeline/ledger-write.ts";
import { planReverify } from "../pipeline/reverify.ts";
import type { Verdicts } from "../pipeline/verify.ts";

/** Re-verification settles records admitted unread: promoted in place when the text reads and holds, refused
 *  with a tombstone when it reads and fails, left provisional when it still cannot be read — and the scheduler asks
 *  for it on a cadence that doubles after each pass that promotes nothing. */

const block = { since: "2026-09-17", exists: "doi 10.1/x resolves", reason: "PDF has no extractable text", route: "obtain the text and re-run verify", by: "r" };
const src = (id: string, extra: object = {}) => ({ id, title: `Source ${id}`, sourceType: "paper", verification: "unverified", authors: [], reliabilityNotes: [], background: false, ...extra }) as never;
const ev = (id: string, extra: object = {}) => ({ id, title: `Evidence ${id}`, claimIds: ["X-C001"], sourceId: "SRC-A", direction: "supports", strength: "weak", sourceStatement: "s", limitations: [], reviewState: "ai_extracted", origin: { ref: "r", extractedBy: "m", runId: "r" }, ...extra }) as never;
const cl = (id: string, extra: object = {}) => ({ id, statement: `Claim ${id} says something specific enough.`, theme: "t", rung: "observation", parentClaimIds: [], dependsOnClaimIds: [], reviewState: "ai_extracted", origin: { ref: "r", extractedBy: "m", runId: "r" }, ...extra }) as never;

describe("planReverify", () => {
  it("promotes what the reader accepted under its own id, appends split parts, refuses what failed, keeps the rest unread", () => {
    const originals = { sources: [src("SRC-A", { provisional: block }), src("SRC-B", { provisional: block })], evidence: [ev("X-E001", { reviewState: "provisional", provisional: block }), ev("X-E002", { reviewState: "provisional", provisional: block }), ev("X-E003", { reviewState: "provisional", provisional: block })], claims: [cl("X-C009", { reviewState: "provisional", provisional: block })] };
    const verdicts = {
      accepted: { sources: [src("SRC-A", { verification: "ai_verified" })], evidence: [ev("X-E001"), ev("X-E010")], claims: [], research: [] },
      provisional: { sources: [src("SRC-B", { provisional: block })], evidence: [ev("X-E002", { reviewState: "provisional", provisional: { ...block, reason: "HTTP 200 but no text" } })], claims: [] },
      rejected: [
        { id: "X-E003", kind: "evidence", observed: "e3", disposition: "failed", reason: "quoted span not found verbatim" },
        { id: "X-C009", kind: "claim", observed: "c9", disposition: "failed", reason: "second reader rejected the anchor" },
      ],
      notes: [],
    } as unknown as Verdicts;
    const plan = planReverify(verdicts, originals);
    expect(plan.promote.map((p) => `${p.kind}:${p.id}`)).toEqual(["source:SRC-A", "evidence:X-E001"]);
    expect(plan.appended.map((p) => p.id)).toEqual(["X-E010"]);
    expect(plan.refuse.map((r) => `${r.id}:${r.reason}`)).toEqual(["X-E003:quoted span not found verbatim", "X-C009:second reader rejected the anchor"]);
    expect(plan.unread.map((u) => `${u.id}:${u.reason}`)).toEqual(["SRC-B:PDF has no extractable text", "X-E002:HTTP 200 but no text"]);
    expect(plan.promote[0].file).toBe("sources.yaml");
  });
  it("a source refused only because nothing cites it, and a record blocked again, stay unread; an original the reader never mentioned is unread too", () => {
    const originals = { sources: [src("SRC-A", { provisional: block })], evidence: [ev("X-E001", { reviewState: "provisional", provisional: block }), ev("X-E002", { reviewState: "provisional", provisional: block })], claims: [] };
    const verdicts = { accepted: { sources: [], evidence: [], claims: [], research: [] }, provisional: { sources: [], evidence: [], claims: [] }, rejected: [
      { id: "SRC-A", kind: "source", observed: "a", disposition: "failed", reason: "nothing accepted cites it (§3.6: sources are not evidence by themselves)" },
      { id: "X-E001", kind: "evidence", observed: "e1", disposition: "blocked", reason: "source text not retrievable: HTTP 404", route: "r" },
    ], notes: [] } as unknown as Verdicts;
    const plan = planReverify(verdicts, originals);
    expect(plan.refuse).toEqual([]);
    expect(plan.unread.map((u) => u.id).sort()).toEqual(["SRC-A", "X-E001", "X-E002"]);
  });
});

describe("replaceRecord", () => {
  it("writes the promoted record over the provisional one and leaves every other byte alone", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aletheia-replace-"));
    const file = path.join(dir, "evidence.yaml");
    const text = ["# header comment kept", "- id: X-E001", "  title: first", "  reviewState: provisional", "  provisional:", "    since: 2026-09-17", "", "- id: X-E002", "  title: second   # a comment", "  reviewState: ai_extracted", ""].join("\n");
    fs.writeFileSync(file, text);
    replaceRecord(file, "X-E001", { id: "X-E001", title: "first, read", reviewState: "ai_extracted", readerActs: [{ field: "direction" }] });
    const after = fs.readFileSync(file, "utf8");
    expect(after.startsWith("# header comment kept\n")).toBe(true);
    expect(after).toContain("  title: second   # a comment");
    const parsed = parseYaml(after) as Record<string, unknown>[];
    expect(parsed[0]).toEqual({ id: "X-E001", title: "first, read", reviewState: "ai_extracted", readerActs: [{ field: "direction" }] });
    expect(parsed[1]).toEqual({ id: "X-E002", title: "second", reviewState: "ai_extracted" });
    expect(() => replaceRecord(file, "X-E009", { id: "X-E009" })).toThrow(/no record X-E009/);
    expect(() => replaceRecord(file, "X-E001", { id: "X-E002" })).toThrow(/is not X-E001/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("the scheduler re-verifies provisional records on a doubling cadence", () => {
  const c = getCaseBySlug("megalithic-casting");
  const provisionalCase = { ...c, evidence: [{ ...c.evidence[0], reviewState: "provisional", provisional: block } as Evidence] };
  const run = (over: Partial<RunRecord>): RunRecord => ({ runId: "2026-09-10-reverify-megalithic-casting-000000", verb: "reverify", case: c.record.slug, date: "2026-09-10", model: "m", promptVersion: "verify-v6", inputHash: null, outcome: "completed", cost: { calls: 1, inputTokens: 1, outputTokens: 1, usd: 1 }, ...over });
  it("asks for a re-verify when a case holds provisional records and none has run", () => {
    expect(nextAction([provisionalCase], [], "2026-09-17")).toMatchObject({ case: c.record.slug, verb: "reverify", reason: expect.stringMatching(/1 provisional record\(s\) await their texts/) });
  });
  it("waits seven days after a pass, doubling after each pass that promoted nothing, and never asks for a case with none", () => {
    const passed = run({ date: "2026-09-16", notes: "re-verify: promoted 2, appended 0, refused 0, still unread 1" });
    expect(nextAction([provisionalCase], [passed], "2026-09-17").verb).not.toBe("reverify");
    expect(nextAction([provisionalCase], [passed], "2026-09-23").verb).toBe("reverify");
    const empty = run({ date: "2026-09-09", notes: "re-verify: promoted 0, appended 0, refused 0, still unread 1" });
    expect(nextAction([provisionalCase], [empty], "2026-09-17").verb).not.toBe("reverify"); // 8 days, cadence now 14
    expect(nextAction([provisionalCase], [empty], "2026-09-24").verb).toBe("reverify");
    expect(nextAction([{ ...c, dispositions: c.dispositions.filter((r) => r.disposition !== "blocked") }], [], "2026-09-17").verb).not.toBe("reverify");
  });
});
