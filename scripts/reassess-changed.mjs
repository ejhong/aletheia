#!/usr/bin/env node
/**
 * Re-run AI assessment overlays for cases whose evidence or claims changed
 * since their latest assessment run, and correct the editorial layer the
 * new evidence has outdated.
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
 * Then, for each case that was reassessed, a second pass audits the parts of
 * the case that do NOT self-heal: the overview article and the research
 * agenda. Verdicts re-derive from the ledger every run, but prose written
 * six months ago keeps asserting whatever it asserted — so an article can go
 * on telling readers "nobody has ever examined X" long after a record says
 * someone has. That pass makes the correction rather than filing a to-do,
 * because a to-do leaves the false sentence on the public page in the
 * meantime. What keeps it safe is not restraint but structure:
 *
 *   - edits are exact string replacements; a `find` span that is missing,
 *     ambiguous, or under 60 characters is rejected, never approximated;
 *   - the article's claim annotations and plate placements must survive the
 *     edit — losing one reverts every narrative edit for that case;
 *   - research edits splice a single YAML scalar's source span and are then
 *     verified by re-parsing: if any other record or field moved, revert;
 *   - only prose fields are editable (ids, links and taxonomy are canon);
 *   - every applied edit writes a history entry naming the model and run;
 *   - the diff touches featured content, so scripts/classify-pr-risk.mjs
 *     routes the PR to human approval. Nothing here reaches the site alone.
 *
 * Requires an LLM API key (see scripts/lib/llm.mjs); fails early without one.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml, parseDocument, stringify as stringifyYaml } from "yaml";
import { noKeyMessage, parseJsonReply, pickProvider } from "./lib/llm.mjs";
import {
  applyTextEdits,
  claimRefs,
  foldScalar,
  plateRefs,
} from "./lib/editorial-edits.mjs";

const PROMPT_VERSION = "aletheia-assess-v1-auto";
const EDIT_PROMPT_VERSION = "aletheia-editorial-audit-v1";
/** Research fields this pass may rewrite. Ids, links and taxonomy are canon. */
const EDITABLE_RESEARCH_FIELDS = ["title", "summary", "informationGain"];
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
    // Cross-model check runs corroborate; they are not the house draft
    // that a reassessment should build on.
    .filter((r) => r.run.role !== "check")
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

  return { draft, bundle };
}

const EDITORIAL_SYSTEM = `You audit the EDITORIAL layer of a case in an evidence-mapping publication against its own ledger, and you correct it.

The assessment layer (verdicts on claims) re-runs automatically whenever evidence changes. Two things do not, and they are your job:

1. the overview article (overview.md) — the prose a general reader actually reads;
2. the research agenda (research.yaml) — the studies the case says would move it.

Both are written at a moment in time. New evidence can leave them asserting things the ledger now contradicts, or proposing a study that has since been done. A reader who takes the article at its word would then be misled by us. That is the failure you exist to prevent.

WHAT COUNTS AS A CORRECTION

Only a factual conflict with the current records. Specifically:
- the prose asserts something the evidence records now contradict or supersede (e.g. "nobody has ever examined X" when a record now reports X was examined);
- the prose states as settled something the records show is contested, or as contested something now settled;
- the prose describes evidence as independent that the records now show is dependent, or vice versa;
- a research item proposes work that a new record reports as already done, or describes a test whose premise the records have overtaken.

WHAT DOES NOT COUNT — return nothing for these:
- style, tone, flow, word choice, tightening, "clarity";
- adding new material that is merely interesting;
- restating the assessment inside the article;
- hedging that is already accurate.

Silence is the correct and expected output when the editorial layer is accurate. Most cases most weeks need zero edits. Do not manufacture work: an unnecessary edit to a human-written article is a worse outcome than a missed one, because a missed one is caught next run and an unnecessary one erodes the article.

HOW TO WRITE A CORRECTION
- Make the smallest edit that removes the falsehood. Repair the sentence; do not rewrite the paragraph.
- Match the surrounding voice. This is edited editorial prose, not a bulletin.
- State what the record actually reports, including who reports it and whether anyone outside has seen it. Reported-but-unpublished is not established. Never upgrade a claim's standing beyond what its evidence record supports.
- Preserve every inline annotation exactly: spans of the form [text]{claim=SOME-ID} and lines of the form {plate:IMG-...}. If your edit touches an annotated span, keep the brackets and the {claim=...} suffix intact. Never delete an annotation.
- Cite record ids in prose only where the article already does so; the article is for general readers.

FORMAT — each edit is an exact string replacement.
"find" MUST be copied character-for-character from the file text given to you, MUST be at least 60 characters, and MUST appear exactly once in that file. Include enough surrounding text to be unique. Do not normalize whitespace, quotes, or dashes — copy them exactly as they appear, including typographic quotes and em dashes. If you cannot copy a span exactly, omit that edit.

Reply with ONLY JSON:
{"narrativeEdits": [{"find": "...", "replace": "...", "why": "one sentence: which record contradicts the old text"}],
 "researchEdits": [{"id": "XXX-R001", "field": "summary", "find": "...", "replace": "...", "why": "..."}],
 "historyChange": "2-4 sentences for the public change log describing what was corrected and to what, or empty string if no edits",
 "historyReason": "1-2 sentences on why the correction was required, or empty string"}`;


/**
 * Audit overview.md and research.yaml against the current ledger and apply
 * any corrections. Returns the edited file contents plus a record of what
 * was applied and what was rejected. Every structural invariant is checked
 * before anything is written: annotations may not be lost, claim references
 * must resolve, and research records may only differ in their prose fields.
 */
async function auditEditorialLayer(caseDir, bundle, newAssessment) {
  const dir = path.join(CASES_DIR, caseDir);
  const overviewPath = path.join(dir, "overview.md");
  const researchPath = path.join(dir, "research.yaml");
  if (!fs.existsSync(overviewPath)) return null;

  const overview = fs.readFileSync(overviewPath, "utf8");
  const researchRaw = fs.existsSync(researchPath)
    ? fs.readFileSync(researchPath, "utf8")
    : null;
  const research = researchRaw ? parseYaml(researchRaw) ?? [] : [];

  const reply = await provider.call(
    EDITORIAL_SYSTEM,
    [
      `Case directory: ${caseDir}`,
      "",
      "=== CURRENT LEDGER (claims, evidence) ===",
      JSON.stringify({ claims: bundle.claims, evidence: bundle.evidence }, null, 2),
      "",
      "=== ASSESSMENT JUST DRAFTED FROM THAT LEDGER ===",
      JSON.stringify(newAssessment.caseAssessment, null, 2),
      "",
      "=== overview.md (copy find-spans from here verbatim) ===",
      overview,
      "",
      "=== research.yaml records ===",
      JSON.stringify(research, null, 2),
    ].join("\n"),
  );
  const draft = parseJsonReply(reply);
  const rejected = [];

  // --- narrative ---
  const narrativeEdits = Array.isArray(draft.narrativeEdits) ? draft.narrativeEdits : [];
  const { out: newOverview, applied: appliedNarrative } = applyTextEdits(
    overview,
    narrativeEdits,
    "overview.md",
    rejected,
  );

  // Annotations are the article's link into the claim graph; an edit that
  // drops one degrades the page silently. Growth is fine, loss is not.
  const before = claimRefs(overview);
  const after = claimRefs(newOverview);
  const knownClaims = new Set(bundle.claims.map((c) => c.id));
  const lost = before.filter((id) => !after.includes(id));
  const unknown = after.filter((id) => !knownClaims.has(id));
  const platesBefore = plateRefs(overview).join(",");
  const platesAfter = plateRefs(newOverview).join(",");
  let overviewOut = newOverview;
  if (lost.length > 0 || unknown.length > 0 || platesBefore !== platesAfter) {
    rejected.push(
      `overview.md: ALL narrative edits reverted — ${
        lost.length > 0 ? `dropped claim annotations (${lost.join(", ")}); ` : ""
      }${unknown.length > 0 ? `unknown claim ids (${unknown.join(", ")}); ` : ""}${
        platesBefore !== platesAfter ? "plate placement changed; " : ""
      }the article's links into the claim graph must survive an automated edit`,
    );
    overviewOut = overview;
    appliedNarrative.length = 0;
  }

  // --- research agenda ---
  const researchEdits = Array.isArray(draft.researchEdits) ? draft.researchEdits : [];
  const appliedResearch = [];
  let researchOut = researchRaw;
  for (const e of researchEdits) {
    if (researchRaw === null) {
      rejected.push(`research.yaml: no such file in ${caseDir}`);
      break;
    }
    if (!EDITABLE_RESEARCH_FIELDS.includes(e.field)) {
      rejected.push(
        `research.yaml: ${e.id}.${e.field} is not an editable field (only ${EDITABLE_RESEARCH_FIELDS.join("/")})`,
      );
      continue;
    }
    // Re-parse each time so offsets refer to the text we are about to splice.
    const doc = parseDocument(researchOut);
    const node = doc.contents?.items?.find((m) => m.get?.("id") === e.id);
    if (!node) {
      rejected.push(`research.yaml: unknown item ${e.id}`);
      continue;
    }
    const scalar = node.get(e.field, true);
    if (!scalar || typeof scalar.value !== "string") {
      rejected.push(`research.yaml: ${e.id}.${e.field} is not text`);
      continue;
    }
    const sub = [];
    const { out, applied } = applyTextEdits(
      scalar.value,
      [e],
      `research.yaml ${e.id}.${e.field}`,
      sub,
    );
    rejected.push(...sub);
    if (applied.length === 0) continue;
    if (out.trim().length === 0) {
      rejected.push(`research.yaml: ${e.id}.${e.field} would be emptied`);
      continue;
    }
    // Splice only this scalar's source span, keeping the file's comments,
    // ordering and formatting exactly as a human left them.
    const [start, valueEnd] = scalar.range;
    const span = researchOut.slice(start, valueEnd);
    const header = span.match(/^[>|][-+]?\d*\n/);
    const indentMatch = span.match(/\n([ ]+)\S/);
    if (!header || !indentMatch) {
      rejected.push(
        `research.yaml: ${e.id}.${e.field} is not a block scalar — refusing to reformat it`,
      );
      continue;
    }
    const trailing = span.slice(span.trimEnd().length);
    const candidate =
      researchOut.slice(0, start) +
      header[0] +
      foldScalar(out, indentMatch[1].length) +
      trailing +
      researchOut.slice(valueEnd);

    // Verify by structure, not by eye: every record and every other field
    // must be byte-identical after the splice.
    const before = parseYaml(researchOut);
    let after;
    try {
      after = parseYaml(candidate);
    } catch (err) {
      rejected.push(`research.yaml: ${e.id}.${e.field} edit produced invalid YAML (${err.message})`);
      continue;
    }
    const mutate = (recs) =>
      JSON.stringify(recs.map((r) => ({ ...r, [e.field]: r.id === e.id ? null : r[e.field] })));
    if (mutate(before) !== mutate(after) || after.find((r) => r.id === e.id)?.[e.field] !== out) {
      rejected.push(
        `research.yaml: ${e.id}.${e.field} edit changed more than the targeted field — reverted`,
      );
      continue;
    }
    researchOut = candidate;
    appliedResearch.push(e);
  }

  return {
    overviewPath,
    overview: overviewOut,
    overviewChanged: overviewOut !== overview,
    researchPath,
    research: researchOut,
    researchChanged: appliedResearch.length > 0,
    appliedNarrative,
    appliedResearch,
    rejected,
    historyChange: typeof draft.historyChange === "string" ? draft.historyChange : "",
    historyReason: typeof draft.historyReason === "string" ? draft.historyReason : "",
  };
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
    let draft, bundle;
    try {
      ({ draft, bundle } = await reassessCase(caseDir, prev));
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

    // The assessment layer self-heals; the editorial layer does not. Audit
    // the article and research agenda against the same ledger and correct
    // them. These edits touch featured content, so the risk classifier
    // routes the PR to human approval — nothing here publishes itself.
    let audit;
    try {
      audit = await auditEditorialLayer(caseDir, bundle, draft);
    } catch (err) {
      digest.push(
        `  - editorial audit failed and made no changes (${err.message}). The article and research agenda are unchanged; the next run retries.`,
      );
      continue;
    }
    if (!audit) continue;

    for (const r of audit.rejected) console.error(`${caseDir}: rejected — ${r}`);

    if (!audit.overviewChanged && !audit.researchChanged) {
      digest.push(
        `  - editorial audit found nothing in the article or research agenda that the updated ledger contradicts${
          audit.rejected.length > 0
            ? ` (${audit.rejected.length} proposed edit${audit.rejected.length === 1 ? "" : "s"} rejected as unsafe — see the run log)`
            : ""
        }.`,
      );
      continue;
    }

    if (dryRun) {
      // Print the prose itself: the only way to judge an automated edit to a
      // human-written article is to read what it would actually say.
      for (const e of [...audit.appliedNarrative, ...audit.appliedResearch]) {
        console.log(
          `\n(dry run) ${caseDir} ${e.id ? `${e.id}.${e.field}` : "overview.md"} — ${e.why}\n` +
            `  - ${e.find}\n  + ${e.replace}`,
        );
      }
    } else {
      if (audit.overviewChanged) {
        fs.writeFileSync(audit.overviewPath, audit.overview);
        written.push(path.relative(ROOT, audit.overviewPath));
      }
      if (audit.researchChanged) {
        fs.writeFileSync(audit.researchPath, audit.research);
        written.push(path.relative(ROOT, audit.researchPath));
      }
      // A content change without a history entry is exactly the silent
      // revision this project exists to make impossible.
      const historyPath = path.join(CASES_DIR, caseDir, "history.yaml");
      if (fs.existsSync(historyPath)) {
        const entry = {
          date: today,
          kind: "content",
          change:
            audit.historyChange ||
            `Editorial correction from the scheduled reassessment (run ${runId}): ${audit.appliedNarrative.length} article edit(s), ${audit.appliedResearch.length} research-agenda edit(s).`,
          reason:
            audit.historyReason ||
            "The article or research agenda asserted something the current evidence records contradict or supersede.",
          actor: `${provider.name}/${provider.model} (scheduled maintenance run, ${EDIT_PROMPT_VERSION}), pending human approval`,
          aiAssisted: true,
        };
        fs.appendFileSync(historyPath, "\n" + stringifyYaml([entry]));
        written.push(path.relative(ROOT, historyPath));
      }
    }

    const detail = [
      ...audit.appliedNarrative.map((e) => `article: ${e.why}`),
      ...audit.appliedResearch.map((e) => `${e.id}.${e.field}: ${e.why}`),
    ];
    digest.push(
      `  - **editorial correction applied** (needs human approval): ${detail.join("; ")}`,
    );
    if (audit.rejected.length > 0)
      digest.push(
        `  - ${audit.rejected.length} further edit(s) proposed and rejected as unsafe — see the run log.`,
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
