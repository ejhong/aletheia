import { describe, expect, it } from "vitest";
import { loadAllCases } from "./load.ts";
import { caseRecord } from "./record.ts";

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
