import { describe, expect, it } from "vitest";
import { compoundClause, danglingProseRefs, ledgerIdRefs, narrowLocator, pageOfQuote, scrubUnadmitted } from "./proseRefs.ts";

describe("prose references", () => {
  const c = {
    claims: [{ id: "ORCH-C044", statement: "Spin dynamics modulate polymerization.", origin: { date: "2026-09-11" } }],
    evidence: [{ id: "ORCH-E049", title: "A second null", sourceStatement: "…", editorInference: "Adds to ORCH-C031 and ORCH-E017.", limitations: ["cf. ORCH-C905"], origin: { date: "2026-09-11" } }],
    research: [{ id: "ORCH-R013", title: "Desk audit", summary: "the construction recorded at ORCH-C109 and the search at ORCH-C047", informationGain: "prices ORCH-E019", origin: { date: "2026-09-11" } }],
  };
  it("finds ids with the case prefix and ignores other cases' ids", () => {
    expect(ledgerIdRefs("see ORCH-C001, GEO-C002 and ORCH-R010", "ORCH")).toEqual(["ORCH-C001", "ORCH-R010"]);
    expect(ledgerIdRefs(undefined, "ORCH")).toEqual([]);
  });
  it("lists every prose id that names no record of the case", () => {
    expect(danglingProseRefs(c)).toEqual([
      { record: "ORCH-E049", field: "editorInference", id: "ORCH-C031" },
      { record: "ORCH-E049", field: "editorInference", id: "ORCH-E017" },
      { record: "ORCH-E049", field: "limitations[0]", id: "ORCH-C905" },
      { record: "ORCH-R013", field: "summary", id: "ORCH-C109" },
      { record: "ORCH-R013", field: "summary", id: "ORCH-C047" },
      { record: "ORCH-R013", field: "informationGain", id: "ORCH-E019" },
    ]);
  });
  it("can be scoped by date for tooling, but the loader runs it over every record", () => {
    const old = { ...c, research: [{ ...c.research[0], origin: { date: "2026-08-25" } }] };
    expect(danglingProseRefs(old, "2026-09-12")).toEqual([]);
    expect(danglingProseRefs(old).length).toBe(6);
  });
  it("rewrites ids of proposal records that did not enter as what they were", () => {
    const un = new Map([["ORCH-C514", { kind: "claim", observed: "The deficit of variance in large-radius rings and the clustering of low-variance ring centres into a few regions" }]]);
    expect(scrubUnadmitted("bears on ORCH-C514 and not on ORCH-C010", un)).toBe("bears on a proposed claim not admitted at intake ('The deficit of variance in large-radius rings and the clustering of…') and not on ORCH-C010");
    expect(scrubUnadmitted("nothing to scrub: ORCH-C010", un)).toBe("nothing to scrub: ORCH-C010");
  });
});

describe("compound statements", () => {
  it("names the falsification clause a statement bundles", () => {
    expect(compoundClause("A bounds B to 40 fm; it would be false if the noise were larger than reported.")).toBe("; it would be false if the noise were larger than reported.");
    expect(compoundClause("X modulates Y, and would be false if Y showed no field dependence")).toBe(", and would be false if Y showed no field dependence");
    expect(compoundClause("The model is falsifiable by a null at 10 mT.")).toBe("is falsifiable by a null at 10 mT.");
  });
  it("leaves one proposition alone", () => {
    expect(compoundClause("LISA Pathfinder's acceleration noise bounds the regularization length to at least 40.1 fm.")).toBeNull();
    expect(compoundClause("Penrose and Diósi disagree on how the collapse happens.")).toBeNull();
  });
});

describe("split parts keep their own page", () => {
  const text = "[p. 1] Intro. The rate is E/ħ times an unspecified numeric constant.\n[p. 2] More.\n[p. 4] The apparent parameter-independence may be illusory.";
  it("finds the page of a quote in paged text", () => {
    expect(pageOfQuote(text, "unspecified numeric constant")).toBe(1);
    expect(pageOfQuote(text, "may be illusory")).toBe(4);
    expect(pageOfQuote(text, "not in the text")).toBeNull();
    expect(pageOfQuote("no markers here: unspecified", "unspecified")).toBeNull();
  });
  it("narrows a multi-page locator to one page and keeps the descriptor", () => {
    expect(narrowLocator("[p. 1] (Sec. I) and [p. 4] (Sec. V), arXiv PDF 2111.04604v2", 1)).toBe("[p. 1], arXiv PDF 2111.04604v2");
    expect(narrowLocator("[p. 14] ('Lifetimes of Subradiant and Superradiant States'), arXiv PDF 2602.02868v1", 14)).toBe("[p. 14], arXiv PDF 2602.02868v1");
    expect(narrowLocator("[p. 3]", 3)).toBe("[p. 3]");
  });
});
