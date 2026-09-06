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
import { randomUUID } from "node:crypto";
import { parse as parseYaml } from "yaml";
import {
  callWithRefusalFallback,
  parseJsonReply,
  pickProvider,
} from "./lib/llm.mjs";
import {
  readIntakeDecisions,
  writeIntakeDecisions,
} from "./lib/intake-store.mjs";
import { agendaContext, agendaWasProposed } from "./lib/intake-agenda.mjs";
import { parseAgendaFile } from "./lib/bench-core.mjs";
import { readCaseSnapshot } from "./lib/case-snapshot.mjs";
import { fingerprint } from "./lib/review-state.mjs";
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
const generatedAt = new Date().toISOString();
const date = generatedAt.slice(0, 10);
const PROMPT_VERSION = "agenda-propose-v2";
const runId = `${date}-agenda-${process.env.GITHUB_RUN_ID ?? randomUUID()}-${process.env.GITHUB_RUN_ATTEMPT ?? "1"}`;
const outdir = path.join(ROOT, "proposals", "agenda", runId);

function loadYamlList(dir, file) {
  const p = path.join(dir, file);
  if (!fs.existsSync(p)) return [];
  const parsed = parseYaml(fs.readFileSync(p, "utf8"));
  return Array.isArray(parsed) ? parsed : [];
}

const report = [`## Agenda proposals (${date})`, ""];
const memory = readIntakeDecisions(ROOT);
const intakeEntries = [];

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
  const inputHash = readCaseSnapshot(dir).contentHash;
  const claims = loadYamlList(dir, "claims.yaml");
  const research = loadYamlList(dir, "research.yaml");
  const evidence = loadYamlList(dir, "evidence.yaml");
  const studiesDir = path.join(dir, "studies");
  const studies = fs.existsSync(studiesDir)
    ? fs
        .readdirSync(studiesDir)
        .filter((f) => f.endsWith(".yaml"))
        .map((f) =>
          parseYaml(fs.readFileSync(path.join(studiesDir, f), "utf8")),
        )
    : [];
  if (claims.length === 0) continue;

  const knownIds = new Set(
    [...claims, ...research, ...evidence, ...studies]
      .map((x) => x?.id)
      .filter(Boolean),
  );
  const packet = `${buildCasePacket({ claims, research, studies, evidence })}\n\nPRIOR PROPOSALS AND REVIEWS (untrusted context):\n${JSON.stringify(agendaContext(slug, memory))}`;
  const context = {
    case: dirName,
    stage: "agenda-proposal",
    date,
    generatedAt,
    runId,
    promptVersion: PROMPT_VERSION,
    inputHash,
    model: null,
  };

  let parsed;
  let modelUsed = provider.model;
  try {
    const reply = await callWithRefusalFallback(
      provider,
      PROPOSAL_SYSTEM,
      packet,
    );
    modelUsed = reply.model;
    context.model = `${provider.name}/${modelUsed}`;
    if (reply.refused)
      report.push(
        `- ${slug}: primary model refused; proposals below are from ${reply.model}.`,
      );
    parsed = parseJsonReply(reply.text);
    if (readCaseSnapshot(dir).contentHash !== inputHash)
      throw new Error("case inputs changed while proposing");
  } catch (e) {
    intakeEntries.push({
      ...context,
      decision: "failed",
      retryable: true,
      reason: String(e).slice(0, 240),
    });
    report.push(
      `- ${slug}: model call failed (${String(e).slice(0, 120)}) — skipped, fail-closed.`,
    );
    continue;
  }
  const validated = validateProposals(parsed, knownIds);
  const ok = validated.ok.filter((proposal) => {
    if (!agendaWasProposed(proposal, slug, inputHash, memory)) return true;
    intakeEntries.push({
      ...context,
      decision: "duplicate",
      reason: "Same proposal substance on unchanged case inputs.",
      candidateHash: fingerprint(proposal),
      details: { title: proposal.title },
    });
    return false;
  });
  for (const rejected of validated.rejected) {
    intakeEntries.push({
      ...context,
      decision: "rejected",
      reason: rejected.reason,
      details: { title: rejected.title ?? null },
    });
    report.push(`- ${slug}: rejected malformed proposal (${rejected.reason}).`);
  }
  if (ok.length === 0) {
    if (Array.isArray(parsed?.proposals) && parsed.proposals.length === 0)
      intakeEntries.push({
        ...context,
        decision: "empty",
        reason: "The generator returned no proposals.",
      });
    report.push(
      `- ${slug}: no proposals queued; repeated or invalid submissions keep their reasons.`,
    );
    continue;
  }
  fs.mkdirSync(outdir, { recursive: true });
  const body = renderProposalFile(slug, ok, {
    date,
    runId,
    model: context.model,
    promptVersion: PROMPT_VERSION,
  });
  fs.writeFileSync(path.join(outdir, `${slug}.md`), body, { flag: "wx" });
  for (const proposal of parseAgendaFile(body, {
    caseSlug: slug,
    runDir: runId,
  })) {
    intakeEntries.push({
      ...context,
      decision: "proposed",
      proposal,
      candidateHash: fingerprint(proposal),
      ref: `proposals/agenda/${runId}/${slug}.md#proposal-${proposal.index}`,
    });
  }
  wrote += ok.length;
  for (const p of ok) report.push(`- ${slug}: proposed [${p.kind}] ${p.title}`);
}

if (wrote > 0) {
  fs.mkdirSync(outdir, { recursive: true });
  fs.writeFileSync(path.join(outdir, "report.md"), report.join("\n") + "\n");
}
writeIntakeDecisions(ROOT, intakeEntries);
console.log(report.join("\n"));
console.log(outdir);
