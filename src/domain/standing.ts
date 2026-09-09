/** Standing: ratification derived from the blind checks (concurrence within one step, load-bearing splits, staleness), the objections that survive it, and the cross-model summary. */
import { seatKey } from "../lib/seat-key.mjs";
import { assessmentLabels, type AssessmentRun, type AssessmentState, type LoadedCase } from "./schema.ts";
import { adoptedAssessment } from "./editions.ts";
import { isHousekeepingEntry } from "./history.ts";

/**
 * Ratification-by-concurrence (AGENTS.md §3.15, Stage 3 of the AI-operated
 * pivot). The displayed assessment is the one the current edition adopts; what varies
 * is its standing, DERIVED at build time from the independent check runs
 * rather than stored — so a re-check updates the standing with no record
 * mutated, and a new draft or new evidence automatically demotes the case
 * to unratified until the panel judges the current file. Failing safe here
 * means failing DOWN: nothing in this function can raise a run's standing
 * except fresh agreement from independent vendors.
 *
 * - `ratified`: a panel of at least RATIFICATION_MIN_PANEL independent
 *   models, judging the current content blind, agrees with the draft's
 *   case verdict with at most one dissenter, and no load-bearing claim is
 *   contested.
 * - `contested`: the panel is sufficient and current, but disagrees — on
 *   the case verdict or on a load-bearing claim. Displayed as such;
 *   disagreement is never resolved by hiding it.
 * - `unratified`: the panel is too small, absent, or judged an older
 *   version of the case file (staleSince) — or the displayed draft is a
 *   reconsideration (written non-blind, with the panel's dissents in
 *   hand) that no fresh blind check has judged yet: the checks a
 *   reconciliation engaged can never ratify the draft that answered them.
 *
 * A load-bearing claim is contested when fewer than a strict majority of
 * the models judging it land within one step of the draft's verdict on the
 * graded scale (open verdicts must match exactly — "unresolved" is not
 * adjacent to anything).
 */
export const RATIFICATION_MIN_PANEL = 4;

export type RatificationStatus = "ratified" | "contested" | "unratified";

export interface Ratification {
  status: RatificationStatus;
  /** Independent models whose current judgment was counted. */
  panel: number;
  /** How many of them place the case verdict within one step of the draft's (AGENTS.md §3.15). */
  agreeing: number;
  /** Load-bearing claims where the panel disagrees with the draft. */
  contestedLoadBearing: string[];
  /** Date of the newest counted check run, null when the panel is empty. */
  checksDate: string | null;
  /** Content moved after the newest check (mirrors CrossModelSummary). */
  staleSince: string | null;
  /** One plain sentence for the UI. */
  reason: string;
}

/**
 * A reconsideration draft is the one deliberately non-blind draft in the
 * pipeline (the `edition` verb's reconsideration, formerly scripts/reconcile-contested.mjs): written with the panel's
 * dissents in hand. Detected by the `reconciles` stamp; the promptVersion
 * fallback covers overlays written before the stamp existed.
 */
export function isReconsiderationRun(run: AssessmentRun): boolean {
  return (
    run.role !== "check" &&
    (run.reconciles !== undefined || /reconsider/i.test(run.promptVersion))
  );
}

/**
 * The checks that can vouch for a reconsideration draft: only runs the
 * reconciliation never saw. Stamped drafts name the engaged runIds
 * exactly; for pre-stamp overlays, only a check dated strictly after the
 * draft is provably fresh (a same-day check may have been in hand).
 */
function freshChecksFor(
  draft: AssessmentRun,
  checks: AssessmentRun[],
): AssessmentRun[] {
  return checks.filter((r) =>
    draft.reconciles !== undefined
      ? !draft.reconciles.includes(r.runId)
      : r.date > draft.date,
  );
}

/**
 * Has the ledger moved since this run judged it? Staleness is a hash, not a
 * date (docs/AUTOMATION.md): a run that recorded the ledger hash it judged
 * is stale exactly when the current ledger hashes differently. Runs from
 * before the field existed fall back to the date rule — content-bearing
 * history newer than the run. Returns a short reason, or null when current.
 */
export function runStaleness(loaded: LoadedCase, run: AssessmentRun): string | null {
  if (run.basis) {
    return run.basis.ledgerHash === loaded.ledgerHash ? null : "the ledger changed";
  }
  const newestContent = loaded.history
    .filter((h) => !isHousekeepingEntry(h))
    .map((h) => h.date)
    .sort()
    .at(-1);
  return newestContent && newestContent > run.date ? newestContent : null;
}

/**
 * The staleness of a panel. Checks that recorded a ledger hash are judged
 * one by one (any mismatch is stale). Checks from before the field existed
 * are judged as a panel by date, as they always were: stale when
 * content-bearing history is newer than the newest of them — a panel that
 * re-judged after the change is current even if one older seat was not.
 */
function panelStaleness(loaded: LoadedCase, checks: AssessmentRun[]): string | null {
  const hashed = checks.filter((r) => r.basis);
  if (hashed.some((r) => r.basis!.ledgerHash !== loaded.ledgerHash)) {
    return "the ledger changed";
  }
  const legacy = checks.filter((r) => !r.basis);
  if (legacy.length === 0) return null;
  const newestCheck = legacy.map((r) => r.date).sort().at(-1)!;
  const newestContent = loaded.history
    .filter((h) => !isHousekeepingEntry(h))
    .map((h) => h.date)
    .sort()
    .at(-1);
  return newestContent && newestContent > newestCheck ? newestContent : null;
}

/**
 * The checks that still speak to the case as it stands: hashed checks whose
 * ledger hash is current, and legacy checks unless content-bearing history
 * is newer than the newest of them. A stale seat is set aside, not counted —
 * and does not veto the seats that re-judged (2026-09-08: one August check
 * with no hash held four fresh seats at "unratified").
 */
export function currentChecks(loaded: LoadedCase, checks: AssessmentRun[]): AssessmentRun[] {
  const legacyStale = panelStaleness(loaded, checks.filter((r) => !r.basis));
  return checks.filter((r) => (r.basis ? r.basis.ledgerHash === loaded.ledgerHash : !legacyStale));
}

export function ratification(loaded: LoadedCase): Ratification | null {
  const draft = adoptedAssessment(loaded);
  if (!draft) return null;
  const all = latestCheckPerModel(loaded);
  const checks = currentChecks(loaded, all);
  const setAside = all.length - checks.length;
  const panel = checks.length;
  const checksDate =
    panel > 0 ? checks.map((r) => r.date).sort().at(-1)! : null;
  const staleSince = setAside > 0 ? panelStaleness(loaded, all) : null;
  const agreeing = checks.filter((r) =>
    withinOneStep(r.caseAssessment.verdict, draft.caseAssessment.verdict),
  ).length;

  const base = {
    panel,
    agreeing,
    checksDate,
    staleSince,
    contestedLoadBearing: [] as string[],
  };

  if (panel < RATIFICATION_MIN_PANEL) {
    const aside =
      setAside === 0
        ? ""
        : staleSince === "the ledger changed"
          ? ` — ${setAside} earlier check${setAside === 1 ? "" : "s"} set aside because the ledger changed after ${setAside === 1 ? "it" : "they"} judged it`
          : ` — ${setAside} earlier check${setAside === 1 ? "" : "s"} set aside because the case file changed (${staleSince}) after ${setAside === 1 ? "it" : "they"} judged it`;
    return {
      ...base,
      status: "unratified",
      reason:
        panel === 0
          ? `no independent model has checked this case as it stands${aside}`
          : `only ${panel} independent model${panel === 1 ? "" : "s"} have checked this case as it stands (${RATIFICATION_MIN_PANEL} required)${aside}`,
    };
  }

  // A reconsideration draft was written WITH the panel's dissents in hand
  // (the one non-blind draft in the pipeline). Deriving its standing from
  // the checks it already answered would let a contested case clear by
  // converging on the judges instead of the evidence — so those checks
  // cannot ratify it. Standing stays down until at least one blind check
  // the reconciliation never saw judges the case.
  if (isReconsiderationRun(draft) && freshChecksFor(draft, checks).length === 0) {
    return {
      ...base,
      status: "unratified",
      reason:
        "the displayed draft is a reconsideration written with the panel's dissents in hand — standing resets until a fresh blind check judges it",
    };
  }

  // Load-bearing claims: majority of judging models within one step.
  const contestedLB: string[] = [];
  for (const claimId of draft.caseAssessment.loadBearing) {
    const own = draft.claimAssessments.find(
      (ca) => ca.claimId === claimId,
    )?.verdict;
    if (!own) continue;
    const verdicts = checks
      .map((r) => r.claimAssessments.find((ca) => ca.claimId === claimId))
      .filter((ca) => ca !== undefined)
      .map((ca) => ca.verdict);
    if (verdicts.length === 0) continue;
    const near = verdicts.filter((v) => withinOneStep(v, own)).length;
    if (near * 2 <= verdicts.length) contestedLB.push(claimId);
  }

  if (agreeing < panel - 1 || contestedLB.length > 0) {
    const parts: string[] = [];
    if (agreeing < panel - 1)
      parts.push(
        `${panel - agreeing} of ${panel} models place the case verdict more than one step away`,
      );
    if (contestedLB.length > 0)
      parts.push(`the panel splits on load-bearing ${contestedLB.join(", ")}`);
    return {
      ...base,
      contestedLoadBearing: contestedLB,
      status: "contested",
      reason: parts.join("; "),
    };
  }

  return {
    ...base,
    status: "ratified",
    reason: `${agreeing} of ${panel} independent models concur with the case verdict within one step, and none splits on a load-bearing claim`,
  };
}

/**
 * Does this case need a fresh blind panel? True when no independent model
 * has checked it, when content moved after the newest check, or when the
 * adopted assessment is a reconsideration no fresh blind check has judged.
 * The single source of the rule the content-response workflow re-panels on
 * (formerly scripts/stale-checks.ts, retired 2026-09-09; `next` reads `checksStale`) — the same derivation `ratification` uses.
 */
export function checksStale(loaded: LoadedCase): boolean {
  const draft = adoptedAssessment(loaded);
  if (!draft) return false;
  const checks = latestCheckPerModel(loaded);
  if (checks.length === 0) return true;
  if (panelStaleness(loaded, checks)) return true;
  return isReconsiderationRun(draft) && freshChecksFor(draft, checks).length === 0;
}

/**
 * A ratified case's tolerated dissents — "conclusions ship with their
 * surviving objections attached, not sanitized away." For each current
 * check whose case verdict differs from the displayed draft's, return the
 * seat, its verdict, and the first sentence of its synthesis as the
 * objection's one-line form (the full reasoning lives on /panel).
 */
/** Every seat whose word differs from the displayed verdict, a neighbouring word included: the standing tolerates one step, the page still shows it. */
export function survivingObjections(
  loaded: LoadedCase,
  displayed: AssessmentRun,
): { seat: string; verdict: AssessmentState; verdictLabel: string; firstSentence: string }[] {
  return latestCheckPerModel(loaded)
    .filter((r) => r.caseAssessment.verdict !== displayed.caseAssessment.verdict)
    .map((r) => {
      const first =
        r.caseAssessment.synthesis.match(/^[\s\S]*?[.!?](?=\s|$)/)?.[0].trim() ??
        r.caseAssessment.synthesis.slice(0, 180).trim();
      return {
        seat: r.model.split("—")[0].split(", independent")[0].trim(),
        verdict: r.caseAssessment.verdict,
        verdictLabel: assessmentLabels[r.caseAssessment.verdict],
        firstSentence: first.length > 260 ? first.slice(0, 257) + "…" : first,
      };
    });
}

/**
 * The assessment to display: the one the current edition adopts, stamped
 * with its ratification standing. The standing badge tells the reader
 * exactly how much independent concurrence stands behind it.
 */
export function displayAssessment(
  loaded: LoadedCase,
): { run: AssessmentRun; ratification: Ratification } | null {
  const run = adoptedAssessment(loaded);
  if (!run) return null;
  return { run, ratification: ratification(loaded)! };
}

/**
 * The newest check run from each judging model, oldest-model-first by date.
 *
 * Check runs are append-only, so re-checking a case after its content
 * changes leaves the superseded runs on disk. The concurrence panel must
 * report the *current* judgment of each model, not count a vendor twice
 * because it judged the case in two different weeks. Runs are keyed by
 * SEAT — the API vendor in the label ("GPT-5.1 (OpenAI)…" → `openai`;
 * see src/lib/seat-key.mjs) — which is stable across label wordings
 * and across model upgrades within a seat.
 */
export function latestCheckPerModel(loaded: LoadedCase): AssessmentRun[] {
  const byModel = new Map<string, AssessmentRun>();
  for (const run of loaded.assessmentRuns) {
    if (run.role !== "check") continue;
    const key = seatKey(run.model);
    const prev = byModel.get(key);
    // Same-date ties happen when a case is re-checked the day it changed
    // (append-only means both runs stay). runId breaks the tie: the re-run
    // convention suffixes -r2, -r3, …, and a suffixed id string-compares
    // after its own unsuffixed prefix, so the newest run wins.
    if (
      !prev ||
      run.date > prev.date ||
      (run.date === prev.date && run.runId > prev.runId)
    )
      byModel.set(key, run);
  }
  return [...byModel.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Concurrence of independent cross-model check runs with the displayed assessment. */
export interface CrossModelSummary {
  /** Model labels of the check runs, in run-date order. */
  models: string[];
  latestDate: string;
  /** Case-verdict tally across check runs, e.g. { unresolved: 4 }. */
  caseVerdicts: Record<string, number>;
  /** Whether every check run's case verdict matches the displayed run's. */
  caseUnanimousWithDisplayed: boolean;
  claimsCompared: number;
  /**
   * Date of the newest content-bearing history entry, when that entry is
   * more recent than the newest check run — i.e. the case file moved
   * after these judges read it. Null when the checks are current.
   */
  staleSince: string | null;
  /** Claims on which every seat's verdict is the displayed one. */
  exact: number;
  /** Claims on which every seat is within one step of the displayed verdict, not all exactly on it. */
  adjacent: number;
  /** Claims on which fewer than a majority of seats are within one step — the same rule that contests a load-bearing claim. */
  split: number;
  splitClaimIds: string[];
}

/** One seat's relation to the displayed verdict, by the one-step rule. */
export function seatRelation(seat: AssessmentState, displayed: AssessmentState): "concurs" | "disputes" {
  return withinOneStep(seat, displayed) ? "concurs" : "disputes";
}

/** How a claim's verdicts across the panel relate to the displayed one: the rule the standing uses, so a page never shows two answers. */
export function claimConcurrence(displayed: AssessmentState, seats: AssessmentState[]): "exact" | "adjacent" | "split" {
  if (seats.every((v) => v === displayed)) return "exact";
  const near = seats.filter((v) => withinOneStep(v, displayed)).length;
  return near * 2 > seats.length ? "adjacent" : "split";
}

const gradedScale: Partial<Record<AssessmentState, number>> = {
  established: 6,
  well_supported: 5,
  provisionally_supported: 4,
  mixed: 3,
  weakly_supported: 2,
  contradicted: 1,
};

/**
 * Concurrence (AGENTS.md §3.15, founder amendment of 2026-09-09): a seat's
 * verdict within one step of the draft's on the graded scale concurs, two
 * steps away disputes. The two ungraded states stand between "weakly
 * supported" and "mixed": one step from either, and from each other; two
 * from "contradicted" and from "provisionally supported". Five seats from
 * five vendors choosing among eight words rarely pick the same one.
 */
const nearScale: Partial<Record<AssessmentState, number>> = { ...gradedScale, unresolved: 2.5, presently_untestable: 2.5 };
export function withinOneStep(a: AssessmentState, b: AssessmentState): boolean {
  if (a === b) return true;
  const x = nearScale[a];
  const y = nearScale[b];
  return x !== undefined && y !== undefined && Math.abs(x - y) <= 1;
}

export function crossModelSummary(
  loaded: LoadedCase,
): CrossModelSummary | null {
  const shown = displayAssessment(loaded);
  const checks = latestCheckPerModel(loaded);
  if (checks.length === 0 || !shown) return null;

  // The case file moved after a judge read it? Say so.
  const staleSince = panelStaleness(loaded, checks);

  const baseline = new Map(
    shown.run.claimAssessments.map((ca) => [ca.claimId, ca.verdict]),
  );
  let exact = 0;
  let adjacent = 0;
  const splitIds = new Set<string>();
  let compared = 0;
  for (const [claimId, base] of baseline) {
    const verdicts = checks
      .map((r) => r.claimAssessments.find((ca) => ca.claimId === claimId))
      .filter((ca) => ca !== undefined)
      .map((ca) => ca.verdict);
    if (verdicts.length === 0) continue;
    compared++;
    const relation = claimConcurrence(base, verdicts);
    if (relation === "exact") exact++;
    else if (relation === "adjacent") adjacent++;
    else splitIds.add(claimId);
  }

  const caseVerdicts: Record<string, number> = {};
  for (const r of checks) {
    const v = r.caseAssessment.verdict;
    caseVerdicts[v] = (caseVerdicts[v] ?? 0) + 1;
  }

  return {
    models: checks.map((r) => r.model),
    latestDate: checks[checks.length - 1].date,
    caseVerdicts,
    caseUnanimousWithDisplayed: checks.every(
      (r) => r.caseAssessment.verdict === shown.run.caseAssessment.verdict,
    ),
    claimsCompared: compared,
    staleSince,
    exact,
    adjacent,
    split: splitIds.size,
    splitClaimIds: [...splitIds],
  };
}
