import { describe, expect, it } from "vitest";
import { loadAllCases } from "./load.ts";
import { caseView } from "./view.ts";

/** A claim's evidence count is the number of admitted evidence records citing it; zero marks a claim held on its
 *  anchor alone, which the page shows beside the claim (2026-09-16, after the Immortality Key panel's objections). */
describe("caseView evidence counts", () => {
  it("counts, for every live claim of every case, the evidence records that cite it", () => {
    for (const loaded of loadAllCases()) {
      const view = caseView(loaded);
      expect(view.claims.length).toBeGreaterThan(0);
      for (const c of view.claims) {
        expect(c.evidenceCount).toBe(loaded.evidence.filter((e) => e.claimIds.includes(c.claim.id)).length);
      }
    }
  });
});
