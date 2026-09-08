#!/usr/bin/env node
/**
 * aletheia — the one CLI (docs/AUTOMATION.md, "The verbs").
 *
 *   node scripts/aletheia.ts status [case]
 *   node scripts/aletheia.ts diff <case> <candidates.yaml|json>
 *   node scripts/aletheia.ts migrate-memory [--dry-run]
 *
 *   node scripts/aletheia.ts report|draft|verify|edition <…>   (build step 3b)
 *   node scripts/aletheia.ts check <case>                      → scripts/cross-model-check.ts
 *   node scripts/aletheia.ts panel <pr>                        → scripts/arbiter.mjs
 *
 * Every verb is one module under src/pipeline/ sharing four services — the
 * packet builder, the coverage diff, the model transport with the spend
 * ledger inside it, and the intake store. This file only dispatches.
 */
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { coverageDiff, type Candidate } from "../src/domain/coverage.ts";
import { loadAllCases } from "../src/domain/load.ts";
import { migrateMemory } from "../src/pipeline/migrate-memory.ts";
import { allStatus, renderStatusTable } from "../src/pipeline/status.ts";

const [verb, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith("--")));
const args = rest.filter((a) => !a.startsWith("--"));

function findCase(key: string) {
  const loaded = loadAllCases().find((c) => c.record.slug === key || c.dir === key);
  if (!loaded) {
    console.error(`no case with slug or directory "${key}"`);
    process.exit(1);
  }
  return loaded;
}

switch (verb) {
  case "status": {
    const rows = allStatus(args[0]);
    console.error(renderStatusTable(rows));
    console.log(JSON.stringify(rows, null, 2));
    break;
  }
  case "diff": {
    const [key, file] = args;
    if (!key || !file) {
      console.error("usage: aletheia diff <case> <candidates.yaml|json>");
      process.exit(1);
    }
    const loaded = findCase(key);
    const raw = parseYaml(fs.readFileSync(path.resolve(file), "utf8")) as Candidate[];
    if (!Array.isArray(raw)) {
      console.error("candidates file must be a list of {kind, title|statement, doi|arxivId|url|identifier}");
      process.exit(1);
    }
    const result = coverageDiff(raw, loaded);
    console.error(
      `${loaded.record.slug}: ${raw.length} candidates → ${result.novel.length} novel, ${result.seen.length} seen, ${result.probable.length} probable; ${result.declined.length} currently declined`,
    );
    for (const s of result.seen)
      console.error(`  seen     ${s.key}  ←  ${s.via === "ledger" ? s.record : `${s.disposition?.disposition} (${s.disposition?.date})`}`);
    for (const p of result.probable)
      console.error(`  probable ${p.candidate.title ?? p.candidate.statement}  ~  ${p.matches.map((m) => `${m.id} ${m.score}`).join(", ")}`);
    for (const n of result.novel) console.error(`  novel    ${n.title ?? n.statement ?? n.url}`);
    console.log(JSON.stringify(result, null, 2));
    break;
  }
  case "migrate-memory": {
    const report = migrateMemory({ dryRun: flags.has("--dry-run") });
    console.log(report.join("\n"));
    break;
  }
  case "check":
    console.error("check runs live in scripts/cross-model-check.ts until step 3b folds them in:\n  node scripts/cross-model-check.ts <case> [--vendors …] [--dry-run]");
    process.exit(2);
    break;
  case "panel":
    console.error("panel runs live in scripts/arbiter.mjs until step 3b folds them in.");
    process.exit(2);
    break;
  case "report":
  case "draft":
  case "verify":
  case "edition":
    console.error(`${verb}: build step 3b — protocol committed (protocols/${verb}-v1.md), verb not yet built.`);
    process.exit(2);
    break;
  default:
    console.error(
      "usage: aletheia <status [case] | diff <case> <candidates> | migrate-memory [--dry-run] | report | draft | verify | edition | check | panel>",
    );
    process.exit(1);
}
