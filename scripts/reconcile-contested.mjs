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
 * promptVersion aletheia-reconsider-v1) stamped with `reconciles`: the
 * runIds of the checks whose dissents it engaged. Those checks can never
 * ratify the draft that answered them (src/domain/load.ts ratification) —
 * a reconciled case stays unratified until at least one fresh blind check
 * judges it, which stale-checks.mjs arranges by listing the case for the
 * next content-response re-panel.
 *
 * Eligibility mirrors what makes a standing "contested" in
 * src/domain/load.ts (via scripts/lib/reconcile-core.mjs): the newest
 * checks are current (not stale vs content); the panel disputes either
 * the case verdict (two or more seats) or a load-bearing claim (fewer
 * than a strict majority of judging seats within one step of the draft's
 * verdict — the vasocomputation shape: a unanimous case verdict over a
 * split load-bearing claim); and the latest draft is NOT already a
 * reconsideration — if the house has engaged and the panel still
 * disputes, that is a genuine standoff, displayed indefinitely and
 * reported here rather than re-litigated in a loop.
 *
 * Usage: node scripts/reconcile-contested.mjs [--case <dir>] [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { callWithRefusalFallback, noKeyMessage, parseJsonReply, pickProvider } from "./lib/llm.mjs";
import {
  caseVerdictDissenters,
  claimDissentPacket,
  contestedLoadBearingClaims,
} from "./lib/reconcile-core.mjs";

const PROMPT_VERSION = "aletheia-reconsider-v3"; // v3: steelman field (epistemic counterweight)
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

  // The same disagreements that display as "contested": a case-verdict
  // dispute, or a load-bearing claim split under a unanimous verdict.
  const dissenting = caseVerdictDissenters(draft, checks);
  const splitClaims = contestedLoadBearingClaims(draft, checks);
  if (dissenting.length < 2 && splitClaims.length === 0) return null;
  if (draft.promptVersion === PROMPT_VERSION) {
    return { standoff: true, dir, draft, dissenting, splitClaims };
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
    // Load-bearing claims the panel splits on, with each seat's verdict
    // and reasoning — the claim-level dissent the draft must engage.
    claimDissents: claimDissentPacket(draft, checks, splitClaims, seatName),
    claims: claims.map((c) => ({ id: c.id, statement: c.statement, rung: c.rung })),
    evidence: evidence.map((e) => ({
      id: e.id, title: e.title, direction: e.direction, strength: e.strength,
      claimIds: e.claimIds, sourceStatement: e.sourceStatement ?? "",
      limitations: e.limitations ?? [],
    })),
  };

  const SYSTEM = `You write a RECONSIDERATION assessment for a case in an evidence-mapping publication. The house draft is disputed by independent judges — on the case verdict, on one or more load-bearing claims, or both; your task is to engage every dissent on its merits — the way an author answers referees.

Rules:
- Address each dissenting seat's argument explicitly in the synthesis: either concede it and move, or answer it and hold. Silence on a dissent is failure.
- If claimDissents is non-empty, engage each split claim BY ID: that claim's reasoning field must answer the seats' arguments (concede and regrade, or hold and say precisely why), and the synthesis must address the split where the claim is load-bearing. A reconsideration that leaves a split claim unaddressed is failure.
- Move ONLY where the argument compels. You are not obliged to converge; you are obliged to engage. If after engagement you hold the original verdict, say precisely why the dissents do not compel.
- Verdicts from this vocabulary only: ${VERDICTS.join(", ")}.
- Distinguish credibility from diagnosticity; repeated reports are not independent; feasibility is not occurrence.
- Synthesis at least 200 words, plain language, citing record ids.
- Sensitivity: in the synthesis, name the single evidence record whose removal would most change the case verdict, and state plainly whether the verdict survives without it. A verdict hanging on one thread must say so.
- Steelman (required): in caseAssessment.steelman, state the strongest argument FOR the featured hypothesis that your assessment does NOT answer — specific, no hedging; "some people disagree" is a failing answer. It never changes your verdict.
- loadBearing AND weakestLinks are arrays of CLAIM ids only (like XXX-C001) — never evidence ids, never prose sentences. Put the prose reasons in the synthesis. claimAssessments cover every featured claim by id.

Reply ONLY JSON:
{"caseAssessment": {"verdict": "...", "loadBearing": ["..."], "weakestLinks": ["..."], "synthesis": "...", "steelman": "..."}, "claimAssessments": [{"claimId": "...", "verdict": "...", "reasoning": "...", "confidence": "high|moderate|low"}], "whatChanged": "which dissents (case-level and claim-level) moved you, which did not, and why — 2-5 sentences"}`;

  // House-drafting call (the reconsideration is a draft that rides the
  // gates like any other): the one-shot Opus refusal fallback applies, and
  // the overlay's model stamp must be the model that actually answered.
  const { text: reply, model: modelUsed } = await callWithRefusalFallback(
    provider,
    SYSTEM,
    `Case: ${dir}\n\n${JSON.stringify(packet, null, 2)}`,
  );
  const d = parseJsonReply(reply);

  // Fail-closed validation, mirroring reassess-changed.
  const known = new Set(claims.map((c) => c.id));
  const errs = [];
  if (!VERDICTS.includes(d.caseAssessment?.verdict)) errs.push("bad case verdict");
  if ((d.caseAssessment?.synthesis ?? "").length < 150) errs.push("synthesis too short");
  if ((d.caseAssessment?.steelman ?? "").length < 40)
    errs.push("steelman missing or too thin (the counterweight is required)");
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
    model: `${provider.name}/${modelUsed} (reconsideration — deliberately non-blind: engages the panel's dissents)`,
    date: today,
    promptVersion: PROMPT_VERSION,
    humanReviewed: false,
    role: "draft",
    // The checks whose dissents were in hand: exactly these can never
    // ratify this draft — only a blind check outside this list can.
    reconciles: checks.map((r) => r.runId),
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
  return { dir, runId, from: draft.caseAssessment.verdict, to: d.caseAssessment.verdict, splitClaims, whatChanged: d.whatChanged, file, dryRun };
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
      const shape = [
        r.dissenting.length >= 2 ? `${r.dissenting.length} seats dispute the case verdict` : "",
        r.splitClaims.length > 0 ? `the panel splits on ${r.splitClaims.join(", ")}` : "",
      ].filter(Boolean).join("; ");
      console.log(
        `${dir}: genuine standoff — the house has engaged (${r.draft.runId}) and the dispute stands (${shape}). Displayed as contested; no re-litigation.`,
      );
      continue;
    }
    console.log(
      `${dir}: reconsideration ${r.dryRun ? "(dry run) " : ""}${r.from} -> ${r.to} (${r.runId})${r.splitClaims.length > 0 ? ` — engaged split claims ${r.splitClaims.join(", ")}` : ""}. ${r.whatChanged}`,
    );
  } catch (err) {
    console.error(`${dir}: ${err.message} — nothing written`);
  }
}
