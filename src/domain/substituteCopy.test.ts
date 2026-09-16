import { describe, expect, it } from "vitest";
import { substituteCopy } from "../pipeline/verify.ts";

/** A quote not found in a stand-in copy of a source is unverified, not false: the record is blocked with a route
 *  to the cited text instead of failed (2026-09-16, the Łucejko 2018 quotes checked against an OpenAlex copy).
 *  Only the fetch layer's typed flag says a text is a stand-in; a description alone never does (review notes
 *  #315, #318). */
describe("substituteCopy", () => {
  it("is true only when the fetch layer flagged the text as a stand-in for the cited document", () => {
    expect(substituteCopy({ substitute: true, via: "open-access copy via OpenAlex: http://hdl.handle.net/11573/1116547" })).toBe(true);
    expect(substituteCopy({ substitute: true, via: "arXiv full text (PDF) at https://arxiv.org/pdf/2101.00001, read for the abstract page" })).toBe(true);
  });
  it("is false for the cited document itself, whatever note its retrieval carries, and for a supplied document", () => {
    expect(substituteCopy({ via: "open-access copy via OpenAlex: http://x.test" })).toBe(false); // the description alone decides nothing
    expect(substituteCopy({ via: "Wayback snapshot 20251119142339 (save requested; older snapshot returned)" })).toBe(false);
    expect(substituteCopy({ via: "supplied document essay.pdf (sha256 0123456789ab), identified as SRC-X" })).toBe(false);
    expect(substituteCopy({})).toBe(false);
    expect(substituteCopy(undefined)).toBe(false);
  });
});
