#!/usr/bin/env node
/**
 * Yield report: attention allocation, derived from the ledger
 * (docs/AUTOMATION.md, "the scheduler: attention follows yield").
 *
 * Prints a per-case table to stderr for humans and a JSON object to
 * stdout for workflows:
 *   { date, cases: { <slug>: { band, attention, due, lastMoved,
 *     daysSinceMovement, eventsLast120Days } } }
 *
 * Stateless and model-free: run it anywhere, same answer. Reads the cases
 * through the site's own loader, so "featured" means what the current
 * edition says it means.
 *
 * Usage: node scripts/yield-report.ts [--today YYYY-MM-DD]
 */
import { currentEdition, loadAllCases } from "../src/domain/load.ts";
import { classifyCase, dueThisRun } from "./lib/yield-core.mjs";

const todayArg = process.argv.indexOf("--today");
const today =
  todayArg > -1 ? process.argv[todayArg + 1] : new Date().toISOString().slice(0, 10);

type CaseYield = ReturnType<typeof classifyCase> & { due: boolean };
const report: { date: string; cases: Record<string, CaseYield> } = { date: today, cases: {} };
for (const loaded of loadAllCases()) {
  const c = classifyCase(
    {
      history: loaded.history,
      claims: loaded.claims,
      featuredIds: currentEdition(loaded).featuredClaimIds,
      assessmentRuns: loaded.assessmentRuns,
      studies: loaded.studies,
    },
    today,
  );
  report.cases[loaded.record.slug] = { ...c, due: dueThisRun(c.band, today) };
}

const pad = (s: unknown, n: number) => String(s).padEnd(n);
console.error(
  pad("case", 26) + pad("band", 6) + pad("attention", 11) + pad("due", 5) +
    pad("last moved", 12) + "events(120d)",
);
for (const [slug, c] of Object.entries(report.cases)) {
  console.error(
    pad(slug, 26) + pad(c.band, 6) + pad(c.attention, 11) +
      pad(c.due ? "yes" : "no", 5) + pad(c.lastMoved ?? "never", 12) +
      c.eventsLast120Days,
  );
}
console.log(JSON.stringify(report, null, 2));
