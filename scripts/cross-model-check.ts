#!/usr/bin/env node
/**
 * Cross-model check — independent blind re-assessment of one case.
 *
 * Usage:
 *   node scripts/cross-model-check.ts <case-slug-or-dir> [--vendors anthropic,openai,gemini,xai,venice] [--dry-run]
 *
 * For each configured vendor with an API key present, sends the BLIND
 * packet — the ledger only: case identity, claims (propositions with
 * anchors; they carry no grades), evidence, sources, research — with the
 * standard judge instructions. Deliberately excluded: every assessment, the
 * editions (article and selection), and the history, so every judge is
 * blind. The reply is validated fail-closed against the site's own
 * AssessmentRunSchema and written as an append-only overlay:
 *
 *   content/cases/<dir>/assessments/<date>-check-<vendor>-<HHMMSS>.yaml
 *
 * with `role: check` and `basis.ledgerHash` — the hash of the ledger it
 * judged, so staleness is a hash, not a date (src/domain/load.ts).
 * Check runs never narrate; the concurrence panel summarizes how far they
 * agree with the adopted assessment. A reply that does not parse, misses a
 * featured claim, or uses bad tokens is written to
 * proposals/cross-model-failures/ and NOT installed.
 *
 * Keys: ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, XAI_API_KEY,
 * VENICE_API_KEY (seat table: scripts/lib/vendors.mjs).
 */
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { currentEdition, loadAllCases } from "../src/domain/load.ts";
import { AssessmentRunSchema, type AssessmentRun } from "../src/domain/schema.ts";
import { overlayRunId } from "./lib/overlay-ids.mjs";
import { VENDORS as SEAT_TABLE, callVendor } from "./lib/vendors.mjs";

type Seat = { key: () => string | undefined; model: string; label: string; tag: string };
const VENDORS = SEAT_TABLE as Record<string, Seat>;

const ROOT = process.cwd();
const args = process.argv.slice(2);
const key = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");
const vendorArg = args.includes("--vendors")
  ? args[args.indexOf("--vendors") + 1].split(",")
  : ["anthropic", "openai", "gemini", "xai", "venice"];

if (!key) {
  console.error(
    "usage: node scripts/cross-model-check.ts <case> [--vendors a,b] [--dry-run]",
  );
  process.exit(1);
}
const loaded = loadAllCases().find((c) => c.record.slug === key || c.dir === key);
if (!loaded) {
  console.error(`no case with slug or directory ${key}`);
  process.exit(1);
}
const caseDir = path.join(ROOT, "content", "cases", loaded.dir);

const VERDICTS = [
  "established",
  "well_supported",
  "provisionally_supported",
  "mixed",
  "weakly_supported",
  "contradicted",
  "unresolved",
  "presently_untestable",
];

// ---------------------------------------------------------------- packet
// The ledger files verbatim — no assessments, no editions, no history.
const read = (f: string) => fs.readFileSync(path.join(caseDir, f), "utf8");
const packetFiles = ["case.yaml", "claims.yaml", "evidence.yaml", "sources.yaml", "research.yaml"];
const packet = packetFiles
  .map((f) => `===== FILE: ${f} =====\n${read(f)}`)
  .join("\n\n");

const featuredIds = currentEdition(loaded).featuredClaimIds;
const caseRecord = loaded.record;
const today = new Date().toISOString().slice(0, 10);

const PROMPT_VERSION = "aletheia-check-v4"; // v4: blind packet is the ledger only; basis hash recorded

const instructions = `You are an independent scientific assessor for Aletheia, a public evidence ledger for contested hypotheses. You have the complete ledger for "${caseRecord.title}" — case identity, atomic claims, evidence records, source records, and research agenda. You have deliberately NOT been shown any prior assessment, any article, or which claims the site currently features.

Your task: produce one complete assessment run over this case, as YAML, in exactly the schema below.

Assessment rules:
1. Weigh ONLY the evidence records provided. No browsing or outside results. General scientific background may calibrate plausibility, but wherever a verdict leans on priors rather than the evidence records, say so in the reasoning.
2. Distinguish each claim's local truth from what it implies for the featured hypothesis; assess the claim as stated.
3. Consensus is not proof; outsider status is not evidence. Mechanisms, measurements, and replications count — paper counts and prestige do not.
4. Choose the verdict the evidence warrants, including strong verdicts in either direction. "unresolved" and "mixed" are substantive findings requiring justification, not safe defaults.
5. Steelman both directions in the synthesis.
6. Sensitivity: name the single evidence record whose removal would most change your case verdict, and state whether the verdict survives without it — a verdict hanging on one thread must say so.
7. Steelman (required): in caseAssessment.steelman, state the strongest argument FOR the featured hypothesis that your assessment does NOT answer — the specific unexplained observation, unrebutted argument, or untested prediction a proponent would rightly point to. A limitations disclosure, not a rebuttal: it never changes your verdict, and "some people disagree" is a failing answer.
8. Never fabricate results, papers, or numbers.

Verdict vocabulary (exact tokens): ${VERDICTS.join(" | ")}
Confidence tokens: high | moderate | low

Output RAW YAML ONLY — no markdown fences, no commentary. You are operating autonomously in a pipeline: your reply IS the YAML document. Begin your response directly with the runId line. Produce the complete document in this single response. Use block scalars (>-) for all prose fields. Schema:

runId: "${today}-check-<TAG>"
model: "<MODEL_LABEL>"
date: "${today}"
promptVersion: "${PROMPT_VERSION}"
humanReviewed: false
role: check
caseAssessment:
  verdict: <token>
  loadBearing: [<claim ids>]
  weakestLinks: [<claim ids>]
  synthesis: >-
    <argued structural roll-up, at least 250 words>
  steelman: >-
    <the strongest argument for the featured hypothesis this assessment
    does not answer — at least 40 characters, specific, no hedging>
claimAssessments:
  - claimId: <id>
    verdict: <token>
    confidence: <token>
    reasoning: >-
      <2-6 sentences; name the strongest opposing consideration>

claimAssessments MUST contain one entry for EVERY one of these ${featuredIds.length} claims, in this order: ${featuredIds.join(", ")}. Only reference claim ids from that list in loadBearing and weakestLinks.`;

// ----------------------------------------------------------------- calls
async function callSeat(name: string): Promise<string> {
  const cfg = VENDORS[name];
  const userMsg = `RUN HEADER:\n  TAG: ${cfg.tag}\n  MODEL_LABEL: ${cfg.label}, independent check run\n\nCASE FILE FOLLOWS:\n\n${packet}`;
  const text: string = await callVendor(name, {
    system: instructions,
    user: userMsg,
    maxTokens: 64000,
    timeoutMs: 1800_000,
  });
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.split("\n").slice(1).join("\n");
    const fence = t.lastIndexOf("```");
    if (fence >= 0) t = t.slice(0, fence);
  }
  return t.trim();
}

/** Parse a reply, tolerating up to five trailing non-YAML lines (observed vendor footers). */
function parseYamlReply(yamlText: string): unknown {
  const lines = yamlText.split("\n");
  let lastErr: unknown;
  for (let drop = 0; drop <= Math.min(5, lines.length - 1); drop++) {
    try {
      return parseYaml(lines.slice(0, lines.length - drop).join("\n"));
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

/**
 * Validate fail-closed: the site's own schema first, then the packet
 * contract (every featured claim graded, nothing else referenced).
 */
function validate(vendor: string, yamlText: string): { run: AssessmentRun | null; problems: string[] } {
  const raw = parseYamlReply(yamlText) as Record<string, unknown>;
  const problems: string[] = [];
  // Stamp the fields the pipeline owns before schema validation.
  const stamped = {
    ...raw,
    runId: overlayRunId([today, "check", VENDORS[vendor].tag], {
      exists: (id: string) => fs.existsSync(path.join(caseDir, "assessments", `${id}.yaml`)),
    }),
    date: today,
    promptVersion: PROMPT_VERSION,
    humanReviewed: false,
    role: "check",
    model: `${VENDORS[vendor].label} — independent check run via ${VENDORS[vendor].model}`,
    basis: { ledgerHash: loaded!.ledgerHash },
  };
  const parsed = AssessmentRunSchema.safeParse(stamped);
  if (!parsed.success) {
    return { run: null, problems: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  }
  const run = parsed.data;
  const seen = new Set(run.claimAssessments.map((ca) => ca.claimId));
  const missing = featuredIds.filter((id) => !seen.has(id));
  if (missing.length) problems.push(`missing claims: ${missing.join(",")}`);
  for (const ca of run.claimAssessments) {
    if (!featuredIds.includes(ca.claimId)) problems.push(`unknown claim ${ca.claimId}`);
  }
  for (const id of [...run.caseAssessment.loadBearing, ...run.caseAssessment.weakestLinks]) {
    if (!featuredIds.includes(id)) problems.push(`roll-up references unknown claim ${id}`);
  }
  if (!run.caseAssessment.steelman) problems.push("steelman missing (the counterweight is required)");
  return { run, problems };
}

// ------------------------------------------------------------------ main
async function main() {
  const active = vendorArg.filter((v) => VENDORS[v]?.key());
  const skipped = vendorArg.filter((v) => VENDORS[v] && !VENDORS[v].key());
  if (skipped.length) console.error(`no key, skipping: ${skipped.join(", ")}`);
  if (active.length === 0) {
    console.error("no vendor keys available — nothing to run");
    process.exit(1);
  }
  console.error(
    `cross-model check: ${loaded!.record.slug} → ${active.length} vendor(s): ${active.join(", ")} (${featuredIds.length} featured claims, ledger ${loaded!.ledgerHash.slice(0, 12)})`,
  );
  if (dryRun) {
    console.log(`(dry run: would call ${active.join(", ")}; no API calls made)`);
    return;
  }

  const results = await Promise.allSettled(
    active.map(async (v) => ({ vendor: v, text: await callSeat(v) })),
  );

  const failDir = path.join(ROOT, "proposals", "cross-model-failures", `${today}-${loaded!.dir}`);
  const installed: string[] = [];
  const failed: string[] = [];
  for (const r of results) {
    if (r.status === "rejected") {
      failed.push(String(r.reason).slice(0, 200));
      continue;
    }
    const { vendor, text } = r.value;
    let outcome: { run: AssessmentRun | null; problems: string[] };
    try {
      outcome = validate(vendor, text);
    } catch (e) {
      outcome = { run: null, problems: [`YAML parse failure: ${(e as Error).message}`] };
    }
    if (!outcome.run || outcome.problems.length) {
      fs.mkdirSync(failDir, { recursive: true });
      fs.writeFileSync(path.join(failDir, `${vendor}.yaml`), text);
      fs.writeFileSync(path.join(failDir, `${vendor}.problems.txt`), outcome.problems.join("\n"));
      failed.push(`${vendor}: ${outcome.problems.join("; ")}`);
      continue;
    }
    const run = outcome.run;
    const file = path.join(caseDir, "assessments", `${run.runId}.yaml`);
    const header = `# Cross-model check run — an independent judge (${VENDORS[vendor].label}),\n# blind to all prior assessments and to the editions (scripts/cross-model-check.ts,\n# promptVersion ${PROMPT_VERSION}). role: check — never displayed as the case\n# narrative; feeds the concurrence panel. basis.ledgerHash is the ledger it\n# judged. Append-only; NOT human reviewed.\n`;
    fs.writeFileSync(file, header + stringifyYaml(run));
    installed.push(path.relative(ROOT, file));
  }

  console.error(`\ninstalled ${installed.length} check run(s):`);
  for (const f of installed) console.error(`  ${f}`);
  if (failed.length) {
    console.error(`failed (${failed.length}) — raw replies under ${path.relative(ROOT, failDir)}/:`);
    for (const f of failed) console.error(`  ${f}`);
  }
  if (installed.length === 0) process.exit(1);
  console.log(installed.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
