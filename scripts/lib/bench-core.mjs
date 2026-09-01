/**
 * Bench v2 core (docs/AUTOMATION.md, "The Bench"): the pure logic of
 * panel-scored proposal advancement, kept model-free and unit-tested.
 *
 * The thresholds principle (founder-confirmed 2026-09-01): a proposal
 * advances when four of five seats score it high-gain AND no seat raises
 * a constitutional concern — deliberately not unanimity (a lone lukewarm
 * seat must not starve exploration), while a single substantiated
 * objection keeps its stopping power here as everywhere. The advanced
 * proposal's freeze PR still faces the full arbiter, so the real veto
 * stays at publication.
 */

export const SCORES = ["high", "medium", "low"];
export const REQUIRED_HIGHS = 4;
/** Site-wide cap on auto-drafted freezes per maintenance run. */
export const MAX_FREEZES_PER_RUN = 2;
/** A case may carry at most this many frozen-but-uncollected studies. */
export const MAX_ACTIVE_STUDIES_PER_CASE = 2;

/**
 * Fail-closed parse of one seat's scoring reply. Expected JSON:
 *   { scores: [ { id, score: high|medium|low,
 *                 constitutionalConcern: string|null, reasoning } ] }
 * Returns a Map of proposal id -> {score, concern, reasoning}; malformed
 * entries are skipped (a seat that garbles one row still scores the
 * rest); a reply with no valid rows returns an empty Map — the caller
 * treats that seat as failed, never as neutral.
 */
export function parseSeatScores(parsed) {
  const out = new Map();
  const list = Array.isArray(parsed?.scores) ? parsed.scores : [];
  for (const row of list) {
    if (typeof row?.id !== "string") continue;
    if (!SCORES.includes(row?.score)) continue;
    const concern =
      typeof row.constitutionalConcern === "string" &&
      row.constitutionalConcern.trim().length > 0
        ? row.constitutionalConcern.trim()
        : null;
    out.set(row.id, {
      score: row.score,
      concern,
      reasoning: typeof row.reasoning === "string" ? row.reasoning : "",
    });
  }
  return out;
}

/**
 * Aggregate all seats for one proposal id. Failed seats (no entry) stay
 * out of the numerator and the concern check but are reported, so the
 * digest can say "4/4 seats returned, 2 failed" honestly.
 */
export function tallyProposal(id, seatMaps) {
  const seats = [];
  let highs = 0;
  const concerns = [];
  for (const [seat, map] of seatMaps) {
    const row = map.get(id);
    if (!row) {
      seats.push({ seat, score: null, concern: null });
      continue;
    }
    seats.push({ seat, score: row.score, concern: row.concern });
    if (row.score === "high") highs++;
    if (row.concern) concerns.push({ seat, concern: row.concern });
  }
  return { id, highs, concerns, seats };
}

/**
 * The advancement rule. `returned` counts seats that scored this
 * proposal at all; advancing on a thin panel is forbidden — at least
 * four seats must have returned, four highs among them, zero concerns
 * from anyone.
 */
export function advances(tally) {
  const returned = tally.seats.filter((s) => s.score !== null).length;
  return (
    returned >= REQUIRED_HIGHS &&
    tally.highs >= REQUIRED_HIGHS &&
    tally.concerns.length === 0
  );
}

/**
 * Budget filter over advancing STUDY proposals. `activeByCase` maps case
 * slug -> count of frozen-but-uncollected studies already open there.
 * Selection order is the caller's ranking (highest tally first is
 * conventional); deferred proposals are returned with the reason so the
 * report can say why they wait.
 */
export function applyBudgets(advancing, activeByCase, limits = {}) {
  const maxRun = limits.maxFreezesPerRun ?? MAX_FREEZES_PER_RUN;
  const maxActive = limits.maxActivePerCase ?? MAX_ACTIVE_STUDIES_PER_CASE;
  const selected = [];
  const deferred = [];
  const activeNow = new Map(Object.entries(activeByCase));
  for (const p of advancing) {
    if (selected.length >= maxRun) {
      deferred.push({ ...p, reason: `run budget (${maxRun}) spent` });
      continue;
    }
    const active = activeNow.get(p.caseSlug) ?? 0;
    if (active >= maxActive) {
      deferred.push({
        ...p,
        reason: `case already carries ${active} uncollected studies`,
      });
      continue;
    }
    activeNow.set(p.caseSlug, active + 1);
    selected.push(p);
  }
  return { selected, deferred };
}
