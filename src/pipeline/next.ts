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
  const choice = nextAction(cases, runs, opts.today ?? new Date().toISOString().slice(0, 10), draftedFrom(runs, root), inboxPending(cases, root));
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
