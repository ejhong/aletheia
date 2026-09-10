import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { getCaseBySlug, loadAllCases } from "./load.ts";
import { currentEdition } from "./editions.ts";
import { parseYamlReply, runCheck, validateCheckReply } from "../pipeline/check.ts";
import { readRuns } from "../pipeline/store.ts";

const geo = () => getCaseBySlug("megalithic-casting");

/** A root holding the case's ledger files and the budget, so a check can run against a copy. */
function tmpRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aletheia-check-"));
  const src = path.join(process.cwd(), "content", "cases", "geopolymer");
  const dst = path.join(root, "content", "cases", "geopolymer");
  fs.mkdirSync(dst, { recursive: true });
  for (const f of ["case.yaml", "claims.yaml", "evidence.yaml", "sources.yaml", "research.yaml"]) fs.copyFileSync(path.join(src, f), path.join(dst, f));
  fs.mkdirSync(path.join(root, "config"));
  for (const f of ["budget.yaml", "tariffs.yaml", "models.yaml"]) fs.copyFileSync(path.join(process.cwd(), "config", f), path.join(root, "config", f));
  return root;
}

describe("the check verb", () => {
  it("validates an installed check run's own text against the packet contract", () => {
    const c = geo();
    const file = path.join(process.cwd(), "content", "cases", "geopolymer", "assessments", "2026-09-08-check-opus-162528.yaml");
    const run = parseYaml(fs.readFileSync(file, "utf8"));
    // What a seat returns: the assessment without the fields the pipeline stamps.
    const { runId: _r, date: _d, promptVersion: _p, humanReviewed: _h, role: _ro, model: _m, basis: _b, ...body } = run;
    void [_r, _d, _p, _h, _ro, _m, _b];
    const text = "```yaml\n" + stringifyYaml(body) + "```\nThank you.";
    const featuredIds = run.claimAssessments.map((ca: { claimId: string }) => ca.claimId);
    const v = validateCheckReply(text, { loaded: c, seat: "anthropic", featuredIds, date: "2026-09-08", promptVersion: "check-v1", runId: "2026-09-08-check-opus-000000" });
    expect(v.problems).toEqual([]);
    expect(v.run?.role).toBe("check");
    expect(v.run?.basis?.ledgerHash).toBe(c.ledgerHash);
    expect(v.run?.producedBy).toBeUndefined();
    // The verb names the run that wrote the seat's record (2026-09-10).
    const stamped = validateCheckReply(text, { loaded: c, seat: "anthropic", featuredIds, date: "2026-09-08", promptVersion: "check-v1", runId: "2026-09-08-check-opus-000000", producedBy: "2026-09-08-check-megalithic-casting-000000" });
    expect(stamped.run?.producedBy).toBe("2026-09-08-check-megalithic-casting-000000");
    // A seat that skipped a featured claim, or named one that is not featured, fails the contract.
    const short = validateCheckReply(text, { loaded: c, seat: "anthropic", featuredIds: [...featuredIds, "GEO-C999"], date: "2026-09-08", promptVersion: "check-v1", runId: "x" });
    expect(short.problems.join()).toMatch(/missing claims: GEO-C999/);
    expect(parseYamlReply("a: 1\nb: 2\nSincerely,\nthe model")).toEqual({ a: 1, b: 2 });
  });

  it("dry-runs without a call, and records a seat that fails twice without installing it", async () => {
    const root = tmpRoot();
    const cases = loadAllCases();
    const dry = await runCheck("megalithic-casting", { seats: ["anthropic"], dryRun: true, root, deps: { cases: () => cases, call: async () => ({ text: "", model: "m", usage: { inputTokens: 0, outputTokens: 0 }, usd: 0 }) } });
    expect(dry.outcome).toBe("dry-run");
    expect(fs.existsSync(path.join(root, "proposals", dry.runId, "packet.md"))).toBe(true);

    let calls = 0;
    const bad = await runCheck("megalithic-casting", {
      seats: ["anthropic"],
      root,
      deps: { cases: () => cases, call: async () => ({ text: `caseAssessment: {}\nclaimAssessments: []\n`, model: "claude-opus-5", usage: { inputTokens: 10, outputTokens: 5 }, usd: 0.01, ...(calls++ >= 0 ? {} : {}) }) },
    });
    expect(calls).toBe(2); // one repair round, no more
    expect(bad.outcome).toBe("failed");
    expect(bad.installed).toEqual([]);
    expect(bad.failed[0]).toMatch(/^anthropic:/);
    const dir = path.join(root, "proposals", bad.runId);
    expect(fs.existsSync(path.join(dir, "seat-anthropic.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "seat-anthropic.repaired.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "seat-anthropic.problems.txt"))).toBe(true);
    expect(fs.readdirSync(path.join(root, "content", "cases", "geopolymer")).includes("assessments")).toBe(false);
    expect(readRuns(root).find((r) => r.runId === bad.runId)?.verb).toBe("check");
    expect(currentEdition(geo()).featuredClaimIds.length).toBeGreaterThan(0);
  });
});
