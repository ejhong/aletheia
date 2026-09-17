import { describe, expect, it } from "vitest";
import { getCaseBySlug } from "./load.ts";
import type { Evidence } from "./schema.ts";
import { applyReader, duplicateIdErrors, freshEvidenceIds, type VerifyReply } from "../pipeline/verify.ts";

/** A record split by the second reader gets one fresh id per extra part, never its own id again (2026-09-17: a part
 *  split by direction got the part's own id, and the ledger held AMZ-E110 twice — #353). */

describe("freshEvidenceIds", () => {
  const c = getCaseBySlug("megalithic-casting");
  it("hands out distinct ids past everything taken, counting what it handed out and what the caller's list holds now", () => {
    const later: string[] = [];
    const fresh = freshEvidenceIds(c, () => ["GEO-E900", ...later]);
    const a = fresh();
    later.push("GEO-E905"); // the caller admitted more in the meantime
    const b = fresh();
    const d = fresh();
    expect(a).toBe("GEO-E901");
    expect(b).toBe("GEO-E906");
    expect(d).toBe("GEO-E907");
  });
  it("a part split three ways by direction gets three distinct ids, and its own id only once", () => {
    const part = { id: "GEO-E910", title: "Part", claimIds: ["GEO-C001", "GEO-C002", "GEO-C003"], sourceId: "SRC-X", direction: "supports", strength: "weak", sourceStatement: "s", limitations: [], reviewState: "ai_extracted", origin: { ref: "r", extractedBy: "m", runId: "x", date: "2099-01-01" } } as unknown as Evidence;
    const verdict = { quoteInContext: true, locatorSupported: true, statementSupported: true, directionRight: false, relevant: true, atomic: true, independenceNoted: true, reason: "three directions", bearing: [{ claimId: "GEO-C001", direction: "supports" }, { claimId: "GEO-C002", direction: "undermines" }, { claimId: "GEO-C003", direction: "qualifies" }] } as unknown as VerifyReply;
    const applied = applyReader(part, verdict, { model: "m", promptVersion: "verify-v6", runId: "x", date: "2099-01-01" }, freshEvidenceIds(c, () => ["GEO-E900", part.id]));
    const ids = applied!.records.map((r) => r.id);
    expect(ids).toEqual(["GEO-E910", "GEO-E911", "GEO-E912"]);
    expect(new Set(ids).size).toBe(3);
  });
});

describe("duplicateIdErrors", () => {
  it("names every id that occurs more than once, per kind", () => {
    expect(duplicateIdErrors({ sources: [{ id: "SRC-A" }], evidence: [{ id: "X-E001" }, { id: "X-E002" }, { id: "X-E001" }], claims: [{ id: "X-C001" }, { id: "X-C001" }, { id: "X-C001" }] })).toEqual(["duplicate evidence id X-E001", "duplicate claim id X-C001", "duplicate claim id X-C001"]);
    expect(duplicateIdErrors({ sources: [], evidence: [{ id: "X-E001" }], claims: [] })).toEqual([]);
  });
});
