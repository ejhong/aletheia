import { createHash } from "node:crypto";
import { seatKey } from "./seat-key.mjs";

export const REVIEW_MIN_PANEL = 4;

/** Hash values deterministically, independent of YAML/JSON object key order.
 * @param {unknown} value
 * @returns {string}
 */
export function fingerprint(value) {
  const canonical = (/** @type {unknown} */ v) => {
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v)
          .filter(([, x]) => x !== undefined)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, x]) => [k, canonical(x)]),
      );
    }
    return v;
  };
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

/** @typedef {import('../../src/domain/schema').AssessmentRun} Run */

/** Full timestamps decide new runs; a natural run-id comparison breaks legacy ties.
 * @param {Pick<Run, 'date' | 'runId' | 'generatedAt'>} a
 * @param {Pick<Run, 'date' | 'runId' | 'generatedAt'>} b
 */
export function compareRuns(a, b) {
  return (
    (a.generatedAt ?? a.date).localeCompare(b.generatedAt ?? b.date) ||
    a.runId.localeCompare(b.runId, "en", { numeric: true })
  );
}

/** @param {Run[]} runs */
export function latestDraft(runs) {
  return (
    runs
      .filter((r) => r.role !== "check")
      .sort(compareRuns)
      .at(-1) ?? null
  );
}

/** New drafts rest on exact evidence packets. Legacy runs use their existing
 * timestamp until their next actual reassessment supplies an input receipt.
 * @param {Run | null} run
 * @param {string} inputHash
 * @param {string | null} lastContentAt
 */
export function draftIsCurrent(run, inputHash, lastContentAt) {
  if (!run) return false;
  if (run.inputHash) return run.inputHash === inputHash;
  return Boolean(
    lastContentAt &&
      Date.parse(run.generatedAt ?? run.date) >= Date.parse(lastContentAt),
  );
}

/** @param {Run[]} runs */
export function latestChecks(runs) {
  const seats = new Map();
  for (const run of runs) {
    if (run.role !== "check") continue;
    const key = seatKey(run.model);
    const previous = seats.get(key);
    if (!previous || compareRuns(run, previous) > 0) seats.set(key, run);
  }
  return /** @type {Run[]} */ ([...seats.values()].sort(compareRuns));
}

/** Normalize only schema defaults, so a raw YAML run and its validated form match.
 * @param {Run} draft
 */
export function assessmentHash(draft) {
  return fingerprint({
    runId: draft.runId,
    model: draft.model,
    date: draft.date,
    generatedAt: draft.generatedAt,
    inputHash: draft.inputHash,
    promptVersion: draft.promptVersion,
    humanReviewed: draft.humanReviewed,
    role: draft.role ?? "draft",
    caseAssessment: draft.caseAssessment,
    claimAssessments: draft.claimAssessments,
    reconciles: draft.reconciles ?? [],
  });
}

/** Only checks of these exact inputs and this exact draft can raise standing.
 * Historical checks remain visible, but are never backfilled with invented receipts.
 * @param {Run[]} runs
 * @param {Run} draft
 * @param {string} contentHash
 * @param {string} packetHash
 */
export function currentChecks(runs, draft, contentHash, packetHash) {
  const target = assessmentHash(draft);
  return latestChecks(runs).filter(
    (r) =>
      r.review?.protocol === "case-snapshot-v1" &&
      r.review.contentHash === contentHash &&
      r.review.packetHash === packetHash &&
      r.review.assessmentHash === target &&
      !draft.reconciles?.includes(r.runId),
  );
}

/** @param {Run} draft @param {Run[]} checks */
export function missingReviewCoverage(draft, checks) {
  return draft.caseAssessment.loadBearing.filter(
    (id) =>
      !draft.claimAssessments.some((a) => a.claimId === id) ||
      checks.some((r) => !r.claimAssessments.some((a) => a.claimId === id)),
  );
}
