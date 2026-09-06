#!/usr/bin/env node
/**
 * Cross-model check — independent blind re-assessment of one case.
 *
 * Usage:
 *   node scripts/cross-model-check.mjs <case-slug> [--vendors anthropic,openai,gemini,xai] [--dry-run]
 *
 * For each configured vendor with an API key present, sends an evidence
 * packet built by case-snapshot.mjs, excluding the article, prior
 * assessments, stored credibility/importance/strength grades, and history,
 * and writes the returned assessment as an ordinary append-only overlay:
 *
 *   content/cases/<case>/assessments/<date>-check-<vendor>.yaml
 *
 * with `role: check`. Check runs never display as the case narrative;
 * the site's concurrence panel (CrossModelPanel) summarizes how far they
 * agree with the displayed assessment, and each claim page lists their
 * per-claim verdicts. Validation is fail-closed: a reply that does not
 * parse, misses claims, or uses bad verdict tokens is written to
 * proposals/cross-model-failures/ for inspection and NOT installed.
 *
 * Keys: ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, XAI_API_KEY,
 * VENICE_API_KEY (the seat table is scripts/lib/vendors.mjs). Vendors
 * without a key are skipped with a note. Costs are one long
 * completion per vendor (typically a few dollars per case total).
 */
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { overlayRunId } from "./lib/overlay-ids.mjs";
import { readCaseSnapshot, evidencePacket } from "./lib/case-snapshot.mjs";
import {
  assessmentHash,
  fingerprint,
  latestDraft,
} from "./lib/review-state.mjs";
import { VENDORS, callVendor } from "./lib/vendors.mjs";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");
const vendorArg = args.includes("--vendors")
  ? args[args.indexOf("--vendors") + 1].split(",")
  : ["anthropic", "openai", "gemini", "xai", "venice"];

if (!slug) {
  console.error(
    "usage: node scripts/cross-model-check.mjs <case-slug> [--vendors a,b] [--dry-run]",
  );
  process.exit(1);
}
const caseDir = path.join(ROOT, "content", "cases", slug);
if (!fs.existsSync(path.join(caseDir, "case.yaml"))) {
  console.error(`no case at content/cases/${slug}/case.yaml`);
  process.exit(1);
}

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

const snapshot = readCaseSnapshot(caseDir);
const blind = evidencePacket(snapshot.files);
const packet = JSON.stringify(blind, null, 2);
const featuredIds = blind.assessClaimIds;
const caseRecord = parseYaml(snapshot.files["case.yaml"]);
const readDraft = () => {
  const dir = path.join(caseDir, "assessments");
  return latestDraft(
    (fs.existsSync(dir) ? fs.readdirSync(dir) : [])
      .filter((f) => f.endsWith(".yaml"))
      .map((f) => parseYaml(fs.readFileSync(path.join(dir, f), "utf8"))),
  );
};
// This reference is stamped by the runner, NEVER sent to the blind assessor.
const targetDraft = readDraft();
const receipt = targetDraft
  ? {
      protocol: "case-snapshot-v1",
      contentHash: snapshot.contentHash,
      assessmentHash: assessmentHash(targetDraft),
      packetHash: fingerprint(blind),
    }
  : null;

const PROMPT_VERSION = "aletheia-check-v4"; // v4: blind evidence packet and exact input receipt

const instructions = `You are an independent scientific assessor for Aletheia, a public evidence ledger for contested hypotheses. You have the recorded evidence for "${caseRecord.title}" — atomic claims, observations, source records, research agenda, and studies. You have NOT been shown the article, stored credibility/importance/strength grades, or any prior assessment. This is an assessment of the supplied record, not independent verification of the source documents. Evidence directions and inferences are editorial interpretations: question them, distinguish them from source statements, and account for shared sources and samples.

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

Output RAW YAML ONLY — no markdown fences, no commentary. You are operating autonomously in a pipeline: your reply IS the YAML document. Begin your response directly with the runId line — never with a statement of intent like "Let me work through this". Produce the complete document in this single response. Use block scalars (>-) for all prose fields. Schema:

runId: "${new Date().toISOString().slice(0, 10)}-check-<TAG>"
model: "<MODEL_LABEL>"
date: "${new Date().toISOString().slice(0, 10)}"
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

// PANEL SEAT — the seat table and HTTP path live in scripts/lib/vendors.mjs
// (one table for the arbiter, the check, and the bench), where the refusal
// fallback is banned: a refusing seat is a FAILED seat, never a swapped one.
async function callSeat(name) {
  const cfg = VENDORS[name];
  const userMsg = `RUN HEADER:\n  TAG: ${cfg.tag}\n  MODEL_LABEL: ${cfg.label}, independent check run\n\nCASE FILE FOLLOWS:\n\n${packet}`;
  // Long output: a 14-claim case ran one claim past 32k on Opus. Long
  // deadline: a full blind assessment at pinned effort can take many minutes.
  const text = await callVendor(name, {
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

/**
 * Parse a model's YAML reply, tolerating trailing non-YAML junk. Some
 * replies arrive with a stray footer line after the document (observed
 * twice from the Anthropic vendor on ccc: a "Refusal: … Bias: …" scoring
 * line that is not part of the assessment) — a top-level line like that
 * breaks the whole parse and quarantines an otherwise valid run. Strategy:
 * parse as-is; on failure, drop trailing lines one at a time (up to 5) and
 * retry. Content is never modified above the failure point, and a reply
 * that is genuinely malformed still fails closed.
 */
function parseYamlReply(yamlText) {
  const lines = yamlText.split("\n");
  let lastErr;
  for (let drop = 0; drop <= Math.min(5, lines.length - 1); drop++) {
    try {
      return parseYaml(lines.slice(0, lines.length - drop).join("\n"));
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

function validate(name, yamlText) {
  const d = parseYamlReply(yamlText);
  const problems = [];
  if (d.role !== "check") problems.push("role is not 'check'");
  if (!VERDICTS.includes(d.caseAssessment?.verdict))
    problems.push(`bad case verdict: ${d.caseAssessment?.verdict}`);
  const seen = new Set((d.claimAssessments ?? []).map((ca) => ca.claimId));
  if (seen.size !== (d.claimAssessments ?? []).length)
    problems.push("duplicate claim assessments");
  const missing = featuredIds.filter((id) => !seen.has(id));
  if (missing.length) problems.push(`missing claims: ${missing.join(",")}`);
  for (const ca of d.claimAssessments ?? []) {
    if (!featuredIds.includes(ca.claimId))
      problems.push(`unknown claim ${ca.claimId}`);
    if (!VERDICTS.includes(ca.verdict))
      problems.push(`bad verdict ${ca.claimId}=${ca.verdict}`);
    if (!["high", "moderate", "low"].includes(ca.confidence))
      problems.push(`bad confidence ${ca.claimId}=${ca.confidence}`);
  }
  for (const id of [
    ...(d.caseAssessment?.loadBearing ?? []),
    ...(d.caseAssessment?.weakestLinks ?? []),
  ]) {
    if (!featuredIds.includes(id))
      problems.push(`roll-up references unknown claim ${id}`);
  }
  if ((d.caseAssessment?.synthesis ?? "").length < 100)
    problems.push("synthesis too short");
  if ((d.caseAssessment?.steelman ?? "").length < 40)
    problems.push(
      "steelman missing or too thin (the counterweight is required)",
    );
  return { data: d, problems };
}

// ------------------------------------------------------------------ main

async function main() {
  const date = new Date().toISOString().slice(0, 10);
  if (!receipt || featuredIds.length === 0 || blind.evidence.length === 0) {
    console.error(
      "no assessable edition yet — establish claims and evidence before requesting a panel",
    );
    return;
  }
  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          case: slug,
          review: receipt,
          claimCount: featuredIds.length,
          packet: blind,
        },
        null,
        2,
      ),
    );
    return;
  }
  const active = vendorArg.filter((v) => VENDORS[v]?.key());
  if (active.length === 0)
    throw new Error("no vendor keys available — nothing to run");
  console.error(`cross-model check: ${slug} → ${active.join(", ")}`);

  const results = await Promise.allSettled(
    active.map(async (v) => {
      const text = await callSeat(v);
      return { vendor: v, text };
    }),
  );

  // A long-running call cannot attest to files that moved while it ran.
  const currentDraft = readDraft();
  if (
    readCaseSnapshot(caseDir).contentHash !== receipt.contentHash ||
    !currentDraft ||
    assessmentHash(currentDraft) !== receipt.assessmentHash
  ) {
    const quarantine = path.join(
      ROOT,
      "proposals",
      "cross-model-failures",
      overlayRunId([date, slug, "stale-input"]),
    );
    fs.mkdirSync(quarantine, { recursive: true });
    fs.writeFileSync(
      path.join(quarantine, "receipt.json"),
      JSON.stringify(
        {
          ...receipt,
          reason:
            "Inputs changed during the panel; these replies cannot be installed as current checks.",
        },
        null,
        2,
      ),
    );
    for (const result of results) {
      if (result.status === "fulfilled") {
        fs.writeFileSync(
          path.join(quarantine, `${result.value.vendor}.txt`),
          result.value.text,
          { flag: "wx" },
        );
      }
    }
    throw new Error(
      "case or assessment changed during the panel; no reviews installed",
    );
  }

  const failDir = path.join(
    ROOT,
    "proposals",
    "cross-model-failures",
    `${date}-${slug}`,
  );
  const installed = [];
  const failed = [];
  for (const r of results) {
    if (r.status === "rejected") {
      failed.push(String(r.reason).slice(0, 200));
      continue;
    }
    const { vendor, text } = r.value;
    let outcome;
    try {
      outcome = validate(vendor, text);
    } catch (e) {
      outcome = { data: null, problems: [`YAML parse failure: ${e.message}`] };
    }
    if (outcome.problems.length) {
      fs.mkdirSync(failDir, { recursive: true });
      fs.writeFileSync(path.join(failDir, `${vendor}.yaml`), text);
      fs.writeFileSync(
        path.join(failDir, `${vendor}.problems.txt`),
        outcome.problems.join("\n"),
      );
      failed.push(`${vendor}: ${outcome.problems.join("; ")}`);
      continue;
    }
    // Normalize the stamped fields regardless of what the model wrote.
    const d = outcome.data;
    // Overlays are append-only; a same-day re-check must not overwrite the
    // morning's run. The id is unique across branches and monotonic in
    // time — both invariants, and why, live in scripts/lib/overlay-ids.mjs
    // with tests in src/domain/overlayIds.test.ts.
    const base = overlayRunId([date, "check", VENDORS[vendor].tag], {
      exists: (id) =>
        fs.existsSync(path.join(caseDir, "assessments", `${id}.yaml`)),
    });
    d.runId = base;
    d.date = date;
    d.generatedAt = new Date().toISOString();
    d.review = receipt;
    d.promptVersion = PROMPT_VERSION;
    d.humanReviewed = false;
    d.role = "check";
    d.model = `${VENDORS[vendor].label} — independent check run via ${VENDORS[vendor].model}`;
    const file = path.join(caseDir, "assessments", `${base}.yaml`);
    const header = `# Cross-model check run — an independent judge (${VENDORS[vendor].label}),\n# blind to all prior assessments (scripts/cross-model-check.mjs,\n# promptVersion ${PROMPT_VERSION}). role: check — never displayed as the case\n# narrative; feeds the concurrence panel. Append-only; NOT human reviewed.\n`;
    fs.writeFileSync(file, header + stringifyYaml(d));
    installed.push(path.relative(ROOT, file));
  }

  console.error(`\ninstalled ${installed.length} check run(s):`);
  for (const f of installed) console.error(`  ${f}`);
  if (failed.length) {
    console.error(
      `failed (${failed.length}) — raw replies under ${path.relative(ROOT, failDir)}/:`,
    );
    for (const f of failed) console.error(`  ${f}`);
  }
  if (installed.length === 0) process.exit(1);
  console.log(installed.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
