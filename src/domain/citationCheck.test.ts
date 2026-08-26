import { describe, expect, it } from "vitest";
import {
  extractCitations,
  formatVerificationSection,
  verificationSummary,
  verifyCitations,
} from "../../scripts/lib/citation-check.mjs";

/**
 * Mechanical citation verification is an input to the arbiter seats;
 * these tests pin its two safety-relevant behaviors: what gets scanned
 * (added content lines only) and how failures report themselves
 * (informatively, never by throwing).
 */

const diff = (file: string, ...added: string[]) =>
  [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    "@@ -1,1 +1,9 @@",
    ...added.map((l) => `+${l}`),
  ].join("\n");

describe("citation extraction from diffs", () => {
  it("finds DOIs, arXiv ids, and URLs in added content lines", () => {
    const d = diff(
      "content/cases/x/sources.yaml",
      "  doi: 10.1234/abcd.5678",
      "  url: https://example.org/report",
      "  note: see arXiv:2401.12345 for the preprint",
    );
    expect(extractCitations(d)).toEqual([
      { kind: "doi", id: "10.1234/abcd.5678" },
      { kind: "url", id: "https://example.org/report" },
      { kind: "arxiv", id: "2401.12345" },
    ]);
  });

  it("classifies doi.org and arxiv.org URLs as their identifier kind, once", () => {
    const d = diff(
      "content/cases/x/sources.yaml",
      "  url: https://doi.org/10.1234/abcd.5678",
      "  doi: 10.1234/abcd.5678",
      "  mirror: https://arxiv.org/abs/2401.12345v2",
    );
    expect(extractCitations(d)).toEqual([
      { kind: "doi", id: "10.1234/abcd.5678" },
      { kind: "arxiv", id: "2401.12345" },
    ]);
  });

  it("ignores removed lines, context lines, and non-content files", () => {
    const d = [
      diff("scripts/foo.mjs", "  const api = 'https://api.vendor.test/v1';"),
      `diff --git a/content/cases/x/evidence.yaml b/content/cases/x/evidence.yaml`,
      `--- a/content/cases/x/evidence.yaml`,
      `+++ b/content/cases/x/evidence.yaml`,
      "@@ -1,2 +1,2 @@",
      "-  old: https://removed.example.org/gone",
      "   context: https://context.example.org/unchanged",
    ].join("\n");
    expect(extractCitations(d)).toEqual([]);
  });

  it("strips trailing sentence punctuation from identifiers", () => {
    const d = diff(
      "content/cases/x/overview.md",
      "As shown in https://example.org/paper), and 10.1234/xyz.",
    );
    expect(extractCitations(d)).toEqual([
      { kind: "url", id: "https://example.org/paper" },
      { kind: "doi", id: "10.1234/xyz" },
    ]);
  });

  // Regression: `)` used to terminate the identifier unconditionally, so
  // DOIs with legal parentheses (Elsevier S-prefix, ASCE) were truncated
  // into strings that fail to resolve — and a FAILS line reads to the
  // seats as a fabricated citation.
  it("keeps balanced parentheses inside DOIs", () => {
    const d = diff(
      "content/cases/x/sources.yaml",
      "  doi: 10.1016/S0140-6736(20)30183-5",
      "  doi: 10.1061/(ASCE)0733-9399(2002)128:1(2)",
      "  url: https://doi.org/10.1016/S0140-6736(20)30183-5",
    );
    expect(extractCitations(d)).toEqual([
      { kind: "doi", id: "10.1016/S0140-6736(20)30183-5" },
      { kind: "doi", id: "10.1061/(ASCE)0733-9399(2002)128:1(2)" },
    ]);
  });

  it("still trims unbalanced closing parens from prose and markdown links", () => {
    const d = diff(
      "content/cases/x/overview.md",
      "(see 10.1234/foo) and [the site](https://example.com/a) for context.",
      "The trial (10.1016/S0140-6736(20)30183-5), reported no effect.",
    );
    expect(extractCitations(d)).toEqual([
      { kind: "url", id: "https://example.com/a" },
      { kind: "doi", id: "10.1234/foo" },
      { kind: "doi", id: "10.1016/S0140-6736(20)30183-5" },
    ]);
  });
});

describe("verification reporting", () => {
  const stub = (status: string, note: string) => async () => ({ status, note });

  it("checks each citation with its kind's checker and formats the section", async () => {
    const results = await verifyCitations(
      [
        { kind: "doi", id: "10.1/a" },
        { kind: "url", id: "https://x.test/" },
      ],
      {
        doi: stub("resolves", 'Crossref: "A title", 2024'),
        url: stub("fails", "HTTP 404"),
        arxiv: stub("resolves", "unused"),
      },
    );
    expect(formatVerificationSection(results)).toBe(
      [
        'doi 10.1/a — RESOLVES (Crossref: "A title", 2024)',
        "url https://x.test/ — FAILS (HTTP 404)",
      ].join("\n"),
    );
    expect(verificationSummary(results)).toMatch(/2 citation.*1 resolve, 1 fail, 0 unchecked/);
  });

  it("reports items beyond the budget as unchecked instead of dropping them", async () => {
    const many = Array.from({ length: 45 }, (_, i) => ({
      kind: "url" as const,
      id: `https://x.test/${i}`,
    }));
    const results = await verifyCitations(many, {
      url: stub("resolves", "HTTP 200"),
      doi: stub("resolves", ""),
      arxiv: stub("resolves", ""),
    });
    expect(results).toHaveLength(45);
    expect(results.filter((r) => r.status === "unchecked")).toHaveLength(5);
    expect(verificationSummary(results)).toMatch(/40 resolve, 0 fail, 5 unchecked/);
  });

  it("renders an honest empty state when nothing was cited", () => {
    expect(formatVerificationSection([])).toMatch(/no citation identifiers/);
  });
});
