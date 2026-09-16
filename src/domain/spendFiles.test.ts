import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { readSpend, recordSpend, spendFile, spendRunFile } from "../pipeline/spend.ts";

/** One spend file per run (2026-09-16): two sittings that overlap never write the same file, so their chain
 *  PRs no longer conflict on the ledger; the original single file is still read, first. */

const row = (runId: string, usd: number) => ({ date: "2026-09-16", runId, verb: "report" as const, case: "x", model: "m", calls: 1, inputTokens: 1, outputTokens: 1, usd });

describe("the spend ledger is one file per run", () => {
  it("two runs write two files; the ledger reads the single file first, then the runs in name order; the single file is not written", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aletheia-spend-"));
    fs.mkdirSync(path.join(root, "governance"), { recursive: true });
    const legacy = stringify([row("legacy", 1)]);
    fs.writeFileSync(spendFile(root), legacy);
    recordSpend(row("2026-09-16-b", 3), root);
    recordSpend(row("2026-09-16-a", 2), root);
    recordSpend(row("2026-09-16-a", 4), root);
    expect(fs.existsSync(spendRunFile("2026-09-16-a", root))).toBe(true);
    expect(fs.existsSync(spendRunFile("2026-09-16-b", root))).toBe(true);
    expect(readSpend(root).map((r) => [r.runId, r.usd])).toEqual([["legacy", 1], ["2026-09-16-a", 2], ["2026-09-16-a", 4], ["2026-09-16-b", 3]]);
    expect(fs.readFileSync(spendFile(root), "utf8")).toBe(legacy);
    fs.rmSync(root, { recursive: true, force: true });
  });
  it("a run id must already be a file name; anything else is refused before a row is written, so two ids never share a file", () => {
    expect(path.basename(spendRunFile("2026-09-16-verify-immortality-key-033510", "/r"))).toBe("2026-09-16-verify-immortality-key-033510.yaml");
    expect(() => spendRunFile("odd/run id", "/r")).toThrow(/not a file name/);
    expect(() => spendRunFile("../escape", "/r")).toThrow(/not a file name/);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aletheia-spend-"));
    expect(() => recordSpend(row("odd/run id", 1), root)).toThrow(/not a file name/);
    expect(fs.existsSync(path.join(root, "governance", "spend"))).toBe(false);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
