import { describe, expect, it } from "vitest";
import { groupEvidenceByDirection } from "./evidence";
import { loadAllCases } from "./load";
import type { Evidence } from "./schema";

const ev = (
  id: string,
  direction: Evidence["direction"],
  strength: Evidence["strength"],
) =>
  ({
    id,
    title: id,
    claimIds: ["X-C001"],
    sourceId: "SRC-X",
    direction,
    strength,
    sourceStatement: "s",
    limitations: [],
    reviewState: "ai_extracted",
    origin: { ref: "t", extractedBy: "t", runId: "t", date: "2026-01-01" },
  }) as Evidence;

describe("evidence ledger grouping", () => {
  it("groups in canonical direction order, dropping empty directions", () => {
    const groups = groupEvidenceByDirection([
      ev("X-E001", "context", "weak"),
      ev("X-E002", "supports", "strong"),
      ev("X-E003", "undermines", "moderate"),
    ]);
    expect(groups.map((g) => g.direction)).toEqual([
      "supports",
      "undermines",
      "context",
    ]);
  });

  it("orders records strongest-first with stable id tie-breaks", () => {
    const groups = groupEvidenceByDirection([
      ev("X-E003", "supports", "weak"),
      ev("X-E002", "supports", "decisive"),
      ev("X-E004", "supports", "strong"),
      ev("X-E001", "supports", "strong"),
    ]);
    expect(groups[0].records.map((r) => r.id)).toEqual([
      "X-E002",
      "X-E001",
      "X-E004",
      "X-E003",
    ]);
  });

  it("accounts for every record of every live case exactly once", () => {
    for (const c of loadAllCases()) {
      const grouped = groupEvidenceByDirection(c.evidence);
      const ids = grouped.flatMap((g) => g.records.map((r) => r.id));
      expect(ids.length).toBe(c.evidence.length);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
