import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parse, stringify } from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { loadCase, displayAssessment, ratification, reviewCoverage } from "./load";
import { caseView } from "./caseView";
import { topicSeed } from "../../scripts/lib/topic-seed.mjs";
import { assessmentHash, fingerprint, currentChecks } from "../../scripts/lib/review-state.mjs";
import { readCaseSnapshot, evidencePacket } from "../../scripts/lib/case-snapshot.mjs";
import { readIntakeDecisions } from "../../scripts/lib/intake-store.mjs";
import { seedEdition, validateEditionProposal, recordEditionProposal } from "../../scripts/lib/edition-proposals";
import { EditionProposalSchema, type EditionProposal } from "./editionProposal";
import { AssessmentRunSchema, type AssessmentRun, type ClaimTreatment } from "./schema";

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

const treatment: ClaimTreatment = {
  plainLanguage: "Interpretation-only fixture wording for the current edition.",
  claimType: "observation", importance: "major", diagnosticity: "low",
  diagnosticitySummary: "The synthetic observation fits both explanations.",
  strongestObjection: "The synthetic comparison lacks an independent control.",
  whatWouldChangeOurMind: ["An independent synthetic control that separates the explanations."],
};

function catalogFixture() {
  const { root, dir } = fixture(true);
  const raw = loadCase(dir);
  fs.writeFileSync(path.join(dir, "claims.yaml"), "[]\n");
  fs.writeFileSync(path.join(dir, "claims-catalog.yaml"), stringify(raw.claims.map(claim => ({
    id: claim.id, tier: "catalog", statement: claim.statement, theme: claim.theme, rung: claim.rung,
    reviewState: claim.reviewState, origin: claim.origin, independenceGroup: "synthetic-shared-object",
    sourceAnchor: { sourceId: "SRC-TST", locator: "Synthetic source passage." },
  }))));
  const proposal = seedEdition(root, "synthetic", stamp);
  const assessment: AssessmentRun = { ...raw.assessmentRuns[0], runId: "interpreted",
    model: "Synthetic interpretation model", generatedAt: "2026-09-06T09:30:00.000Z",
    claimAssessments: raw.assessmentRuns[0].claimAssessments.map((claim, i) => i === 0
      ? { ...claim, verdict: "well_supported", reasoning: "Synthetic local support does not establish the broader hypothesis.", treatment }
      : claim),
  };
  proposal.assessment = assessment;
  proposal.edition.assessment = { runId: assessment.runId, hash: assessmentHash(assessment) };
  proposal.edition.featuredClaimIds = ["TST-C001"];
  proposal.edition.article = "## Synthetic essay\n\n[The synthetic observation is credible locally.]{claim=TST-C001} It does not distinguish the explanations.";
  return { root, dir, proposal, assessment };
}

function installConcurrence(dir: string, assessment: AssessmentRun) {
  const loaded = loadCase(dir);
  const scope = evidencePacket(readCaseSnapshot(dir).files).assessClaimIds;
  for (const seat of ["alpha", "beta", "gamma", "delta"]) {
    fs.writeFileSync(path.join(dir, `assessments/check-${seat}.yaml`), stringify({
      ...assessment, runId: `check-${seat}`, role: "check", model: `${seat} (Vendor-${seat})`,
      claimAssessments: assessment.claimAssessments.filter(a => scope.includes(a.claimId))
        .map(({ treatment: ignored, ...a }) => { void ignored; return a; }),
      review: { protocol: "case-snapshot-v1", contentHash: loaded.contentHash,
        assessmentHash: assessmentHash(assessment), packetHash: loaded.reviewPacketHash },
    }));
  }
}

describe("assessment-owned claim interpretation", () => {
  it("features a catalog observation through its edition without rewriting the proposition or provenance", () => {
    const { root, dir, proposal } = catalogFixture();
    const before = loadCase(dir);
    const bytes = fs.readFileSync(path.join(dir, "claims-catalog.yaml"), "utf8");
    install(root, dir, proposal);
    const loaded = loadCase(dir);
    const view = caseView(loaded);
    expect(loaded.claims).toEqual(before.claims);
    expect(fs.readFileSync(path.join(dir, "claims-catalog.yaml"), "utf8")).toBe(bytes);
    expect(view.featured[0]).toMatchObject({ ...treatment, id: "TST-C001", credibility: "well_supported",
      statement: before.claims[0].statement, origin: before.claims[0].origin,
      independenceGroup: "synthetic-shared-object", reviewState: "ai_extracted",
      assessment: { runId: "interpreted", standing: "unratified", treatment: true } });
    expect(view.catalog.map(c => c.id)).toEqual(["TST-C002"]);
    expect(new Set(view.claims.map(c => c.id)).size).toBe(2);
    expect(view.claims).toHaveLength(2);
    expect(reviewCoverage(loaded)).toEqual({ reviewed: 0, total: 1 });
  });

  it("keeps unadopted treatment out of the current presentation and preserves it for inspection", () => {
    const { root, dir, proposal, assessment } = catalogFixture();
    fs.writeFileSync(path.join(dir, "assessments/interpreted.yaml"), stringify(assessment));
    const unadopted = caseView(loadCase(dir));
    expect(unadopted.allFeatured).toEqual([]);
    expect(unadopted.catalog).toHaveLength(2);
    expect(loadCase(dir).assessmentRuns.some(run => run.claimAssessments.some(a => a.treatment))).toBe(true);
    delete proposal.assessment;
    proposal.edition.basis = seedEdition(root, "synthetic", stamp).edition.basis;
    install(root, dir, proposal);
    const later = { ...assessment, runId: "later-unadopted", generatedAt: "2026-09-06T11:00:00.000Z",
      claimAssessments: assessment.claimAssessments.map(a => a.treatment
        ? { ...a, treatment: { ...a.treatment, diagnosticity: "high" as const } } : a) };
    fs.writeFileSync(path.join(dir, "assessments/later.yaml"), stringify(later));
    expect(caseView(loadCase(dir)).featured[0].diagnosticity).toBe("low");
  });

  it("fails closed when a selected catalog claim lacks complete interpretation", () => {
    const { root, proposal } = catalogFixture();
    const incomplete = structuredClone(proposal);
    delete incomplete.assessment!.claimAssessments[0].treatment;
    incomplete.edition.assessment!.hash = assessmentHash(incomplete.assessment!);
    expect(() => validateEditionProposal(root, incomplete)).toThrow(/without live editorial treatment/);
    for (const bad of [
      { ...treatment, plainLanguage: "             " },
      { ...treatment, strongestObjection: "" },
      { ...treatment, diagnosticitySummary: "             " },
      { ...treatment, whatWouldChangeOurMind: [] },
      { ...treatment, statement: "A treatment cannot replace the proposition." },
    ]) {
      const invalid = structuredClone(proposal);
      Object.assign(invalid.assessment!.claimAssessments[0], { treatment: bad });
      expect(EditionProposalSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("preserves exact assessment bytes and requires timestamps, draft role, and unique judgments", () => {
    const { assessment } = catalogFixture();
    const raw = structuredClone(assessment);
    raw.claimAssessments[0].treatment!.strongestObjection += "  ";
    expect(assessmentHash(AssessmentRunSchema.parse(raw))).toBe(assessmentHash(raw));
    expect(AssessmentRunSchema.safeParse({ ...raw, generatedAt: undefined }).success).toBe(false);
    expect(AssessmentRunSchema.safeParse({ ...raw, role: "check" }).success).toBe(false);
    expect(AssessmentRunSchema.safeParse({ ...raw, claimAssessments: [raw.claimAssessments[0], raw.claimAssessments[0]] }).success).toBe(false);
  });

  it("includes selected catalog claims in blind review without leaking their interpretation", () => {
    const { root, dir, proposal } = catalogFixture();
    install(root, dir, proposal);
    const packet = evidencePacket(readCaseSnapshot(dir).files);
    expect(packet.assessClaimIds).toEqual(["TST-C001"]);
    expect(packet.claims).toHaveLength(2);
    expect(JSON.stringify(packet)).not.toMatch(/Interpretation-only|diagnosticitySummary|strongestObjection|importance|Synthetic essay/);
    const script = path.resolve("scripts/cross-model-check.mjs");
    const report = JSON.parse(execFileSync(process.execPath, [script, "synthetic", "--dry-run"], { cwd: root, encoding: "utf8" }));
    expect(report.claimCount).toBe(1);
    expect(report.packet.assessClaimIds).toEqual(["TST-C001"]);
    expect(execFileSync(process.execPath, [path.resolve("scripts/stale-checks.mjs")], { cwd: root, encoding: "utf8" }).trim()).toBe("synthetic");
  });

  it("reviews the latest selection across multiple editions and rejects an ambiguous snapshot", () => {
    const { root, dir, proposal, assessment } = catalogFixture();
    install(root, dir, proposal);
    const second = next(root);
    second.assessment = { ...assessment, runId: "second-catalog-assessment", generatedAt: "2026-09-06T11:30:00.000Z",
      caseAssessment: { ...assessment.caseAssessment, loadBearing: ["TST-C002"] },
      claimAssessments: assessment.claimAssessments.map(a => a.claimId === "TST-C002" ? { ...a, treatment } : a),
    };
    second.edition.assessment = { runId: second.assessment.runId, hash: assessmentHash(second.assessment) };
    second.edition.featuredClaimIds = ["TST-C002"];
    second.edition.article = "## Second synthetic essay\n\n[The other synthetic observation becomes the focus.]{claim=TST-C002}";
    install(root, dir, second);

    const snapshot = readCaseSnapshot(dir);
    expect(snapshot.editions).toHaveLength(2);
    expect(snapshot.edition?.runId).toBe(second.edition.runId);
    expect(Object.keys(snapshot.files).filter(file => file.startsWith("editions/")))
      .toEqual([`editions/${second.edition.runId}.yaml`]);
    expect(evidencePacket(snapshot.files).assessClaimIds).toEqual(["TST-C002"]);
    const report = JSON.parse(execFileSync(process.execPath, [path.resolve("scripts/cross-model-check.mjs"), "synthetic", "--dry-run"],
      { cwd: root, encoding: "utf8" }));
    expect(report.packet.assessClaimIds).toEqual(["TST-C002"]);

    // A carried-over treatment outside this edition's scope must not inherit
    // its standing. The independent checks here grade only the new selection.
    installConcurrence(dir, second.assessment);
    const loaded = loadCase(dir);
    const view = caseView(loaded);
    expect(ratification(loaded)?.status).toBe("ratified");
    expect(view.allFeatured.map(c => c.id)).toEqual(["TST-C002"]);
    expect(view.catalog.map(c => c.id)).toEqual(["TST-C001"]);
    expect(loaded.assessmentRuns.find(run => run.runId === second.assessment!.runId)
      ?.claimAssessments.find(a => a.claimId === "TST-C001")?.treatment).toEqual(treatment);

    const oldFile = `editions/${proposal.edition.runId}.yaml`;
    const ambiguous = { [oldFile]: fs.readFileSync(path.join(dir, oldFile), "utf8"), ...snapshot.files };
    expect(() => evidencePacket(ambiguous)).toThrow(/only the current edition/);
    expect(() => evidencePacket(Object.fromEntries(Object.entries(ambiguous).reverse())))
      .toThrow(/only the current edition/);
  });

  it("requires fresh concurrence after an edition changes interpretation while preserving the earlier assessment", () => {
    const { root, dir, proposal, assessment } = catalogFixture();
    install(root, dir, proposal);
    installConcurrence(dir, assessment);
    expect(ratification(loadCase(dir))?.status).toBe("ratified");
    const revised = next(root);
    revised.assessment = { ...assessment, runId: "reinterpreted", generatedAt: "2026-09-06T11:30:00.000Z",
      claimAssessments: assessment.claimAssessments.map(a => a.treatment
        ? { ...a, treatment: { ...a.treatment, importance: "headline" } } : a) };
    revised.edition.assessment = { runId: revised.assessment.runId, hash: assessmentHash(revised.assessment) };
    install(root, dir, revised);
    const after = loadCase(dir);
    expect(caseView(after).featured[0].importance).toBe("headline");
    expect(ratification(after)?.status).toBe("unratified");
    expect(ratification(after)?.panel).toBe(0);
    expect(after.assessmentRuns.find(run => run.runId === assessment.runId)).toEqual(AssessmentRunSchema.parse(assessment));
  });
});

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
