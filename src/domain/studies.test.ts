import { describe, expect, it } from "vitest";
import { StudySchema, type Evidence, type Source, type Study } from "./schema";
import {
  computeCriteriaHash,
  isPendingStudy,
  studyIntegrityErrors,
} from "./studies";

/**
 * The pre-registration machinery: the freeze must be tamper-evident
 * (hash), the freeze/collection ordering must be structural (schema
 * refinements), and a superseded study's workpaper must not keep
 * carrying ledger weight.
 */

const criteria = (over: Partial<Study["criteria"]> = {}): Study["criteria"] => {
  const base = {
    frozenOn: "2026-08-27",
    inclusion: ["public venue", "investigators formally released the scene"],
    exclusion: ["ongoing scene holds"],
    searchProtocol:
      'news archives: "scene released" AND "repaved|demolished|cleaned"; court records for authorization orders',
    knownCandidates: [
      { name: "Target case", disposition: "exclude" as const, reason: "the case under study" },
    ],
    criteriaHash: "000000000000",
  };
  const c = { ...base, ...over };
  return { ...c, criteriaHash: over.criteriaHash ?? computeCriteriaHash(c) };
};

const frozenStudy = (over: Partial<Study> = {}): Study =>
  StudySchema.parse({
    id: "EX-S001",
    title: "Example base-rate study",
    question: "How fast are released scenes altered?",
    researchIds: ["EX-R001"],
    claimIds: [],
    criteria: criteria(),
    method: "Tabulate comparable cases per the frozen protocol.",
    columns: ["case", "released", "altered"],
    rows: [],
    findings: [],
    limitations: [],
    runId: "2026-08-27-study-ex",
    model: "test/model",
    date: "2026-08-27",
    promptVersion: "test-v1",
    humanReviewed: false,
    ...over,
  });

const row = {
  cells: { case: "Case A", released: "2020-01-01", altered: "2020-02-01" },
  citation: { text: "AP report, 2020-02-02", verification: "ai_verified" as const },
};

const collectedStudy = (over: Partial<Study> = {}): Study =>
  frozenStudy({
    rows: [row],
    findings: [{ statement: "Alteration followed release in the one comparable case found." }],
    limitations: ["single-row example"],
    ...over,
  });

const ctx = (studies: Study[], sources: Source[] = [], evidence: Evidence[] = []) => ({
  studies,
  sources,
  evidence,
  researchIds: new Set(["EX-R001"]),
  claimIds: new Set(["EX-C001"]),
});

const workpaperSource = (studyId: string): Source =>
  ({
    id: "SRC-EX-S001",
    title: "Workpaper for EX-S001",
    authors: [],
    sourceType: "workpaper",
    studyId,
    verification: "ai_verified",
    reliabilityNotes: [],
    background: false,
  }) as unknown as Source;

const evidenceCiting = (sourceId: string): Evidence =>
  ({
    id: "EX-E001",
    title: "Aggregate finding",
    claimIds: ["EX-C001"],
    sourceId,
    direction: "context",
    strength: "weak",
    sourceStatement: "s",
    limitations: [],
    reviewState: "ai_extracted",
    origin: { kind: "ai_extracted", runId: "r", model: "m", date: "2026-08-27" },
  }) as unknown as Evidence;

describe("freeze integrity", () => {
  it("a correctly stamped study passes", () => {
    expect(studyIntegrityErrors(ctx([frozenStudy()]))).toEqual([]);
  });

  it("editing frozen criteria after the stamp fails the build", () => {
    const s = frozenStudy();
    const tampered = {
      ...s,
      criteria: { ...s.criteria, inclusion: [...s.criteria.inclusion, "quietly widened"] },
    };
    expect(studyIntegrityErrors(ctx([tampered]))[0]).toMatch(/criteriaHash .* does not match/);
  });

  it("the schema refuses findings before rows and rows without limitations", () => {
    expect(() => frozenStudy({ findings: [{ statement: "x".repeat(30) }] })).toThrow(
      /without rows cannot carry findings/,
    );
    expect(() => frozenStudy({ rows: [row], findings: [{ statement: "x".repeat(30) }] })).toThrow(
      /must state its limitations/,
    );
    expect(() => frozenStudy({ rows: [row], limitations: ["l"] })).toThrow(
      /must state its aggregate findings/,
    );
  });

  it("rows may only fill declared columns", () => {
    expect(() =>
      collectedStudy({
        rows: [{ ...row, cells: { ...row.cells, undeclared: "x" } }],
      }),
    ).toThrow(/undeclared column/);
  });

  it("pending is exactly the zero-rows state", () => {
    expect(isPendingStudy(frozenStudy())).toBe(true);
    expect(isPendingStudy(collectedStudy())).toBe(false);
  });
});

describe("cross-record integrity", () => {
  it("dangling research, claim, evidence, and supersedes ids all fail", () => {
    const s = collectedStudy({
      researchIds: ["EX-R999"],
      claimIds: ["EX-C999"],
      findings: [{ statement: "x".repeat(30), evidenceId: "EX-E999" }],
      supersedes: "EX-S999",
    });
    const errors = studyIntegrityErrors(ctx([s]));
    expect(errors.join(" ")).toMatch(/unknown research item EX-R999/);
    expect(errors.join(" ")).toMatch(/unknown claim EX-C999/);
    expect(errors.join(" ")).toMatch(/unknown evidence EX-E999/);
    expect(errors.join(" ")).toMatch(/supersedes unknown study EX-S999/);
  });

  it("workpaper sources must name a real study; only workpapers carry studyId", () => {
    const noStudy = { ...workpaperSource("EX-S404") };
    expect(studyIntegrityErrors(ctx([frozenStudy()], [noStudy])).join(" ")).toMatch(
      /unknown study EX-S404/,
    );
    const paperWithStudy = { ...workpaperSource("EX-S001"), sourceType: "paper" } as Source;
    expect(studyIntegrityErrors(ctx([frozenStudy()], [paperWithStudy])).join(" ")).toMatch(
      /only workpaper sources may carry studyId/,
    );
  });

  it("evidence citing a superseded study's workpaper fails until re-pointed", () => {
    const original = collectedStudy();
    const successor = collectedStudy({
      id: "EX-S002",
      runId: "2026-09-01-study-ex2",
      supersedes: "EX-S001",
    });
    const src = workpaperSource("EX-S001");
    const errors = studyIntegrityErrors(
      ctx([original, successor], [src], [evidenceCiting(src.id)]),
    );
    expect(errors.join(" ")).toMatch(/superseded study EX-S001 — re-point/);
    // The successor's own workpaper is fine.
    const src2 = { ...workpaperSource("EX-S002"), id: "SRC-EX-S002" };
    expect(
      studyIntegrityErrors(ctx([original, successor], [src2], [evidenceCiting("SRC-EX-S002")])),
    ).toEqual([]);
  });
});
