import { describe, expect, it } from "vitest";
import { closeClaimSpans, extractClaimRefs, extractPlateRefs, markerErrors, parseArticle, plainArticle } from "./article.ts";
import { loadAllCases } from "./load.ts";

/**
 * An article's markers are the route from a sentence to its claim and the
 * seat of its plates. A marker the parser will not read is printed on the
 * page as text and the route is gone, so the tests are about the ways a
 * marker goes wrong without anything refusing it.
 */
describe("an article's markers", () => {
  const good = "## Egypt\n\n{plate:IMG-X-P01}\n\nThe claim is modest: [some blocks were cast]{claim=X-C020}. Its proponents mean the casing.\n\n[The salt is real]{claim=X-C003}, and explains nothing.";

  it("a well-formed article has no faults, and reads as the page shows it", () => {
    expect(markerErrors(good)).toEqual([]);
    expect(extractClaimRefs(good)).toEqual(["X-C020", "X-C003"]);
    expect(extractPlateRefs(good)).toEqual(["IMG-X-P01"]);
    expect(plainArticle(good)).toBe("## Egypt\n\n[a plate: a photograph or figure, with its caption]\n\nThe claim is modest: some blocks were cast. Its proponents mean the casing.\n\nThe salt is real, and explains nothing.");
  });

  it("a claim span closed with the wrong bracket is a fault, and never swallows the text after it", () => {
    // The drafter's slip of 2026-09-30: "]" for "}". Read loosely, the span ran to the next closing brace and took a section with it.
    const slipped = good.replace("{claim=X-C020}", "{claim=X-C020]");
    const faults = markerErrors(slipped);
    expect(faults).toHaveLength(1);
    expect(faults[0]).toContain("[some blocks were cast]{claim=X-C020]");
    // What a reader is shown keeps every word between the broken marker and the next good one.
    expect(plainArticle(slipped)).toContain("Its proponents mean the casing.");
    expect(plainArticle(slipped)).toContain("The salt is real, and explains nothing.");
    // The broken span is no longer a route to its claim, which is why it must be refused rather than shown.
    expect(extractClaimRefs(slipped)).toEqual(["X-C003"]);
  });

  it("the one-character slip can be closed, and nothing else is guessed at", () => {
    const slipped = good.replace("{claim=X-C020}", "{claim=X-C020]").replace("{claim=X-C003}", "{claim=X-C003]");
    const fixed = closeClaimSpans(slipped);
    expect(fixed.markdown).toBe(good);
    expect(fixed.closed).toEqual(["X-C020", "X-C003"]);
    // A well-formed article is returned as it came.
    expect(closeClaimSpans(good)).toEqual({ markdown: good, closed: [] });
    // Anything that is not the whole span less its last character is left for the drafter: a malformed id, a span
    // with no opening bracket, a bare marker, a bracket after a good span.
    for (const other of ["A [claim]{claim=X-C20] here.", "A claim]{claim=X-C020] here.", "A bare {claim=X-C020] here.", "A [claim]{claim=X-C020}] here.", "A [claim]{claim=x-c020] here."]) {
      expect(closeClaimSpans(other), other).toEqual({ markdown: other, closed: [] });
    }
    // Words with a bracket of their own before the span do not confuse it.
    expect(closeClaimSpans("See [a] note, and [the salt is real]{claim=X-C003].").markdown).toBe("See [a] note, and [the salt is real]{claim=X-C003}.");
  });

  it("names a malformed id, a marker with no span, and a plate set inside a line", () => {
    expect(markerErrors("A [claim]{claim=X-C20} here.")).toHaveLength(1);
    expect(markerErrors("A bare {claim=X-C020} here.")).toHaveLength(1);
    expect(markerErrors("Text before {plate:IMG-X-P01} and after.")).toHaveLength(1);
    expect(markerErrors("A span with no marker [like this] is prose, and a link [here](https://example.org) is a link.")).toEqual([]);
  });

  it("a plate marker that opens a paragraph seats the plate before it", () => {
    const lead = "First paragraph.\n\n{plate:IMG-X-P01} Nothing about the session is scored.\n\nLast.";
    expect(markerErrors(lead)).toEqual([]);
    expect(extractPlateRefs(lead)).toEqual(["IMG-X-P01"]);
    expect(parseArticle(lead).map((b) => b.kind)).toEqual(["paragraph", "plate", "paragraph", "paragraph"]);
    const second = parseArticle(lead)[2];
    expect(second.kind === "paragraph" && second.inlines[0]).toEqual({ kind: "text", text: "Nothing about the session is scored." });
    // A plate alone in its block is what it always was.
    expect(parseArticle(good).map((b) => b.kind)).toEqual(["heading", "plate", "paragraph", "paragraph"]);
  });

  it("holds on the real ledger: no edition carries a marker the page would print as text, and every plate written is seated", () => {
    for (const c of loadAllCases()) {
      for (const e of c.editions) {
        expect(markerErrors(e.article), `${c.record.slug} ${e.runId}`).toEqual([]);
        // Every "{plate:" in the text is a plate the parser seats.
        expect((e.article.match(/\{plate:/g) ?? []).length, `${c.record.slug} ${e.runId}`).toBe(parseArticle(e.article).filter((b) => b.kind === "plate").length);
      }
    }
  });
});
