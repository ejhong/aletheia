/**
 * The operations view (the /operations page): the operation state, when the
 * operator works, spend against the caps in force, the recent runs across
 * cases — the operator's sessions, the panel's checks, and before
 * 2026-10-19 the pipeline's verbs — and the reviews of every change.
 * Everything here is derived at build time from the files the site writes
 * and the founder's configuration; nothing is authored for the page.
 */
import fs from "node:fs";
import path from "node:path";
import type { Cost, SpendRow } from "./intake.ts";
import { capsFor, loadBudget, type Budget } from "./budget.ts";
import { loadOperation, loadReviewNotes, loadReviewRecords, type ReviewRecord } from "./governance.ts";
import type { ReviewNoteRecord } from "./schema.ts";
import { describeRunAsPublished, readRuns } from "./runs.ts";
import { readSpend, spentOn, sumCost } from "./spend.ts";

export interface Operations {
  operation: ReturnType<typeof loadOperation>;
  schedule: { cron: string | null; human: string };
  spend: {
    today: string;
    day: { usd: number; rows: number; unpriced: number };
    month: { usd: number; rows: number; unpriced: number };
    allTime: Cost;
    caps: ReturnType<typeof capsFor>;
    budget: Budget;
    byVerb: { verb: string; usd: number | null; rows: number }[];
  };
  sittings: { runId: string; case: string; verb: string; date: string; outcome: string; summary: string; usd: number | null }[];
  /** The reviews of changes since 2026-10-19, newest first. */
  reviews: ReviewRecord[];
  /** The constitutional gate's review notes, 2026-09-09 to 2026-10-19: its record, kept. */
  reviewNotes: ReviewNoteRecord[];
}

const DAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

/** A five-field cron in a reader's words, for the shapes the workflows use; anything else is shown as written. */
export function cronHuman(cron: string): string {
  const m = cron.trim().match(/^(\d{1,2}) (\d{1,2}) \* \* (\*|\d(?:,\d)*)$/);
  if (!m) return `on the schedule \`${cron}\` (UTC)`;
  const hh = m[2].padStart(2, "0");
  const mm = m[1].padStart(2, "0");
  if (m[3] === "*") return `daily at ${hh}:${mm} UTC`;
  const days = m[3].split(",").map((d) => DAYS[Number(d)] ?? d);
  return `${days.length === 1 ? "weekly, " : ""}${days.join(" and ")} at ${hh}:${mm} UTC`;
}

/** A workflow's active cron line — the operator's by default — if its schedule is uncommented. */
export function workflowCron(root = process.cwd(), workflow = "operator.yml"): string | null {
  const file = path.join(root, ".github", "workflows", workflow);
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, "utf8");
  const on = text.match(/^on:\n([\s\S]*?)^(?:concurrency|permissions|jobs):/m)?.[1] ?? text;
  const m = on.match(/^\s*schedule:\n\s*-\s*cron:\s*"([^"]+)"/m);
  return m ? m[1] : null;
}

export function operationsView(root = process.cwd(), today = new Date().toISOString().slice(0, 10)): Operations {
  const rows = readSpend(root);
  const budget = loadBudget(root);
  const byVerb = new Map<string, SpendRow[]>();
  for (const r of rows) byVerb.set(r.verb, [...(byVerb.get(r.verb) ?? []), r]);
  const cron = workflowCron(root);
  return {
    operation: loadOperation(root),
    schedule: { cron, human: cron ? cronHuman(cron) : "no schedule: the operator works when the founder starts a session" },
    spend: {
      today,
      day: spentOn(rows, today),
      month: spentOn(rows, today.slice(0, 7)),
      allTime: sumCost(rows),
      caps: capsFor(budget, today),
      budget,
      byVerb: [...byVerb.entries()].map(([verb, vs]) => ({ verb, usd: vs.every((r) => r.usd !== null) ? Number(vs.reduce((n, r) => n + (r.usd ?? 0), 0).toFixed(2)) : null, rows: vs.length })).sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0)),
    },
    sittings: readRuns(root)
      .reverse()
      .slice(0, 24)
      .map((r) => ({ runId: r.runId, case: r.case, verb: r.verb, date: r.date, outcome: r.outcome, summary: describeRunAsPublished(r, root), usd: r.cost?.usd ?? null })),
    reviews: loadReviewRecords(root),
    reviewNotes: loadReviewNotes(),
  };
}
