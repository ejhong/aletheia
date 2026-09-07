import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadCase } from "../../src/domain/load.ts";
import type { LoadedCase } from "../../src/domain/schema.ts";
import { recordSchemas, type ResearchProposal } from "../../src/domain/researchProposal.ts";
import { readIntakeDecisions, writeIntakeDecisions } from "./intake-store.mjs";
import { researchBasis, resolveResearchCase, validateResearchProposal } from "./research-proposals.ts";
import { readCaseSnapshot } from "./case-snapshot.mjs";
import { fingerprint } from "./review-state.mjs";
import { appendCaseHistory, installCaseFiles } from "./case-files.ts";

function present(loaded: LoadedCase, proposal: ResearchProposal) {
  const records = { source: loaded.sources, claim: loaded.claims, evidence: loaded.evidence,
    research: loaded.research, study: loaded.studies };
  return proposal.changes.every(change => {
    const found = records[change.kind].find(record => record.id === change.recordId);
    return found && fingerprint(found) === fingerprint(recordSchemas[change.kind].parse(change.after));
  }) && Object.entries(proposal.themeAdditions).every(([key, value]) => loaded.record.themes[key] === value);
}

/** Prepare already recorded change bundles in a working tree for the normal
 * gated PR. This has no model calls, commits, pushes, or merge authority. */
export function prepareResearchAdoptions(root: string, stamp: { runId: string; generatedAt: string }, dryRun = false) {
  const history = readIntakeDecisions(root);
  const changedCases = new Set<string>();
  const outcomes: Array<{ proposalId: string; case: string; decision: string; reason: string; records: number }> = [];
  for (const entry of history.filter(e => e.stage === "research-proposal" && e.decision === "proposed")) {
    const proposal: ResearchProposal = entry.research!;
    if (changedCases.has(proposal.case)) continue; // other candidates need a fresh basis after this adoption
    const caseDir = resolveResearchCase(root, proposal.case);
    if (!path.relative(path.join(root, "content/cases"), caseDir).split(path.sep).every(p => p !== "..")) continue;
    const before = loadCase(caseDir);
    const inputHash = fingerprint(researchBasis(caseDir, before));
    if (history.some(prior => prior.stage === "research-adoption" &&
      prior.details?.proposalId === entry.id && (prior.decision === "prepared" || prior.inputHash === inputHash))) continue;
    let decision = "already_present";
    let reason = "The proposed records are already present in the ledger; no replacement needed.";
    let count = 0;
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "aletheia-research-adoption-"));
    try {
      if (!present(before, proposal)) {
        if (fingerprint(proposal.basis) !== inputHash) {
          decision = "stale";
          reason = "Case inputs changed after this proposal. Reconsider it against the current ledger before adoption.";
        } else {
          const prospective = path.join(temporary, "case");
          const review = validateResearchProposal(root, proposal, prospective);
          decision = "prepared";
          reason = [proposal.rationale, ...review.warnings].join(" ");
          count = proposal.changes.length;
          if (!dryRun) {
            if (fingerprint(researchBasis(caseDir)) !== inputHash) throw new Error("case changed before adoption");
            const originalFiles = readCaseSnapshot(caseDir).files;
            const files = readCaseSnapshot(prospective).files;
            const changes: Record<string, string> = Object.fromEntries(Object.entries(files)
              .filter(([file, body]) => body !== originalFiles[file]));
            const update = {
              date: stamp.generatedAt.slice(0, 10), kind: "content", aiAssisted: true,
              change: `Recorded research proposal ${proposal.runId}: ${proposal.changes.map(c => c.recordId).join(", ")}.`,
              reason: proposal.rationale,
              actor: `${proposal.model}; ${proposal.promptVersion}; materialized by ${stamp.runId}`,
            };
            changes["history.yaml"] = appendCaseHistory(caseDir, { ...update, kind: "content" });
            installCaseFiles(caseDir, changes);
          }
          changedCases.add(proposal.case);
        }
      }
    } catch (error) {
      if (error instanceof AggregateError) throw error;
      decision = "invalid";
      count = 0;
      reason = error instanceof Error ? error.message : "proposal validation failed";
    } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
    const outcome = { proposalId: entry.id, case: proposal.case, decision, reason, records: count };
    outcomes.push(outcome);
    if (!dryRun) writeIntakeDecisions(root, [{ case: proposal.case, stage: "research-adoption", decision,
      ref: entry.storageRef, reason, inputHash, candidateHash: entry.candidateHash,
      runId: stamp.runId, generatedAt: stamp.generatedAt, date: stamp.generatedAt.slice(0, 10),
      model: "Aletheia proposal materializer (no model call)", promptVersion: "research-adoption-v1",
      details: { proposalId: entry.id, recordIds: proposal.changes.map(c => c.recordId) },
    }]);
  }
  return { prepared: changedCases.size, outcomes };
}
