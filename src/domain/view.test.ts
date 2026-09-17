import { describe, expect, it } from "vitest";
import { getCaseBySlug, loadAllCases } from "./load.ts";
import type { Evidence } from "./schema.ts";
import { caseView } from "./view.ts";

/** A claim's evidence count is the number of admitted evidence records citing it; zero marks a claim held on its
 *  anchor alone, which the page shows beside the claim (2026-09-16, after the Immortality Key panel's objections).
 *  A tombstone — a record refused after it entered — does not count, and a provisional record is counted apart. */
describe("caseView evidence counts", () => {
  it("counts, for every live claim of every case, the admitted evidence records that cite it", () => {
    for (const loaded of loadAllCases()) {
      const view = caseView(loaded);
      expect(view.claims.length).toBeGreaterThan(0);
      for (const c of view.claims) {
        expect(c.evidenceCount).toBe(loaded.evidence.filter((e) => e.reviewState !== "rejected" && e.reviewState !== "provisional" && e.claimIds.includes(c.claim.id)).length);
      }
    }
  });
  it("a tombstone does not count, and a provisional record is counted apart", () => {
    const c = getCaseBySlug("megalithic-casting");
    const claim = c.claims.find((k) => k.reviewState !== "rejected")!;
    const base = { ...c.evidence[0], claimIds: [claim.id], origin: { ...c.evidence[0].origin, date: "2099-01-01" } };
    const before = caseView(c).claims.find((v) => v.claim.id === claim.id)!;
    const with3 = { ...c, evidence: [...c.evidence, { ...base, id: "GEO-E901", reviewState: "ai_extracted" } as Evidence, { ...base, id: "GEO-E902", reviewState: "rejected", limitations: [...base.limitations, "Refused at re-verification 2099-01-02: the quote was not found"] } as Evidence, { ...base, id: "GEO-E903", reviewState: "provisional", provisional: { since: "2099-01-01", exists: "doi resolves", reason: "no text", route: "obtain it", by: "r" } } as Evidence] };
    const after = caseView(with3).claims.find((v) => v.claim.id === claim.id)!;
    expect(after.evidenceCount).toBe(before.evidenceCount + 1);
    expect(after.provisionalEvidenceCount).toBe(before.provisionalEvidenceCount + 1);
  });
});
