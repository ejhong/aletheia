import { describe, expect, it } from "vitest";
import { loadOperation } from "./governance.ts";
import { getCaseBySlug, loadAllCases } from "./load.ts";
import { nextAction } from "../pipeline/next.ts";
import type { RunRecord } from "./intake.ts";

const run = (over: Partial<RunRecord>): RunRecord => ({
  runId: "2026-09-01-report-x-000000", verb: "report", case: "x", date: "2026-09-01", model: "m", promptVersion: "report-v1", inputHash: null,
  outcome: "completed", cost: { calls: 1, inputTokens: 1, outputTokens: 1, usd: 1 }, ...over,
});

describe("aletheia next", () => {
  const cases = loadAllCases();
  const other = cases.find((c) => c.record.slug !== "megalithic-casting" && !c.dispositions.length)!;

  it("finishes a half-done chain before anything else", () => {
    const slug = other.record.slug;
    const runs = [run({ runId: `2026-09-01-report-${slug}-000000`, case: slug })];
    const n = nextAction(cases, runs, "2026-09-20");
    expect(n).toMatchObject({ case: slug, verb: "draft", from: runs[0].runId });
    const withDraft = [...runs, run({ runId: `2026-09-01-draft-${slug}-010000`, verb: "draft", case: slug })];
    expect(nextAction(cases, withDraft, "2026-09-20")).toMatchObject({ case: slug, verb: "verify", from: withDraft[1].runId });
  });

  it("then a due edition, then the least recently reported case with the house seat, skipping the cadence window", async () => {
    const { editionDue } = await import("../pipeline/edition.ts");
    // Cases the panel contests and nothing has answered are due an edition before any report.
    const contested = cases.find((c) => editionDue(c)?.reason.includes("contests"));
    if (contested) expect(nextAction([contested], [], "2026-09-20")).toMatchObject({ case: contested.record.slug, verb: "edition" });
    // Among cases whose editions are current, with no runs at all, the first never-reported case is chosen for a report.
    const settled = cases.filter((c) => c.record.slug !== "megalithic-casting" && !editionDue(c));
    expect(settled.length).toBeGreaterThan(1);
    const n = nextAction(settled, [], "2026-09-20");
    expect(n.verb).toBe("report");
    expect(n.seat).toBe("anthropic");
    expect(n.reason).toBe("never reported");
    // A case reported yesterday waits; the one reported three weeks ago goes; nothing landing sends the second seat.
    const [a, b] = settled.slice(0, 2).map((c) => c.record.slug);
    const two = settled.filter((c) => [a, b].includes(c.record.slug));
    const runs = [
      run({ runId: `2026-09-19-report-${a}-000000`, case: a, date: "2026-09-19" }),
      run({ runId: `2026-08-30-report-${b}-000000`, case: b, date: "2026-08-30" }),
      run({ runId: `2026-09-19-draft-${a}-010000`, verb: "draft", case: a, date: "2026-09-19" }),
      run({ runId: `2026-09-19-verify-${a}-020000`, verb: "verify", case: a, date: "2026-09-19" }),
      run({ runId: `2026-08-30-draft-${b}-010000`, verb: "draft", case: b, date: "2026-08-30" }),
      run({ runId: `2026-08-30-verify-${b}-020000`, verb: "verify", case: b, date: "2026-08-30" }),
    ];
    const n2 = nextAction(two, runs, "2026-09-20");
    expect(n2.case).toBe(b);
    expect(n2.verb).toBe("report");
    expect(n2.seat).toBe("openai"); // its last pass landed nothing (no `in` rows name that run)
    expect(nextAction(two.filter((c) => c.record.slug === a), runs, "2026-09-20").verb).toBe("rest");
  });

  it("a reconsideration the fresh panel still contests rests until the ledger moves", async () => {
    const { editionDue } = await import("../pipeline/edition.ts");
    const geo = getCaseBySlug("megalithic-casting");
    const adopted = geo.assessmentRuns.find((r) => r.runId === geo.editions.at(-1)!.assessment!.runId)!;
    if (adopted.reconciles && geo.editions.at(-1)!.basis.ledgerHash === geo.ledgerHash) expect(editionDue(geo)).toBeNull();
  });

  it("the live ledger has a choice, and the operation state is on the record", () => {
    const n = nextAction(cases, [], "2026-09-20");
    expect(["report", "edition", "draft", "verify"]).toContain(n.verb);
    const op = loadOperation();
    expect(["live", "paused"]).toContain(op.state);
    expect(op.reason.length).toBeGreaterThan(10);
    expect(getCaseBySlug("megalithic-casting").record.slug).toBe("megalithic-casting");
  });
});
