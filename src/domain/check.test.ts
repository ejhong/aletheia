import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { getCaseBySlug, loadAllCases } from "./load.ts";
import { currentEdition } from "./editions.ts";
import { sha256Hex } from "./hash.ts";
import { owedSeats, parseYamlReply, runCheck, validateCheckReply } from "../pipeline/check.ts";
import { readRuns } from "../pipeline/store.ts";
import { VENDORS } from "../pipeline/transport.ts";

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
  it("never reuses a protocol name an experiment's runs are stamped with", () => {
    // A promptVersion stamp names the text a model was given. Three runs of the verdict-definitions experiment are
    // stamped check-v3: its draft, copied into protocols/ for those runs and removed. The draft was not adopted, so
    // the site's next check protocol is check-v4; a file of this name here would put another text behind that stamp.
    const draft = path.join(process.cwd(), "proposals", "assessment-experiments", "2026-09-30-verdict-definitions", "check-v3-draft.md");
    expect(fs.existsSync(draft)).toBe(true);
    for (const dir of ["protocols", path.join("protocols", "archive")]) expect(fs.existsSync(path.join(process.cwd(), dir, "check-v3.md")), dir).toBe(false);
  });

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
    // The run record says what file the seats were sent, whatever became of their replies: the packet's hash, the
    // same for every run over one ledger (the dry run's packet.md is that file) and another when the ledger differs.
    const sent = sha256Hex(fs.readFileSync(path.join(root, "proposals", dry.runId, "packet.md"), "utf8"));
    const recorded = (id: string) => readRuns(root).find((r) => r.runId === id)?.inputHash;
    expect(recorded(bad.runId)).toBe(sent);
    expect(recorded(dry.runId)).toBe(sent);
    fs.appendFileSync(path.join(root, "content", "cases", "geopolymer", "research.yaml"), "\n# a byte the seats would be sent\n");
    const moved = await runCheck("megalithic-casting", { seats: ["anthropic"], dryRun: true, root, deps: { cases: () => cases } });
    expect(recorded(moved.runId)).toMatch(/^[a-f0-9]{64}$/);
    expect(recorded(moved.runId)).not.toBe(sent);
    expect(currentEdition(geo()).featuredClaimIds.length).toBeGreaterThan(0);
  });

  it("asks only the seats that have not judged the ledger as it stands, and rests when every seat has", async () => {
    const root = tmpRoot();
    const real = geo();
    const template = real.assessmentRuns.find((r) => r.role === "check")!;
    // The fixture's panel is the only panel: the real case's own checks are set aside, so that a seat the fixture
    // leaves out is owed whatever the real panel has judged since (2026-09-30: five real seats judged this ledger,
    // the fifth seat was no longer owed, and the test failed on a change that only added those checks).
    const base = { ...real, assessmentRuns: real.assessmentRuns.filter((r) => r.role !== "check") };
    // A check of the ledger as it stands, held by one roster seat (dated past every real one, so it is that seat's latest).
    const held = (seat: string) => ({ ...template, runId: `2099-01-01-check-${VENDORS[seat].tag}-000000`, date: "2099-01-01", model: `${VENDORS[seat].label} — independent check run via ${VENDORS[seat].model}`, basis: { ledgerHash: base.ledgerHash } });
    const seats = Object.keys(VENDORS);
    const holding = (names: string[]) => [{ ...base, assessmentRuns: [...base.assessmentRuns, ...names.map(held)] }];
    expect(owedSeats(holding(seats.slice(0, 4))[0])).toEqual([seats[4]]);
    expect(owedSeats(holding(seats)[0])).toEqual([]);

    const asked: string[] = [];
    const call = async (seat: string) => (asked.push(seat), { text: "caseAssessment: {}\nclaimAssessments: []\n", model: "m", usage: { inputTokens: 1, outputTokens: 1 }, usd: 0 });
    // Four seats hold a check of this ledger; the fifth failed last time. Only the fifth is asked (and once more, its repair round).
    const completing = await runCheck("megalithic-casting", { root, deps: { cases: () => holding(seats.slice(0, 4)), call } });
    expect(asked).toEqual([seats[4], seats[4]]);
    expect(completing.reason).toContain(`not asked, having judged this ledger already: ${seats.slice(0, 4).join(", ")}`);
    // Every seat holds one: the verb rests, and no seat is paid to judge the same ledger twice.
    asked.length = 0;
    const rest = await runCheck("megalithic-casting", { root, deps: { cases: () => holding(seats), call } });
    expect(rest.outcome).toBe("rested");
    expect(asked).toEqual([]);
    // Naming seats asks them whatever they hold.
    await runCheck("megalithic-casting", { seats: [seats[0]], root, deps: { cases: () => holding(seats), call } });
    expect(asked).toEqual([seats[0], seats[0]]);
  });
});
