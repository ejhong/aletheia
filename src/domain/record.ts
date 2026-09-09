/**
 * The record layer of a case page: every sitting on the case, with what it
 * proposed and what it refused and why — the run records and the
 * dispositions, grouped by the run that wrote them. Derived; nothing is
 * stored for it. A reader who wants to know why a candidate is not on
 * the ledger finds the reason here, in the row the verifier wrote.
 */
import type { Disposition, RunRecord } from "./intake.ts";
import type { LoadedCase } from "./schema.ts";
import { describeRun, readRuns } from "./runs.ts";

export interface SittingRow {
  key: string;
  kind: Disposition["kind"];
  disposition: Disposition["disposition"];
  observed: string;
  reason: string | null;
  reopenIf: string | null;
  as: string | null;
}

export interface Sitting {
  runId: string;
  verb: RunRecord["verb"];
  date: string;
  outcome: RunRecord["outcome"];
  summary: string;
  usd: number | null;
  /** Rows by disposition, e.g. { in: 62, failed: 30, blocked: 6 }. */
  counts: Partial<Record<Disposition["disposition"], number>>;
  admitted: SittingRow[];
  refused: SittingRow[];
}

const row = (d: Disposition): SittingRow => ({
  key: d.key,
  kind: d.kind,
  disposition: d.disposition,
  observed: d.observed,
  reason: d.reason ?? null,
  reopenIf: d.reopenIf ?? null,
  as: d.as ?? null,
});

/** Every run on the case, newest first, each with the disposition rows it wrote. */
export function caseRecord(loaded: LoadedCase, root = process.cwd()): Sitting[] {
  const byRun = new Map<string, Disposition[]>();
  for (const d of loaded.dispositions) {
    const list = byRun.get(d.by) ?? [];
    list.push(d);
    byRun.set(d.by, list);
  }
  const runs = readRuns(root).filter((r) => r.case === loaded.record.slug).reverse();
  const seen = new Set(runs.map((r) => r.runId));
  const sittings: Sitting[] = runs.map((r) => sitting(r.runId, r.verb, r.date, r.outcome, describeRun(r), r.cost?.usd ?? null, byRun.get(r.runId) ?? []));
  // Rows whose run left no record (a migration, an early script): still shown, under the run id they name.
  for (const [runId, rows] of byRun) {
    if (seen.has(runId)) continue;
    const verb = (runId.match(/^\d{4}-\d\d-\d\d-([a-z]+)-/)?.[1] ?? "migration") as RunRecord["verb"];
    sittings.push(sitting(runId, verb, rows[0].date, "completed", "rows written outside a recorded run", null, rows));
  }
  return sittings.sort((a, b) => b.date.localeCompare(a.date) || b.runId.localeCompare(a.runId));
}

function sitting(runId: string, verb: RunRecord["verb"], date: string, outcome: RunRecord["outcome"], summary: string, usd: number | null, rows: Disposition[]): Sitting {
  const counts: Sitting["counts"] = {};
  for (const d of rows) counts[d.disposition] = (counts[d.disposition] ?? 0) + 1;
  return {
    runId,
    verb,
    date,
    outcome,
    summary,
    usd,
    counts,
    admitted: rows.filter((d) => d.disposition === "in").map(row),
    refused: rows.filter((d) => d.disposition !== "in").map(row),
  };
}
