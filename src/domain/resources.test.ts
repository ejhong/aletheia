import { describe, expect, it } from "vitest";
import { getCaseBySlug, loadAllCases } from "./load";
import { extractArxivId, extractDoi, resourceGroups } from "./resources";
import { CuratedResourceSchema, WatchConfigSchema } from "./schema";

describe("identifier extraction", () => {
  it("finds DOIs in identifier prose and strips trailing punctuation", () => {
    expect(
      extractDoi("Science Advances 6(31): eabc0133. DOI: 10.1126/sciadv.abc0133"),
    ).toBe("10.1126/sciadv.abc0133");
    expect(extractDoi("DOI: 10.1016/j.jas.2005.09.011.")).toBe(
      "10.1016/j.jas.2005.09.011",
    );
    expect(extractDoi("no identifier here")).toBeNull();
    expect(extractDoi(undefined)).toBeNull();
  });

  it("finds modern arXiv ids in text and URLs", () => {
    expect(extractArxivId("arXiv:2408.01234v2")).toBe("2408.01234");
    expect(extractArxivId("https://arxiv.org/abs/2301.00001")).toBe(
      "2301.00001",
    );
    expect(extractArxivId("plain text")).toBeNull();
  });
});

describe("resource group derivation", () => {
  const geo = getCaseBySlug("megalithic-casting");
  const groups = resourceGroups(geo);

  it("places every source exactly once and invents nothing", () => {
    const placed = groups.flatMap((g) => g.entries.map((e) => e.source.id));
    expect(placed.sort()).toEqual(geo.sources.map((s) => s.id).sort());
  });

  it("derives the critiques group from evidence direction, honestly", () => {
    const critiques = groups.find((g) => g.key === "critiques");
    expect(critiques).toBeDefined();
    // The anti-casting petrography belongs here.
    const ids = critiques!.entries.map((e) => e.source.id);
    expect(ids).toContain("SRC-JANA-2007");
    // Invariant: every entry in critiques has more undermining than
    // supporting evidence records; no other group has such an entry.
    for (const g of groups) {
      for (const e of g.entries) {
        const critical =
          (e.directionCounts.undermines ?? 0) >
          (e.directionCounts.supports ?? 0);
        expect(critical).toBe(g.key === "critiques");
      }
    }
  });

  it("links out via explicit URL or extracted DOI, never a fabricated one", () => {
    for (const g of groups) {
      for (const e of g.entries) {
        if (e.href?.startsWith("https://doi.org/")) {
          // A DOI link exists only because the identifier field carried it.
          expect(e.doi).not.toBeNull();
          expect(e.source.identifier).toContain(e.doi!);
        }
      }
    }
    // A book held only in the project library has no public link.
    const foti = groups
      .flatMap((g) => g.entries)
      .find((e) => e.source.id === "SRC-FOTI-2024");
    expect(foti?.href).toBeNull();
  });

  it("orders entries newest-first within a group", () => {
    for (const g of groups) {
      const years = g.entries.map((e) => e.source.year ?? "");
      const sorted = [...years].sort((a, b) => b.localeCompare(a));
      expect(years).toEqual(sorted);
    }
  });
});

describe("watch config schema", () => {
  const valid = {
    queries: [
      { id: "trigger-point-imaging", query: "myofascial trigger point" },
    ],
  };

  it("parses a minimal config and defaults to arXiv + Crossref", () => {
    const cfg = WatchConfigSchema.parse(valid);
    expect(cfg.queries[0].sources).toEqual(["arxiv", "crossref"]);
  });

  it("rejects duplicate query ids", () => {
    expect(() =>
      WatchConfigSchema.parse({
        queries: [
          { id: "same", query: "one thing" },
          { id: "same", query: "another thing" },
        ],
      }),
    ).toThrow(/duplicate watch query id/);
  });

  it("rejects unknown sources, empty query lists, and bad ids", () => {
    expect(() =>
      WatchConfigSchema.parse({
        queries: [{ id: "q", query: "test query", sources: ["scholar"] }],
      }),
    ).toThrow();
    expect(() => WatchConfigSchema.parse({ queries: [] })).toThrow();
    expect(() =>
      WatchConfigSchema.parse({
        queries: [{ id: "Bad Id!", query: "test query" }],
      }),
    ).toThrow();
  });

  it("loads the seeded watch configs through the case loader", () => {
    for (const slug of ["megalithic-casting", "vasocomputation"]) {
      const loaded = getCaseBySlug(slug);
      expect(loaded.watch).not.toBeNull();
      expect(loaded.watch!.queries.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("curated resources schema", () => {
  const valid = {
    title: "A real explainer",
    url: "https://example.com/explainer",
    type: "explainer",
    verification: "ai_verified",
  };

  it("requires a real URL and an honest verification label", () => {
    expect(() => CuratedResourceSchema.parse(valid)).not.toThrow();
    const { url: _url, ...noUrl } = valid;
    void _url;
    expect(() => CuratedResourceSchema.parse(noUrl)).toThrow();
    expect(() =>
      CuratedResourceSchema.parse({ ...valid, url: "not-a-url" }),
    ).toThrow();
    const { verification: _v, ...noVerification } = valid;
    void _v;
    expect(() => CuratedResourceSchema.parse(noVerification)).toThrow();
  });

  it("loads seeded curated resources for every case that ships them", () => {
    for (const loaded of loadAllCases()) {
      for (const item of loaded.curatedResources) {
        expect(item.url).toMatch(/^https:\/\//);
        expect(item.verification).toBeDefined();
      }
    }
    expect(
      getCaseBySlug("megalithic-casting").curatedResources.length,
    ).toBeGreaterThanOrEqual(2);
  });
});
