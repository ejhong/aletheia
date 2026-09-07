import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { stringify } from "yaml";
import { EditionProposalSchema, type EditionProposal } from "../../src/domain/editionProposal.ts";
import { displayAssessment, featuredClaims, loadCase } from "../../src/domain/load.ts";
import type { LoadedCase, AssessmentRun } from "../../src/domain/schema.ts";
import { extractClaimRefs, extractPlateRefs, parseArticle } from "../../src/domain/article.ts";
import { assessmentHash, fingerprint } from "./review-state.mjs";
import { researchBasis, resolveResearchCase } from "./research-proposals.ts";
import { readIntakeDecisions, writeIntakeDecisions } from "./intake-store.mjs";

function selection(loaded: LoadedCase) {
  return loaded.editions.at(-1)?.featuredClaimIds ?? featuredClaims(loaded).map(c => c.id);
}
export function editionBasis(caseDir: string, loaded = loadCase(caseDir)) {
  const assessment = displayAssessment(loaded)?.run;
  return { ...researchBasis(caseDir, loaded), ledgerHash: loaded.ledgerHash,
    incumbentHash: fingerprint({ edition: loaded.editions.at(-1) ?? null,
      article: loaded.overviewMarkdown, featured: selection(loaded),
      assessment: assessment ? assessmentHash(assessment) : null }) };
}

/** Capture the actual incumbent, including its original assessment authorship. */
export function seedEdition(root: string, key: string, stamp: {
  runId: string; generatedAt: string; model: string; promptVersion: string;
}) {
  const caseDir = resolveResearchCase(root, key);
  const loaded = loadCase(caseDir);
  const previous = loaded.editions.at(-1);
  const assessment = displayAssessment(loaded)?.run;
  return EditionProposalSchema.parse({ case: loaded.record.slug, edition: {
    version: 1, ...stamp, basis: editionBasis(caseDir, loaded),
    previous: previous ? { runId: previous.runId, hash: fingerprint(previous) } : null,
    assessment: assessment ? { runId: assessment.runId, hash: assessmentHash(assessment) } : null,
    featuredClaimIds: selection(loaded), article: loaded.overviewMarkdown,
    rationale: "Preserve the incumbent essay, selection, and assessment as a versioned edition.",
  } });
}

function substance(proposal: EditionProposal, referenced?: AssessmentRun) {
  const e = proposal.edition;
  const assessment = proposal.assessment ?? referenced;
  return fingerprint({ article: e.article, featured: e.featuredClaimIds,
    assessment: assessment ? { caseAssessment: assessment.caseAssessment, claimAssessments: assessment.claimAssessments } : null });
}

/** No in-place publication: validate a complete prospective case and optionally
 * materialize it in a NEW review directory. The ordinary PR gate publishes it. */
export function validateEditionProposal(root: string, raw: unknown, outputDir?: string) {
  const proposal = EditionProposalSchema.parse(raw);
  const { edition, assessment } = proposal;
  const caseDir = resolveResearchCase(root, proposal.case);
  const before = loadCase(caseDir);
  if (proposal.case !== before.record.slug) throw new Error("edition must use the public case slug");
  if (fingerprint(edition.basis) !== fingerprint(editionBasis(caseDir, before)))
    throw new Error("stale edition proposal: ledger, inputs, or incumbent changed");
  if (before.editions.some(e => e.runId === edition.runId)) throw new Error("edition id already exists");
  if (assessment && before.assessmentRuns.some(run => run.runId === assessment.runId))
    throw new Error("assessment id already exists; reference it without rewriting it");
  if (assessment && (edition.assessment?.runId !== assessment.runId ||
    edition.assessment.hash !== assessmentHash(assessment))) throw new Error("unbound proposed assessment");
  parseArticle(edition.article);
  const previous = before.editions.at(-1);
  const difference = {
    featuredAdded: edition.featuredClaimIds.filter(id => !selection(before).includes(id)),
    featuredRemoved: selection(before).filter(id => !edition.featuredClaimIds.includes(id)),
    claimReferencesRemoved: extractClaimRefs(before.overviewMarkdown).filter(id => !extractClaimRefs(edition.article).includes(id)),
    platesRemoved: extractPlateRefs(before.overviewMarkdown).filter(id => !extractPlateRefs(edition.article).includes(id)),
    articleChanged: before.overviewMarkdown !== edition.article,
    assessmentChanged: (displayAssessment(before)?.run.runId ?? null) !== (edition.assessment?.runId ?? null),
  };
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "aletheia-edition-proposal-"));
  const draftDir = path.join(temp, "case");
  try {
    fs.cpSync(caseDir, draftDir, { recursive: true });
    // The legacy essay survives in git and the initial edition. One authority.
    const legacy = path.join(draftDir, "overview.md");
    if (fs.existsSync(legacy)) fs.unlinkSync(legacy);
    if (assessment) {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,119}$/.test(assessment.runId)) throw new Error("unsafe assessment id");
      fs.mkdirSync(path.join(draftDir, "assessments"), { recursive: true });
      fs.writeFileSync(path.join(draftDir, "assessments", `${assessment.runId}.yaml`), stringify(assessment), { flag: "wx" });
    }
    fs.mkdirSync(path.join(draftDir, "editions"), { recursive: true });
    fs.writeFileSync(path.join(draftDir, "editions", `${edition.runId}.yaml`), stringify(edition), { flag: "wx" });
    const after = loadCase(draftDir);
    // New IDs, dates and author stamps alone are not an improved edition. A
    // genuinely changed ledger may warrant renewing an otherwise stable account.
    const unchanged = Boolean(previous && previous.basis.ledgerHash === edition.basis.ledgerHash &&
      previous.basis.inputsHash === edition.basis.inputsHash &&
      substance({ case: proposal.case, edition: previous }, displayAssessment(before)?.run) ===
      substance(proposal, after.assessmentRuns.find(run => run.runId === edition.assessment?.runId)));
    if (outputDir) {
      if (unchanged) throw new Error("unchanged edition; retain the incumbent");
      if (fs.existsSync(outputDir)) throw new Error("review directory already exists");
      fs.cpSync(draftDir, outputDir, { recursive: true, errorOnExist: true, force: false });
    }
    return { case: proposal.case, runId: edition.runId, unchanged, difference,
      candidateHash: fingerprint(edition), contentHash: after.contentHash,
      reviewPacketHash: after.reviewPacketHash, assessmentHash: edition.assessment?.hash ?? null };
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}

export function recordEditionProposal(root: string, raw: unknown) {
  const proposal = EditionProposalSchema.parse(raw);
  const report = validateEditionProposal(root, raw);
  const e = proposal.edition;
  const inputHash = fingerprint(e.basis);
  const loaded = loadCase(resolveResearchCase(root, proposal.case));
  const candidateHash = substance(proposal, loaded.assessmentRuns.find(run => run.runId === e.assessment?.runId));
  const prior = readIntakeDecisions(root).find(entry => entry.stage === "edition-proposal" &&
    entry.case === proposal.case && entry.inputHash === inputHash && entry.candidateHash === candidateHash);
  if (prior) return { ...report, rested: true, decisionId: prior.id };
  const file = writeIntakeDecisions(root, [{ case: proposal.case, stage: "edition-proposal",
    decision: report.unchanged ? "no_change" : "proposed", edition: proposal,
    date: e.generatedAt.slice(0, 10), generatedAt: e.generatedAt, runId: e.runId,
    model: e.model, promptVersion: e.promptVersion, reason: e.rationale,
    inputHash, candidateHash, details: { difference: report.difference } }]);
  return { ...report, rested: false, file };
}
