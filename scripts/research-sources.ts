#!/usr/bin/env node
/** A manual, bounded source-reading pass. Public URLs are supplied explicitly;
 * this adapter does not claim web-discovery coverage. Never writes canon. */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { loadCase } from "../src/domain/load.ts";
import type { ResearchProposal } from "../src/domain/researchProposal.ts";
import { readIntakeDecisions, writeIntakeDecisions } from "./lib/intake-store.mjs";
import { recordResearchProposal, researchBasis, resolveResearchCase } from "./lib/research-proposals.ts";
import { createResearchBudget, boundedCompletion } from "./lib/bounded-model.mjs";
import { retrieveSource } from "./lib/source-passages.mjs";
import { RESEARCH_PROMPT, proposeSourceReading } from "./lib/source-reader.ts";
import { fingerprint } from "./lib/review-state.mjs";

const [key, ...urls] = process.argv.slice(2);
if (!key || urls.length < 1 || urls.length > 2 || new Set(urls).size !== urls.length)
  throw new Error("usage: node scripts/research-sources.ts <case> <public-https-url> [second-url] (at most two distinct sources)");
const root = process.cwd();
const caseDir = resolveResearchCase(root, key);
const loaded = loadCase(caseDir);
const basis = researchBasis(caseDir, loaded);
const generatedAt = new Date().toISOString();
const runId = `sources-${generatedAt.slice(0, 10)}-${randomUUID()}`;
const runDir = path.join(root, ".research-runs", runId);
fs.mkdirSync(runDir, { recursive: true });
const saveBudget = (report: unknown) => {
  const temporary = path.join(runDir, "budget.tmp");
  fs.writeFileSync(temporary, JSON.stringify(report, null, 2));
  fs.renameSync(temporary, path.join(runDir, "budget.json"));
};
const budget = createResearchBudget({ save: saveBudget });
const history = readIntakeDecisions(root).filter(entry =>
  [loaded.record.slug, path.basename(caseDir)].includes(entry.case ?? ""));
const memory = history.slice(-20).map(entry => ({ id: entry.id, date: entry.date,
  decision: entry.decision, reason: entry.reason, proposal: entry.proposal,
  changes: entry.research?.changes.map((change: ResearchProposal["changes"][number]) => ({ kind: change.kind, recordId: change.recordId, rationale: change.rationale, after: change.after })) }));
const proposal: Omit<ResearchProposal, "changes"> = {
  version: 1, case: loaded.record.slug, basis, runId, generatedAt,
  model: "pending", promptVersion: RESEARCH_PROMPT, intent: "add",
  title: "Primary-source observations", rationale: "Record narrow observations with source context and a separate reading check.",
  priorDecisionIds: [], themeAdditions: {},
};
const changes: Parameters<typeof proposeSourceReading>[0]["existingChanges"] = [];
const outcomes: Record<string, unknown>[] = [];
let decision = "no_change";
let failure: string | undefined;
let proposalFile: string | null = null;
try {
  for (const url of urls) {
    try {
      budget.checkTime();
      const capture = await retrieveSource(url, { timeoutMs: Math.min(20000, budget.remainingMs()) });
      const result = await proposeSourceReading({ capture, loaded, runId, generatedAt,
        existingChanges: changes, memory,
        call: (role, instructions, input) => boundedCompletion(budget, role, {
          instructions, input, inputHash: fingerprint({ instructions, input }),
        }),
      });
      const retrieval = Object.fromEntries(Object.entries(capture).filter(([key]) => key !== "text"));
      outcomes.push({ url, retrieval, outcome: result.outcome, model: result.model,
        reason: "reason" in result ? result.reason : null, review: "review" in result ? result.review : null });
      if (result.outcome === "proposed") {
        changes.push(...result.changes);
        for (const [theme, label] of Object.entries(result.themeAdditions)) {
          if (theme in proposal.themeAdditions && proposal.themeAdditions[theme] !== label)
            throw new Error(`conflicting proposed theme: ${theme}`);
          proposal.themeAdditions[theme] = label;
        }
        proposal.model = result.model;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "source pass failed";
      const kind = error instanceof Error && "kind" in error ? String(error.kind) : "failed";
      outcomes.push({ url, outcome: kind, reason: message });
      failure = message;
      decision = ["failed", "refused", "budget_exhausted"].includes(kind) ? kind : "failed";
      // A refusal, unknown model usage, or exhausted allowance ends paid
      // work. Completed independent readings can still form a valid bundle.
      if (error instanceof Error && "kind" in error) break;
    }
  }
  if (changes.length) {
    const result = recordResearchProposal(root, { ...proposal, changes });
    proposalFile = result.file;
    decision = failure ? "partial" : result.rested ? "no_change" : "completed";
  }
} catch (error) {
  const kind = error instanceof Error && "kind" in error ? error.kind : "failed";
  decision = ["failed", "refused", "budget_exhausted"].includes(String(kind)) ? String(kind) : "failed";
  failure = error instanceof Error ? error.message : "research pass failed";
  // Invalid or stale bundles stay local; a model reading cannot override
  // the production loader or a changed case basis.
  fs.writeFileSync(path.join(runDir, "incomplete.json"), JSON.stringify({ ...proposal, changes }, null, 2));
} finally {
  const report = { runId, case: loaded.record.slug, decision, basis, urls,
    proposedRecords: proposalFile ? changes.length : 0, proposalFile, outcomes,
    failure: failure ?? null, budget: budget.report() };
  fs.writeFileSync(path.join(runDir, "report.json"), JSON.stringify(report, null, 2));
  writeIntakeDecisions(root, [{
    case: loaded.record.slug, stage: "research-run", decision,
    reason: failure ?? (proposalFile ? "Source-read proposal recorded for review." : "No new proposal advanced in this source scope."),
    date: generatedAt.slice(0, 10), generatedAt, runId, promptVersion: RESEARCH_PROMPT,
    inputHash: fingerprint({ basis, urls }), caseBasis: basis.contentHash,
    retryable: Boolean(failure), details: report,
  }]);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
if (failure && !proposalFile) process.exitCode = 1;
