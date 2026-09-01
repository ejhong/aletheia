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

/** Titles already proposed for a case in ANY prior run: proposing is
 * once-only, and founder silence retires an idea (see the dedupe rule
 * in the system prompt and the validator backstop). */
function priorTitlesFor(slug) {
  const base = path.join(ROOT, "proposals", "agenda");
  const titles = new Set();
  if (!fs.existsSync(base)) return titles;
  for (const run of fs.readdirSync(base)) {
    const f = path.join(base, run, `${slug}.md`);
    if (!fs.existsSync(f)) continue;
    for (const m of fs.readFileSync(f, "utf8").matchAll(/^## \d+\. \[[a-z-]+\] (.+)$/gm))
      titles.add(m[1].trim());
  }
  return titles;
}

const report = [`## Agenda proposals (${date})`, ""];

if (!provider) {
  report.push("No LLM key configured — agenda generation skipped.");
  console.log(report.join("\n"));
  process.exit(0);
}

// Attention follows yield (docs/AUTOMATION.md): --only <slug,slug> limits
// this run to the cases the yield report marked due. Omitted or empty =
// all cases (local runs, and a safe default if the yield step failed).
const onlyArg = process.argv.indexOf("--only");
const only =
  onlyArg > -1 && (process.argv[onlyArg + 1] ?? "").trim().length > 0
    ? new Set(process.argv[onlyArg + 1].split(",").map((s) => s.trim()))
    : null;

const slugs = fs
  .readdirSync(CASES, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .filter((name) => {
    if (only && !only.has(name)) {
      console.error(`${name}: not due this run (yield band) — skipped`);
      return false;
    }
    return true;
  });

let wrote = 0;
for (const dirName of slugs) {
  const dir = path.join(CASES, dirName);
  // Directories can predate a case rename (geopolymer -> the
  // megalithic-casting slug); the published slug lives in case.yaml and
  // is what pages, links, and proposal filenames must key on.
  const caseFile = path.join(dir, "case.yaml");
  const slug = fs.existsSync(caseFile)
    ? (parseYaml(fs.readFileSync(caseFile, "utf8"))?.slug ?? dirName)
    : dirName;
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
  const priorTitles = priorTitlesFor(slug);
  let packet = buildCasePacket({ claims, research, studies, evidence });
  if (priorTitles.size > 0) {
    packet += "\n\nPREVIOUSLY PROPOSED (retired by editorial silence; do not re-propose):\n";
    packet += [...priorTitles].map((t) => `- ${t}`).join("\n");
  }

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
  const { ok, rejected } = validateProposals(parsed, knownIds, priorTitles);
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
