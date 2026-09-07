#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { draftEdition, editionPlan } from "./lib/edition-drafting.ts";
import { fingerprint } from "./lib/review-state.mjs";

const args = process.argv.slice(2);
const root = process.cwd();
let key: string | undefined;
let scan = false, dryRun = false, prepare = false;
let reconsider: string | undefined;
let reuseDraftsFrom: string | undefined;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--scan") scan = true;
  else if (args[i] === "--dry-run") dryRun = true;
  else if (args[i] === "--prepare") prepare = true;
  else if (args[i] === "--reconsider" && args[i + 1]) reconsider = args[++i];
  else if (args[i] === "--reuse-drafts" && args[i + 1]) reuseDraftsFrom = args[++i];
  else if (!args[i].startsWith("-") && !key) key = args[i];
  else throw new Error(`Unknown edition argument: ${args[i]}`);
}
if ((!scan && !key) || (scan && (key || reconsider || reuseDraftsFrom)) || (reuseDraftsFrom && !reconsider))
  throw new Error("Usage: node scripts/draft-editions.ts <case>|--scan [--dry-run] [--prepare] [--reconsider 'specific reason' [--reuse-drafts prior-cycle-id]]");

const keys = key ? [key] : fs.readdirSync(path.join(root, "content/cases"), { withFileTypes: true })
  .filter(d => d.isDirectory()).map(d => d.name).sort();
for (const candidate of keys) {
  const plan = editionPlan(root, candidate, undefined, reconsider);
  if (dryRun) {
    console.log(JSON.stringify({ case: plan.case, due: plan.due, reason: plan.reason }));
    continue;
  }
  const ready = plan.prior?.outcome === "proposed" && plan.prior.rulesHash === plan.rules &&
    fingerprint(plan.prior.basis) === fingerprint(plan.basis);
  if (scan && !plan.due && !ready) continue;
  // One case per scheduled run. Calls use the same global allowance as intake,
  // independent review, the operator and image generation.
  const report = await draftEdition(root, candidate, { prepare, reconsider, reuseDraftsFrom }, { progress: console.error });
  console.log(JSON.stringify(report, null, 2));
  break;
}
