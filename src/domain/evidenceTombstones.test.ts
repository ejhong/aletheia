import { describe, expect, it } from "vitest";
import { evidenceTombstones, getCaseBySlug, liveEvidence } from "./load.ts";
import type { Evidence } from "./schema.ts";

/** Every evidence record is either live or a tombstone, and the ledger page renders both — so an id the history
 *  names always has its anchor (2026-09-17: the first tombstones left the case page linking into nothing). */
describe("evidenceTombstones", () => {
  it("partitions the case's evidence with liveEvidence, refused records on its side", () => {
    const c = getCaseBySlug("megalithic-casting");
    const base = c.evidence[0];
    const withTombstone = { ...c, evidence: [...c.evidence, { ...base, id: "GEO-E902", reviewState: "rejected", limitations: [...base.limitations, "Refused at re-verification 2099-01-02 (run x): the quote was not found"] } as Evidence] };
    const live = liveEvidence(withTombstone), gone = evidenceTombstones(withTombstone);
    expect(gone.map((e) => e.id)).toEqual(["GEO-E902"]);
    expect(live.some((e) => e.id === "GEO-E902")).toBe(false);
    expect(live.length + gone.length).toBe(withTombstone.evidence.length);
    expect(new Set([...live, ...gone].map((e) => e.id)).size).toBe(withTombstone.evidence.length);
  });
});
