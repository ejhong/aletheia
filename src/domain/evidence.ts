import type { Evidence, EvidenceDirection } from "./schema";

/**
 * Canonical presentation order for the evidence ledger. Supporting and
 * undermining lead, in that fixed order and with identical structure —
 * the fairness rule is symmetry of treatment, not alternation — followed
 * by qualifying and context records.
 */
export const directionOrder: readonly EvidenceDirection[] = [
  "supports",
  "undermines",
  "qualifies",
  "context",
];

const strengthRank: Record<Evidence["strength"], number> = {
  decisive: 0,
  strong: 1,
  moderate: 2,
  weak: 3,
};

/**
 * Group a case's evidence for the ledger view: one group per direction
 * that actually has records, in canonical order, strongest records first
 * (ties broken by id so the ordering is stable across builds).
 */
export function groupEvidenceByDirection(
  evidence: Evidence[],
): { direction: EvidenceDirection; records: Evidence[] }[] {
  return directionOrder
    .map((direction) => ({
      direction,
      records: evidence
        .filter((e) => e.direction === direction)
        .sort(
          (a, b) =>
            strengthRank[a.strength] - strengthRank[b.strength] ||
            a.id.localeCompare(b.id),
        ),
    }))
    .filter((g) => g.records.length > 0);
}
