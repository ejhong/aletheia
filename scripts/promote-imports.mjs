#!/usr/bin/env node
/** The existing promotion job now reads the common source queue, then prepares
 * complete research bundles for a normal gated PR. Never commits or publishes. */
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { sourceQueue } from "./lib/source-queue.ts";
import { MAX_RESEARCH_SOURCES, researchSources } from "./lib/source-research.ts";
import { prepareResearchAdoptions } from "./lib/research-adoption.ts";

const { values } = parseArgs({ options: {
  "dry-run": { type: "boolean" }, limit: { type: "string" },
} });
const limit = values.limit === undefined ? MAX_RESEARCH_SOURCES : Number(values.limit);
if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RESEARCH_SOURCES)
  throw new Error(`--limit must be between 1 and ${MAX_RESEARCH_SOURCES}; the shared source-pass budget is unchanged`);
const root = process.cwd();
const generatedAt = new Date().toISOString();
const runId = `promote-${generatedAt.slice(0, 10)}-${randomUUID()}`;
const queue = sourceQueue(root);
for (const issue of queue.issues) console.error(issue);
const selected = queue.requests.slice(0, limit);
console.error(`${queue.requests.length} queued source request(s); ${selected.length} selected for one bounded pass.`);
if (values["dry-run"]) {
  for (const request of selected) console.error(`would read ${request.case}: ${request.url} (${request.ref})`);
} else if (selected.length) {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is required for the bounded reader; requests remain queued. No fallback or source verification is invented.");
  } else {
    const report = await researchSources(root, selected);
    console.error(`source pass ${report.runId}: ${report.decision}; ${report.proposedRecords} proposed records; accounted $${report.budget.accountedUsd.toFixed(4)}.`);
  }
}
const adoption = prepareResearchAdoptions(root, { runId, generatedAt }, Boolean(values["dry-run"]));
for (const result of adoption.outcomes) console.error(`${result.case}: ${result.decision} — ${result.reason}`);
console.log(values["dry-run"] ? "0" : String(adoption.prepared));
