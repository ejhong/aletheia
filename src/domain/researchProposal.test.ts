import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { topicSeed } from "../../scripts/lib/topic-seed.mjs";
import { loadCase } from "./load";
import { ResearchProposalSchema, type ResearchProposal } from "./researchProposal";
import { fingerprint } from "../../scripts/lib/review-state.mjs";
import { readIntakeDecisions, writeIntakeDecisions } from "../../scripts/lib/intake-store.mjs";
import { recordResearchProposal, researchBasis, validateResearchProposal } from "../../scripts/lib/research-proposals";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));
const stamp = { runId: "synthetic-source-test", generatedAt: "2026-09-06T10:00:00.000Z", model: "fixture-model", promptVersion: "fixture-v1" };
const origin = { ref: "Synthetic test source", extractedBy: stamp.model, runId: stamp.runId, date: "2026-09-06" };
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aletheia-research-test-"));
  roots.push(root);
  const dir = path.join(root, "proposals/topics/synthetic");
  fs.mkdirSync(dir, { recursive: true });
  for (const [file, value] of Object.entries(topicSeed({ id: "TST-001", slug: "synthetic", title: "Synthetic research fixture",
    question: "Does the synthetic observation distinguish two explanations?", domain: "Test only", date: "2026-09-06" })))
    fs.writeFileSync(path.join(dir, file), value);
  const proposal = ResearchProposalSchema.parse({ version: 1, case: "synthetic", basis: researchBasis(dir), ...stamp,
    intent: "add", title: "An initial observation", rationale: "A synthetic fixture for an empty case.",
    themeAdditions: { objects: "Objects" }, changes: [
      { kind: "source", recordId: "SRC-TEST", beforeHash: null, rationale: "Source container.", after: {
        id: "SRC-TEST", title: "Synthetic source", sourceType: "webpage", url: "https://example.org/test", verification: "unverified" } },
      { kind: "claim", recordId: "TST-C001", beforeHash: null, rationale: "Local proposition.", after: {
        id: "TST-C001", tier: "catalog", statement: "The synthetic object has three markings.", theme: "objects", rung: "observation",
        reviewState: "ai_extracted", origin, sourceAnchor: { sourceId: "SRC-TEST", locator: "Synthetic passage one" } } },
      { kind: "evidence", recordId: "TST-E001", beforeHash: null, rationale: "Observed description.", after: {
        id: "TST-E001", title: "Synthetic markings", claimIds: ["TST-C001"], sourceId: "SRC-TEST", direction: "supports",
        strength: "weak", sourceStatement: "The synthetic test text describes three markings.", reviewState: "ai_extracted", origin } },
    ] });
  return { root, dir, proposal };
}
function alter(proposal: ResearchProposal, index: number, update: Record<string, unknown>) {
  const next = structuredClone(proposal);
  Object.assign(next.changes[index].after, update);
  return next;
}

describe("common research proposals", () => {
  it("bootstraps a complete linked bundle through the production loader without changing its empty basis", () => {
    const { root, dir, proposal } = fixture();
    const output = path.join(root, "review");
    expect(validateResearchProposal(root, proposal, output).changes).toHaveLength(3);
    expect(loadCase(output).claims[0].id).toBe("TST-C001");
    expect(loadCase(dir).claims).toEqual([]);
    expect(() => validateResearchProposal(root, proposal, output)).toThrow(/already exists/);
    const file = path.join(root, "proposal.yaml");
    fs.writeFileSync(file, stringify(proposal));
    // Native Node shares the exact TypeScript schema used by the site.
    const script = path.resolve("scripts/review-research-proposal.ts");
    expect(JSON.parse(execFileSync(process.execPath, [script, file], { cwd: root, encoding: "utf8" })).changes).toHaveLength(3);
  });

  it("rejects dangling references, hidden fields, invented authority and conflicting additions", () => {
    const { root, proposal } = fixture();
    expect(() => validateResearchProposal(root, alter(proposal, 2, { claimIds: ["TST-C999"] }))).toThrow(/unknown claim/);
    expect(() => validateResearchProposal(root, alter(proposal, 0, { invented: "silent repair" }))).toThrow(/Unrecognized key/);
    expect(() => validateResearchProposal(root, alter(proposal, 1, { origin: { ...origin, invented: "hidden field" } }))).toThrow(/unknown record field/);
    expect(() => validateResearchProposal(root, alter(proposal, 1, { reviewState: "human_reviewed" }))).toThrow(/human review/);
    expect(() => validateResearchProposal(root, alter(proposal, 0, { verification: "verified" }))).toThrow(/project library/);
    const duplicate = structuredClone(proposal);
    duplicate.changes.push({ ...duplicate.changes[0], recordId: "SRC-COPY", after: { ...duplicate.changes[0].after, id: "SRC-COPY", background: true } });
    expect(() => validateResearchProposal(root, duplicate)).toThrow(/source identity duplicates/);
    const wrong = structuredClone(proposal);
    wrong.changes[0].beforeHash = "a".repeat(64);
    expect(() => validateResearchProposal(root, wrong)).toThrow(/conflicting target/);
  });

  it("invalidates even same-day case and founding-input changes", () => {
    const { root, dir, proposal } = fixture();
    fs.appendFileSync(path.join(dir, "overview.md"), "\nQuestion revised.\n");
    expect(() => validateResearchProposal(root, proposal)).toThrow(/stale proposal/);
    const fresh = { ...proposal, basis: researchBasis(dir) };
    fs.mkdirSync(path.join(dir, "inputs"));
    fs.writeFileSync(path.join(dir, "inputs/manifest.yaml"), "[]\n");
    expect(() => validateResearchProposal(root, fresh)).toThrow(/founding inputs changed/);
  });

  it("admits a new observation from a known source, with before/after corrections in the same envelope", () => {
    const { root, dir, proposal } = fixture();
    const ready = path.join(root, "ready");
    validateResearchProposal(root, proposal, ready);
    fs.cpSync(ready, dir, { recursive: true });
    const before = loadCase(dir);
    const next = structuredClone(proposal);
    next.basis = researchBasis(dir);
    next.themeAdditions = {};
    next.changes = next.changes.slice(1).map(change => ({ ...change,
      recordId: change.kind === "claim" ? "TST-C002" : "TST-E002",
      after: change.kind === "claim" ? { ...change.after, id: "TST-C002", statement: "A second synthetic observation concerns the reverse face." }
        : { ...change.after, id: "TST-E002", claimIds: ["TST-C002"], sourceStatement: "A different source passage describes the reverse face." },
    }));
    next.changes.push({ kind: "source", recordId: "SRC-TEST", beforeHash: fingerprint(before.sources[0]),
      after: { ...before.sources[0], reliabilityNotes: ["The observations share one object; they are not independent samples."] },
      rationale: "Clarify dependency context.", passages: [] });
    const result = validateResearchProposal(root, next);
    expect(result.changes).toHaveLength(3);
    expect(result.changes[2].action).toBe("update");
  });

  it("keeps decisions immutable and rests identical substance while allowing a changed argument", () => {
    const { root, proposal } = fixture();
    expect(recordResearchProposal(root, proposal).added).toBe(1);
    const again = structuredClone(proposal);
    again.runId = "second-run";
    again.generatedAt = "2026-09-06T11:00:00.000Z";
    again.changes.filter(change => change.kind !== "source").forEach(change => {
      change.after.origin = { ...origin, runId: again.runId };
    });
    expect(recordResearchProposal(root, again).rested).toBe(true);
    const prior = readIntakeDecisions(root)[0];
    again.intent = "reconsider";
    again.priorDecisionIds = [prior.id];
    again.rationale = "A corrected reading of the original source motivates reconsideration; no newer paper is required.";
    expect(recordResearchProposal(root, again).added).toBe(1);
    expect(readIntakeDecisions(root)).toHaveLength(2);
    again.priorDecisionIds = ["0".repeat(64)];
    expect(() => recordResearchProposal(root, again)).toThrow(/prior decision/);
    expect(() => writeIntakeDecisions(root, [{ ...prior, id: undefined, storageRef: undefined, case: "other" }])).toThrow();
  });

  it("surfaces possible source aliases for review without equating a title match with identity", () => {
    const { root, dir, proposal } = fixture();
    const ready = path.join(root, "ready");
    validateResearchProposal(root, proposal, ready);
    fs.cpSync(ready, dir, { recursive: true });
    const candidate = { ...proposal, basis: researchBasis(dir), themeAdditions: {}, changes: [{
      ...proposal.changes[0], recordId: "SRC-RELATED",
      after: { ...proposal.changes[0].after, id: "SRC-RELATED", url: "https://example.org/related", background: true },
    }] };
    expect(validateResearchProposal(root, candidate).warnings).toEqual([
      "SRC-RELATED resembles the title of SRC-TEST; inspect whether these are versions of the same work",
    ]);
  });
});
