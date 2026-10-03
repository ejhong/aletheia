import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { loadAllCases } from "./load.ts";
import { caseRecord, unpublishedChecks } from "./record.ts";

describe("the record layer", () => {
  it("groups every disposition row under the run that wrote it, newest sitting first, counts matching rows", () => {
    const c = loadAllCases().find((x) => x.record.slug === "vasocomputation")!;
    const sittings = caseRecord(c);
    expect(sittings.length).toBeGreaterThan(3);
    const dates = sittings.map((s) => s.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    const rows = sittings.reduce((n, s) => n + s.admitted.length + s.refused.length, 0);
    expect(rows).toBe(c.dispositions.length); // every row is shown under exactly one run
    for (const s of sittings) {
      const counted = Object.values(s.counts).reduce((a, b) => a + (b ?? 0), 0);
      expect(counted).toBe(s.admitted.length + s.refused.length);
      expect(s.summary.length).toBeGreaterThan(0);
      for (const r of s.refused) expect(r.reason).not.toBeNull(); // every refusal carries the verifier's reason
      for (const r of s.admitted) expect(r.as).not.toBeNull(); // every admission names the ledger record
    }
    const verify = sittings.find((s) => s.verb === "verify" && s.refused.length > 0)!;
    expect(verify.summary).toMatch(/admitted|refused/);
    expect(verify.recorded).toBe(true);
  });

  it("says when a run wrote a file that is not published, with the note left beside the run", () => {
    const real = loadAllCases().find((x) => x.record.slug === "megalithic-casting")!;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aletheia-record-"));
    const dir = path.join("content", "cases", real.dir, "assessments");
    const run = (runId: string, extra: Record<string, unknown>) => {
      fs.mkdirSync(path.join(root, "proposals", runId), { recursive: true });
      const record = { runId, verb: "check", case: real.record.slug, date: "2099-01-01", model: "panel", promptVersion: "check-v2", inputHash: "a".repeat(64), outcome: "completed", cost: { calls: 1, inputTokens: 1, outputTokens: 1, usd: 0.1 }, ...extra };
      fs.writeFileSync(path.join(root, "proposals", runId, "run.yaml"), stringifyYaml(record));
    };
    // A run that installed two checks: one is in the repository, one is not, and a note beside the run says why.
    const first = "2099-01-01-check-megalithic-casting-000001";
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    fs.writeFileSync(path.join(root, dir, "2099-01-01-check-opus-000001.yaml"), "kept\n");
    run(first, { notes: "2 of 2 seat(s) installed", wrote: [path.join(dir, "2099-01-01-check-opus-000001.yaml"), path.join(dir, "2099-01-01-check-gemini-000001.yaml")] });
    fs.writeFileSync(path.join(root, "proposals", first, "seat-gemini.withheld.txt"), "Not published: it misread a record.\n");
    // The same seat asked again over the same case file, and a run over another case file.
    const again = "2099-01-01-check-megalithic-casting-000002";
    run(again, { notes: "1 of 1 seat(s) installed", wrote: [path.join(dir, "2099-01-01-check-gemini-000002.yaml")] });
    run("2099-01-01-check-megalithic-casting-000003", { inputHash: "b".repeat(64), notes: "1 of 1 seat(s) installed", wrote: [path.join(dir, "2099-01-01-check-grok-000003.yaml")] });

    const c = { ...real, dispositions: [] };
    const sittings = caseRecord(c, root);
    expect(sittings).toHaveLength(3);
    const one = sittings.find((s) => s.runId === first)!;
    expect(one.unpublished).toEqual(["2099-01-01-check-gemini-000001.yaml"]);
    expect(one.withheld).toEqual(["Not published: it misread a record."]);
    expect(one.summary).toBe("2 of 2 seats judged the case blind; 1 of the 2 checks it wrote is not published");
    const two = sittings.find((s) => s.runId === again)!;
    expect(two.unpublished).toEqual(["2099-01-01-check-gemini-000002.yaml"]);
    expect(two.withheld).toEqual([]);
    expect(two.summary).toBe("1 of 1 seat judged the case blind; the one check it wrote is not published");

    // Under the panel, what is "not shown" is a check of the case as it stands: the files of the run that produced a
    // current check and of any run sent the same case file. A run over another case file is not counted there.
    const template = real.assessmentRuns.find((r) => r.role === "check")!;
    const held = { ...template, runId: "2099-01-01-check-opus-000001", date: "2099-01-01", producedBy: first, basis: { ledgerHash: real.ledgerHash } };
    const others = real.assessmentRuns.filter((r) => r.role !== "check");
    expect(unpublishedChecks({ ...c, assessmentRuns: [...others, held] }, root)).toEqual([
      { runId: first, files: ["2099-01-01-check-gemini-000001.yaml"] },
      { runId: again, files: ["2099-01-01-check-gemini-000002.yaml"] },
    ]);
    // With no check of the case as it stands, the panel has nothing to say is missing.
    expect(unpublishedChecks({ ...c, assessmentRuns: others }, root)).toEqual([]);
    // Every run on main publishes what its record says it wrote, or says why not beside the run.
    for (const loaded of loadAllCases()) for (const s of caseRecord(loaded)) if (s.unpublished.length) expect(s.withheld.length, s.runId).toBeGreaterThan(0);
  });

  it("rows whose run left no record are shown as exactly that: no verb, outcome or cost is inferred", () => {
    const c = loadAllCases().find((x) => x.record.slug === "ccc")!;
    const orphan = caseRecord(c).find((s) => !s.recorded)!;
    expect(orphan).toBeDefined();
    expect(orphan.verb).toBeNull();
    expect(orphan.outcome).toBeNull();
    expect(orphan.usd).toBeNull();
    expect(orphan.summary).toMatch(/row\(s\) written by triage-.*which left no run record/);
    expect(orphan.date).toMatch(/^\d{4}-\d\d-\d\d$/);
  });
});
