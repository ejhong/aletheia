import { describe, expect, it } from "vitest";
import {
  hasTerm,
  matchesKeywords,
  nearDuplicateOf,
  titleOverlap,
} from "../../scripts/lib/watch-matching.mjs";

/**
 * The fixtures below are real items the 2026-08-24 watch run surfaced, junk
 * and signal alike. The filters exist to drop the first without touching the
 * second, so the run itself is the regression suite.
 */

const item = (title: string, abstractSnippet = "") => ({ title, abstractSnippet });

describe("hasTerm", () => {
  it("matches a stem at a word boundary, so archaeolog finds archaeological", () => {
    expect(hasTerm("An archaeological survey", "archaeolog")).toBe(true);
    expect(hasTerm("Anesthetic implications", "anesthe")).toBe(true);
  });

  it("does not match inside a word", () => {
    expect(hasTerm("physics of epsilon", "psi")).toBe(false);
    expect(hasTerm("the psi hypothesis", "psi")).toBe(true);
  });

  it("treats regex metacharacters in a keyword literally", () => {
    expect(hasTerm("dated to 12,800 years", "12,800")).toBe(true);
    expect(hasTerm("micro-PK studies", "micro-PK")).toBe(true);
  });
});

describe("matchesKeywords — flat OR list", () => {
  const query = { keywords: ["nanodiamond", "spherule", "lonsdaleite"] };

  it("keeps an item matching any single term", () => {
    expect(matchesKeywords(item("Nanodiamond contact lenses"), query)).toBe(true);
  });

  it("is only as narrow as its broadest term — which is the problem", () => {
    expect(matchesKeywords(item("Younger Dryas spherules"), query)).toBe(true);
  });
});

describe("matchesKeywords — ANDed concept groups", () => {
  it("drops the nanodiamond contact-lens paper that a flat OR admitted", () => {
    const query = {
      keywordGroups: [
        ["nanodiamond", "spherule", "lonsdaleite"],
        ["Younger Dryas", "YDB", "Pleistocene"],
      ],
    };
    expect(
      matchesKeywords(
        item("Fluorescent nanodiamond and gold nanoparticle hybrid-embedded contact lenses"),
        query,
      ),
    ).toBe(false);
    expect(
      matchesKeywords(
        item("Nanodiamond abundance at the Younger Dryas boundary"),
        query,
      ),
    ).toBe(true);
  });

  it("drops the clinical nerve-block papers surfaced under Orch OR", () => {
    const query = {
      keywordGroups: [
        ["anesthe", "anaesthe"],
        ["microtubule", "tubulin", "epothilone", "cytoskelet"],
      ],
    };
    for (const junk of [
      "Popliteal Sciatic Block as a Safe Anesthetic Alternative for High-risk Below-knee Surgeries",
      "Managing What You Cannot Measure: Anesthetic Implications of Takayasu's Arteritis",
      "Enhanced Pain Management With Combined EMLA Patch and Local Anesthetic",
    ]) {
      expect(matchesKeywords(item(junk), query)).toBe(false);
    }
    expect(
      matchesKeywords(
        item("Anesthetic binding to tubulin dimers alters microtubule dynamics"),
        query,
      ),
    ).toBe(true);
  });

  it("drops the ancient-Rome novel review surfaced under geopolymer", () => {
    const query = {
      keywordGroups: [
        ["geopolymer", "alkali-activat", "binder"],
        ["ancient", "archaeolog", "pyramid", "megalith"],
      ],
    };
    expect(
      matchesKeywords(
        item("Robert Harris returns to ancient Rome with Agrippa – a novel about an empire's forgotten architect"),
        query,
      ),
    ).toBe(false);
    expect(
      matchesKeywords(
        item("Geopolymer binders in ancient Egyptian limestone construction"),
        query,
      ),
    ).toBe(true);
  });

  it("matches on the abstract, not only the title", () => {
    const query = { keywordGroups: [["conformal", "cyclic"], ["cosmolog", "CMB"]] };
    expect(
      matchesKeywords(
        item("A note on cyclic models", "We revisit conformal rescaling in cosmology."),
        query,
      ),
    ).toBe(true);
  });

  it("keeps everything when no filter is declared", () => {
    expect(matchesKeywords(item("Anything at all"), {})).toBe(true);
  });
});

describe("near-duplicate detection", () => {
  // The same work, arXiv preprint vs Scientific Reports — different titles,
  // different identifiers, which is how exact-key dedup missed it.
  const arxivTitle =
    "Machine Learning Supports Existence of Previously Unrecognized Transient Astronomical Phenomena in Historical Observatory Images";
  const journalTitle =
    "Use of machine learning to enhance detection of transient astronomical phenomena in historical observatory images";

  it("scores a retitled preprint above the threshold", () => {
    expect(titleOverlap(arxivTitle, journalTitle)).toBeGreaterThanOrEqual(0.7);
  });

  it("scores unrelated papers in the same field well below it", () => {
    expect(
      titleOverlap(
        arxivTitle,
        "Statistically Significant Linear Alignments Among High-Confidence Transient Candidates on POSS-I Photographic Plates",
      ),
    ).toBeLessThan(0.7);
  });

  it("labels the matching source instead of dropping the item", () => {
    const sources = [
      { id: "SRC-BRUEHL-2026-ML", title: journalTitle },
      { id: "SRC-CANN-2026", title: "Geomagnetic storm suppression of plate transient detections" },
    ];
    const dup = nearDuplicateOf({ title: arxivTitle }, sources);
    expect(dup?.id).toBe("SRC-BRUEHL-2026-ML");
  });

  it("returns null when nothing is close, so new work is never suppressed", () => {
    const sources = [{ id: "SRC-X", title: "An entirely unrelated paper about cement chemistry" }];
    expect(nearDuplicateOf({ title: arxivTitle }, sources)).toBeNull();
  });
});
