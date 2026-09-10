import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { loadOperation } from "./governance.ts";
import { getCaseBySlug, loadAllCases } from "./load.ts";
import { cadenceDays, nextAction, inboxPending } from "../pipeline/next.ts";
import type { RunRecord } from "./intake.ts";

const run = (over: Partial<RunRecord>): RunRecord => ({
  runId: "2026-09-01-report-x-000000", verb: "report", case: "x", date: "2026-09-01", model: "m", promptVersion: "report-v1", inputHash: null,
  outcome: "completed", cost: { calls: 1, inputTokens: 1, outputTokens: 1, usd: 1 }, ...over,
});

describe("aletheia next", () => {
  const cases = loadAllCases();
  const other = cases.find((c) => c.record.slug !== "megalithic-casting" && !c.dispositions.length)!;

  it("an inbox with items is the first choice, counted without reading the files", () => {
    const [a, b] = cases;
    expect(nextAction(cases, [], "2026-09-20", new Set(), new Map([[b.record.slug, 2]]))).toMatchObject({ case: b.record.slug, verb: "inbox", reason: `2 item(s) waiting in inbox/${b.dir}` });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aletheia-inbox-pending-"));
    fs.mkdirSync(path.join(root, "inbox", a.dir, "processed", "old"), { recursive: true });
    fs.writeFileSync(path.join(root, "inbox", a.dir, "README.md"), "not an item");
    fs.writeFileSync(path.join(root, "inbox", a.dir, ".DS_Store"), "");
    fs.writeFileSync(path.join(root, "inbox", a.dir, "processed", "old", "done.md"), "taken in already");
    fs.writeFileSync(path.join(root, "inbox", a.dir, "note.md"), "---\ncase: x\n---\nwaiting");
    fs.writeFileSync(path.join(root, "inbox", a.dir, "paper.pdf"), "%PDF");
    expect([...inboxPending(cases, root)]).toEqual([[a.record.slug, 2]]);
  });

  it("finishes a half-done chain before anything else", () => {
    const slug = other.record.slug;
    const runs = [run({ runId: `2026-09-01-report-${slug}-000000`, case: slug })];
    const n = nextAction(cases, runs, "2026-09-20");
    expect(n).toMatchObject({ case: slug, verb: "draft", from: runs[0].runId });
    // A draft after the report does not count until a proposal names that report; then the proposal waits for verification.
    const withDraft = [...runs, run({ runId: `2026-09-01-draft-${slug}-010000`, verb: "draft", case: slug })];
    expect(nextAction(cases, withDraft, "2026-09-20")).toMatchObject({ verb: "draft", from: runs[0].runId });
    expect(nextAction(cases, withDraft, "2026-09-20", new Set([runs[0].runId]))).toMatchObject({ case: slug, verb: "verify", from: withDraft[1].runId });
    // Two reports, one drafted: the undrafted one is next even though it is older than the draft.
    const two = [run({ runId: `2026-09-02-inbox-${slug}-000000`, verb: "inbox", case: slug, date: "2026-09-02" }), ...withDraft, run({ runId: `2026-09-01-verify-${slug}-020000`, verb: "verify", case: slug })];
    expect(nextAction(cases, two, "2026-09-20", new Set([runs[0].runId]))).toMatchObject({ verb: "draft", from: `2026-09-02-inbox-${slug}-000000` });
  });

  it("then a due edition, then the least recently reported case with the house seat, skipping the cadence window", async () => {
    const { editionDue } = await import("../pipeline/edition.ts");
    // A case the panel contests and nothing has answered is searched first; the reconsideration waits until the report is within cadence.
    const contested = cases.find((c) => editionDue(c)?.kind === "contested");
    if (contested) {
      expect(nextAction([contested], [], "2026-09-20")).toMatchObject({ case: contested.record.slug, verb: "report" });
      const slug = contested.record.slug;
      const reported = [
        run({ runId: `2026-09-19-report-${slug}-000000`, case: slug, date: "2026-09-19" }),
        run({ runId: `2026-09-19-draft-${slug}-010000`, verb: "draft", case: slug, date: "2026-09-19" }),
        run({ runId: `2026-09-19-verify-${slug}-020000`, verb: "verify", case: slug, date: "2026-09-19" }),
      ];
      expect(nextAction([contested], reported, "2026-09-20", new Set([reported[0].runId]))).toMatchObject({ case: slug, verb: "edition" });
    }
    // Among cases whose editions are current, with no runs at all, the first never-reported case is chosen for a report.
    const { checksStale } = await import("./standing.ts");
    const settled = cases.filter((c) => c.record.slug !== "megalithic-casting" && !editionDue(c) && !checksStale(c));
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
    const drafted = new Set([`2026-09-19-report-${a}-000000`, `2026-08-30-report-${b}-000000`]);
    const n2 = nextAction(two, runs, "2026-09-20", drafted);
    expect(n2.case).toBe(b);
    expect(n2.verb).toBe("report");
    expect(n2.seat).toBe("openai"); // its last pass landed nothing (no `in` rows name that run)
    expect(nextAction(two.filter((c) => c.record.slug === a), runs, "2026-09-20", drafted).verb).toBe("rest");
    // Two empty cycles: the cadence is 28 days, so 21 days is rest; at 30 days the house seat is back.
    const quiet = [
      ...runs.filter((r) => r.case === b),
      run({ runId: `2026-08-15-report-${b}-000000`, case: b, date: "2026-08-15" }),
      run({ runId: `2026-08-15-draft-${b}-010000`, verb: "draft", case: b, date: "2026-08-15" }),
    ];
    const quietDrafted = new Set([...drafted, `2026-08-15-report-${b}-000000`]);
    const onlyB = two.filter((c) => c.record.slug === b);
    expect(nextAction(onlyB, quiet, "2026-09-20", quietDrafted).verb).toBe("rest");
    const later = nextAction(onlyB, quiet, "2026-09-29", quietDrafted);
    expect(later).toMatchObject({ case: b, verb: "report", seat: "anthropic" });
    expect(later.reason).toMatch(/2 pass\(es\) landed nothing, so the cadence is 28 days and the house seat looks/);
    expect(cadenceDays(0)).toBe(7);
    expect(cadenceDays(2)).toBe(14);
    expect(cadenceDays(8)).toBe(90); // the ceiling
  });

  it("a reconsideration the fresh panel still contests rests until the ledger moves", async () => {
    const { editionDue } = await import("../pipeline/edition.ts");
    const geo = getCaseBySlug("megalithic-casting");
    const adopted = geo.assessmentRuns.find((r) => r.runId === geo.editions.at(-1)!.assessment!.runId)!;
    if (adopted.reconciles && geo.editions.at(-1)!.basis.ledgerHash === geo.ledgerHash) expect(editionDue(geo)).toBeNull();
  });

  it("a stale panel is re-checked after any due edition and before any report", async () => {
    const { checksStale } = await import("./standing.ts");
    const { editionDue } = await import("../pipeline/edition.ts");
    const stale = cases.find((c) => checksStale(c) && !editionDue(c));
    if (stale) expect(nextAction([stale], [], "2026-09-20")).toMatchObject({ case: stale.record.slug, verb: "check" });
    const due = cases.find((c) => checksStale(c) && editionDue(c)?.kind === "moved");
    if (due) expect(nextAction([due], [], "2026-09-20").verb).toBe("edition");
  });

  it("the live ledger has a choice, and the operation state is on the record", () => {
    const n = nextAction(cases, [], "2026-09-20");
    expect(["report", "edition", "draft", "verify", "check"]).toContain(n.verb);
    const op = loadOperation();
    expect(["live", "paused"]).toContain(op.state);
    expect(op.reason.length).toBeGreaterThan(10);
    expect(getCaseBySlug("megalithic-casting").record.slug).toBe("megalithic-casting");
  });
});

describe("superseded intakes", () => {
  it("an earlier intake whose documents a later intake of the same case took in again needs no draft", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const { draftedFrom } = await import("../pipeline/next.ts");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aletheia-supersede-"));
    const mk = (id: string, shas: string[]) => {
      fs.mkdirSync(path.join(root, "proposals", id), { recursive: true });
      fs.writeFileSync(path.join(root, "proposals", id, "manifest.yaml"), `items:\n${shas.map((s) => `  - sha256: ${s}\n`).join("")}`);
    };
    mk("2026-09-09-inbox-v-010000", ["aaa"]);
    mk("2026-09-09-inbox-v-020000", ["aaa"]);
    mk("2026-09-09-inbox-v-030000", ["bbb"]);
    const runs = ["010000", "020000", "030000"].map((t) => run({ runId: `2026-09-09-inbox-v-${t}`, verb: "inbox", case: "v", date: "2026-09-09" }));
    const drafted = draftedFrom(runs, root);
    expect(drafted.has("2026-09-09-inbox-v-010000")).toBe(true); // superseded by 020000
    expect(drafted.has("2026-09-09-inbox-v-020000")).toBe(false); // the latest intake of that document
    expect(drafted.has("2026-09-09-inbox-v-030000")).toBe(false); // a different document
  });
});

describe("a sitting knows its deadline and writes its progress", () => {
  it("makes no new choice once the deadline has passed, says so, and reports progress after every choice", async () => {
    const { runNext } = await import("../pipeline/next.ts");
    let clock = 0;
    const seen: number[] = [];
    const once = async () => {
      clock += 50 * 60_000; // each choice takes fifty minutes
      return { choice: { case: "x", verb: "check" as const, reason: "test" }, ran: [{ verb: "check", outcome: { outcome: "completed" as const, runId: `r${clock}` } }] };
    };
    const r = await runNext({ run: true, steps: 8, deadlineMinutes: 120, onProgress: (so) => seen.push(1 + (so.more?.length ?? 0)), deps: { now: () => clock, once } });
    // 50, 100 → a third choice would begin at 150 min, past the deadline: three outcomes in all, stopped after the second extra.
    expect(1 + (r.more?.length ?? 0)).toBe(3);
    expect(r.stopped).toEqual({ reason: "deadline", afterMinutes: 150, stepsMade: 3 });
    expect(seen).toEqual([1, 2, 3, 3]); // after each choice, and once more when it stopped
    // Without a deadline the sitting runs its steps; a failed step still ends it.
    let n = 0;
    const failing = async () => ({ choice: { case: "x", verb: "check" as const, reason: "test" }, ran: [{ verb: "check", outcome: { outcome: (++n === 2 ? "failed" : "completed") as "failed" | "completed", runId: `r${n}` } }] });
    const f = await runNext({ run: true, steps: 5, deps: { now: () => 0, once: failing } });
    expect(1 + (f.more?.length ?? 0)).toBe(2);
    expect(f.stopped).toBeUndefined();
  });
});

describe("the CLI reads every value flag it documents", () => {
  it("takes --deadline-minutes and --out as values, not bare flags", async () => {
    const { splitArgs, VALUE_FLAGS } = await import("../lib/args.ts");
    const r = splitArgs(["--run", "--steps", "6", "--deadline-minutes", "240", "--out", "next.json"], VALUE_FLAGS);
    expect(r.values).toEqual({ "--steps": "6", "--deadline-minutes": "240", "--out": "next.json" });
    expect([...r.flags]).toEqual(["--run"]);
    expect(r.args).toEqual([]);
    // A flag not on the list is bare, and its would-be value a positional: the 2026-09-10 fault, kept as the contrast.
    const bad = splitArgs(["--out", "next.json"], ["--steps"]);
    expect(bad.values).toEqual({});
    expect(bad.args).toEqual(["next.json"]);
  });
});

describe("a sitting works on at most its case limit", () => {
  it("ends when the next choice would open another case, keeping the choices made and naming the cases", async () => {
    const { runNext } = await import("../pipeline/next.ts");
    const plan = ["a", "a", "b", "c", "c"];
    let i = 0;
    const choose = () => ({ case: plan[i++], verb: "check" as const, reason: "test" });
    const perform = async (choice: { case: string | null }) => ({ choice: { case: choice.case, verb: "check" as const, reason: "test" }, ran: [{ verb: "check", outcome: { outcome: "completed" as const, runId: `r${i}` } }] });
    const r = await runNext({ run: true, steps: 5, maxCases: 2, deps: { now: () => 0, choose, perform } });
    expect([r.choice.case, ...(r.more ?? []).map((m) => m.choice.case)]).toEqual(["a", "a", "b"]);
    expect(r.stopped).toEqual({ reason: "cases", afterMinutes: 0, stepsMade: 3, cases: ["a", "b"] });
    // Without a limit all five run.
    i = 0;
    const all = await runNext({ run: true, steps: 5, deps: { now: () => 0, choose, perform } });
    expect(1 + (all.more?.length ?? 0)).toBe(5);
    expect(all.stopped).toBeUndefined();
  });
});
