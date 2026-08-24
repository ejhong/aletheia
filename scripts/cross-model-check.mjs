#!/usr/bin/env node
/**
 * Cross-model check — independent blind re-assessment of one case.
 *
 * Usage:
 *   node scripts/cross-model-check.mjs <case-slug> [--vendors anthropic,openai,gemini,xai] [--dry-run]
 *
 * For each configured vendor with an API key present, sends the case file
 * (case.yaml, overview.md, claims.yaml, evidence.yaml, sources.yaml,
 * research.yaml — deliberately EXCLUDING all prior assessments and
 * history, so every judge is blind) with the standard judge instructions,
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
 * Keys: ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, XAI_API_KEY.
 * Vendors without a key are skipped with a note. Costs are one long
 * completion per vendor (typically a few dollars per case total).
 */
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");
const vendorArg = args.includes("--vendors")
  ? args[args.indexOf("--vendors") + 1].split(",")
  : ["anthropic", "openai", "gemini", "xai", "venice"];

if (!slug) {
  console.error("usage: node scripts/cross-model-check.mjs <case-slug> [--vendors a,b] [--dry-run]");
  process.exit(1);
}
const caseDir = path.join(ROOT, "content", "cases", slug);
if (!fs.existsSync(path.join(caseDir, "case.yaml"))) {
  console.error(`no case at content/cases/${slug}/case.yaml`);
  process.exit(1);
}

// Model choices per vendor: current flagship, stable enough to cite.
const VENDORS = {
  anthropic: {
    key: process.env.ANTHROPIC_API_KEY,
    model: "claude-opus-5",
    label: "Opus 5 (Anthropic)",
    tag: "opus",
  },
  openai: {
    key: process.env.OPENAI_API_KEY,
    model: "gpt-5.1",
    label: "GPT-5.1 (OpenAI)",
    tag: "gpt",
  },
  gemini: {
    key: process.env.GEMINI_API_KEY,
    model: "gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro (Google)",
    tag: "gemini",
  },
  xai: {
    key: process.env.XAI_API_KEY,
    model: "grok-4.6",
    label: "Grok 4.6 (xAI)",
    tag: "grok",
  },
  venice: {
    key: process.env.VENICE_API_KEY,
    model: "kimi-k3",
    label: "Kimi K3 (Moonshot, via Venice)",
    tag: "kimi",
  },
};

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

const read = (f) => fs.readFileSync(path.join(caseDir, f), "utf8");
const packetFiles = [
  "case.yaml",
  "overview.md",
  "claims.yaml",
  "evidence.yaml",
  "sources.yaml",
  "research.yaml",
];
const packet = packetFiles
  .map((f) => `===== FILE: ${f} =====\n${read(f)}`)
  .join("\n\n");

const claims = parseYaml(read("claims.yaml"));
const featuredIds = claims
  .filter((c) => (c.tier ?? "featured") === "featured" && c.reviewState !== "rejected")
  .map((c) => c.id);
const caseRecord = parseYaml(read("case.yaml"));

const PROMPT_VERSION = "aletheia-check-v1";

const instructions = `You are an independent scientific assessor for Aletheia, a public evidence ledger for contested hypotheses. You have the complete case file for "${caseRecord.title}" — dossier, overview article, atomic claims, evidence records, source records, and research agenda. You have deliberately NOT been shown any prior assessment.

Your task: produce one complete assessment run over this case, as YAML, in exactly the schema below.

Assessment rules:
1. Weigh ONLY the evidence records provided. No browsing or outside results. General scientific background may calibrate plausibility, but wherever a verdict leans on priors rather than the evidence records, say so in the reasoning.
2. Distinguish each claim's local truth from what it implies for the featured hypothesis; assess the claim as stated.
3. Consensus is not proof; outsider status is not evidence. Mechanisms, measurements, and replications count — paper counts and prestige do not.
4. Choose the verdict the evidence warrants, including strong verdicts in either direction. "unresolved" and "mixed" are substantive findings requiring justification, not safe defaults.
5. Steelman both directions in the synthesis.
6. Never fabricate results, papers, or numbers.

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
claimAssessments:
  - claimId: <id>
    verdict: <token>
    confidence: <token>
    reasoning: >-
      <2-6 sentences; name the strongest opposing consideration>

claimAssessments MUST contain one entry for EVERY one of these ${featuredIds.length} claims, in this order: ${featuredIds.join(", ")}. Only reference claim ids from that list in loadBearing and weakestLinks.`;

// ----------------------------------------------------------------- calls

async function callVendor(name, cfg) {
  const userMsg = `RUN HEADER:\n  TAG: ${cfg.tag}\n  MODEL_LABEL: ${cfg.label}, independent check run\n\nCASE FILE FOLLOWS:\n\n${packet}`;
  let url, body, headers;
  if (name === "gemini") {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${cfg.key}`;
    body = {
      system_instruction: { parts: [{ text: instructions }] },
      contents: [{ role: "user", parts: [{ text: userMsg }] }],
      generationConfig: { maxOutputTokens: 32000 },
    };
    headers = { "Content-Type": "application/json" };
  } else if (name === "anthropic") {
    url = "https://api.anthropic.com/v1/messages";
    body = {
      model: cfg.model,
      // Opus writes long reasonings; 32k proved one claim short on a
      // 14-claim case. Thinking is adaptive by default and shares the
      // max_tokens budget with the visible reply — there is no thinking
      // budget parameter on this model; effort is the depth control.
      max_tokens: 64000,
      output_config: { effort: "high" },
      system: instructions,
      messages: [{ role: "user", content: userMsg }],
    };
    headers = {
      "Content-Type": "application/json",
      "x-api-key": cfg.key,
      "anthropic-version": "2023-06-01",
    };
  } else {
    url =
      name === "xai"
        ? "https://api.x.ai/v1/chat/completions"
        : name === "venice"
          ? "https://api.venice.ai/api/v1/chat/completions"
          : "https://api.openai.com/v1/chat/completions";
    body = {
      model: cfg.model,
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: userMsg },
      ],
      max_completion_tokens: 32000,
    };
    headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.key}`,
    };
  }
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(1800_000),
  });
  if (!res.ok) throw new Error(`${name} HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  let text;
  if (name === "gemini") {
    text = (data.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("");
  } else if (name === "anthropic") {
    text = (data.content ?? []).map((b) => b.text ?? "").join("");
  } else {
    text = data.choices?.[0]?.message?.content ?? "";
  }
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.split("\n").slice(1).join("\n");
    const fence = t.lastIndexOf("```");
    if (fence >= 0) t = t.slice(0, fence);
  }
  return t.trim();
}

function validate(name, yamlText) {
  const d = parseYaml(yamlText);
  const problems = [];
  if (d.role !== "check") problems.push("role is not 'check'");
  if (!VERDICTS.includes(d.caseAssessment?.verdict))
    problems.push(`bad case verdict: ${d.caseAssessment?.verdict}`);
  const seen = new Set((d.claimAssessments ?? []).map((ca) => ca.claimId));
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
    if (!featuredIds.includes(id)) problems.push(`roll-up references unknown claim ${id}`);
  }
  if ((d.caseAssessment?.synthesis ?? "").length < 100)
    problems.push("synthesis too short");
  return { data: d, problems };
}

// ------------------------------------------------------------------ main

async function main() {
  const date = new Date().toISOString().slice(0, 10);
  const active = vendorArg.filter((v) => VENDORS[v]?.key);
  const skippedVendors = vendorArg.filter((v) => VENDORS[v] && !VENDORS[v].key);
  if (skippedVendors.length)
    console.error(`no key, skipping: ${skippedVendors.join(", ")}`);
  if (active.length === 0) {
    console.error("no vendor keys available — nothing to run");
    process.exit(1);
  }
  console.error(
    `cross-model check: ${slug} → ${active.length} vendor(s): ${active.join(", ")} (${featuredIds.length} featured claims)`,
  );
  if (dryRun) {
    console.log(`(dry run: would call ${active.join(", ")}; no API calls made)`);
    return;
  }

  const results = await Promise.allSettled(
    active.map(async (v) => {
      const text = await callVendor(v, VENDORS[v]);
      return { vendor: v, text };
    }),
  );

  const failDir = path.join(ROOT, "proposals", "cross-model-failures", `${date}-${slug}`);
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
    // morning's run. On collision, suffix -r2, -r3, … — the loader breaks
    // same-date ties by runId, and "…-r2" sorts after its unsuffixed prefix,
    // so the newest run wins deterministically.
    let base = `${date}-check-${VENDORS[vendor].tag}`;
    for (let n = 2; fs.existsSync(path.join(caseDir, "assessments", `${base}.yaml`)); n++) {
      base = `${date}-check-${VENDORS[vendor].tag}-r${n}`;
    }
    d.runId = base;
    d.date = date;
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
