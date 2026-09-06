import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse, stringify } from "yaml";
import { loadCase } from "../../src/domain/load.ts";
import { ResearchProposalSchema, type ResearchProposal, type RecordKind } from "../../src/domain/researchProposal.ts";
import type { LoadedCase } from "../../src/domain/schema.ts";
import { fingerprint } from "./review-state.mjs";
import { exactSourceMatch } from "./source-identity.mjs";
import { readIntakeDecisions, writeIntakeDecisions } from "./intake-store.mjs";

/** Directory names and public slugs both work; incubating topics use the
 * same loader and validator as published cases. Ambiguity is an error. */
export function resolveResearchCase(root: string, key: string): string {
  const matches: string[] = [];
  for (const base of ["content/cases", "proposals/topics"]) {
    const dir = path.join(root, base);
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const caseDir = path.join(dir, entry.name);
      const file = path.join(caseDir, "case.yaml");
      if (!entry.isDirectory() || !fs.existsSync(file)) continue;
      const record = parse(fs.readFileSync(file, "utf8"));
      if (record.slug === key || entry.name === key) matches.push(caseDir);
    }
  }
  if (matches.length !== 1) throw new Error(`unknown or ambiguous research case: ${key}`);
  return matches[0];
}

export function researchBasis(caseDir: string, loaded = loadCase(caseDir)) {
  const inputs: Record<string, string> = {};
  const manifest = path.join(caseDir, "inputs/manifest.yaml");
  if (fs.existsSync(manifest)) inputs["manifest"] = fs.readFileSync(manifest, "utf8");
  for (const input of loaded.narrativeInputs) {
    const file = input.file.startsWith("inputs/")
      ? path.join(caseDir, input.file) : path.resolve(input.file);
    inputs[input.id] = fs.readFileSync(file, "utf8");
  }
  return { contentHash: loaded.contentHash, inputsHash: fingerprint(inputs) };
}

function records(loaded: LoadedCase, kind: RecordKind) {
  return { source: loaded.sources, evidence: loaded.evidence, claim: loaded.claims,
    research: loaded.research, study: loaded.studies }[kind];
}

export function proposalSubstance(proposal: ResearchProposal): string {
  const substance = Object.fromEntries(Object.entries(proposal).filter(([key]) =>
    !["runId", "generatedAt", "model"].includes(key)));
  // Retrieval times and transport hashes are provenance, not new substance.
  const changes = proposal.changes.map(change => {
    const after = { ...change.after };
    if (after.origin && typeof after.origin === "object") {
      after.origin = Object.fromEntries(Object.entries(after.origin).filter(([key]) =>
        !["runId", "date", "extractedBy"].includes(key)));
    }
    return { ...change, after,
      passages: change.passages.map(passage => Object.fromEntries(Object.entries(passage).filter(([key]) =>
        !["retrievedAt", "responseHash"].includes(key)))),
    };
  });
  return fingerprint({ ...substance, changes });
}

/** Validate a whole prospective ledger with the production loader. No model
 * gets to bypass cross-record validation by splitting a proposal into pieces.
 * Returns a temporary, reviewable case only when explicitly requested. */
export function validateResearchProposal(root: string, raw: unknown, outputDir?: string) {
  const proposal = ResearchProposalSchema.parse(raw);
  const caseDir = resolveResearchCase(root, proposal.case);
  const before = loadCase(caseDir);
  if (proposal.case !== before.record.slug) throw new Error("proposal must use the public case slug");
  if (fingerprint(proposal.basis) !== fingerprint(researchBasis(caseDir, before)))
    throw new Error("stale proposal: case or founding inputs changed");
  const decisions = readIntakeDecisions(root);
  for (const id of proposal.priorDecisionIds) {
    const prior = decisions.find(entry => entry.id === id);
    if (!prior || ![proposal.case, path.basename(caseDir)].includes(prior.case ?? ""))
      throw new Error(`unknown or other-case prior decision: ${id}`);
  }
  const warnings: string[] = [];
  for (const change of proposal.changes) {
    const existing = records(before, change.kind).find(record => record.id === change.recordId);
    if ((existing ? fingerprint(existing) : null) !== change.beforeHash)
      throw new Error(`changed or conflicting target: ${change.recordId}`);
    if (existing && fingerprint(existing) === fingerprint(change.after))
      throw new Error(`unchanged record: ${change.recordId}`);
    if (change.kind === "source" && !existing) {
      const same = exactSourceMatch(change.after, before.sources);
      if (same) throw new Error(`source already exists: ${same.source.id}; propose its new observation instead`);
    }
    // Existing authority cannot be minted by an extraction proposal. Human
    // material may be corrected only in a visibly AI-proposed record.
    if (["claim", "evidence"].includes(change.kind) && change.after.reviewState === "human_reviewed")
      throw new Error("AI proposals cannot assign human review");
    if (change.kind === "source" && change.after.verification === "verified" &&
      (!existing || !("verification" in existing) || existing.verification !== "verified"))
      throw new Error("AI proposals cannot claim a source is held in the project library");
    if (change.kind === "study") {
      if (change.after.humanReviewed) throw new Error("AI proposals cannot assign human study review");
      if (existing && "criteria" in existing && fingerprint(existing.criteria) !== fingerprint(change.after.criteria))
        throw new Error("frozen study criteria cannot change; propose a new study that supersedes it");
    }
    if (change.kind === "claim" || change.kind === "evidence") {
      const statement = String(change.kind === "claim" ? change.after.statement : change.after.sourceStatement);
      const related = records(before, change.kind).filter(record => record.id !== change.recordId &&
        String("statement" in record ? record.statement : "sourceStatement" in record ? record.sourceStatement : "")
          .toLowerCase().replace(/\s+/g, " ") === statement.toLowerCase().replace(/\s+/g, " "));
      related.forEach(record => warnings.push(`${change.recordId} repeats wording in ${record.id}; inspect independence and scope`));
    }
  }
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "aletheia-proposal-"));
  const draftDir = path.join(temp, "case");
  try {
    fs.cpSync(caseDir, draftDir, { recursive: true });
    const caseFile = path.join(draftDir, "case.yaml");
    const metadata = parse(fs.readFileSync(caseFile, "utf8"));
    for (const [key, label] of Object.entries(proposal.themeAdditions)) {
      if (key in metadata.themes) throw new Error(`theme already exists: ${key}`);
      metadata.themes[key] = label;
    }
    if (Object.keys(proposal.themeAdditions).length) fs.writeFileSync(caseFile, stringify(metadata));
    const lists: Record<string, Record<string, unknown>[]> = {};
    const dirty = new Set<string>();
    const list = (file: string) => lists[file] ??= fs.existsSync(path.join(draftDir, file))
      ? parse(fs.readFileSync(path.join(draftDir, file), "utf8")) : [];
    for (const change of proposal.changes) {
      if (change.kind === "study") {
        const prior = before.studies.find(record => record.id === change.recordId);
        const studyDir = path.join(draftDir, "studies");
        fs.mkdirSync(studyDir, { recursive: true });
        const filename = prior ? fs.readdirSync(studyDir).find(file =>
          file.endsWith(".yaml") && parse(fs.readFileSync(path.join(studyDir, file), "utf8")).id === prior.id)
          : `${change.recordId}.yaml`;
        if (!filename) throw new Error("study file missing");
        fs.writeFileSync(path.join(studyDir, filename), stringify(change.after));
      } else {
        const file = { claim: "claims.yaml", source: "sources.yaml", evidence: "evidence.yaml", research: "research.yaml" }[change.kind];
        const filenames = change.kind === "claim" ? [file, "claims-catalog.yaml"] : [file];
        const target = filenames.find(name => list(name).some(record => record.id === change.recordId)) ??
          (change.kind === "claim" && change.after.tier === "catalog" ? "claims-catalog.yaml" : file);
        lists[target] = [...list(target).filter(record => record.id !== change.recordId), change.after];
        dirty.add(target);
      }
    }
    for (const file of dirty) fs.writeFileSync(path.join(draftDir, file), stringify(lists[file]));
    const after = loadCase(draftDir);
    for (const change of proposal.changes.filter(change => change.kind === "source")) {
      const same = exactSourceMatch(change.after, after.sources.filter(source => source.id !== change.recordId));
      if (same) throw new Error(`source identity duplicates ${same.source.id} inside the proposed ledger`);
    }
    for (const change of proposal.changes) for (const passage of change.passages) {
      if (!after.sources.some(source => source.id === passage.sourceId))
        throw new Error(`passage references unknown source: ${passage.sourceId}`);
      if (change.kind === "evidence" && passage.sourceId !== change.after.sourceId)
        throw new Error(`passage belongs to another evidence source: ${change.recordId}`);
    }
    if (fingerprint(researchBasis(caseDir)) !== fingerprint(proposal.basis))
      throw new Error("case changed while validating proposal");
    if (outputDir) {
      if (fs.existsSync(outputDir)) throw new Error("materialization output already exists");
      fs.cpSync(draftDir, outputDir, { recursive: true, errorOnExist: true, force: false });
    }
    return { proposal, warnings, changes: proposal.changes.map(change => ({
      kind: change.kind, id: change.recordId, action: change.beforeHash ? "update" : "add",
      before: records(before, change.kind).find(record => record.id === change.recordId) ?? null,
      after: records(after, change.kind).find(record => record.id === change.recordId),
    })) };
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}

export function recordResearchProposal(root: string, raw: unknown) {
  const result = validateResearchProposal(root, raw);
  const proposal = result.proposal;
  const candidateHash = proposalSubstance(proposal);
  const previous = readIntakeDecisions(root).find(entry => entry.stage === "research-proposal" &&
    entry.decision === "proposed" && entry.case === proposal.case && entry.candidateHash === candidateHash);
  if (previous) return { added: 0, file: previous.storageRef.split("#")[0], rested: true };
  return { ...writeIntakeDecisions(root, [{
    case: proposal.case, stage: "research-proposal", decision: "proposed", research: proposal,
    reason: proposal.rationale, runId: proposal.runId, date: proposal.generatedAt.slice(0, 10),
    generatedAt: proposal.generatedAt, model: proposal.model, promptVersion: proposal.promptVersion,
    caseBasis: proposal.basis.contentHash, inputHash: fingerprint(proposal.basis), candidateHash,
  }]), rested: false };
}
