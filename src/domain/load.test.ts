import { describe, expect, it } from "vitest";
import {
  extractClaimRefs,
  extractPlateRefs,
  parseArticle,
  parseInlines,
} from "./article";
import {
  getCaseBySlug,
  latestAssessment,
  liveClaims,
  loadAllCases,
  loadSiteImages,
} from "./load";
import { ClaimSchema, EvidenceSchema, ImageSchema } from "./schema";

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

  it("loads case and site images with valid licenses and files", () => {
    const geo = getCaseBySlug("megalithic-casting");
    const plates = geo.images.filter((i) => i.role === "plate");
    expect(plates.length).toBeGreaterThanOrEqual(3);
    // Every plate is real imagery with provenance — never generated.
    for (const p of plates) {
      expect(p.source).not.toBe("generated");
      expect(p.provenance?.sourceUrl).toMatch(/^https:/);
    }
    expect(loadSiteImages().length).toBeGreaterThanOrEqual(2);
    // Plate refs in the article resolve to actual plates.
    const plateIds = new Set(plates.map((p) => p.id));
    for (const ref of extractPlateRefs(geo.overviewMarkdown)) {
      expect(plateIds.has(ref)).toBe(true);
    }
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

  it("HARD RULE: AI-generated images can never be plates", () => {
    const base = {
      id: "IMG-TEST-X",
      file: "/images/site/hero.jpg",
      alt: "a test image alt text",
      license: "test",
      credit: "test credit",
      prompt: "p",
      styleVersion: "style-v1",
      model: "m",
      plateNumber: 1,
      depicts: "something",
      provenance: {
        photographer: "someone",
        sourceUrl: "https://example.com",
      },
    };
    expect(() =>
      ImageSchema.parse({ ...base, role: "plate", source: "generated" }),
    ).toThrow(/never be plates/);
    expect(() =>
      ImageSchema.parse({ ...base, role: "plate", source: "commons" }),
    ).not.toThrow();
    expect(() =>
      ImageSchema.parse({ ...base, role: "cover", source: "generated" }),
    ).not.toThrow();
  });

  it("images without license or credit fail validation", () => {
    expect(() =>
      ImageSchema.parse({
        id: "IMG-TEST-Y",
        role: "cover",
        file: "/images/site/hero.jpg",
        alt: "some alt text here",
        source: "commons",
        license: "",
        credit: "",
      }),
    ).toThrow();
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
