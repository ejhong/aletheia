#!/usr/bin/env node
/**
 * aletheia — the one CLI (docs/AUTOMATION.md, "The verbs").
 *
 *   node scripts/aletheia.ts status [case]
 *   node scripts/aletheia.ts diff <case> <candidates.yaml|json>
 *   node scripts/aletheia.ts migrate-memory [--dry-run]
 *
 *   node scripts/aletheia.ts report <case> [--seat anthropic|openai] [--dry-run] [--reconsider "why"]   (default seat and models: config/models.yaml)
 *   node scripts/aletheia.ts draft <reportRunId> [--dry-run]
 *   node scripts/aletheia.ts verify <proposalRunId> [--dry-run]
 *   node scripts/aletheia.ts edition <case> [--dry-run] [--force]
 *   node scripts/aletheia.ts check <case> [--seats a,b] [--dry-run]   the blind panel, every roster seat with a key
 *   node scripts/aletheia.ts inbox <case> [--dry-run]         the founder's door as a producer: dropped items → one report the draft verb consumes
 *   node scripts/aletheia.ts next [--run]                      what the ledger wants done next (and, with --run, do it through the chain)
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
import { findCase } from "../src/domain/load.ts";
import { migrateMemory } from "../src/pipeline/migrate-memory.ts";
import { allStatus, renderStatusTable } from "../src/pipeline/status.ts";
import { DEFAULT_SEAT, runReport } from "../src/pipeline/report.ts";
import { runDraft } from "../src/pipeline/draft.ts";
import { runVerify } from "../src/pipeline/verify.ts";
import { runEdition } from "../src/pipeline/edition.ts";
import { runCheck } from "../src/pipeline/check.ts";
import { runNext } from "../src/pipeline/next.ts";
import { runInbox } from "../src/pipeline/inbox.ts";

const [verb, ...rest] = process.argv.slice(2);
const flagNames = new Set(["--seat", "--seats", "--reconsider"]);
const flags = new Set<string>();
const args: string[] = [];
const values: Record<string, string> = {};
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (flagNames.has(a)) values[a] = rest[++i] ?? "";
  else if (a.startsWith("--")) flags.add(a);
  else args.push(a);
}
const flagValue = (name: string) => values[name];


await (async () => {
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
  case "inbox": {
    const [key] = args;
    if (!key) {
      console.error("usage: aletheia inbox <case> [--dry-run]");
      process.exit(1);
    }
    const r = await runInbox(key, { dryRun: flags.has("--dry-run") });
    console.log(JSON.stringify(r, null, 2));
    if (r.outcome === "failed") process.exit(1);
    break;
  }
  case "next": {
    const r = await runNext({ run: flags.has("--run") });
    console.log(JSON.stringify(r, null, 2));
    if (r.ran.some((s) => s.outcome.outcome === "failed")) process.exit(1);
    break;
  }
  case "check": {
    const [key] = args;
    if (!key) {
      console.error("usage: aletheia check <case> [--seats anthropic,openai,gemini,xai,venice] [--dry-run]");
      process.exit(1);
    }
    const seats = flagValue("--seats")?.split(",").map((s) => s.trim()).filter(Boolean);
    const r = await runCheck(key, { seats, dryRun: flags.has("--dry-run") });
    console.log(JSON.stringify(r, null, 2));
    if (r.outcome === "failed") process.exit(1);
    break;
  }
  case "panel":
    console.error("panel runs live in scripts/arbiter.mjs until step 3b folds them in.");
    process.exit(2);
    break;
  case "report": {
    const [key] = args;
    const seat = (flagValue("--seat") ?? DEFAULT_SEAT) as "openai" | "anthropic";
    if (!key || !["openai", "anthropic"].includes(seat)) {
      console.error('usage: aletheia report <case> [--seat openai|anthropic] [--dry-run] [--reconsider "why"]');
      process.exit(1);
    }
    const r = await runReport(key, { seat, dryRun: flags.has("--dry-run"), reconsider: flagValue("--reconsider") });
    console.log(JSON.stringify(r, null, 2));
    if (r.outcome === "failed") process.exit(1);
    break;
  }
  case "draft": {
    const [reportRunId] = args;
    if (!reportRunId) {
      console.error("usage: aletheia draft <reportRunId> [--dry-run]");
      process.exit(1);
    }
    const r = await runDraft(reportRunId, { dryRun: flags.has("--dry-run") });
    console.log(JSON.stringify(r, null, 2));
    if (r.outcome === "failed") process.exit(1);
    break;
  }
  case "verify": {
    const [proposalRunId] = args;
    if (!proposalRunId) {
      console.error("usage: aletheia verify <proposalRunId> [--dry-run]");
      process.exit(1);
    }
    const r = await runVerify(proposalRunId, { dryRun: flags.has("--dry-run") });
    console.log(JSON.stringify(r, null, 2));
    if (r.outcome === "failed") process.exit(1);
    if (r.outcome === "completed") console.error("records written to the working tree — review, then open the PR the panel judges");
    break;
  }
  case "edition": {
    const [key] = args;
    if (!key) {
      console.error("usage: aletheia edition <case> [--dry-run] [--force]");
      process.exit(1);
    }
    const r = await runEdition(key, { dryRun: flags.has("--dry-run"), force: flags.has("--force") });
    console.log(JSON.stringify(r, null, 2));
    if (r.outcome === "failed") process.exit(1);
    if (r.outcome === "completed") console.error("edition candidate written to the working tree — the panel judges it against the incumbent in the PR");
    break;
  }
  default:
    console.error(
      "usage: aletheia <status [case] | diff <case> <candidates> | migrate-memory [--dry-run] | report | draft | verify | edition | check | panel>",
    );
    process.exit(1);
}
})();
