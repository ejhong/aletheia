/**
 * The record layer of a case page: every sitting on the case, with what it
 * proposed and what it refused and why — the run records and the
 * dispositions, grouped by the run that wrote them. Derived; nothing is
 * stored for it. A reader who wants to know why a candidate is not on
 * the ledger finds the reason here, in the row the verifier wrote.
 */
import fs from "node:fs";
import path from "node:path";
import type { Disposition, RunRecord } from "./intake.ts";
import type { LoadedCase } from "./schema.ts";
import { describeRunAsPublished, readRuns, runDir, unpublishedFiles } from "./runs.ts";
import { currentChecks, latestCheckPerModel } from "./standing.ts";

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
  /** False for rows whose run left no record (an earlier script, a migration): nothing about that run is inferred — no verb, no outcome, no cost. */
  recorded: boolean;
  verb: RunRecord["verb"] | null;
  /** The run's own date when recorded; otherwise the date the rows carry. */
  date: string;
  outcome: RunRecord["outcome"] | null;
  summary: string;
  usd: number | null;
  /** Rows by disposition, e.g. { in: 62, failed: 30, blocked: 6 }. */
  counts: Partial<Record<Disposition["disposition"], number>>;
  admitted: SittingRow[];
  refused: SittingRow[];
  /**
   * Files the run's record says it wrote that are not in the repository, by name (runs.ts, `unpublishedFiles`); the
   * summary says how many.
   */
  unpublished: string[];
  /** Why, in the words left beside the run: the text of each `*.withheld.txt` in the run's directory, in file order. */
  withheld: string[];
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
  const sittings: Sitting[] = runs.map((r) => ({
    ...sitting(r.runId, true, r.verb, r.date, r.outcome, describeRunAsPublished(r, root), r.cost?.usd ?? null, byRun.get(r.runId) ?? []),
    unpublished: unpublishedFiles(r, root),
    withheld: withheldNotes(r.runId, root),
  }));
  // Rows whose run left no record (an earlier script, a migration) are shown as exactly that, under the run id
  // the rows name and on the date the rows carry — no verb, outcome or cost is inferred for a run nobody recorded.
  for (const [runId, rows] of byRun) {
    if (seen.has(runId)) continue;
    const dates = [...new Set(rows.map((d) => d.date))].sort();
    sittings.push(sitting(runId, false, null, dates[dates.length - 1], null, `${rows.length} row(s) written by ${runId}, which left no run record`, null, rows));
  }
  return sittings.sort((a, b) => b.date.localeCompare(a.date) || b.runId.localeCompare(a.runId));
}

/**
 * Checks of the case as it stands that were written and are not published: the files, by the run that wrote them.
 * A check run belongs here when its record carries the hash of the same case file as a run that produced one of the
 * panel's current checks (`inputHash`, on check runs since 2026-09-30), so a withheld check of an older ledger is not
 * counted against the panel a reader is looking at.
 */
export function unpublishedChecks(loaded: LoadedCase, root = process.cwd()): { runId: string; files: string[] }[] {
  const producers = new Set(currentChecks(loaded, latestCheckPerModel(loaded)).map((c) => c.producedBy).filter(Boolean));
  if (producers.size === 0) return [];
  const runs = readRuns(root).filter((r) => r.verb === "check" && r.case === loaded.record.slug);
  const sent = new Set(runs.filter((r) => producers.has(r.runId)).map((r) => r.inputHash).filter(Boolean));
  return runs
    .filter((r) => r.inputHash && sent.has(r.inputHash))
    .map((r) => ({ runId: r.runId, files: unpublishedFiles(r, root) }))
    .filter((r) => r.files.length > 0);
}

/** The notes left beside a run about what of its output is not published, as written: `proposals/<runId>/*.withheld.txt`. */
function withheldNotes(runId: string, root: string): string[] {
  const dir = runDir(runId, root);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".withheld.txt"))
    .sort()
    .map((name) => fs.readFileSync(path.join(dir, name), "utf8").trim())
    .filter(Boolean);
}

function sitting(runId: string, recorded: boolean, verb: RunRecord["verb"] | null, date: string, outcome: RunRecord["outcome"] | null, summary: string, usd: number | null, rows: Disposition[]): Sitting {
  const counts: Sitting["counts"] = {};
  for (const d of rows) counts[d.disposition] = (counts[d.disposition] ?? 0) + 1;
  return {
    runId,
    recorded,
    verb,
    date,
    outcome,
    summary,
    usd,
    counts,
    admitted: rows.filter((d) => d.disposition === "in").map(row),
    refused: rows.filter((d) => d.disposition !== "in").map(row),
    unpublished: [],
    withheld: [],
  };
}
