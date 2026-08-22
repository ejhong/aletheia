import { describe, expect, it } from "vitest";
import { extractClaimRefs, parseArticle, parseInlines } from "./article";
import { getCaseBySlug, latestAssessment, liveClaims, loadAllCases } from "./load";
import { ClaimSchema, EvidenceSchema } from "./schema";

describe("real content", () => {
  it("loads and passes all integrity checks", () => {
    const cases = loadAllCases();
    expect(cases.length).toBeGreaterThan(0);
    const geo = getCaseBySlug("megalithic-casting");
    expect(geo.record.id).toBe("GEO-001");
    expect(liveClaims(geo).length).toBeGreaterThanOrEqual(10);
    // Tombstones are kept but excluded from live views.
    expect(geo.claims.length).toBeGreaterThan(liveClaims(geo).length);
    expect(latestAssessment(geo)).not.toBeNull();
    // Every claim referenced by the article resolves.
    for (const id of extractClaimRefs(geo.overviewMarkdown)) {
      expect(liveClaims(geo).some((c) => c.id === id)).toBe(true);
    }
  });

  it("article parses into blocks with claim refs", () => {
    const geo = getCaseBySlug("megalithic-casting");
    const blocks = parseArticle(geo.overviewMarkdown);
    expect(blocks.some((b) => b.kind === "heading")).toBe(true);
    const refs = extractClaimRefs(geo.overviewMarkdown);
    expect(refs.length).toBeGreaterThanOrEqual(8);
  });
});

describe("schema rules", () => {
  const baseClaim = {
    id: "GEO-C999",
    statement: "A test statement long enough to pass.",
    plainLanguage: "A plain language gloss long enough.",
    theme: "tool-marks",
    rung: "observation",
    claimType: "observation",
    importance: "supporting",
    reviewState: "ai_extracted",
    origin: {
      ref: "test",
      extractedBy: "test",
      runId: "test-run",
      date: "2026-01-01",
    },
    credibility: "unresolved",
    credibilitySummary: "none",
    diagnosticity: "low",
    diagnosticitySummary: "none",
    strongestObjection: "none",
  };

  it("rejected claims require a rejectionReason (tombstone rule)", () => {
    expect(() =>
      ClaimSchema.parse({ ...baseClaim, reviewState: "rejected" }),
    ).toThrow();
    expect(() =>
      ClaimSchema.parse({
        ...baseClaim,
        reviewState: "rejected",
        rejectionReason: "because",
      }),
    ).not.toThrow();
  });

  it("evidence requires direction and at least one claim", () => {
    expect(() =>
      EvidenceSchema.parse({
        id: "GEO-E999",
        title: "t",
        claimIds: [],
        sourceId: "SRC-X",
        direction: "supports",
        strength: "weak",
        sourceStatement: "s",
        reviewState: "ai_extracted",
        origin: baseClaim.origin,
      }),
    ).toThrow();
  });
});

describe("article parser", () => {
  it("parses claim refs, links, and emphasis", () => {
    const inlines = parseInlines(
      "Before [the claim]{claim=GEO-C001} and *em* and **strong** and [a link](https://example.com).",
    );
    expect(inlines).toContainEqual({
      kind: "claimRef",
      text: "the claim",
      claimId: "GEO-C001",
    });
    expect(inlines).toContainEqual({ kind: "em", text: "em" });
    expect(inlines).toContainEqual({ kind: "strong", text: "strong" });
    expect(inlines).toContainEqual({
      kind: "link",
      text: "a link",
      href: "https://example.com",
    });
  });

  it("rejects unsupported heading levels", () => {
    expect(() => parseArticle("# Top level")).toThrow();
  });
});
