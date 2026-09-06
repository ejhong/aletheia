import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parse, stringify } from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { loadCase, displayAssessment } from "./load";
import { caseView } from "./caseView";
import { topicSeed } from "../../scripts/lib/topic-seed.mjs";
import { assessmentHash, fingerprint, currentChecks } from "../../scripts/lib/review-state.mjs";
import { readCaseSnapshot, evidencePacket } from "../../scripts/lib/case-snapshot.mjs";
import { readIntakeDecisions } from "../../scripts/lib/intake-store.mjs";
import { seedEdition, validateEditionProposal, recordEditionProposal } from "../../scripts/lib/edition-proposals";
import { EditionProposalSchema, type EditionProposal } from "./editionProposal";
import type { AssessmentRun } from "./schema";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));
const stamp = { runId: "edition-fixture-1", generatedAt: "2026-09-06T10:00:00.000Z",
  model: "Synthetic assembler", promptVersion: "fixture-only" };
function fixture(assessed = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aletheia-edition-test-"));
  roots.push(root);
  const dir = path.join(root, "content/cases/synthetic");
  fs.mkdirSync(dir, { recursive: true });
  for (const [file, body] of Object.entries(topicSeed({ id: "TST-001", slug: "synthetic",
    title: "Synthetic edition", question: "Does the synthetic object distinguish the proposed explanations?",
    domain: "Tests only", date: "2026-09-06" }))) fs.writeFileSync(path.join(dir, file), body);
  if (assessed) {
    const metadata = parse(fs.readFileSync(path.join(dir, "case.yaml"), "utf8"));
    metadata.themes = { synthetic: "Synthetic objects" };
    fs.writeFileSync(path.join(dir, "case.yaml"), stringify(metadata));
    const origin = { ref: "Synthetic fixture", extractedBy: "fixture", runId: "fixture", date: "2026-09-06" };
    fs.writeFileSync(path.join(dir, "claims.yaml"), stringify([1, 2].map(i => ({
      id: `TST-C00${i}`, tier: "featured", theme: "synthetic", rung: "observation", claimType: "observation",
      statement: `Synthetic observation ${i}.`, plainLanguage: "A synthetic test observation.", reviewState: "ai_extracted", origin,
      importance: "supporting", credibility: "unresolved", credibilitySummary: "Synthetic uncertainty.",
      diagnosticity: "indeterminate", diagnosticitySummary: "Synthetic uncertainty.",
      strongestObjection: "Synthetic missing control.", whatWouldChangeOurMind: ["A synthetic independent control."],
    }))));
    fs.writeFileSync(path.join(dir, "sources.yaml"), stringify([{ id: "SRC-TST", title: "Synthetic source",
      sourceType: "webpage", verification: "unverified", url: "https://example.org/synthetic" }]));
    fs.writeFileSync(path.join(dir, "evidence.yaml"), stringify([{ id: "TST-E001", title: "Synthetic observation",
      sourceId: "SRC-TST", claimIds: ["TST-C001"], direction: "context", strength: "weak", sourceStatement: "Synthetic text only.", reviewState: "ai_extracted", origin }]));
    fs.mkdirSync(path.join(dir, "assessments"));
    fs.writeFileSync(path.join(dir, "assessments/original.yaml"), stringify({
      runId: "original", generatedAt: "2026-09-06T09:00:00.000Z", date: "2026-09-06", model: "Original fixture model",
      promptVersion: "fixture", humanReviewed: false, role: "draft", caseAssessment: { verdict: "unresolved", loadBearing: ["TST-C001"],
        weakestLinks: [], synthesis: "This is synthetic test reasoning with explicit uncertainty. ".repeat(3),
        steelman: "A synthetic unanswered objection remains for a future control." },
      claimAssessments: [1, 2].map(i => ({ claimId: `TST-C00${i}`, verdict: "unresolved", reasoning: "Synthetic uncertainty.", confidence: "low" })),
    }));
  }
  return { root, dir, proposal: seedEdition(root, "synthetic", stamp) };
}
function install(root: string, dir: string, proposal: EditionProposal) {
  const output = path.join(root, proposal.edition.runId);
  const report = validateEditionProposal(root, proposal, output);
  fs.rmSync(dir, { recursive: true });
  fs.cpSync(output, dir, { recursive: true });
  return report;
}
function next(root: string, i = 2) {
  return seedEdition(root, "synthetic", { ...stamp, runId: `edition-fixture-${i}`, generatedAt: `2026-09-06T1${i}:00:00.000Z` });
}

describe("versioned edition proposals", () => {
  it("preserves an unassessed opening without inventing a judgment or changing its prose", () => {
    const { root, dir, proposal } = fixture();
    const before = loadCase(dir);
    const report = install(root, dir, proposal);
    const after = loadCase(dir);
    expect(after.overviewMarkdown).toBe(before.overviewMarkdown);
    expect(after.ledgerHash).toBe(before.ledgerHash);
    expect(after.contentHash).not.toBe(before.contentHash);
    expect(after.editions).toHaveLength(1);
    expect(displayAssessment(after)).toBeNull();
    expect(report.difference.articleChanged).toBe(false);
    expect(fs.existsSync(path.join(dir, "overview.md"))).toBe(false);
    expect(caseView(after).editionStale).toBe(false);
    const snapshot = readCaseSnapshot(dir);
    expect(fingerprint(evidencePacket(snapshot.files))).toBe(before.reviewPacketHash);
  });

  it("pins the original assessment and keeps an unselected claim available in the ledger", () => {
    const { root, dir, proposal } = fixture(true);
    proposal.edition.featuredClaimIds = ["TST-C001"];
    install(root, dir, proposal);
    const loaded = loadCase(dir);
    const newer = { ...loaded.assessmentRuns[0], runId: "unadopted-draft", generatedAt: "2026-09-06T11:00:00.000Z" };
    fs.writeFileSync(path.join(dir, "assessments/unadopted.yaml"), stringify(newer));
    const view = caseView(loadCase(dir));
    expect(view.assessment!.run.model).toBe("Original fixture model");
    expect(view.assessment!.run.runId).toBe("original");
    expect(view.featured.map(c => c.id)).toEqual(["TST-C001"]);
    expect(view.allFeatured.map(c => c.id)).toEqual(["TST-C001", "TST-C002"]);
  });

  it("records an unchanged candidate once and retains the incumbent", () => {
    const { root, dir, proposal } = fixture();
    install(root, dir, proposal);
    const candidate = next(root);
    expect(validateEditionProposal(root, candidate).unchanged).toBe(true);
    expect(() => validateEditionProposal(root, candidate, path.join(root, "no-change"))).toThrow(/unchanged edition/);
    recordEditionProposal(root, candidate);
    expect(recordEditionProposal(root, { ...candidate, edition: { ...candidate.edition, runId: "another-attempt" } }).rested).toBe(true);
    const history = readIntakeDecisions(root);
    expect(history).toHaveLength(1);
    expect(history[0].decision).toBe("no_change");
  });

  it("invalidates changed ledger inputs and discloses that an edition needs refreshing", () => {
    const { root, dir, proposal } = fixture();
    install(root, dir, proposal);
    const candidate = next(root);
    fs.appendFileSync(path.join(dir, "sources.yaml"), "# synthetic correction\n");
    expect(() => validateEditionProposal(root, candidate)).toThrow(/stale edition/);
    expect(caseView(loadCase(dir)).editionStale).toBe(true);
  });

  it("invalidates a changed founding input or legacy incumbent assessment", () => {
    const { root, dir, proposal } = fixture(true);
    const run = loadCase(dir).assessmentRuns[0];
    fs.writeFileSync(path.join(dir, "assessments/later.yaml"), stringify({ ...run, runId: "later", generatedAt: "2026-09-06T09:30:00.000Z" }));
    expect(() => validateEditionProposal(root, proposal)).toThrow(/incumbent changed/);
    const fresh = seedEdition(root, "synthetic", stamp);
    fs.mkdirSync(path.join(dir, "inputs"));
    fs.writeFileSync(path.join(dir, "inputs/manifest.yaml"), "[]\n");
    expect(() => validateEditionProposal(root, fresh)).toThrow(/inputs/);
  });

  it("rejects unknown claims, invented assessment authority, and hidden fields", () => {
    const { root, dir, proposal } = fixture(true);
    expect(() => validateEditionProposal(root, { ...proposal, edition: { ...proposal.edition, featuredClaimIds: [] } })).toThrow(/load-bearing/);
    expect(() => validateEditionProposal(root, { ...proposal, edition: { ...proposal.edition, article: "An unknown [synthetic observation]{claim=TST-C999} appears in this synthetic text." } })).toThrow(/unknown claim/);
    expect(() => validateEditionProposal(root, { ...proposal, edition: { ...proposal.edition, article: "A synthetic illustration is referenced below.\n\n{plate:IMG-TST-MISSING}" } })).toThrow(/unknown image/);
    const run = loadCase(dir).assessmentRuns[0];
    expect(EditionProposalSchema.safeParse({ ...proposal, assessment: { ...run, humanReviewed: true } }).success).toBe(false);
    expect(EditionProposalSchema.safeParse({ ...proposal, assessment: { ...run, caseAssessment: { ...run.caseAssessment, hidden: true } } }).success).toBe(false);
    expect(() => validateEditionProposal(root, { ...proposal, edition: { ...proposal.edition, assessment: { ...proposal.edition.assessment!, hash: "a".repeat(64) } } })).toThrow(/changed edition assessment/);
  });

  it("rejects forked history, changed predecessors, and a second article authority", () => {
    const { root, dir, proposal } = fixture();
    install(root, dir, proposal);
    const candidate = next(root);
    candidate.edition.article += "\nA synthetic revision for the next edition.\n";
    expect(() => validateEditionProposal(root, { ...candidate,
      edition: { ...candidate.edition, previous: null } })).toThrow(/broken or forked/);
    install(root, dir, candidate);
    expect(loadCase(dir).editions).toHaveLength(2);
    const file = path.join(dir, "editions", `${proposal.edition.runId}.yaml`);
    const old = parse(fs.readFileSync(file, "utf8"));
    old.article += "Modified history.";
    fs.writeFileSync(file, stringify(old));
    expect(() => loadCase(dir)).toThrow(/broken or forked/);
    fs.writeFileSync(file, stringify(proposal.edition));
    fs.writeFileSync(path.join(dir, "overview.md"), proposal.edition.article);
    expect(() => loadCase(dir)).toThrow(/one current article authority/);
  });

  it("an edition change invalidates old review receipts while appending history does not", () => {
    const { root, dir, proposal } = fixture(true);
    install(root, dir, proposal);
    const loaded = loadCase(dir);
    const draft = displayAssessment(loaded)!.run;
    const checks = ["a", "b", "c", "d"].map(seat => ({ ...draft, runId: `check-${seat}`,
      role: "check" as const, model: `Fixture (Vendor-${seat})`, review: { protocol: "case-snapshot-v1" as const,
        contentHash: loaded.contentHash, assessmentHash: assessmentHash(draft), packetHash: loaded.reviewPacketHash } }));
    expect(currentChecks(checks, draft, loaded.contentHash, loaded.reviewPacketHash)).toHaveLength(4);
    const candidate = next(root);
    candidate.edition.article += "\nSynthetic updated explanation.\n";
    install(root, dir, candidate);
    const after = loadCase(dir);
    expect(currentChecks(checks, draft, after.contentHash, after.reviewPacketHash)).toHaveLength(0);
    fs.appendFileSync(path.join(dir, "history.yaml"), "# history only\n");
    expect(loadCase(dir).contentHash).toBe(after.contentHash);
  });

  it("validates a newly authored assessment and edition together in a review directory", () => {
    const { root, dir, proposal } = fixture(true);
    const run: AssessmentRun = { ...loadCase(dir).assessmentRuns[0], runId: "proposed-assessment",
      model: "New fixture model", generatedAt: "2026-09-06T09:45:00.000Z" };
    proposal.assessment = run;
    proposal.edition.assessment = { runId: run.runId, hash: assessmentHash(run) };
    const file = path.join(root, "proposal.yaml");
    fs.writeFileSync(file, stringify(proposal));
    const result = JSON.parse(execFileSync(process.execPath, [path.resolve("scripts/review-edition.ts"), file], { cwd: root, encoding: "utf8" }));
    expect(result.assessmentHash).toBe(assessmentHash(run));
    expect(loadCase(dir).editions).toEqual([]);
    install(root, dir, proposal);
    expect(displayAssessment(loadCase(dir))!.run.model).toBe("New fixture model");
  });
});
