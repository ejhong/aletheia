import { describe, expect, it } from "vitest";
import {
  alreadyCarried,
  evidenceDraftErrors,
  extractIdentifiers,
  selectPromotions,
  unverifiedQuotes,
} from "../../scripts/lib/promote-core.mjs";

describe("promotion pipe core", () => {
  it("extracts arxiv ids, dois, and normalized urls", () => {
    expect(
      extractIdentifiers({ url: "https://arxiv.org/abs/2605.01190v2" }).arxiv,
    ).toBe("2605.01190");
    expect(
      extractIdentifiers({
        identifier: "doi 10.1016/j.forsciint.2024.112287, posted 2024",
      }).doi,
    ).toBe("10.1016/j.forsciint.2024.112287");
    expect(
      extractIdentifiers({ url: "https://www.Example.org/paper/" }).urlNorm,
    ).toBe("example.org/paper");
  });

  it("dedupes by identifier and by the Bruehl title-aliasing lesson", () => {
    const ledger = [
      {
        id: "SRC-BRUEHL-2026-ML",
        title:
          "Machine Learning Supports Existence of Previously Unrecognized Transient Astronomical Phenomena in Historical Observatory Images",
        url: "https://doi.org/10.1038/s41598-026-99999-1",
      },
    ];
    // Same work under its arXiv id: no identifier overlap, title must catch it.
    const dupe = alreadyCarried(
      {
        title:
          "[2604.18799] Machine Learning Supports Existence of Previously Unrecognized Transient Astronomical Phenomena in Historical Observatory Images",
        url: "https://arxiv.org/abs/2604.18799",
      },
      ledger,
    );
    expect(dupe?.via).toBe("title similarity");
    // Genuinely new work passes.
    expect(
      alreadyCarried(
        { title: "A completely different subject entirely", url: "https://arxiv.org/abs/2609.00001" },
        ledger,
      ),
    ).toBeNull();
  });

  it("verifies quoted spans verbatim, whitespace- and hyphen-insensitive", () => {
    const text =
      "the features are re-\nproducible across different   representations of the same field";
    expect(
      unverifiedQuotes(
        'It states "reproducible across different representations of the same field".',
        text,
      ),
    ).toEqual([]);
    expect(
      unverifiedQuotes('It states "a sentence the source never wrote at all".', text),
    ).toHaveLength(1);
  });

  it("evidence drafts fail closed on shape, anchoring, and misquotes", () => {
    const base = {
      id: "TRN-E099",
      claimIds: ["TRN-C001"],
      direction: "supports",
      strength: "moderate",
      sourceStatement:
        'The paper reports "the observed features match stellar coma" in its analysis section.',
      editorInference: "Bears on the optical-origin question directly.",
    };
    const ctx = {
      claimIds: new Set(["TRN-C001"]),
      fetchedText: "…the observed features match stellar coma…",
    };
    expect(evidenceDraftErrors(base, ctx)).toEqual([]);
    expect(
      evidenceDraftErrors({ ...base, claimIds: ["TRN-C999"] }, ctx),
    ).toContain("unknown claim TRN-C999");
    expect(
      evidenceDraftErrors({ ...base, direction: "proves" }, ctx),
    ).toContain("bad direction: proves");
    const misquote = evidenceDraftErrors(
      {
        ...base,
        sourceStatement:
          'The paper reports "something it never actually said anywhere".',
      },
      ctx,
    );
    expect(misquote.some((e) => e.includes("not found verbatim"))).toBe(true);
  });

  it("budgets promotions with reasons", () => {
    const { selected, deferred } = selectPromotions(
      [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
      3,
    );
    expect(selected).toHaveLength(3);
    expect(deferred[0].reason).toContain("run budget");
  });
});
