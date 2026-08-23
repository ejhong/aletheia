#!/usr/bin/env node
/**
 * Re-run AI assessment overlays for cases whose evidence or claims changed
 * since their latest assessment run.
 *
 * Usage:
 *   node scripts/reassess-changed.mjs [--dry-run] [--case <case-dir>]
 *                                     [--provider anthropic|openai]
 *
 * For each case under content/cases/:
 *   1. find the latest assessment overlay in <case>/assessments/;
 *   2. compare its date with the last git-commit date of claims.yaml /
 *      claims-catalog.yaml / evidence.yaml / sources.yaml;
 *   3. if content moved after the assessment, draft a NEW overlay file —
 *      append-only, humanReviewed: false, runId/model/promptVersion stamped.
 *      Existing overlays are never modified (that is the design).
 *
 * The draft is validated structurally before writing (verdict enums, known
 * claim ids, synthesis length); an invalid draft is discarded and reported —
 * failing closed, never writing a malformed overlay.
 *
 * Requires an LLM API key (see scripts/lib/llm.mjs); fails early without one.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { noKeyMessage, parseJsonReply, pickProvider } from "./lib/llm.mjs";

const PROMPT_VERSION = "aletheia-assess-v1-auto";
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

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const onlyCase = args.includes("--case") ? args[args.indexOf("--case") + 1] : null;
const forcedProvider = args.includes("--provider")
  ? args[args.indexOf("--provider") + 1]
  : undefined;

const ROOT = process.cwd();
const CASES_DIR = path.join(ROOT, "content", "cases");

const provider = pickProvider(forcedProvider);
if (!provider) {
  console.error(noKeyMessage());
  process.exit(1);
}

function lastCommitDate(relPath) {
  try {
    const out = execFileSync(
      "git",
      ["log", "-1", "--format=%cI", "--", relPath],
      { cwd: ROOT, encoding: "utf8" },
    ).trim();
    return out ? new Date(out) : null;
  } catch {
    return null;
  }
}

function latestAssessment(caseDir) {
  const dir = path.join(CASES_DIR, caseDir, "assessments");
  if (!fs.existsSync(dir)) return null;
  const runs = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => ({
      file: f,
      run: parseYaml(fs.readFileSync(path.join(dir, f), "utf8")),
    }))
    .sort((a, b) => String(a.run.date).localeCompare(String(b.run.date)));
  return runs.at(-1) ?? null;
}

const ASSESS_SYSTEM = `You draft an AI assessment overlay for a case in an evidence-mapping publication. Follow the project's epistemic rules exactly:

- Distinguish credibility (is this claim locally true?) from diagnosticity (does it discriminate between hypotheses?). A credible observation can be weak evidence for a grand theory.
- Do not use false precision. Verdicts come only from this vocabulary: ${VERDICTS.join(", ")}.
- Repeated/derived reports are not independent evidence. Feasibility is not occurrence. Consensus is not proof; outsider status is not evidence.
- The synthesis is an argued structural roll-up over the claim ladder (observation → mechanism → attribution), at least 150 words, in plain language. Not a score.
- Name the load-bearing claims (what the featured thesis actually rests on) and the weakest links (where the argument most likely fails).
- When citing other records in synthesis or reasoning prose, use exact ids (e.g. ZW-C004, SRC-MULLER-2020, ZW-E010, ZW-R003, ZW-001). The site auto-links these in the UI.
- Assess each FEATURED claim individually with a verdict, 1-3 sentence reasoning, and confidence (high|moderate|low).
- You are given the previous assessment run: focus on what the NEW evidence changes; do not churn verdicts without a stated reason grounded in the changed material.

Reply with ONLY JSON:
{"caseAssessment": {"verdict": "...", "loadBearing": ["..."], "weakestLinks": ["..."], "synthesis": "..."}, "claimAssessments": [{"claimId": "...", "verdict": "...", "reasoning": "...", "confidence": "..."}], "whatChanged": "1-3 plain-language sentences on what moved since the previous run and why"}`;

async function reassessCase(caseDir, prev) {
  const read = (f) => {
    const p = path.join(CASES_DIR, caseDir, f);
    return fs.existsSync(p) ? parseYaml(fs.readFileSync(p, "utf8")) ?? [] : [];
  };
  const claims = read("claims.yaml");
  const evidence = read("evidence.yaml");
  const featured = claims.filter(
    (c) => (c.tier ?? "featured") === "featured" && c.reviewState !== "rejected",
  );

  const bundle = {
    claims: featured.map((c) => ({
      id: c.id,
      statement: c.statement,
      rung: c.rung,
      reviewState: c.reviewState,
    })),
    evidence: evidence.map((e) => ({
      id: e.id,
      title: e.title,
      direction: e.direction,
      strength: e.strength,
      claimIds: e.claimIds,
      sourceStatement: e.sourceStatement ?? "",
      editorInference: e.editorInference ?? "",
      limitations: e.limitations ?? [],
    })),
    previousAssessment: prev
      ? {
          date: prev.run.date,
          caseAssessment: prev.run.caseAssessment,
          claimAssessments: prev.run.claimAssessments,
        }
      : null,
  };

  const reply = await provider.call(
    ASSESS_SYSTEM,
    `Case directory: ${caseDir}\n\n${JSON.stringify(bundle, null, 2)}`,
  );
  const draft = parseJsonReply(reply);

  // Structural validation — fail closed rather than write a malformed overlay.
  const errors = [];
  const knownIds = new Set(featured.map((c) => c.id));
  const ca = draft.caseAssessment ?? {};
  if (!VERDICTS.includes(ca.verdict)) errors.push(`bad case verdict: ${ca.verdict}`);
  if (typeof ca.synthesis !== "string" || ca.synthesis.length < 100)
    errors.push("synthesis missing or too short");
  for (const key of ["loadBearing", "weakestLinks"]) {
    if (!Array.isArray(ca[key])) errors.push(`${key} missing`);
    else
      for (const id of ca[key])
        if (!knownIds.has(id)) errors.push(`${key} references unknown claim ${id}`);
  }
  if (!Array.isArray(draft.claimAssessments)) errors.push("claimAssessments missing");
  else
    for (const a of draft.claimAssessments) {
      if (!knownIds.has(a.claimId)) errors.push(`assessment for unknown claim ${a.claimId}`);
      if (!VERDICTS.includes(a.verdict)) errors.push(`bad verdict for ${a.claimId}`);
      if (!["high", "moderate", "low"].includes(a.confidence))
        errors.push(`bad confidence for ${a.claimId}`);
      if (typeof a.reasoning !== "string" || a.reasoning.length < 10)
        errors.push(`reasoning missing for ${a.claimId}`);
    }
  if (errors.length > 0) {
    throw new Error(`draft failed validation: ${errors.join("; ")}`);
  }

  return draft;
}

async function main() {
  const caseDirs = fs
    .readdirSync(CASES_DIR)
    .filter((d) => fs.existsSync(path.join(CASES_DIR, d, "case.yaml")))
    .filter((d) => !onlyCase || d === onlyCase);

  const today = new Date().toISOString().slice(0, 10);
  const digest = [];
  const written = [];

  for (const caseDir of caseDirs) {
    const prev = latestAssessment(caseDir);
    const contentPaths = [
      "claims.yaml",
      "claims-catalog.yaml",
      "evidence.yaml",
      "sources.yaml",
    ].map((f) => `content/cases/${caseDir}/${f}`);
    const lastContentChange = contentPaths
      .map(lastCommitDate)
      .filter(Boolean)
      .sort((a, b) => b - a)[0];

    if (!lastContentChange) continue;
    if (prev && new Date(prev.run.date) >= lastContentChange) {
      console.error(`${caseDir}: assessment current (last run ${prev.run.date}) — skip`);
      continue;
    }

    console.error(
      `${caseDir}: content changed after last assessment${prev ? ` (${prev.run.date})` : " (none yet)"} — reassessing`,
    );
    let draft;
    try {
      draft = await reassessCase(caseDir, prev);
    } catch (err) {
      digest.push(
        `**${caseDir}**: reassessment attempted but the draft failed validation and was discarded (${err.message}). No overlay written — a human or the next run should retry.`,
      );
      continue;
    }

    const runId = `${today}-auto-${Math.random().toString(36).slice(2, 6)}`;
    const overlay = {
      runId,
      model: `${provider.name}/${provider.model} (scheduled maintenance run)`,
      date: today,
      promptVersion: PROMPT_VERSION,
      humanReviewed: false,
      caseAssessment: draft.caseAssessment,
      claimAssessments: draft.claimAssessments,
    };
    const header = [
      "# AI assessment overlay — append-only. This file is a draft generated by",
      "# an AI model on a scheduled maintenance run and has NOT been reviewed by",
      "# a human. It never mutates the canon claim files; a future run adds a",
      "# new file beside this one.",
      "",
    ].join("\n");
    const outFile = path.join(CASES_DIR, caseDir, "assessments", `${runId}.yaml`);

    if (dryRun) {
      console.log(`(dry run) would write ${path.relative(ROOT, outFile)}`);
    } else {
      fs.writeFileSync(outFile, header + stringifyYaml(overlay));
      written.push(path.relative(ROOT, outFile));
    }
    digest.push(
      `**${caseDir}**: new AI assessment overlay (run ${runId}, verdict ${draft.caseAssessment.verdict}). What changed since the previous run: ${draft.whatChanged ?? "not stated"}`,
    );
  }

  if (digest.length === 0) {
    console.log("nothing to reassess — all assessments current");
    return;
  }
  const report = [
    "## Assessment refresh",
    "",
    ...digest.map((d) => `- ${d}`),
    "",
    "These overlays are append-only AI drafts (`humanReviewed: false`); the site labels them as such. Reverting a run = deleting its overlay file.",
    "",
  ].join("\n");
  console.log(report);
  if (!dryRun && written.length > 0) {
    fs.writeFileSync(path.join(ROOT, "reassess-digest.md"), report);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
