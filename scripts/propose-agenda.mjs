/**
 * Weekly agenda generation (maintenance step; see docs/MAINTENANCE.md and
 * the 2026-08-26 DECISIONS entry). One model call per live case asks the
 * question no other stage asks: what claim, research item, or study does
 * the current ledger imply that the case does not yet contain?
 *
 * Output is proposals/agenda/<date>-<runId>/<case>.md plus report.md —
 * proposals only, low-risk by construction, adopted (or ignored) by the
 * founder through the normal gates. Prints the output directory as the
 * last line (workflow convention). Exits 0 with a note when no LLM key
 * is configured: proposal generation is optional machinery.
 *
 * Usage: node scripts/propose-agenda.mjs [--provider anthropic|openai]
 */

import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { callWithRefusalFallback, parseJsonReply, pickProvider } from "./lib/llm.mjs";
import {
  PROPOSAL_SYSTEM,
  buildCasePacket,
  validateProposals,
  renderProposalFile,
} from "./lib/agenda-propose.mjs";

const ROOT = process.cwd();
const CASES = path.join(ROOT, "content", "cases");
const forced = process.argv.includes("--provider")
  ? process.argv[process.argv.indexOf("--provider") + 1]
  : undefined;

const provider = pickProvider(forced);
const date = new Date().toISOString().slice(0, 10);
const runId = `${date}-agenda-${process.env.GITHUB_RUN_ID ?? "local"}`;
const outdir = path.join(ROOT, "proposals", "agenda", runId);

function loadYamlList(dir, file) {
  const p = path.join(dir, file);
  if (!fs.existsSync(p)) return [];
  const parsed = parseYaml(fs.readFileSync(p, "utf8"));
  return Array.isArray(parsed) ? parsed : [];
}

const report = [`## Agenda proposals (${date})`, ""];

if (!provider) {
  report.push("No LLM key configured — agenda generation skipped.");
  console.log(report.join("\n"));
  process.exit(0);
}

const slugs = fs
  .readdirSync(CASES, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

let wrote = 0;
for (const slug of slugs) {
  const dir = path.join(CASES, slug);
  const claims = loadYamlList(dir, "claims.yaml");
  const research = loadYamlList(dir, "research.yaml");
  const evidence = loadYamlList(dir, "evidence.yaml");
  const studiesDir = path.join(dir, "studies");
  const studies = fs.existsSync(studiesDir)
    ? fs
        .readdirSync(studiesDir)
        .filter((f) => f.endsWith(".yaml"))
        .map((f) => parseYaml(fs.readFileSync(path.join(studiesDir, f), "utf8")))
    : [];
  if (claims.length === 0) continue;

  const knownIds = new Set(
    [...claims, ...research, ...evidence, ...studies].map((x) => x?.id).filter(Boolean),
  );
  const packet = buildCasePacket({ claims, research, studies, evidence });

  let parsed;
  let modelUsed = provider.model;
  try {
    const reply = await callWithRefusalFallback(provider, PROPOSAL_SYSTEM, packet);
    modelUsed = reply.model;
    if (reply.refused)
      report.push(`- ${slug}: primary model refused; proposals below are from ${reply.model}.`);
    parsed = parseJsonReply(reply.text);
  } catch (e) {
    report.push(`- ${slug}: model call failed (${String(e).slice(0, 120)}) — skipped, fail-closed.`);
    continue;
  }
  const { ok, rejected } = validateProposals(parsed, knownIds);
  for (const r of rejected)
    report.push(`- ${slug}: rejected malformed proposal (${r.reason}).`);
  if (ok.length === 0) {
    report.push(`- ${slug}: no new proposals — an empty answer is a fine answer.`);
    continue;
  }
  fs.mkdirSync(outdir, { recursive: true });
  fs.writeFileSync(
    path.join(outdir, `${slug}.md`),
    renderProposalFile(slug, ok, {
      date,
      runId,
      model: modelUsed,
      promptVersion: "agenda-propose-v1",
    }),
  );
  wrote += ok.length;
  for (const p of ok) report.push(`- ${slug}: proposed [${p.kind}] ${p.title}`);
}

if (wrote > 0) {
  fs.mkdirSync(outdir, { recursive: true });
  fs.writeFileSync(path.join(outdir, "report.md"), report.join("\n") + "\n");
}
console.log(report.join("\n"));
console.log(outdir);
