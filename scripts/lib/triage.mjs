/**
 * Pure helpers for the literature-watch triage step
 * (scripts/triage-watch.mjs). Kept separate and framework-free so the
 * fail-closed reply validation and the duplicate guard — the two pieces
 * whose failure would matter — are unit-testable (src/domain/triage.test.ts).
 */

export const TRIAGE_DECISIONS = ["import", "shelf", "archive"];

/**
 * Validate a model's triage reply against the item list, fail-closed.
 *
 * The reply must be an array covering every item index exactly once, each
 * entry carrying a known decision and a non-empty reason. Anything else
 * returns errors and NO decisions — a half-valid reply is not partially
 * applied, because a silently skipped item would look identical to a
 * deliberate archive.
 */
export function validateTriageReply(reply, itemCount) {
  const errors = [];
  if (!Array.isArray(reply)) {
    return { decisions: null, errors: ["reply is not a JSON array"] };
  }
  const byIndex = new Map();
  for (const entry of reply) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !Number.isInteger(entry.index)
    ) {
      errors.push(`entry without an integer index: ${JSON.stringify(entry)}`);
      continue;
    }
    if (entry.index < 0 || entry.index >= itemCount) {
      errors.push(`index ${entry.index} out of range (0..${itemCount - 1})`);
      continue;
    }
    if (byIndex.has(entry.index)) {
      errors.push(`index ${entry.index} judged twice`);
      continue;
    }
    if (!TRIAGE_DECISIONS.includes(entry.decision)) {
      errors.push(`index ${entry.index}: unknown decision "${entry.decision}"`);
      continue;
    }
    if (typeof entry.reason !== "string" || entry.reason.trim().length === 0) {
      errors.push(`index ${entry.index}: missing reason`);
      continue;
    }
    byIndex.set(entry.index, {
      index: entry.index,
      decision: entry.decision,
      reason: entry.reason.trim(),
    });
  }
  for (let i = 0; i < itemCount; i++) {
    if (!byIndex.has(i)) errors.push(`item ${i} not judged`);
  }
  if (errors.length > 0) return { decisions: null, errors };
  return {
    decisions: [...byIndex.values()].sort((a, b) => a.index - b.index),
    errors: [],
  };
}

/**
 * Hard rule, applied in code rather than trusted to the prompt: an item the
 * watch labeled as a possible duplicate of an existing source may never be
 * imported by triage — identity must be checked first, and an import of the
 * same work under a second identifier would double-count evidence
 * (AGENTS.md §3.10). Downgrades import → archive with the reason recorded.
 */
export function applyDuplicateGuard(items, decisions) {
  return decisions.map((d) => {
    const item = items[d.index];
    if (d.decision === "import" && item?.possibleDuplicateOf) {
      return {
        ...d,
        decision: "archive",
        reason: `${d.reason} [downgraded from import: watch flagged a possible duplicate — ${item.possibleDuplicateOf}]`,
      };
    }
    return d;
  });
}
