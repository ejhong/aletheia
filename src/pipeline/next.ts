import type { RunRecord } from "../domain/intake.ts";
import { loadAllCases } from "../domain/load.ts";
import { runCheck } from "./check.ts";
import { runInbox } from "./inbox.ts";
import { runDraft } from "./draft.ts";
import { runEdition } from "./edition.ts";
import { runReport } from "./report.ts";
import { readRuns, type RunOutcome } from "./store.ts";
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

export {
  CADENCE_DAYS,
  MAX_CADENCE_DAYS,
  SATURATED_AFTER,
  cadenceDays,
  draftedFrom,
  emptyCycles,
  inboxPending,
  nextAction,
  type NextChoice,
} from "../domain/schedule.ts";
import { draftedFrom, inboxPending, nextAction, type NextChoice } from "../domain/schedule.ts";

export interface NextOutcome {
  choice: NextChoice;
  ran: { verb: string; outcome: RunOutcome }[];
  /** Later choices made in the same sitting (`--steps`), each with what it ran. */
  more?: NextOutcome[];
  /**
   * Why the sitting made fewer choices than asked: its deadline passed. Set
   * on the first outcome. A sitting that runs out of time still opens its
   * PR with what it did (2026-09-10: a two-hour workflow limit cancelled an
   * eight-step sitting after the seventh, and every record and spend row it
   * had written was lost with the runner).
   */
  stopped?: { reason: "deadline" | "cases"; afterMinutes: number; stepsMade: number; cases?: string[] };
}

export interface SittingOptions {
  run?: boolean;
  steps?: number;
  today?: string;
  root?: string;
  /** No new choice is made once this many minutes have passed since the sitting began; the step under way finishes. */
  deadlineMinutes?: number;
  /**
   * A sitting works on at most this many cases: a choice that would open another case ends it. The
   * sitting's PR is what the panel reads, and three cases' records in one PR ran past what a seat can
   * see (2026-09-10: two seats could not vote on a six-step sitting because the transients ledger
   * was omitted from their view). Absent: no limit.
   */
  maxCases?: number;
  /** Cases not to choose, each with why — an open sitting on an unmerged branch (scripts/busy-cases.mjs). */
  busy?: Map<string, string>;
  /** Called after every choice with the sitting so far, so a caller can write progress to disk as it goes. */
  onProgress?: (soFar: NextOutcome) => void;
  /** Test seams: the clock, one choice-and-run, or the choice and the run apart. */
  deps?: { now?: () => number; once?: (opts: SittingOptions) => Promise<NextOutcome>; choose?: (opts: SittingOptions) => NextChoice; perform?: (choice: NextChoice, opts: SittingOptions) => Promise<NextOutcome> };
}

/** Choose, and with `run`, do it — continuing a report through the chain until a step does not complete; with `steps`, choose again up to that many times, within the deadline. */
export async function runNext(opts: SittingOptions = {}): Promise<NextOutcome> {
  const now = opts.deps?.now ?? Date.now;
  const choose = opts.deps?.choose ?? chooseNext;
  const perform = opts.deps?.perform ?? performChoice;
  const once = opts.deps?.once ?? (async (o: SittingOptions) => perform(choose(o), o));
  const began = now();
  const minutesGone = () => (now() - began) / 60_000;
  const first = await once(opts);
  const steps = Math.max(1, opts.steps ?? 1);
  const progress = (): NextOutcome => ({ ...first, ...(more.length ? { more } : {}) });
  const more: NextOutcome[] = [];
  const cases = new Set<string>(first.choice.case ? [first.choice.case] : []);
  opts.onProgress?.(progress());
  if (!opts.run || steps === 1) return first;
  let last = first;
  for (let i = 1; i < steps; i++) {
    if (last.choice.verb === "rest" || last.ran.some((s) => s.outcome.outcome === "failed")) break;
    if (opts.deadlineMinutes !== undefined && minutesGone() >= opts.deadlineMinutes) {
      first.stopped = { reason: "deadline", afterMinutes: Math.round(minutesGone()), stepsMade: i };
      opts.onProgress?.(progress());
      break;
    }
    if (opts.deps?.once) {
      last = await once(opts);
    } else {
      const choice = choose(opts);
      if (opts.maxCases !== undefined && choice.case && !cases.has(choice.case) && cases.size >= opts.maxCases) {
        first.stopped = { reason: "cases", afterMinutes: Math.round(minutesGone()), stepsMade: i, cases: [...cases] };
        opts.onProgress?.(progress());
        break;
      }
      if (choice.case) cases.add(choice.case);
      last = await perform(choice, opts);
    }
    more.push(last);
    opts.onProgress?.(progress());
    if (last.choice.verb === "rest") break;
  }
  return { ...first, more };
}

/** The ledger's choice, from the files as they stand. */
export function chooseNext(opts: SittingOptions): NextChoice {
  const root = opts.root ?? process.cwd();
  const cases = loadAllCases();
  const runs = readRuns(root);
  return nextAction(cases, runs, opts.today ?? new Date().toISOString().slice(0, 10), draftedFrom(runs, root), inboxPending(cases, root), opts.busy ?? new Map());
}

/** Do the choice: a chain continued until a step does not complete. */
async function performChoice(choice: NextChoice, opts: SittingOptions): Promise<NextOutcome> {
  const root = opts.root ?? process.cwd();
  const ran: NextOutcome["ran"] = [];
  if (!opts.run || choice.verb === "rest" || !choice.case) return { choice, ran };
  const step = async (verb: string, f: () => Promise<RunOutcome>) => {
    const outcome = await f();
    ran.push({ verb, outcome });
    return outcome.outcome === "completed";
  };
  if (choice.verb === "inbox") {
    if (!(await step("inbox", () => runInbox(choice.case!, { root })))) return { choice, ran };
    const intakeId = ran[0].outcome.runId;
    if (!(await step("draft", () => runDraft(intakeId, { root })))) return { choice, ran };
    if (!(await step("verify", () => runVerify(ran[1].outcome.runId, { root })))) return { choice, ran };
    await step("edition", () => runEdition(choice.case!, { root }));
  } else if (choice.verb === "report") {
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
