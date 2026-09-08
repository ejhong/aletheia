import { describe, expect, it } from "vitest";
import {
  declined,
  DispositionSchema,
  latestByKey,
  ProposalSchema,
  RunRecordSchema,
  saturation,
  type Disposition,
} from "./intake.ts";
import { dispositionErrors, getCaseBySlug, loadAllCases } from "./load.ts";

const row = (over: Partial<Disposition>): Disposition => ({
  key: "doi:10.1/x",
  kind: "source",
  disposition: "irrelevant",
  reason: "no bearing on any claim",
  observed: "A paper",
  by: "run-1",
  date: "2026-09-01",
  ...over,
});

describe("dispositions", () => {
  it("in and duplicate need `as`; everything off in needs a reason; keys are mechanical", () => {
    expect(() => DispositionSchema.parse(row({ disposition: "in", reason: undefined }))).toThrow(/as/);
    expect(() => DispositionSchema.parse(row({ disposition: "in", as: "SRC-X", reason: undefined }))).not.toThrow();
    expect(() => DispositionSchema.parse(row({ disposition: "duplicate" }))).toThrow(/as/);
    expect(() => DispositionSchema.parse(row({ disposition: "blocked", reason: undefined }))).toThrow(/reason/);
    expect(() => DispositionSchema.parse(row({ key: "10.1/x" }))).toThrow(/key like/);
    expect(() => DispositionSchema.parse(row({ key: "text:the great pyramid casing stones are cast" }))).not.toThrow();
  });

  it("the latest row per key stands; later in file wins a same-date tie", () => {
    const rows = [
      row({ date: "2026-09-01", disposition: "blocked" }),
      row({ date: "2026-09-02", disposition: "failed" }),
      row({ date: "2026-09-02", disposition: "excluded" }),
      row({ key: "doi:10.1/y", disposition: "in", as: "SRC-Y", reason: undefined }),
    ];
    const latest = latestByKey(rows);
    expect(latest.get("doi:10.1/x")?.disposition).toBe("excluded");
    expect(declined(rows).map((d) => d.key)).toEqual(["doi:10.1/x"]);
  });

  it("an in row must name a record the case holds", () => {
    const geo = getCaseBySlug("megalithic-casting");
    expect(dispositionErrors({ ...geo, dispositions: [row({ disposition: "in", as: "SRC-MARCIS-2023", reason: undefined })] })).toEqual([]);
    expect(dispositionErrors({ ...geo, dispositions: [row({ disposition: "in", as: "SRC-NOPE", reason: undefined })] })[0]).toMatch(
      /unknown record SRC-NOPE/,
    );
  });

  it("live content passes", () => {
    for (const c of loadAllCases()) expect(dispositionErrors(c)).toEqual([]);
  });
});

describe("saturation is derived from runs and dispositions", () => {
  const run = (runId: string, date: string, verb: "report" | "draft" | "check" = "report") => ({
    runId,
    verb,
    case: "x",
    date,
    outcome: "completed" as const,
  });

  it("counts consecutive producer runs that landed nothing, and resets on an in", () => {
    const runs = [run("r1", "2026-09-01"), run("r2", "2026-09-02"), run("r3", "2026-09-03"), run("c1", "2026-09-04", "check")];
    const rows = [row({ disposition: "in", as: "SRC-A", reason: undefined, by: "r1", date: "2026-09-01" })];
    expect(saturation(runs, rows, "x")).toEqual({ consecutiveEmpty: 2, lastIn: "2026-09-01", producerRuns: 3 });
    const landed = [...rows, row({ key: "doi:10.1/z", disposition: "in", as: "SRC-Z", reason: undefined, by: "r3", date: "2026-09-03" })];
    expect(saturation(runs, landed, "x").consecutiveEmpty).toBe(0);
    expect(saturation([], [], "x")).toEqual({ consecutiveEmpty: 0, lastIn: null, producerRuns: 0 });
  });
});

describe("envelopes", () => {
  const hex = "a".repeat(64);
  it("a proposal validates its candidate records with the ledger's own schemas", () => {
    const base = {
      runId: "2026-09-08-draft-x-120000",
      date: "2026-09-08",
      case: "x",
      producer: "draft",
      model: "m",
      promptVersion: "draft-v1",
      basis: { ledgerHash: hex },
      rationale: "a test proposal, long enough",
    };
    const parsed = ProposalSchema.parse(base);
    expect(parsed.adds.sources).toEqual([]);
    expect(parsed.dispositions).toEqual([]);
    expect(() =>
      ProposalSchema.parse({ ...base, adds: { sources: [{ id: "SRC-BAD", title: "t" }] } }),
    ).toThrow();
    expect(() =>
      ProposalSchema.parse({
        ...base,
        adds: { sources: [{ id: "SRC-OK", title: "A real title", sourceType: "paper", verification: "unverified" }] },
      }),
    ).not.toThrow();
  });

  it("a run record carries its cost, with usd null when no tariff priced it", () => {
    const run = RunRecordSchema.parse({
      runId: "2026-09-08-report-x-120000",
      verb: "report",
      case: "x",
      date: "2026-09-08",
      model: "m",
      promptVersion: "report-v1",
      inputHash: hex,
      outcome: "completed",
      cost: { calls: 1, inputTokens: 100, outputTokens: 200, usd: null },
    });
    expect(run.cost.usd).toBeNull();
    expect(() => RunRecordSchema.parse({ ...run, outcome: "maybe" })).toThrow();
  });
});
