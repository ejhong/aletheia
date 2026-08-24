import { describe, expect, it } from "vitest";
import {
  applyTextEdits,
  claimRefs,
  foldScalar,
  narrativeGuardFailure,
  plateRefs,
} from "../../scripts/lib/editorial-edits.mjs";

/**
 * These primitives back the editorial audit pass, which lets a scheduled AI
 * run rewrite human-written article prose when new evidence contradicts it.
 * That is the most invasive thing any automation in this project does, so the
 * guards matter more than the feature: every test below is about refusing a
 * bad edit rather than making a good one.
 */

const SPAN = "a".repeat(70);

describe("applyTextEdits", () => {
  it("applies an exact, unique replacement", () => {
    const rejected: string[] = [];
    const text = `before ${SPAN} after`;
    const { out, applied } = applyTextEdits(
      text,
      [{ find: SPAN, replace: "REPLACED" }],
      "t",
      rejected,
    );
    expect(out).toBe("before REPLACED after");
    expect(applied).toHaveLength(1);
    expect(rejected).toEqual([]);
  });

  it("refuses a find span that is not present verbatim", () => {
    const rejected: string[] = [];
    const { out, applied } = applyTextEdits(
      `text with ${SPAN}`,
      [{ find: "b".repeat(70), replace: "x" }],
      "t",
      rejected,
    );
    expect(out).toBe(`text with ${SPAN}`);
    expect(applied).toEqual([]);
    expect(rejected[0]).toMatch(/not present verbatim/);
  });

  it("refuses an ambiguous find span rather than guessing which one", () => {
    const rejected: string[] = [];
    const { applied } = applyTextEdits(
      `${SPAN} middle ${SPAN}`,
      [{ find: SPAN, replace: "x" }],
      "t",
      rejected,
    );
    expect(applied).toEqual([]);
    expect(rejected[0]).toMatch(/ambiguous/);
  });

  it("refuses a short find span, which could match the wrong sentence", () => {
    const rejected: string[] = [];
    const { applied } = applyTextEdits(
      "the cat sat on the mat",
      [{ find: "the cat", replace: "the dog" }],
      "t",
      rejected,
    );
    expect(applied).toEqual([]);
    expect(rejected[0]).toMatch(/too short/);
  });

  it("keeps applying later edits after rejecting an earlier one", () => {
    const rejected: string[] = [];
    const good = "g".repeat(70);
    const { out, applied } = applyTextEdits(
      `${good} tail`,
      [
        { find: "z".repeat(70), replace: "no" },
        { find: good, replace: "yes" },
      ],
      "t",
      rejected,
    );
    expect(out).toBe("yes tail");
    expect(applied).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });
});

describe("annotation invariants", () => {
  const md = [
    "Intro sentence with [an annotated span]{claim=TRN-C001} inside.",
    "",
    "{plate:IMG-TRN-P03}",
    "",
    "Another [second span]{claim=TRN-C020} here.",
  ].join("\n");

  it("finds every claim annotation", () => {
    expect(claimRefs(md)).toEqual(["TRN-C001", "TRN-C020"]);
  });

  it("finds plate references only on their own line", () => {
    expect(plateRefs(md)).toEqual(["IMG-TRN-P03"]);
    expect(plateRefs("inline {plate:IMG-X} reference")).toEqual([]);
  });

  it("detects an edit that would drop an annotation", () => {
    const edited = md.replace("[an annotated span]{claim=TRN-C001}", "a plain span");
    const lost = claimRefs(md).filter((id) => !claimRefs(edited).includes(id));
    expect(lost).toEqual(["TRN-C001"]);
  });
});

describe("narrativeGuardFailure", () => {
  const article = [
    "A sentence with [an annotated span]{claim=CCC-C001} inside.",
    "",
    "{plate:IMG-CCC-P01}",
    "",
    "A catalog claim the article legitimately cites: [detail]{claim=CCC-C503}.",
  ].join("\n");
  const known = new Set(["CCC-C001", "CCC-C503", "CCC-C002"]);

  it("passes an edit that changes only prose", () => {
    const edited = article.replace("A sentence with", "A revised sentence with");
    expect(narrativeGuardFailure(article, edited, known)).toBeNull();
  });

  it("rejects an edit that drops an annotation", () => {
    const edited = article.replace("[an annotated span]{claim=CCC-C001}", "a plain span");
    expect(narrativeGuardFailure(article, edited, known)).toMatch(
      /dropped claim annotations \(CCC-C001\)/,
    );
  });

  it("rejects an edit that invents a claim id", () => {
    const edited = article.replace("inside.", "inside [new]{claim=CCC-C999}.");
    expect(narrativeGuardFailure(article, edited, known)).toMatch(
      /unknown claim ids \(CCC-C999\)/,
    );
  });

  it("rejects an edit that moves or removes a plate", () => {
    const edited = article.replace("{plate:IMG-CCC-P01}\n\n", "");
    expect(narrativeGuardFailure(article, edited, known)).toMatch(/plate placement changed/);
  });

  it("allows adding an annotation for a claim that exists", () => {
    const edited = article.replace("inside.", "inside [more]{claim=CCC-C002}.");
    expect(narrativeGuardFailure(article, edited, known)).toBeNull();
  });

  it("accepts catalog-tier annotations, which are not in the assessment bundle", () => {
    // Regression: scoping known ids to featured claims read CCC's legitimate
    // catalog annotations as unknown and reverted every edit to that case.
    const featuredOnly = new Set(["CCC-C001"]);
    const edited = article.replace("A sentence with", "A revised sentence with");
    expect(narrativeGuardFailure(article, edited, featuredOnly)).toMatch(/CCC-C503/);
    expect(narrativeGuardFailure(article, edited, known)).toBeNull();
  });
});

describe("foldScalar", () => {
  it("wraps to the house width at the given indent", () => {
    const out = foldScalar(
      "one two three four five six seven eight nine ten eleven twelve " +
        "thirteen fourteen fifteen sixteen seventeen eighteen nineteen",
      4,
    );
    for (const line of out.split("\n")) {
      expect(line.startsWith("    ")).toBe(true);
      expect(line.length).toBeLessThanOrEqual(76);
    }
  });

  it("preserves paragraph breaks as blank lines", () => {
    const out = foldScalar("first para\nsecond para", 2);
    expect(out).toBe("  first para\n\n  second para");
  });

  it("round-trips through a YAML folded block unchanged", async () => {
    const { parse } = await import("yaml");
    const text =
      "A sentence long enough to need wrapping across several lines when " +
      "folded at the house width, plus a second clause to be sure.";
    const doc = `summary: >-\n${foldScalar(text, 2)}\n`;
    expect(parse(doc).summary).toBe(text);
  });
});
