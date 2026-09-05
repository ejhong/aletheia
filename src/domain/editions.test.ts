import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import {
  evidencePacket,
  readCaseSnapshot,
} from "../../scripts/lib/case-snapshot.mjs";
import {
  assessmentHash,
  currentChecks,
  draftIsCurrent,
  fingerprint,
  latestDraft,
} from "../../scripts/lib/review-state.mjs";
import { topicSeed } from "../../scripts/lib/topic-seed.mjs";
import { caseView } from "./caseView";
import {
  crossModelSummary,
  getCaseBySlug,
  loadCase,
  ratification,
} from "./load";
import { AssessmentRunSchema, type AssessmentRun } from "./schema";
import { extractClaimRefs, extractPlateRefs, parseArticle } from "./article";

const scratch: string[] = [];
afterEach(() => {
  for (const dir of scratch.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});
function temp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aletheia-edition-"));
  scratch.push(dir);
  return dir;
}
function receipt(run: AssessmentRun, contentHash: string, packetHash: string) {
  return {
    protocol: "case-snapshot-v1" as const,
    contentHash,
    assessmentHash: assessmentHash(run),
    packetHash,
  };
}
function reviewedCase() {
  const loaded = getCaseBySlug("megalithic-casting");
  const draft = latestDraft(loaded.assessmentRuns)!;
  const checks = ["alpha", "beta", "gamma", "delta"].map((seat) => ({
    ...draft,
    role: "check" as const,
    model: `${seat} (Vendor-${seat})`,
    runId: `check-${seat}`,
    review: receipt(draft, loaded.contentHash, loaded.reviewPacketHash),
  }));
  return { ...loaded, assessmentRuns: [draft, ...checks] };
}

describe("edition review receipts", () => {
  it("a mismatched evidence packet cannot count even when content and draft match", () => {
    const loaded = reviewedCase();
    expect(ratification(loaded)?.status).toBe("ratified");
    loaded.assessmentRuns[1].review!.packetHash =
      fingerprint("a different packet");
    expect(ratification(loaded)?.status).toBe("unratified");
    expect(ratification(loaded)?.panel).toBe(3);
  });
  it("a later history note cannot stale reviews of unchanged content", () => {
    const loaded = reviewedCase();
    loaded.history.push({
      date: "2026-10-01",
      change: "Recorded a no-change investigation.",
      reason: "No new evidence was accepted.",
      actor: "test",
      aiAssisted: true,
    });
    expect(ratification(loaded)?.status).toBe("ratified");
    expect(crossModelSummary(loaded)?.staleSince).toBeNull();
    expect(crossModelSummary(loaded)?.versionVerified).toBe(true);
  });
  it("unchanged input packets rest even after another same-day commit", () => {
    const draft = reviewedCase().assessmentRuns[0];
    const hash = fingerprint("evidence packet");
    expect(
      draftIsCurrent(
        { ...draft, inputHash: hash },
        hash,
        "2026-09-05T23:59:00Z",
      ),
    ).toBe(true);
    expect(
      draftIsCurrent(
        { ...draft, inputHash: hash },
        fingerprint("corrected observation"),
        draft.date,
      ),
    ).toBe(false);
  });

  it("review receipts require an independent role, timestamp, and unique claim assessments", () => {
    const loaded = reviewedCase();
    const check = {
      ...loaded.assessmentRuns[1],
      generatedAt: "2026-09-05T12:00:00Z",
    };
    expect(AssessmentRunSchema.safeParse(check).success).toBe(true);
    expect(
      AssessmentRunSchema.safeParse({ ...check, role: "draft" }).success,
    ).toBe(false);
    expect(
      AssessmentRunSchema.safeParse({ ...check, generatedAt: undefined })
        .success,
    ).toBe(false);
    expect(
      AssessmentRunSchema.safeParse({
        ...check,
        claimAssessments: [
          ...check.claimAssessments,
          check.claimAssessments[0],
        ],
      }).success,
    ).toBe(false);
  });
  it("requires a full current panel after a same-day change", () => {
    const loaded = reviewedCase();
    expect(ratification(loaded)?.status).toBe("ratified");
    loaded.contentHash = fingerprint("same-day evidence correction");
    const draft = loaded.assessmentRuns[0];
    loaded.assessmentRuns[1].review = receipt(
      draft,
      loaded.contentHash,
      loaded.reviewPacketHash,
    );
    expect(ratification(loaded)?.panel).toBe(1);
    expect(ratification(loaded)?.status).toBe("unratified");
  });

  it("a changed assessment cannot reuse the previous draft's checks", () => {
    const loaded = reviewedCase();
    loaded.assessmentRuns[0] = {
      ...loaded.assessmentRuns[0],
      caseAssessment: {
        ...loaded.assessmentRuns[0].caseAssessment,
        synthesis: "A changed argument. ".repeat(10),
      },
    };
    expect(ratification(loaded)?.panel).toBe(0);
  });

  it("missing load-bearing coverage cannot count as concurrence", () => {
    const loaded = reviewedCase();
    const id = loaded.assessmentRuns[0].caseAssessment.loadBearing[0];
    expect(id).toBeTruthy();
    loaded.assessmentRuns[1].claimAssessments =
      loaded.assessmentRuns[1].claimAssessments.filter((a) => a.claimId !== id);
    expect(ratification(loaded)?.status).toBe("unratified");
    expect(ratification(loaded)?.reason).toContain(id);
  });

  it("a vendor model upgrade never adds an independent seat", () => {
    const loaded = reviewedCase();
    const draft = loaded.assessmentRuns[0];
    loaded.assessmentRuns.push({
      ...loaded.assessmentRuns[1],
      runId: "newer-alpha",
      model: "New model (Vendor-alpha)",
      generatedAt: "2026-09-05T12:00:00Z",
    });
    expect(
      currentChecks(
        loaded.assessmentRuns,
        draft,
        loaded.contentHash,
        loaded.reviewPacketHash,
      ),
    ).toHaveLength(4);
  });

  it("new draft ordering uses full timestamps; legacy numeric suffixes stay ordered", () => {
    const draft = reviewedCase().assessmentRuns[0];
    const early = {
      ...draft,
      runId: "z-early",
      generatedAt: "2026-09-05T08:00:00Z",
    };
    const late = {
      ...draft,
      runId: "a-late",
      generatedAt: "2026-09-05T09:00:00Z",
    };
    expect(latestDraft([late, early])?.runId).toBe("a-late");
    expect(
      latestDraft([
        { ...draft, runId: "draft-r10" },
        { ...draft, runId: "draft-r9" },
      ])?.runId,
    ).toBe("draft-r10");
  });

  it("raw and schema-validated draft receipts are identical", () => {
    const draft = reviewedCase().assessmentRuns[0];
    const raw = parse(stringify({ ...draft, role: undefined }));
    expect(assessmentHash(raw)).toBe(
      assessmentHash(AssessmentRunSchema.parse(raw)),
    );
  });

  it("blind packets omit stored judgments and keep exact provenance and dependencies", () => {
    const files = readCaseSnapshot("content/cases/geopolymer").files;
    const packet = evidencePacket({
      ...files,
      "overview.md": "NARRATIVE ANCHOR",
    });
    const text = JSON.stringify(packet);
    expect(text).not.toMatch(
      /NARRATIVE ANCHOR|credibilitySummary|diagnosticitySummary|strongestObjection/,
    );
    expect(packet.claims.length).toBeGreaterThan(packet.assessClaimIds.length);
    expect(
      packet.evidence.every(
        (e: { sourceId: string; sourceStatement: string }) =>
          e.sourceId && e.sourceStatement,
      ),
    ).toBe(true);
    expect(packet.claims.some((c) => c.sourceAnchor)).toBe(true);
    expect(
      packet.sources.some((s: { verification: string }) => s.verification),
    ).toBe(true);
  });
});

describe("one displayed case view", () => {
  it("uses the displayed assessment on claim surfaces without mutating the ledger", () => {
    const loaded = reviewedCase();
    const before = JSON.stringify(loaded.claims);
    const view = caseView(loaded);
    for (const claim of view.featured) {
      const evaluation = view.assessment!.run.claimAssessments.find(
        (a) => a.claimId === claim.id,
      );
      if (evaluation) {
        expect(claim.credibility).toBe(evaluation.verdict);
        expect(claim.credibilitySummary).toBe(evaluation.reasoning);
        expect(claim.assessment?.runId).toBe(view.assessment!.run.runId);
      }
    }
    expect(JSON.stringify(loaded.claims)).toBe(before);
    expect(
      extractClaimRefs(view.article).every((id) =>
        view.featured.some((c) => c.id === id),
      ),
    ).toBe(true);
  });
});

describe("a topic from nothing", () => {
  const input = {
    id: "START-001",
    slug: "a-new-question",
    title: "A new question",
    question: "Which observation would distinguish these explanations?",
    domain: "Method test",
    date: "2026-09-05",
  };
  it("loads through the production loader without evidence, judgments, or invented review", () => {
    const dir = temp();
    for (const [file, text] of Object.entries(topicSeed(input)))
      fs.writeFileSync(path.join(dir, file), text);
    const loaded = loadCase(dir);
    const view = caseView(loaded);
    expect(view.isStarting).toBe(true);
    expect(view.assessment).toBeNull();
    expect(loaded.record.researchPriority).toBeNull();
    expect(loaded.record.lastReviewed).toBeNull();
    expect(
      [
        loaded.claims,
        loaded.evidence,
        loaded.sources,
        loaded.research,
        loaded.assessmentRuns,
      ].every((list) => list.length === 0),
    ).toBe(true);
    expect(parseArticle(view.article).length).toBeGreaterThan(1);
    expect(extractClaimRefs(view.article)).toEqual([]);
    expect(extractPlateRefs(view.article)).toEqual([]);
    const first = loaded.contentHash;
    fs.writeFileSync(
      path.join(dir, "history.yaml"),
      stringify([
        ...loaded.history,
        { ...loaded.history[0], change: "Another run found nothing to add." },
      ]),
    );
    expect(readCaseSnapshot(dir).contentHash).toBe(first);
    fs.appendFileSync(
      path.join(dir, "overview.md"),
      "\nThe research question has been narrowed.\n",
    );
    expect(readCaseSnapshot(dir).contentHash).not.toBe(first);
  });

  it("the command creates a reviewable proposal and refuses to overwrite one", () => {
    const destination = path.join(temp(), "topic");
    const args = [
      "scripts/start-case.mjs",
      "--id",
      input.id,
      "--slug",
      input.slug,
      "--title",
      input.title,
      "--question",
      input.question,
      "--domain",
      input.domain,
      "--output",
      destination,
    ];
    execFileSync(process.execPath, args, { stdio: "pipe" });
    expect(caseView(loadCase(destination)).isStarting).toBe(true);
    expect(() =>
      execFileSync(process.execPath, args, { stdio: "pipe" }),
    ).toThrow();
  });

  it("a minimal active case cannot acquire a fabricated priority by default", () => {
    const dir = temp();
    for (const [file, text] of Object.entries(topicSeed(input)))
      fs.writeFileSync(path.join(dir, file), text);
    const record = parse(fs.readFileSync(path.join(dir, "case.yaml"), "utf8"));
    fs.writeFileSync(
      path.join(dir, "case.yaml"),
      stringify({ ...record, status: "active" }),
    );
    expect(() => loadCase(dir)).toThrow(/research priority/);
  });
});
