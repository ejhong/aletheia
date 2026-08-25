#!/usr/bin/env node
/**
 * The reconciliation loop (operator duty #2). A contested standing is
 * honest but static: drafts are written blind to the panel, so without
 * this script a case where the judges dispute the house verdict stays
 * contested forever, with the house never having engaged the objections.
 *
 * For each eligible case this produces a RECONSIDERATION draft — the one
 * deliberately non-blind draft in the pipeline: the model receives every
 * seat's dissent and must answer each one, moving only where the argument
 * compels. The result is an ordinary append-only overlay (role: draft,
 * promptVersion aletheia-reconsider-v1); standing re-derives against the
 * existing fresh checks, so no new panel is needed to resolve.
 *
 * Eligibility: the newest checks are current (not stale vs content), the
 * case verdict is disputed by at least two seats, and the latest draft is
 * NOT already a reconsideration — if the house has engaged and the panel
 * still disputes, that is a genuine standoff, displayed indefinitely and
 * reported here rather than re-litigated in a loop.
 *
 * Usage: node scripts/reconcile-contested.mjs [--case <dir>] [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { noKeyMessage, parseJsonReply, pickProvider } from "./lib/llm.mjs";

const PROMPT_VERSION = "aletheia-reconsider-v1";
const VERDICTS = [
  "established", "well_supported", "provisionally_supported", "mixed",
  "weakly_supported", "contradicted", "unresolved", "presently_untestable",
];

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const onlyCase = args.includes("--case") ? args[args.indexOf("--case") + 1] : null;
const ROOT = process.cwd();
const CASES = path.join(ROOT, "content", "cases");

const provider = pickProvider();
if (!provider) {
  console.error(noKeyMessage());
  process.exit(1);
}

const seatName = (m) => m.split("—")[0].split(", independent")[0].trim();

function latestPerModel(runs) {
  const byModel = new Map();
  for (const r of runs.filter((r) => r.role === "check")) {
    const k = r.model.trim().split(/[\s,(]/)[0].toLowerCase();
    const prev = byModel.get(k);
    if (!prev || r.date > prev.date || (r.date === prev.date && r.runId > prev.runId))
      byModel.set(k, r);
  }
  return [...byModel.values()];
}

async function reconcile(dir) {
  const read = (f) => {
    const p = path.join(CASES, dir, f);
    return fs.existsSync(p) ? parseYaml(fs.readFileSync(p, "utf8")) ?? [] : [];
  };
  const adir = path.join(CASES, dir, "assessments");
  if (!fs.existsSync(adir)) return null;
  const runs = fs
    .readdirSync(adir)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => parseYaml(fs.readFileSync(path.join(adir, f), "utf8")));
  const drafts = runs
    .filter((r) => r.role !== "check")
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const draft = drafts.at(-1);
  if (!draft) return null;
  const checks = latestPerModel(runs);
  if (checks.length < 4) return null;

  // Freshness: content must not have moved after the newest check.
  const newestCheck = checks.map((r) => String(r.date)).sort().at(-1);
  const newestContent = (read("history.yaml") ?? [])
    .filter((h) => h.kind !== "housekeeping")
    .map((h) => String(h.date))
    .sort()
    .at(-1);
  if (newestContent && newestContent > newestCheck) return null;

  const dissenting = checks.filter(
    (r) => r.caseAssessment.verdict !== draft.caseAssessment.verdict,
  );
  if (dissenting.length < 2) return null; // case verdict not contested
  if (draft.promptVersion === PROMPT_VERSION) {
    return { standoff: true, dir, draft, dissenting };
  }

  const claims = read("claims.yaml").filter(
    (c) => (c.tier ?? "featured") === "featured" && c.reviewState !== "rejected",
  );
  const evidence = read("evidence.yaml");
  const packet = {
    houseDraft: {
      verdict: draft.caseAssessment.verdict,
      synthesis: draft.caseAssessment.synthesis,
      loadBearing: draft.caseAssessment.loadBearing,
      claimAssessments: draft.claimAssessments,
    },
    dissents: checks.map((r) => ({
      seat: seatName(r.model),
      caseVerdict: r.caseAssessment.verdict,
      synthesis: r.caseAssessment.synthesis,
    })),
    claims: claims.map((c) => ({ id: c.id, statement: c.statement, rung: c.rung })),
    evidence: evidence.map((e) => ({
      id: e.id, title: e.title, direction: e.direction, strength: e.strength,
      claimIds: e.claimIds, sourceStatement: e.sourceStatement ?? "",
      limitations: e.limitations ?? [],
    })),
  };

  const SYSTEM = `You write a RECONSIDERATION assessment for a case in an evidence-mapping publication. The house draft's case verdict is disputed by independent judges; your task is to engage every dissent on its merits — the way an author answers referees.

Rules:
- Address each dissenting seat's argument explicitly in the synthesis: either concede it and move, or answer it and hold. Silence on a dissent is failure.
- Move ONLY where the argument compels. You are not obliged to converge; you are obliged to engage. If after engagement you hold the original verdict, say precisely why the dissents do not compel.
- Verdicts from this vocabulary only: ${VERDICTS.join(", ")}.
- Distinguish credibility from diagnosticity; repeated reports are not independent; feasibility is not occurrence.
- Synthesis at least 200 words, plain language, citing record ids.
- loadBearing AND weakestLinks are arrays of CLAIM ids only (like XXX-C001) — never evidence ids, never prose sentences. Put the prose reasons in the synthesis. claimAssessments cover every featured claim by id.

Reply ONLY JSON:
{"caseAssessment": {"verdict": "...", "loadBearing": ["..."], "weakestLinks": ["..."], "synthesis": "..."}, "claimAssessments": [{"claimId": "...", "verdict": "...", "reasoning": "...", "confidence": "high|moderate|low"}], "whatChanged": "which dissents moved you, which did not, and why — 2-5 sentences"}`;

  const reply = await provider.call(SYSTEM, `Case: ${dir}\n\n${JSON.stringify(packet, null, 2)}`);
  const d = parseJsonReply(reply);

  // Fail-closed validation, mirroring reassess-changed.
  const known = new Set(claims.map((c) => c.id));
  const errs = [];
  if (!VERDICTS.includes(d.caseAssessment?.verdict)) errs.push("bad case verdict");
  if ((d.caseAssessment?.synthesis ?? "").length < 150) errs.push("synthesis too short");
  // Both roll-up lists are claim ids — the loader enforces exactly this
  // (load.ts requireLiveClaim on every entry), so anything looser here
  // would install an overlay that breaks the site build.
  for (const k of ["loadBearing", "weakestLinks"])
    for (const id of d.caseAssessment?.[k] ?? [])
      if (!known.has(id)) errs.push(`${k}: not a live claim id: ${String(id).slice(0, 60)}`);
  for (const a of d.claimAssessments ?? []) {
    if (!known.has(a.claimId)) errs.push(`unknown claim ${a.claimId}`);
    if (!VERDICTS.includes(a.verdict)) errs.push(`bad verdict ${a.claimId}`);
  }
  if (errs.length) throw new Error(`reconsideration failed validation: ${errs.join("; ")}`);

  const today = new Date().toISOString().slice(0, 10);
  const runId = `${today}-reconsider-${Math.random().toString(36).slice(2, 6)}`;
  const overlay = {
    runId,
    model: `${provider.name}/${provider.model} (reconsideration — deliberately non-blind: engages the panel's dissents)`,
    date: today,
    promptVersion: PROMPT_VERSION,
    humanReviewed: false,
    role: "draft",
    caseAssessment: d.caseAssessment,
    claimAssessments: d.claimAssessments,
  };
  const file = path.join(adir, `${runId}.yaml`);
  if (!dryRun)
    fs.writeFileSync(
      file,
      "# Reconsideration draft — the one deliberately NON-BLIND draft in the\n" +
        "# pipeline: written with the panel's dissents in hand, required to engage\n" +
        "# each one (scripts/reconcile-contested.mjs). Append-only; not reviewed.\n" +
        stringifyYaml(overlay),
    );
  return { dir, runId, from: draft.caseAssessment.verdict, to: d.caseAssessment.verdict, whatChanged: d.whatChanged, file, dryRun };
}

const dirs = fs
  .readdirSync(CASES)
  .filter((d) => fs.existsSync(path.join(CASES, d, "case.yaml")))
  .filter((d) => !onlyCase || d === onlyCase);

for (const dir of dirs) {
  try {
    const r = await reconcile(dir);
    if (!r) continue;
    if (r.standoff) {
      console.log(
        `${dir}: genuine standoff — the house has engaged (${r.draft.runId}) and ${r.dissenting.length} seats still dispute. Displayed as contested; no re-litigation.`,
      );
      continue;
    }
    console.log(
      `${dir}: reconsideration ${r.dryRun ? "(dry run) " : ""}${r.from} -> ${r.to} (${r.runId}). ${r.whatChanged}`,
    );
  } catch (err) {
    console.error(`${dir}: ${err.message} — nothing written`);
  }
}
