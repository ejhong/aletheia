/**
 * Yield report: attention allocation, derived from the ledger
 * (docs/AUTOMATION.md, "the scheduler: attention follows yield").
 *
 * Prints a per-case table to stderr for humans and a JSON object to
 * stdout for workflows:
 *   { date, cases: { <slug>: { band, attention, due, lastMoved,
 *     daysSinceMovement, eventsLast120Days } } }
 *
 * Stateless and model-free: run it anywhere, same answer. Loops consume
 * `due` — e.g. the agenda step skips cases not due this run — while the
 * cheap identifier-based watch deliberately stays weekly for all cases
 * (a missed discovery costs more than a cheap query; see AUTOMATION.md).
 *
 * Usage: node scripts/yield-report.mjs [--today YYYY-MM-DD]
 */

import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { classifyCase, dueThisRun } from "./lib/yield-core.mjs";

const CASES = path.join(process.cwd(), "content", "cases");
const todayArg = process.argv.indexOf("--today");
const today =
  todayArg > -1
    ? process.argv[todayArg + 1]
    : new Date().toISOString().slice(0, 10);

function loadList(p) {
  if (!fs.existsSync(p)) return [];
  const parsed = parseYaml(fs.readFileSync(p, "utf8"));
  return Array.isArray(parsed) ? parsed : [];
}

const report = { date: today, cases: {} };
for (const slug of fs.readdirSync(CASES).sort()) {
  const dir = path.join(CASES, slug);
  if (!fs.statSync(dir).isDirectory()) continue;
  const assessmentsDir = path.join(dir, "assessments");
  const studiesDir = path.join(dir, "studies");
  const loadedLike = {
    history: loadList(path.join(dir, "history.yaml")),
    claims: loadList(path.join(dir, "claims.yaml")),
    assessmentRuns: fs.existsSync(assessmentsDir)
      ? fs
          .readdirSync(assessmentsDir)
          .filter((f) => f.endsWith(".yaml"))
          .map((f) =>
            parseYaml(fs.readFileSync(path.join(assessmentsDir, f), "utf8")),
          )
      : [],
    studies: fs.existsSync(studiesDir)
      ? fs
          .readdirSync(studiesDir)
          .filter((f) => f.endsWith(".yaml"))
          .map((f) =>
            parseYaml(fs.readFileSync(path.join(studiesDir, f), "utf8")),
          )
      : [],
  };
  const c = classifyCase(loadedLike, today);
  report.cases[slug] = { ...c, due: dueThisRun(c.band, today) };
}

const pad = (s, n) => String(s).padEnd(n);
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
