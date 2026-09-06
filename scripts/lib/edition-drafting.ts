import fs from "node:fs";
import path from "node:path";
import { randomInt, randomUUID } from "node:crypto";
import { stringify } from "yaml";
import { z } from "zod";
import { loadCase, displayAssessment } from "../../src/domain/load.ts";
import { EditionProposalSchema, type EditionProposal } from "../../src/domain/editionProposal.ts";
import { EDITION_PROTOCOL, EditionCycleSchema, EditionDraftSchema, EditionRankingSchema,
  editionChoice, type EditionCycle, type EditionSeat } from "../../src/domain/editionCycle.ts";
import { assessmentHash, fingerprint } from "./review-state.mjs";
import { evidencePacket, readCaseSnapshot } from "./case-snapshot.mjs";
import { claimAssessmentIds } from "./claim-assessment-scope.mjs";
import { resolveResearchCase } from "./research-proposals.ts";
import { editionBasis, seedEdition, recordEditionProposal, validateEditionProposal } from "./edition-proposals.ts";
import { readIntakeDecisions, writeIntakeDecisions } from "./intake-store.mjs";
import { callWithRefusalFallback, pickProvider, parseJsonReply } from "./llm.mjs";
import { VENDORS, callVendor } from "./vendors.mjs";
import { appendCaseHistory, installCaseFiles } from "./case-files.ts";
import { COMPARE_SYSTEM, DRAFT_SYSTEM } from "./edition-prompts.ts";

const modes = ["revision", "recomposition"] as const;
const labels = ["A", "B", "C"] as const;
const anonymousVote = z.object({ ranking: z.array(z.enum(labels)).length(3).refine(r => new Set(r).size === 3),
  reason: z.string().trim().min(10),
  judgments: z.array(z.object({ option: z.enum(labels), status: z.enum(["complies", "violates", "unsure"]),
    reason: z.string().trim().min(10) }).strict()).length(3).refine(j => new Set(j.map(v => v.option)).size === 3),
}).strict();
const message = (error: unknown) => error instanceof Error ? error.message : "Edition operation failed";
const rulesHash = (root: string) => fingerprint({ constitution: fs.readFileSync(path.join(root, "AGENTS.md"), "utf8"),
  draft: DRAFT_SYSTEM, compare: COMPARE_SYSTEM });

export function editionPlan(root: string, key: string, at = new Date().toISOString(), reconsider?: string) {
  if (reconsider !== undefined && reconsider.trim().length < 10) throw new Error("give a specific reconsideration reason (10+ characters)");
  const dir = resolveResearchCase(root, key);
  const loaded = loadCase(dir);
  const basis = editionBasis(dir, loaded);
  const current = loaded.editions.at(-1);
  const rawPrior = readIntakeDecisions(root).filter(e => e.stage === "edition-cycle" && e.case === loaded.record.slug).at(-1)?.editionCycle;
  const prior = rawPrior ? EditionCycleSchema.parse(rawPrior) : undefined;
  const rules = rulesHash(root);
  let reason = "The edition has new inputs to consider.";
  let due = true;
  if (!current) { due = false; reason = "Legacy case: migrate its incumbent before automatic edition drafting."; }
  else if (!loaded.claims.some(c => c.reviewState !== "rejected") || !loaded.evidence.length) {
    due = false; reason = "No assessable ledger yet; leave the opening unassessed and continue intake.";
  } else if (!reconsider && prior?.rulesHash === rules && current.promptVersion === EDITION_PROTOCOL &&
      current.basis.ledgerHash === basis.ledgerHash && current.basis.inputsHash === basis.inputsHash) {
    due = false; reason = "The current edition already considered these ledger and founding inputs.";
  } else if (!reconsider && prior?.rulesHash === rules && fingerprint(prior.basis) === fingerprint(basis) &&
      (prior.outcome !== "failed" || prior.generatedAt.slice(0, 10) === at.slice(0, 10))) {
    due = false;
    reason = prior.outcome === "proposed" ? "A compared candidate is ready for preparation without another model call."
      : `The recorded comparison is ${prior.outcome}; rest until inputs change or explicit reconsideration.`;
  }
  return { case: loaded.record.slug, dir, loaded, basis, prior, rules, due, reason };
}

function interpretation(proposal: EditionProposal) {
  return { article: proposal.edition.article, featuredClaimIds: proposal.edition.featuredClaimIds,
    caseAssessment: proposal.assessment?.caseAssessment ?? null,
    claimAssessments: proposal.assessment?.claimAssessments ?? [] };
}

/** Prepare only the recorded winner, rechecking both the vote and current basis.
 * Publication and independent blind standing still belong to the normal gate. */
export function prepareEditionCycle(root: string, raw: unknown) {
  const cycle = EditionCycleSchema.parse(raw);
  const receipt = readIntakeDecisions(root).find(e => e.editionCycle && fingerprint(e.editionCycle) === fingerprint(cycle));
  if (!receipt) throw new Error("edition comparison must be recorded before preparation");
  if (cycle.rulesHash !== rulesHash(root)) throw new Error("constitution or drafting protocol changed after comparison");
  if (cycle.outcome !== "proposed" || !cycle.winner) throw new Error("comparison did not advance an edition");
  const proposal = cycle.drafts.find(d => d.option === cycle.winner)!.proposal!;
  const dir = resolveResearchCase(root, cycle.case);
  const current = loadCase(dir).editions.at(-1);
  if (current?.runId === proposal.edition.runId && fingerprint(current) === fingerprint(proposal.edition))
    return { prepared: false, reason: "The exact compared edition is already present." };
  const report = validateEditionProposal(root, proposal);
  if (report.unchanged) return { prepared: false, reason: "The compared edition is unchanged; retain the incumbent." };
  if (!current) throw new Error("automatic preparation requires a migrated incumbent");
  if (fingerprint(editionBasis(dir)) !== fingerprint(cycle.basis)) throw new Error("case changed before edition preparation");
  const changes: Record<string, string> = {
    [`assessments/${proposal.assessment!.runId}.yaml`]: stringify(proposal.assessment),
    [`editions/${proposal.edition.runId}.yaml`]: stringify(proposal.edition),
    "history.yaml": appendCaseHistory(dir, {
      date: proposal.edition.generatedAt.slice(0, 10), kind: "content", aiAssisted: true,
      change: "Prepared a new illustrated edition and its assessment after independent candidate comparison.",
      reason: proposal.edition.rationale,
      actor: `${proposal.edition.model}; ${EDITION_PROTOCOL}; ${cycle.runId}; comparison ${receipt.id}`,
    }),
  };
  installCaseFiles(dir, changes);
  return { prepared: true, reason: proposal.edition.rationale, runId: proposal.edition.runId };
}

type Dependencies = {
  now?: () => string;
  draft?: (system: string, user: string) => Promise<{ text: string; model: string }>;
  judge?: (vendor: string, system: string, user: string) => Promise<string>;
  progress?: (message: string) => void;
};

/** Two drafts, one comparison, one durable result. No self-scored saturation,
 * repair loop, commit, push, or implicit permission to publish. */
export async function draftEdition(root: string, key: string,
  options: { prepare?: boolean; reconsider?: string; reuseDraftsFrom?: string } = {}, dependencies: Dependencies = {}) {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const progress = dependencies.progress ?? (() => {});
  const plan = editionPlan(root, key, now(), options.reconsider);
  if (!plan.due) {
    if (options.prepare && plan.prior?.outcome === "proposed" &&
        fingerprint(plan.prior.basis) === fingerprint(plan.basis))
      return { ...prepareEditionCycle(root, plan.prior), rested: true };
    return { rested: true, prepared: false, reason: plan.reason };
  }
  const provider = pickProvider();
  if (!dependencies.draft && !provider && !options.reuseDraftsFrom) throw new Error("No configured edition author key; no work was attempted.");
  const draftCall = dependencies.draft ?? ((system, user) => callWithRefusalFallback(provider!, system, user));
  const judgeCall = dependencies.judge ?? ((vendor, system, user) => callVendor(vendor, { system, user, maxTokens: 16000 }));
  const runId = `edition-${now().slice(0, 10)}-${randomUUID()}`;
  const { dir, loaded, basis } = plan;
  const assertCurrent = () => {
    if (fingerprint(editionBasis(dir)) !== fingerprint(basis) || rulesHash(root) !== plan.rules)
      throw new Error("case changed during edition drafting; proposals remain unadopted");
  };
  const ledger = evidencePacket(readCaseSnapshot(dir).files);
  const recordHashes: Record<string, string> = {};
  for (const [kind, records] of Object.entries({ claims: loaded.claims, evidence: loaded.evidence,
    sources: loaded.sources, research: loaded.research, studies: loaded.studies, images: loaded.images }))
    for (const record of records) recordHashes[`${kind}/${record.id}`] = fingerprint(record);
  const priorHashes = plan.prior?.recordHashes ?? {};
  const incumbent = seedEdition(root, key, { runId: `${runId}-incumbent`, generatedAt: now(),
    model: "Incumbent assembler (no model call)", promptVersion: EDITION_PROTOCOL });
  const assessment = displayAssessment(loaded)?.run;
  const incumbentView = { ...interpretation(incumbent), caseAssessment: assessment?.caseAssessment ?? null,
    claimAssessments: assessment?.claimAssessments ?? [] };
  const packet = {
    constitution: fs.readFileSync(path.join(root, "AGENTS.md"), "utf8"),
    ledger, plates: loaded.images, incumbent: incumbentView,
    foundingInputs: loaded.narrativeInputs.map(input => ({ ...input, text: fs.readFileSync(input.file.startsWith("inputs/")
      ? path.join(dir, input.file) : path.resolve(root, input.file), "utf8") })),
    corrections: loaded.history,
    changes: { changed: Object.keys(recordHashes).filter(k => priorHashes[k] !== recordHashes[k]),
      removed: Object.keys(priorHashes).filter(k => !recordHashes[k]),
      initialComparison: !plan.prior, reconsider: options.reconsider ?? null },
    previousDecision: plan.prior ? { outcome: plan.prior.outcome,
      reasons: plan.prior.seats.map(s => ({ vote: s.vote, error: s.error })) } : null,
  };
  // The complete packet is passed to both authors; diff guides attention, never
  // removes the evidence needed to notice an indirect consequence.
  const drafts: EditionCycle["drafts"] = [];
  if (options.reuseDraftsFrom) {
    const original = readIntakeDecisions(root).find(e => e.stage === "edition-cycle" && e.case === plan.case && e.runId === options.reuseDraftsFrom)?.editionCycle;
    if (!original) throw new Error("unknown prior edition comparison");
    const reused = EditionCycleSchema.parse(original);
    if (fingerprint(reused.basis) !== fingerprint(basis) || reused.drafts.some(d => !d.proposal))
      throw new Error("reusing drafts requires two valid candidates on the current inputs");
    for (const draft of reused.drafts) { validateEditionProposal(root, draft.proposal); drafts.push(draft); }
    progress(`Reusing both recorded drafts from ${reused.runId}; no author calls.`);
  }
  for (const option of options.reuseDraftsFrom ? [] : modes) {
    assertCurrent();
    const user = JSON.stringify({ ...packet, task: option === "revision"
      ? "Make a focused revision. Preserve what works; reconsider assessments and relevant passages against changed inputs."
      : "Compose a fresh alternative from the same evidence. Improve the structure, selection and explanation where warranted." });
    const inputHash = fingerprint({ system: DRAFT_SYSTEM, user });
    let model = provider?.model ?? "Injected test author";
    let reply: string | null = null;
    try {
      progress(`Drafting ${option} for ${plan.case}.`);
      const answer = await draftCall(DRAFT_SYSTEM, user);
      model = answer.model; reply = answer.text;
      const content = EditionDraftSchema.parse(parseJsonReply(reply));
      const required = claimAssessmentIds(loaded.claims, content.featuredClaimIds);
      const supplied = content.claimAssessments.map(a => a.claimId);
      if (new Set(supplied).size !== supplied.length || required.some(id => !supplied.includes(id)) ||
          supplied.some(id => !required.includes(id))) throw new Error("assessment must cover exactly the selected and legacy featured claims");
      const generatedAt = now();
      const assessment = { runId: `${runId}-${option}-assessment`, generatedAt, date: generatedAt.slice(0, 10),
        model, promptVersion: EDITION_PROTOCOL, humanReviewed: false, role: "draft" as const, inputHash,
        caseAssessment: content.caseAssessment, claimAssessments: content.claimAssessments };
      const proposal = EditionProposalSchema.parse({ case: plan.case, assessment, edition: {
        ...incumbent.edition, runId: `${runId}-${option}`, generatedAt, model,
        featuredClaimIds: content.featuredClaimIds, article: content.article, rationale: content.rationale,
        assessment: { runId: assessment.runId, hash: assessmentHash(assessment) },
      } });
      assertCurrent();
      recordEditionProposal(root, proposal);
      drafts.push({ option, model, inputHash, proposal, error: null, rejectedReply: null });
    } catch (error) {
      drafts.push({ option, model, inputHash, proposal: null, error: message(error), rejectedReply: reply });
      progress(`${option} did not validate: ${message(error)}`);
    }
  }
  assertCurrent();
  const seats: EditionSeat[] = [];
  if (drafts.every(d => d.proposal)) {
    progress(`Comparing both drafts with the incumbent for ${plan.case}.`);
    // Fisher–Yates per seat: no author identity or consistently favored position.
    const results = await Promise.allSettled(Object.entries(VENDORS).map(async ([vendor, config]) => {
      const order: EditionSeat["order"] = ["incumbent", ...modes];
      for (let i = order.length - 1; i > 0; i--) {
        const j = randomInt(i + 1); [order[i], order[j]] = [order[j], order[i]];
      }
      const { incumbent: ignored, previousDecision: priorIgnored, ...reference } = packet;
      void ignored; void priorIgnored;
      const user = JSON.stringify({ ...reference, incumbentLabel: labels[order.indexOf("incumbent")],
        options: Object.fromEntries(order.map((option, i) => [labels[i], option === "incumbent" ? incumbentView
          : interpretation(drafts.find(d => d.option === option)!.proposal!)])) });
      const inputHash = fingerprint({ system: COMPARE_SYSTEM, user });
      const base = { vendor, model: config.model, effort: config.effort, order, inputHash };
      let reply: string | null = null;
      try {
        if (!dependencies.judge && !config.key()) throw new Error("Missing vendor key; no paid attempt.");
        reply = await judgeCall(vendor, COMPARE_SYSTEM, user);
        const raw = anonymousVote.parse(parseJsonReply(reply));
        const vote = EditionRankingSchema.parse({ ...raw, ranking: raw.ranking.map(label => order[labels.indexOf(label)]),
          judgments: raw.judgments.map(o => ({ ...o, option: order[labels.indexOf(o.option)] })) });
        return { ...base, generatedAt: now(), vote, error: null, rejectedReply: null };
      } catch (error) { return { ...base, generatedAt: now(), vote: null, error: message(error), rejectedReply: reply }; }
    }));
    for (const result of results) {
      if (result.status === "rejected") throw result.reason;
      seats.push(result.value);
    }
  }
  const cycle = EditionCycleSchema.parse({ version: 1, promptVersion: EDITION_PROTOCOL, case: plan.case,
    runId, generatedAt: now(), basis, reconsider: options.reconsider ?? null,
    packetHash: fingerprint(packet), rulesHash: plan.rules, comparisonVersion: 2,
    ...(options.reuseDraftsFrom ? { reusedDraftsFrom: options.reuseDraftsFrom } : {}),
    recordHashes, drafts, seats, ...editionChoice(seats, 2) });
  writeIntakeDecisions(root, [{ case: plan.case, stage: "edition-cycle", decision: cycle.outcome, editionCycle: cycle,
    date: cycle.generatedAt.slice(0, 10), generatedAt: cycle.generatedAt, runId, promptVersion: EDITION_PROTOCOL,
    model: "Aletheia comparison counter (no model call)", inputHash: fingerprint(basis), candidateHash: fingerprint(cycle),
    reason: cycle.winner ? `Independent comparison advances the ${cycle.winner}; publication still requires the normal gate.`
      : `Comparison ${cycle.outcome}; the incumbent remains in place. See the complete draft and seat records.`,
  }]);
  assertCurrent();
  const prepared = options.prepare && cycle.winner ? prepareEditionCycle(root, cycle) : { prepared: false };
  return { rested: false, ...prepared, outcome: cycle.outcome, runId };
}
