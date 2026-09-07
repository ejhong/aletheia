#!/usr/bin/env node
import { parseArgs } from "node:util";
import { AI_POLICY } from "./lib/ai-policy.mjs";
import { discoverSources, discoveryStatus } from "./lib/discovery.ts";

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  "dry-run": { type: "boolean" }, scan: { type: "boolean" }, reconsider: { type: "string" }, json: { type: "boolean" },
} });
if ((!values.scan && positionals.length !== 1) || (values.scan && (positionals.length || values.reconsider)))
  throw new Error("Usage: node scripts/discover-sources.ts <case> [--dry-run] [--reconsider 'reason'] OR --scan [--dry-run]");
const root = process.cwd();
const cases = values.scan ? AI_POLICY.discovery?.cases ?? [] : positionals;
for (const key of cases) {
  const status = discoveryStatus(root, key, undefined, values.reconsider);
  console.error(`${key}: ${status.reason}`);
  if (values["dry-run"]) continue;
  if (!status.due && status.prior?.outcome !== "queued") continue;
  const result = await discoverSources(root, key, { reconsider: values.reconsider });
  console.log(JSON.stringify(values.json ? result : { case: result.case, outcome: result.outcome,
    reason: result.reason, ...("plan" in result ? { runId: result.runId, question: result.plan?.question,
      searchCalls: result.searches.length, selected: result.selected?.leads.map(l => ({ ...l, source: result.sources[l.index] })) } : {}) }, null, 2));
  if (result.outcome !== "rested") break; // one case per scheduled run
}
