import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse, stringify } from "yaml";
import { afterEach, expect, it, vi } from "vitest";
import { topicSeed } from "../../scripts/lib/topic-seed.mjs";
import { seedEdition, validateEditionProposal } from "../../scripts/lib/edition-proposals";
import { assessmentHash } from "../../scripts/lib/review-state.mjs";
import { draftEdition, editionPlan, prepareEditionCycle } from "../../scripts/lib/edition-drafting";
import { readIntakeDecisions } from "../../scripts/lib/intake-store.mjs";
import { installCaseFiles } from "../../scripts/lib/case-files";
import { EditionCycleSchema, editionChoice, type EditionCycle, type EditionSeat } from "./editionCycle";
import { loadCase, displayAssessment, ratification } from "./load";
import { caseView } from "./caseView";

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true }));
});
const now = () => "2026-09-06T12:00:00.000Z";
function fixture(empty = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aletheia-drafting-")); roots.push(root);
  const dir = path.join(root, "content/cases/synthetic"); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(root, "AGENTS.md"), "Synthetic test constitution: never invent evidence or review.");
  for (const [file, body] of Object.entries(topicSeed({ id: "TST-001", slug: "synthetic", title: "Synthetic topic",
    question: "Does the synthetic observation distinguish these explanations?", domain: "Tests only", date: "2026-09-06" })))
    fs.writeFileSync(path.join(dir, file), body);
  if (!empty) {
    const record = parse(fs.readFileSync(path.join(dir, "case.yaml"), "utf8"));
    record.themes = { synthetic: "Synthetic marks" };
    fs.writeFileSync(path.join(dir, "case.yaml"), stringify(record));
    const origin = { ref: "Synthetic test passage", extractedBy: "fixture", runId: "fixture", date: "2026-09-06" };
    fs.writeFileSync(path.join(dir, "sources.yaml"), stringify([{ id: "SRC-TST", title: "Synthetic source",
      sourceType: "webpage", verification: "unverified", url: "https://example.org/synthetic" }]));
    fs.writeFileSync(path.join(dir, "claims-catalog.yaml"), stringify([{ id: "TST-C001", tier: "catalog", theme: "synthetic",
      statement: "A synthetic object has a circular mark.", rung: "observation", reviewState: "ai_extracted", origin,
      sourceAnchor: { sourceId: "SRC-TST", locator: "Synthetic passage." } }]));
    fs.writeFileSync(path.join(dir, "evidence.yaml"), stringify([{ id: "TST-E001", title: "Synthetic observation",
      sourceId: "SRC-TST", claimIds: ["TST-C001"], direction: "context", strength: "weak",
      sourceStatement: "A synthetic mark is circular.", reviewState: "ai_extracted", origin }]));
  }
  const seed = seedEdition(root, "synthetic", { runId: "opening-edition", generatedAt: "2026-09-06T09:00:00.000Z",
    model: "Synthetic fixture assembler", promptVersion: "fixture-only" });
  fs.mkdirSync(path.join(dir, "editions"));
  fs.writeFileSync(path.join(dir, "editions/opening-edition.yaml"), stringify(seed.edition));
  fs.unlinkSync(path.join(dir, "overview.md"));
  loadCase(dir);
  return { root, dir };
}

function reply(mode = "Revision") {
  return { article: `## ${mode}\n\n[The synthetic object has a circular mark.]{claim=TST-C001} The unverified passage does not distinguish the proposed explanations.`,
    featuredClaimIds: ["TST-C001"], rationale: "Explain the limited observation without treating a shape as proof of a mechanism.",
    caseAssessment: { verdict: "unresolved", loadBearing: ["TST-C001"], weakestLinks: ["TST-C001"],
      synthesis: "The only synthetic observation is a reported circular mark. Its source is unverified and either explanation could produce it. The larger question remains unresolved.",
      steelman: "The synthetic hypothesis could still account for a distinctive pattern in a wider comparison set." },
    claimAssessments: [{ claimId: "TST-C001", verdict: "unresolved", confidence: "low", reasoning: "The synthetic source remains unverified.",
      treatment: { plainLanguage: "The synthetic object has a circular mark.", claimType: "observation", importance: "supporting",
        diagnosticity: "low", diagnosticitySummary: "Both proposed explanations predict a simple circle.",
        strongestObjection: "The synthetic source has not been independently checked.",
        whatWouldChangeOurMind: ["An independently checked synthetic measurement and discriminating comparison."] } }],
  };
}
function workers(preferIncumbent = false) {
  const draft = vi.fn(async (_system: string, user: string) => ({ model: "Synthetic author",
    text: JSON.stringify(reply(JSON.parse(user).task.startsWith("Make") ? "Revision" : "Recomposition")) }));
  const judge = vi.fn(async (_vendor: string, _system: string, user: string) => {
    const packet = JSON.parse(user);
    const preferred = preferIncumbent ? packet.incumbentLabel : Object.entries(packet.options)
      .find(([, value]) => (value as { article: string }).article.startsWith("## Revision"))![0];
    const others = Object.keys(packet.options).filter(label => label !== preferred && label !== packet.incumbentLabel);
    const ranking = preferIncumbent ? [preferred, ...others] : [preferred, ...others, packet.incumbentLabel];
    return JSON.stringify({ ranking, reason: "The synthetic choice preserves uncertainty and explains the observation clearly.",
      judgments: Object.keys(packet.options).map(option => ({ option, status: "complies", reason: "Synthetic constitutional compliance with explicit uncertainty." })) });
  });
  return { now, draft, judge };
}
function cycle(root: string): EditionCycle {
  return EditionCycleSchema.parse(readIntakeDecisions(root).find(e => e.stage === "edition-cycle")!.editionCycle);
}

it("compares an interpreted catalog claim, prepares the winner, preserves the ledger, and then rests", async () => {
  const { root, dir } = fixture(); const deps = workers();
  const ledger = fs.readFileSync(path.join(dir, "claims-catalog.yaml"), "utf8");
  const outcome = await draftEdition(root, "synthetic", { prepare: true }, deps);
  expect(outcome.prepared).toBe(true);
  expect(deps.draft).toHaveBeenCalledTimes(2); expect(deps.judge).toHaveBeenCalledTimes(5);
  const loaded = loadCase(dir);
  expect(loaded.editions).toHaveLength(2);
  expect(caseView(loaded).featured.map(c => c.id)).toEqual(["TST-C001"]);
  expect(displayAssessment(loaded)?.run.model).toBe("Synthetic author");
  expect(ratification(loaded)?.status).not.toBe("ratified");
  expect(fs.readFileSync(path.join(dir, "claims-catalog.yaml"), "utf8")).toBe(ledger);
  expect((await draftEdition(root, "synthetic", { prepare: true }, deps)).rested).toBe(true);
  expect(deps.draft).toHaveBeenCalledTimes(2);
  expect(editionPlan(root, "synthetic", now(), "Reconsider the explanatory structure.").due).toBe(true);
  const oldEvidence = fs.readFileSync(path.join(dir, "evidence.yaml"), "utf8");
  fs.writeFileSync(path.join(dir, "evidence.yaml"), oldEvidence.replace("A synthetic mark is circular.", "A synthetic mark appears approximately circular."));
  expect(editionPlan(root, "synthetic", now()).due).toBe(true);
});

it("can resume an already compared candidate without paying for another draft or panel", async () => {
  const { root, dir } = fixture(); const deps = workers();
  await draftEdition(root, "synthetic", {}, deps);
  expect(loadCase(dir).editions).toHaveLength(1);
  expect((await draftEdition(root, "synthetic", { prepare: true }, deps)).prepared).toBe(true);
  expect(deps.draft).toHaveBeenCalledTimes(2); expect(deps.judge).toHaveBeenCalledTimes(5);
  expect(prepareEditionCycle(root, cycle(root)).prepared).toBe(false);
});

it("ignores fresh assessment metadata as improvement and reopens when the constitution changes", async () => {
  const { root, dir } = fixture();
  await draftEdition(root, "synthetic", { prepare: true }, workers());
  const selected = displayAssessment(loadCase(dir))!.run;
  const proposal = seedEdition(root, "synthetic", { runId: "metadata-only-edition", generatedAt: "2026-09-06T13:00:00.000Z",
    model: selected.model, promptVersion: selected.promptVersion });
  proposal.assessment = { ...selected, runId: "metadata-only-assessment", generatedAt: "2026-09-06T13:00:00.000Z" };
  proposal.edition.assessment = { runId: proposal.assessment.runId, hash: assessmentHash(proposal.assessment) };
  expect(validateEditionProposal(root, proposal).unchanged).toBe(true);
  expect(editionPlan(root, "synthetic", now()).due).toBe(false);
  fs.appendFileSync(path.join(root, "AGENTS.md"), "\nSynthetic new rule: make the original observation explicit.");
  expect(editionPlan(root, "synthetic", now()).due).toBe(true);
});

it("records reasons to retain the incumbent and stops repeating that comparison", async () => {
  const { root, dir } = fixture(); const deps = workers(true);
  expect(await draftEdition(root, "synthetic", { prepare: true }, deps)).toMatchObject({ outcome: "retained", prepared: false });
  expect(cycle(root).seats.every(s => Boolean(s.vote?.reason))).toBe(true);
  expect(editionPlan(root, "synthetic", "2026-09-10T12:00:00.000Z").due).toBe(false);
  expect(loadCase(dir).editions).toHaveLength(1);
});

it("parks a constitutional objection even when four seats prefer the candidate, and rejects a forged tally", async () => {
  const { root, dir } = fixture(); const deps = workers(); const normal = deps.judge;
  await draftEdition(root, "synthetic", { prepare: true }, { ...deps, judge: async (vendor, system, user) => {
    const vote = JSON.parse(await normal(vendor, system, user));
    if (vendor === "venice") vote.judgments = vote.judgments.map((j: { option: string; status: string; reason: string }) =>
      j.option === JSON.parse(user).incumbentLabel ? j : { ...j, status: "violates", reason: "Synthetic constitutional objection to both new inferences." });
    return JSON.stringify(vote);
  } });
  const receipt = cycle(root);
  expect(receipt.outcome).toBe("contested"); expect(loadCase(dir).editions).toHaveLength(1);
  expect(() => EditionCycleSchema.parse({ ...receipt, outcome: "proposed", winner: "revision" })).toThrow(/disagrees/);
  expect(() => EditionCycleSchema.parse({ ...receipt, seats: receipt.seats.map(() => receipt.seats[0]) })).toThrow(/duplicate edition seat/);
});

it("can compare recorded drafts again without rewriting or relabeling their authorship", async () => {
  const { root } = fixture(); const deps = workers();
  await draftEdition(root, "synthetic", {}, deps);
  const previous = cycle(root);
  const outcome = await draftEdition(root, "synthetic", { reuseDraftsFrom: previous.runId,
    reconsider: "Reconsider the comparison against the same unchanged records." }, { ...deps, now: () => "2026-09-06T13:00:00.000Z" });
  expect(outcome).toMatchObject({ rested: false, outcome: "proposed" });
  expect(deps.draft).toHaveBeenCalledTimes(2); expect(deps.judge).toHaveBeenCalledTimes(10);
  const current = readIntakeDecisions(root).find(e => e.runId === outcome.runId)!.editionCycle;
  expect(current.reusedDraftsFrom).toBe(previous.runId);
  expect(current.drafts).toEqual(previous.drafts);
});

it("selects between two improvements without demanding four identical first preferences", () => {
  const rankings = [
    ["revision", "recomposition", "incumbent"], ["revision", "recomposition", "incumbent"],
    ["recomposition", "revision", "incumbent"], ["recomposition", "revision", "incumbent"],
    ["incumbent", "revision", "recomposition"],
  ] as EditionSeat["order"][];
  const seats: EditionSeat[] = rankings.map((ranking, i) => ({ vendor: `synthetic-${i}`, model: "fixture", effort: "fixture",
    generatedAt: now(), inputHash: "a".repeat(64), order: ["incumbent", "revision", "recomposition"],
    error: null, rejectedReply: null, vote: { ranking, reason: "Synthetic comparison of two improvements.",
      judgments: ranking.map(option => ({ option, status: "complies", reason: "Synthetic constitutional compliance." })) } }));
  expect(editionChoice(seats, 2)).toEqual({ outcome: "proposed", winner: "revision" });
  expect(editionChoice(seats.slice(0, 4), 2)).toEqual({ outcome: "contested", winner: null });
});

it("preserves missing-seat failures and retries at most on a later day", async () => {
  const { root, dir } = fixture(); const deps = workers(); const normal = deps.judge;
  await draftEdition(root, "synthetic", { prepare: true }, { ...deps, judge: async (vendor, system, user) => {
    if (["venice", "xai"].includes(vendor)) throw new Error("Synthetic missing provider.");
    return normal(vendor, system, user);
  } });
  expect(cycle(root).outcome).toBe("failed"); expect(loadCase(dir).editions).toHaveLength(1);
  expect(cycle(root).seats.filter(s => s.error)).toHaveLength(2);
  expect(editionPlan(root, "synthetic", now()).due).toBe(false);
  expect(editionPlan(root, "synthetic", "2026-09-07T12:00:00.000Z").due).toBe(true);
});

it("keeps rejected replies without repairing invented records or spending on their comparison", async () => {
  const { root, dir } = fixture(); const deps = workers();
  const invalid = reply(); invalid.featuredClaimIds = ["TST-C999"];
  await draftEdition(root, "synthetic", { prepare: true }, { ...deps,
    draft: async () => ({ model: "Synthetic author", text: JSON.stringify(invalid) }) });
  expect(cycle(root).drafts.every(d => d.error && d.rejectedReply && !d.proposal)).toBe(true);
  expect(deps.judge).not.toHaveBeenCalled(); expect(loadCase(dir).editions).toHaveLength(1);
});

it("refuses an otherwise winning candidate when inputs change during comparison", async () => {
  const { root, dir } = fixture(); const deps = workers(); const normal = deps.judge;
  await expect(draftEdition(root, "synthetic", { prepare: true }, { ...deps, judge: async (vendor, system, user) => {
    if (vendor === "venice") fs.appendFileSync(path.join(dir, "evidence.yaml"), "\n# Synthetic concurrent change\n");
    return normal(vendor, system, user);
  } })).rejects.toThrow(/case changed/);
  expect(loadCase(dir).editions).toHaveLength(1);
  expect(cycle(root).outcome).toBe("proposed");
  expect(() => prepareEditionCycle(root, cycle(root))).toThrow(/stale/);
});

it("restores earlier writes if a later file write or final case validation fails", () => {
  const { dir } = fixture(); const history = fs.readFileSync(path.join(dir, "history.yaml"), "utf8");
  const original = fs.writeFileSync; let interrupted = false;
  vi.spyOn(fs, "writeFileSync").mockImplementation((file, ...args) => {
    if (String(file).endsWith("interrupt.txt") && !interrupted) { interrupted = true; throw new Error("Synthetic interrupted write"); }
    return original(file, ...args);
  });
  expect(() => installCaseFiles(dir, { "history.yaml": history + "\n", "interrupt.txt": "partial" })).toThrow("Synthetic interrupted write");
  expect(fs.readFileSync(path.join(dir, "history.yaml"), "utf8")).toBe(history);
  expect(() => installCaseFiles(dir, { "history.yaml": history + "\n", "claims.yaml": "malformed: [" })).toThrow();
  expect(fs.readFileSync(path.join(dir, "claims.yaml"), "utf8")).toBe("[]\n");
  expect(fs.readFileSync(path.join(dir, "history.yaml"), "utf8")).toBe(history);
});

it("makes no model calls for an empty topic", async () => {
  const { root, dir } = fixture(true); const deps = workers();
  expect(await draftEdition(root, "synthetic", { prepare: true }, deps)).toMatchObject({ rested: true, prepared: false });
  expect(deps.draft).not.toHaveBeenCalled(); expect(deps.judge).not.toHaveBeenCalled();
  expect(displayAssessment(loadCase(dir))).toBeNull();
});
