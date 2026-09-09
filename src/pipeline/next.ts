import { saturation } from "../domain/intake.ts";
import type { RunRecord } from "../domain/intake.ts";
import { checksStale, loadAllCases } from "../domain/load.ts";
import type { LoadedCase } from "../domain/schema.ts";
import { MODELS } from "../../scripts/lib/models.mjs";
import { runCheck } from "./check.ts";
import { runDraft } from "./draft.ts";
import { editionDue, runEdition } from "./edition.ts";
import { runReport, type ResearchSeat } from "./report.ts";
import { readProposal, readRuns, type RunOutcome } from "./store.ts";
import { runVerify } from "./verify.ts";

/**
 * `aletheia next` — what the ledger wants done, and for which case (docs/
 * AUTOMATION.md, step 4b). One rule set, derived from files that exist:
 *
 *  1. Finish what is half done: a completed report with no draft after it,
 *     a completed draft with no verification after it.
 *  2. An edition the ledger owes — the ledger moved under the incumbent.
 *  3. A blind check where the panel is stale — no seat has judged the case
 *     as it stands. After the edition, so the panel judges what will be
 *     displayed.
 *  4. A report for the case least recently reported, skipping a case
 *     reported within the cadence and, unless nothing else is left, a
 *     saturated one (three passes that landed nothing). The house seat by
 *     default; the second seat when the last pass landed nothing — a
 *     different pair of eyes when the first stops finding.
 *  5. A reconsideration where the panel contests an assessment nothing has
 *     answered — after the search, so new evidence gets its chance to move
 *     the case before the old disagreement is re-argued (founder, 2026-09-09).
 *  6. Nothing: everything rests.
 *
 * `--run` performs the choice and, for a report, continues the chain —
 * draft, verify, edition — stopping at the first step that does not
 * complete. `--steps N` repeats the choice up to N times in one sitting
 * (a week's work in one workflow run: a check after an edition, a report
 * after a check), stopping when the ledger rests or a step fails. Every
 * step is its own run with its own record and cost, under the same budget.
 */

export interface NextChoice {
  case: string | null;
  verb: "report" | "draft" | "verify" | "edition" | "check" | "rest";
  seat?: ResearchSeat;
  /** The run id a draft or verify continues from. */
  from?: string;
  reason: string;
}

export const CADENCE_DAYS = 7;
export const SATURATED_AFTER = 3;

const ageDays = (date: string, today: string) => (Date.parse(today) - Date.parse(date)) / 86_400_000;
/** Chronological key for a run: its date and the HHMMSS its id ends with (ids of different verbs do not sort by time on their own). */
const when = (r: Pick<RunRecord, "runId" | "date">) => `${r.date}T${r.runId.slice(-6)}`;
const after = (a: Pick<RunRecord, "runId" | "date">, b: Pick<RunRecord, "runId" | "date">) => when(a) > when(b);

/** The run ids of reports and intakes some proposal was drafted from (the proposal names its report). */
export function draftedFrom(runs: RunRecord[], root = process.cwd()): Set<string> {
  const out = new Set<string>();
  for (const r of runs) {
    if (r.verb !== "draft" || r.outcome !== "completed") continue;
    const id = readProposal(r.runId, root)?.report?.match(/^proposals\/([^/]+)\//)?.[1];
    if (id) out.add(id);
  }
  return out;
}

/** Pure given `drafted`: the choice, from the cases, the run records, the reports already drafted, and the date. */
export function nextAction(cases: LoadedCase[], runs: RunRecord[], today: string, drafted: Set<string> = new Set()): NextChoice {
  const byCase = (slug: string) => runs.filter((r) => r.case === slug).sort((a, b) => when(a).localeCompare(when(b)));
  // 1. Half-done chains, oldest first: every completed report or intake no proposal was drafted from.
  for (const c of cases) {
    const rs = byCase(c.record.slug);
    const undrafted = rs.find((r) => (r.verb === "report" || r.verb === "inbox") && r.outcome === "completed" && !drafted.has(r.runId));
    if (undrafted) {
      return { case: c.record.slug, verb: "draft", from: undrafted.runId, reason: `${undrafted.verb} ${undrafted.runId} has not been drafted` };
    }
    const lastDraft = rs.filter((r) => r.verb === "draft" && r.outcome === "completed").at(-1);
    if (lastDraft && !rs.some((r) => r.verb === "verify" && r.outcome === "completed" && after(r, lastDraft))) {
      return { case: c.record.slug, verb: "verify", from: lastDraft.runId, reason: `proposal ${lastDraft.runId} has not been verified` };
    }
  }
  // 2. Editions the ledger owes.
  for (const c of cases) {
    const due = editionDue(c);
    if (due?.kind === "moved") return { case: c.record.slug, verb: "edition", reason: due.reason };
  }
  // 3. A stale panel.
  for (const c of cases) {
    if (checksStale(c)) return { case: c.record.slug, verb: "check", reason: "no seat has judged the case as it stands" };
  }
  // 4. The least recently reported case.
  const candidates = cases
    .map((c) => {
      const rs = byCase(c.record.slug);
      const last = rs.filter((r) => r.verb === "report" && r.outcome === "completed").at(-1);
      const sat = saturation(rs, c.dispositions, c.record.slug);
      return { c, last, sat };
    })
    .filter(({ last }) => !last || ageDays(last.date, today) >= CADENCE_DAYS);
  const reconsideration = () => {
    for (const c of cases) {
      const due = editionDue(c);
      if (due?.kind === "contested") return { case: c.record.slug, verb: "edition" as const, reason: due.reason };
    }
    return null;
  };
  if (candidates.length === 0) return reconsideration() ?? { case: null, verb: "rest", reason: `every case was reported within the last ${CADENCE_DAYS} days and no panel dissent is unanswered` };
  const fresh = candidates.filter(({ sat }) => sat.consecutiveEmpty < SATURATED_AFTER);
  const pool = fresh.length ? fresh : candidates;
  pool.sort((a, b) => (a.last?.date ?? "").localeCompare(b.last?.date ?? ""));
  const pick = pool[0];
  const seat: ResearchSeat = pick.sat.consecutiveEmpty > 0 && MODELS.research.seats.openai ? "openai" : MODELS.research.default;
  const why = !pick.last
    ? "never reported"
    : `last reported ${pick.last.date}${pick.sat.consecutiveEmpty ? `; the last ${pick.sat.consecutiveEmpty} pass(es) landed nothing, so the second seat looks` : ""}${fresh.length === 0 ? " (every case is saturated; the least recent goes anyway)" : ""}`;
  return { case: pick.c.record.slug, verb: "report", seat, reason: why };
}

export interface NextOutcome {
  choice: NextChoice;
  ran: { verb: string; outcome: RunOutcome }[];
  /** Later choices made in the same sitting (`--steps`), each with what it ran. */
  more?: NextOutcome[];
}

/** Choose, and with `run`, do it — continuing a report through the chain until a step does not complete; with `steps`, choose again up to that many times. */
export async function runNext(opts: { run?: boolean; steps?: number; today?: string; root?: string } = {}): Promise<NextOutcome> {
  const first = await runOnce(opts);
  const steps = Math.max(1, opts.steps ?? 1);
  if (!opts.run || steps === 1) return first;
  const more: NextOutcome[] = [];
  let last = first;
  for (let i = 1; i < steps; i++) {
    if (last.choice.verb === "rest" || last.ran.some((s) => s.outcome.outcome === "failed")) break;
    last = await runOnce(opts);
    more.push(last);
    if (last.choice.verb === "rest") break;
  }
  return { ...first, more };
}

async function runOnce(opts: { run?: boolean; today?: string; root?: string }): Promise<NextOutcome> {
  const root = opts.root ?? process.cwd();
  const cases = loadAllCases();
  const runs = readRuns(root);
  const choice = nextAction(cases, runs, opts.today ?? new Date().toISOString().slice(0, 10), draftedFrom(runs, root));
  const ran: NextOutcome["ran"] = [];
  if (!opts.run || choice.verb === "rest" || !choice.case) return { choice, ran };
  const step = async (verb: string, f: () => Promise<RunOutcome>) => {
    const outcome = await f();
    ran.push({ verb, outcome });
    return outcome.outcome === "completed";
  };
  if (choice.verb === "report") {
    if (!(await step("report", () => runReport(choice.case!, { seat: choice.seat!, root })))) return { choice, ran };
    const reportId = ran[0].outcome.runId;
    if (!(await step("draft", () => runDraft(reportId, { root })))) return { choice, ran };
    const draftId = ran[1].outcome.runId;
    if (!(await step("verify", () => runVerify(draftId, { root })))) return { choice, ran };
    await step("edition", () => runEdition(choice.case!, { root }));
  } else if (choice.verb === "draft") {
    if (!(await step("draft", () => runDraft(choice.from!, { root })))) return { choice, ran };
    if (!(await step("verify", () => runVerify(ran[0].outcome.runId, { root })))) return { choice, ran };
    await step("edition", () => runEdition(choice.case!, { root }));
  } else if (choice.verb === "verify") {
    if (!(await step("verify", () => runVerify(choice.from!, { root })))) return { choice, ran };
    await step("edition", () => runEdition(choice.case!, { root }));
  } else if (choice.verb === "edition") {
    await step("edition", () => runEdition(choice.case!, { root }));
  } else if (choice.verb === "check") {
    await step("check", () => runCheck(choice.case!, { root }));
  }
  return { choice, ran };
}
