import { describe, expect, it } from "vitest";
import {
  canonicalUrl,
  normalizeArxiv,
  normalizeDoi,
  normalizeText,
  sourceKeys,
  textJaccard,
  textKey,
  titleContainment,
} from "./keys.ts";

describe("mechanical keys", () => {
  it("DOIs: bare, prefixed, in a doi.org URL (decoded), and with balanced parentheses", () => {
    expect(normalizeDoi("10.1016/j.jas.2005.09.011")).toBe("10.1016/j.jas.2005.09.011");
    expect(normalizeDoi("Journal 33(4). DOI: 10.1016/J.JAS.2005.09.011.")).toBe("10.1016/j.jas.2005.09.011");
    expect(normalizeDoi("https://doi.org/10.1002/(SICI)1097-4636(19970)12%3A1")).toBe("10.1002/(sici)1097-4636(19970)12:1");
    // A trailing citation parenthesis is stripped; a balanced one inside the DOI is kept.
    expect(normalizeDoi("(see 10.1038/s40494-026-02315-y)")).toBe("10.1038/s40494-026-02315-y");
    expect(normalizeDoi("no identifier here")).toBeNull();
  });

  it("arXiv ids drop the version and survive abs/pdf URLs and the arXiv: prefix", () => {
    expect(normalizeArxiv("https://arxiv.org/abs/2604.27125v2")).toBe("2604.27125");
    expect(normalizeArxiv("arXiv:2604.27125")).toBe("2604.27125");
    expect(normalizeArxiv("https://arxiv.org/pdf/2604.27125.pdf")).toBe("2604.27125");
    expect(normalizeArxiv("2604.27125")).toBe("2604.27125");
    expect(normalizeArxiv("10.1016/j.jas.2005.09.011")).toBeNull();
  });

  it("URLs canonicalise host, tracking parameters, fragment, and trailing slash — and keep path case", () => {
    expect(canonicalUrl("HTTPS://WWW.Example.org/Path/To/?utm_source=chatgpt.com&b=2&a=1#frag")).toBe(
      "example.org/Path/To?a=1&b=2",
    );
    expect(canonicalUrl("http://example.org/x/")).toBe(canonicalUrl("https://example.org/x"));
    expect(canonicalUrl("ftp://example.org/x")).toBeNull();
    expect(canonicalUrl("not a url")).toBeNull();
  });

  it("titles: containment tolerates a journal's retitling; Jaccard would not", () => {
    const preprint = "Machine learning identification of transient candidates in the VASCO catalogue";
    const journal = "Machine learning identification of transient candidates in the VASCO catalogue: a re-analysis with new controls";
    expect(titleContainment(preprint, journal)).toBeGreaterThanOrEqual(0.9);
    expect(textJaccard(preprint, journal)).toBeLessThan(titleContainment(preprint, journal));
    expect(titleContainment("Unrelated words entirely", journal)).toBe(0);
  });

  it("source keys are most specific first and skip short titles", () => {
    expect(
      sourceKeys({
        identifier: "DOI: 10.1016/j.jas.2005.09.011",
        url: "https://www.sciencedirect.com/science/article/pii/S0305440305001800?via%3Dihub",
        title: "Natron as a flux in the early vitreous materials industry",
      }),
    ).toEqual([
      "doi:10.1016/j.jas.2005.09.011",
      "url:sciencedirect.com/science/article/pii/S0305440305001800?via%3Dihub=",
      "title:natron as a flux in the early vitreous materials industry",
    ]);
    expect(sourceKeys({ title: "Short" })).toEqual([]);
  });

  it("text keys normalise a proposition; very short text has no key", () => {
    expect(textKey("The Great Pyramid's casing stones are cast.")).toBe("text:the great pyramid s casing stones are cast");
    expect(textKey("Cast?")).toBeNull();
    expect(normalizeText("  Hello,   World!! ")).toBe("hello world");
  });
});
