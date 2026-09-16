import { describe, expect, it } from "vitest";
import { substituteCopy } from "../pipeline/verify.ts";

/** A quote not found in a substitute copy of a source is unverified, not false: the record is blocked with a route
 *  to the cited text instead of failed (2026-09-16, the Łucejko 2018 quotes checked against an OpenAlex copy). */
describe("substituteCopy", () => {
  it("is an open-access copy or a PDF read in place of the cited page, and not the document itself nor a supplied one", () => {
    expect(substituteCopy("open-access copy via OpenAlex: http://hdl.handle.net/11573/1116547")).toBe(true);
    expect(substituteCopy("arXiv full text (PDF) at https://arxiv.org/pdf/2101.00001, read for the abstract page")).toBe(true);
    expect(substituteCopy("supplied document essay.pdf (sha256 0123456789ab), identified as SRC-X")).toBe(false);
    expect(substituteCopy(undefined)).toBe(false);
    expect(substituteCopy(null)).toBe(false);
    expect(substituteCopy("")).toBe(false);
  });
});
