import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ResearchProposal } from "../../src/domain/researchProposal.ts";
import { loadCase } from "../../src/domain/load.ts";
import { readIntakeDecisions, writeIntakeDecisions } from "./intake-store.mjs";
import { recordResearchProposal, researchBasis, resolveResearchCase } from "./research-proposals.ts";
import { createResearchBudget, boundedCompletion } from "./bounded-model.mjs";
import { retrieveSource } from "./source-passages.mjs";
import { RESEARCH_PROMPT, proposeSourceReading } from "./source-reader.ts";
import { fingerprint } from "./review-state.mjs";

export const MAX_RESEARCH_SOURCES = 2;
export type SourceRequest = { case: string; url: string; key: string; ref?: string; context?: string };
type Options = {
  runId?: string; generatedAt?: string;
  retrieve?: typeof retrieveSource;
  complete?: typeof boundedCompletion;
};

/** One reader and one budget, including sources belonging to different cases. */
export async function researchSources(root: string, requests: SourceRequest[], options: Options = {}) {
  if (!requests.length || requests.length > MAX_RESEARCH_SOURCES ||
    new Set(requests.map(r => `${r.case}:${r.url}`)).size !== requests.length)
    throw new Error("a source pass requires one or two distinct case/URL requests");
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const runId = options.runId ?? `sources-${generatedAt.slice(0, 10)}-${randomUUID()}`;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]+$/.test(runId)) throw new Error("unsafe research run id");
  const history = readIntakeDecisions(root);
  const contexts = [...new Set(requests.map(r => r.case))].map(key => {
    const dir = resolveResearchCase(root, key);
    const loaded = loadCase(dir);
    const basis = researchBasis(dir, loaded);
    const memory = history.filter(entry => [loaded.record.slug, path.basename(dir)].includes(entry.case ?? ""))
      .slice(-20).map(entry => ({ id: entry.id, date: entry.date, decision: entry.decision,
        reason: entry.reason, proposal: entry.proposal,
        changes: entry.research?.changes.map((c: ResearchProposal["changes"][number]) =>
          ({ kind: c.kind, recordId: c.recordId, rationale: c.rationale, after: c.after })) }));
    const proposal: ResearchProposal = {
      version: 1, case: loaded.record.slug, basis, runId, generatedAt,
      model: "pending", promptVersion: RESEARCH_PROMPT, intent: "add",
      title: "Primary-source observations", rationale: "Record narrow observations with source context and a separate reading check.",
      priorDecisionIds: [], themeAdditions: {}, changes: [],
    };
    return { key, loaded, proposal, memory };
  });
  if (new Set(contexts.map(c => c.loaded.record.slug)).size !== contexts.length)
    throw new Error("use one case name consistently within a source pass");
  const runDir = path.join(root, ".research-runs", runId);
  fs.mkdirSync(runDir, { recursive: true });
  if (["budget.json", "report.json"].some(file => fs.existsSync(path.join(runDir, file))))
    throw new Error("research run id already used");
  const saveBudget = (report: unknown) => {
    const temporary = path.join(runDir, "budget.tmp");
    fs.writeFileSync(temporary, JSON.stringify(report, null, 2));
    fs.renameSync(temporary, path.join(runDir, "budget.json"));
  };
  const budget = createResearchBudget({ save: saveBudget });
  const retrieve = options.retrieve ?? retrieveSource;
  const complete = options.complete ?? boundedCompletion;
  const outcomes: Array<Record<string, unknown>> = [];
  const proposals: Array<{ case: string; file: string; records: number; rested: boolean }> = [];
  let failure: string | undefined;
  let failureKind = "failed";
  for (const request of requests) {
    const context = contexts.find(c => c.key === request.case)!;
    const { proposal, loaded, memory } = context;
    try {
      budget.checkTime();
      const capture = await retrieve(request.url, { timeoutMs: Math.min(20000, budget.remainingMs()) });
      const result = await proposeSourceReading({ capture, loaded, runId, generatedAt, memory,
        existingChanges: proposal.changes, requestContext: request.context,
        call: (role, instructions, input) => complete(budget, role, {
          instructions, input, inputHash: fingerprint({ instructions, input }),
        }),
      });
      if (result.outcome === "proposed") {
        for (const [theme, label] of Object.entries(result.themeAdditions))
          if (theme in proposal.themeAdditions && proposal.themeAdditions[theme] !== label)
            throw new Error(`conflicting proposed theme: ${theme}`);
        Object.assign(proposal.themeAdditions, result.themeAdditions);
        proposal.changes.push(...result.changes);
        proposal.model = result.model;
      }
      outcomes.push({ ...request, case: loaded.record.slug,
        retrieval: Object.fromEntries(Object.entries(capture).filter(([key]) => key !== "text")),
        outcome: result.outcome, model: result.model,
        reason: "reason" in result ? result.reason : null, review: "review" in result ? result.review : null });
    } catch (error) {
      failure = error instanceof Error ? error.message : "source pass failed";
      failureKind = error instanceof Error && "kind" in error ? String(error.kind) : "failed";
      outcomes.push({ ...request, case: loaded.record.slug, outcome: failureKind, reason: failure });
      if ((error instanceof Error && "kind" in error) ||
        budget.report().calls.some((call: { usage?: unknown }) => !call.usage)) break;
    }
  }
  for (const { proposal } of contexts) {
    if (!proposal.changes.length) continue;
    try {
      const result = recordResearchProposal(root, proposal);
      proposals.push({ case: proposal.case, file: result.file, records: proposal.changes.length, rested: result.rested });
      for (const outcome of outcomes)
        if (outcome.case === proposal.case && outcome.outcome === "proposed") outcome.proposalFile = result.file;
    } catch (error) {
      failure = error instanceof Error ? error.message : "invalid research bundle";
      failureKind = "failed";
      fs.writeFileSync(path.join(runDir, `incomplete-${proposal.case}.json`), JSON.stringify(proposal, null, 2));
      for (const outcome of outcomes)
        if (outcome.case === proposal.case && outcome.outcome === "proposed") {
          outcome.outcome = "failed";
          outcome.reason = failure;
        }
    }
  }
  const decision = proposals.length
    ? failure ? "partial" : proposals.every(p => p.rested) ? "no_change" : "completed"
    : failure ? ["failed", "refused", "budget_exhausted"].includes(failureKind) ? failureKind : "failed" : "no_change";
  const report = {
    runId, case: contexts.length === 1 ? contexts[0].loaded.record.slug : null,
    decision, requests, cases: contexts.map(c => ({ case: c.loaded.record.slug, basis: c.proposal.basis })),
    basis: contexts.length === 1 ? contexts[0].proposal.basis : null,
    urls: requests.map(r => r.url), proposedRecords: proposals.reduce((sum, p) => sum + p.records, 0),
    proposalFile: proposals.length === 1 ? proposals[0].file : null, proposals,
    outcomes, failure: failure ?? null, budget: budget.report(),
  };
  fs.writeFileSync(path.join(runDir, "report.json"), JSON.stringify(report, null, 2));
  writeIntakeDecisions(root, [{ case: report.case, stage: "research-run", decision,
    reason: failure ?? (proposals.length ? "Source-read proposals recorded for review." : "No new proposal advanced in this source scope."),
    date: generatedAt.slice(0, 10), generatedAt, runId, promptVersion: RESEARCH_PROMPT,
    inputHash: fingerprint({ cases: report.cases, requests }), caseBasis: report.basis?.contentHash ?? null,
    retryable: Boolean(failure), details: report,
  }]);
  return report;
}
