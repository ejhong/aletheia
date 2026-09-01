/**
 * Yield: the attention-allocation metric (docs/AUTOMATION.md, "the
 * scheduler"). One number per case per window — verdict-moving events —
 * derived entirely from records that already exist. Nothing here calls a
 * model; a case's yield is arithmetic over its own files.
 *
 * What counts as a verdict-moving event (each dated, each deduplicated):
 *  - an assessment run whose case verdict differs from its predecessor's,
 *    or whose claim-verdict set changed for any claim (drafts and
 *    reconsiderations; blind check runs are judgment ABOUT the case, not
 *    movement OF it, and are excluded);
 *  - a content-kind history entry (housekeeping excluded by the same rule
 *    the dossier header uses);
 *  - a study reaching collection (its findings date);
 *  - a new featured claim (its origin date).
 *
 * Cadence bands, deliberately coarse (three, not a dial):
 *  - hot:  any event in the last 30 days   → weekly attention
 *  - warm: any event in the last 120 days  → monthly attention
 *  - cool: nothing in 120 days             → quarterly attention
 * Dormancy is measured and reversible, never a status anyone sets by hand.
 */

/** Dates of assessment runs that moved a verdict relative to the prior run. */
export function assessmentMovementDates(runs) {
  const graded = [...(runs ?? [])]
    .filter((r) => (r.role ?? "draft") !== "check")
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const dates = [];
  for (let i = 0; i < graded.length; i++) {
    const run = graded[i];
    const prev = graded[i - 1];
    if (!prev) {
      dates.push(String(run.date)); // the first assessment is movement
      continue;
    }
    const caseMoved =
      run.caseAssessment?.verdict !== prev.caseAssessment?.verdict;
    const prevClaims = new Map(
      (prev.claimAssessments ?? []).map((c) => [c.claimId, c.verdict]),
    );
    const claimMoved = (run.claimAssessments ?? []).some(
      (c) => prevClaims.get(c.claimId) !== c.verdict,
    );
    if (caseMoved || claimMoved) dates.push(String(run.date));
  }
  return dates;
}

/** Every verdict-moving event date for one loaded case, ascending, deduped. */
export function movementDates({ assessmentRuns, history, studies, claims }) {
  const dates = new Set();
  for (const d of assessmentMovementDates(assessmentRuns)) dates.add(d);
  for (const h of history ?? []) {
    if ((h.kind ?? "content") === "content" && h.date) dates.add(String(h.date));
  }
  for (const s of studies ?? []) {
    if ((s.rows?.length ?? 0) > 0 && s.date) dates.add(String(s.date));
  }
  for (const c of claims ?? []) {
    if (c.tier === "featured" && c.origin?.date) dates.add(String(c.origin.date));
  }
  return [...dates].sort();
}

export const CADENCES = /** @type {const} */ ({
  hot: { withinDays: 30, attention: "weekly" },
  warm: { withinDays: 120, attention: "monthly" },
  cool: { withinDays: Infinity, attention: "quarterly" },
});

/** Days between two YYYY-MM-DD dates (b - a). */
export function daysBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

/** Classify one case: events in window, last movement, cadence band. */
export function classifyCase(loadedLike, today) {
  const dates = movementDates(loadedLike);
  const last = dates.at(-1) ?? null;
  const age = last === null ? Infinity : daysBetween(last, today);
  const band = age <= 30 ? "hot" : age <= 120 ? "warm" : "cool";
  return {
    lastMoved: last,
    daysSinceMovement: age === Infinity ? null : age,
    eventsLast120Days:
      dates.filter((d) => daysBetween(d, today) <= 120).length,
    band,
    attention: CADENCES[band].attention,
  };
}

/**
 * Should a monthly/quarterly-band case run in this scheduled invocation?
 * Deterministic, stateless: run when the day-of-year bucket matches, so a
 * weekly cron naturally serves monthly and quarterly cadences with no
 * stored scheduler state.
 */
export function dueThisRun(band, today) {
  if (band === "hot") return true;
  const dayOfYear = Math.floor(
    (Date.parse(today) - Date.parse(`${today.slice(0, 4)}-01-01`)) / 86_400_000,
  );
  const week = Math.floor(dayOfYear / 7);
  if (band === "warm") return week % 4 === 0;
  return week % 13 === 0; // cool: roughly quarterly
}
