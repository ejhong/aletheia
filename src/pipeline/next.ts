import { saturation } from "../domain/intake.ts";
import type { RunRecord } from "../domain/intake.ts";
import { checksStale } from "../domain/standing.ts";
import { loadAllCases } from "../domain/load.ts";
import type { LoadedCase } from "../domain/schema.ts";
import { MODELS } from "../lib/models.mjs";
import { runCheck } from "./check.ts";
import { runInbox } from "./inbox.ts";
import { runDraft } from "./draft.ts";
import { editionDue, runEdition } from "./edition.ts";
import { runReport, type ResearchSeat } from "./report.ts";
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { readProposal, readRuns, runDir, type RunOutcome } from "./store.ts";
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
  verb: "inbox" | "report" | "draft" | "verify" | "edition" | "check" | "rest";
  seat?: ResearchSeat;
  /** The run id a draft or verify continues from. */
  from?: string;
  reason: string;
}

export const CADENCE_DAYS = 7;
export const SATURATED_AFTER = 3;
/**
 * The cadence doubles after each producer cycle (a report and its draft)
 * that lands nothing, up to this ceiling, and resets when a pass lands: a
 * live case is searched weekly, a quiet one every three months. This is
 * what lets the system settle to almost no cost (founder direction,
 * 2026-09-09).
 */
export const MAX_CADENCE_DAYS = 90;
export const emptyCycles = (consecutiveEmpty: number) => Math.floor(consecutiveEmpty / 2);
export const cadenceDays = (consecutiveEmpty: number) => Math.min(CADENCE_DAYS * 2 ** emptyCycles(consecutiveEmpty), MAX_CADENCE_DAYS);

const ageDays = (date: string, today: string) => (Date.parse(today) - Date.parse(date)) / 86_400_000;
/** Chronological key for a run: its date and the HHMMSS its id ends with (ids of different verbs do not sort by time on their own). */
const when = (r: Pick<RunRecord, "runId" | "date">) => `${r.date}T${r.runId.slice(-6)}`;
const after = (a: Pick<RunRecord, "runId" | "date">, b: Pick<RunRecord, "runId" | "date">) => when(a) > when(b);

/**
 * The run ids of reports and intakes that need no draft: those some proposal
 * was drafted from (the proposal names its report), and intakes superseded
 * by a later intake of the same case that took in every document they did
 * (by sha256) — a re-run intake replaces its predecessor rather than
 * queueing beside it (2026-09-09: two stale intakes of one essay were
 * drafted before the current one).
 */
export function draftedFrom(runs: RunRecord[], root = process.cwd()): Set<string> {
  const out = new Set<string>();
  for (const r of runs) {
    if (r.verb !== "draft" || r.outcome !== "completed") continue;
    const id = readProposal(r.runId, root)?.report?.match(/^proposals\/([^/]+)\//)?.[1];
    if (id) out.add(id);
  }
  const intakes = runs.filter((r) => r.verb === "inbox" && r.outcome === "completed");
  const shas = new Map<string, Set<string>>();
  for (const r of intakes) {
    const f = path.join(runDir(r.runId, root), "manifest.yaml");
    if (!fs.existsSync(f)) continue;
    const m = parseYaml(fs.readFileSync(f, "utf8")) as { items?: { sha256?: string }[] };
    shas.set(r.runId, new Set((m.items ?? []).map((i) => i.sha256).filter((x): x is string => Boolean(x))));
  }
  for (const a of intakes) {
    const mine = shas.get(a.runId);
    if (!mine || mine.size === 0) continue;
    const superseded = intakes.some((b) => b.case === a.case && b.runId !== a.runId && b.date + b.runId.slice(-6) > a.date + a.runId.slice(-6) && [...mine].every((s) => shas.get(b.runId)?.has(s)));
    if (superseded) out.add(a.runId);
  }
  return out;
}

/** Pure given `drafted`: the choice, from the cases, the run records, the reports already drafted, and the date. */
/** Cases with files waiting in `inbox/<case>/` (not README, not dotfiles, not `processed/`), by slug: the founder's door, counted without reading the files. */
export function inboxPending(cases: LoadedCase[], root = process.cwd()): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of cases) {
    const dir = path.join(root, "inbox", c.dir);
    if (!fs.existsSync(dir)) continue;
    let n = 0;
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.name.startsWith(".")) continue;
        if (e.isDirectory()) {
          if (e.name !== "processed") walk(path.join(d, e.name));
        } else if (e.name !== "README.md") n++;
      }
    };
    walk(dir);
    if (n > 0) out.set(c.record.slug, n);
  }
  return out;
}

export function nextAction(cases: LoadedCase[], runs: RunRecord[], today: string, drafted: Set<string> = new Set(), pendingInbox: Map<string, number> = new Map()): NextChoice {
  const byCase = (slug: string) => runs.filter((r) => r.case === slug).sort((a, b) => when(a).localeCompare(when(b)));
  // 0. The founder's door: an inbox with items is taken in before anything else (the inbox-response workflow, retired 2026-09-09, did this on push).
  for (const c of cases) {
    const n = pendingInbox.get(c.record.slug);
    if (n) return { case: c.record.slug, verb: "inbox", reason: `${n} item(s) waiting in inbox/${c.dir}` };
  }
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
    .filter(({ last, sat }) => !last || ageDays(last.date, today) >= cadenceDays(sat.consecutiveEmpty));
  const reconsideration = () => {
    for (const c of cases) {
      const due = editionDue(c);
      if (due?.kind === "contested") return { case: c.record.slug, verb: "edition" as const, reason: due.reason };
    }
    return null;
  };
  if (candidates.length === 0) return reconsideration() ?? { case: null, verb: "rest", reason: `every case is within its cadence (${CADENCE_DAYS} days, doubling after each pass that lands nothing, up to ${MAX_CADENCE_DAYS}) and no panel dissent is unanswered` };
  const fresh = candidates.filter(({ sat }) => sat.consecutiveEmpty < SATURATED_AFTER);
  const pool = fresh.length ? fresh : candidates;
  pool.sort((a, b) => (a.last?.date ?? "").localeCompare(b.last?.date ?? ""));
  const pick = pool[0];
  // The seats alternate on a quiet case — a different pair of eyes after a pass that lands nothing, the house seat again after that — never both on one pass.
  const seat: ResearchSeat = emptyCycles(pick.sat.consecutiveEmpty) % 2 === 1 && MODELS.research.seats.openai ? "openai" : MODELS.research.default;
  const why = !pick.last
    ? "never reported"
    : `last reported ${pick.last.date}${pick.sat.consecutiveEmpty ? `; the last ${emptyCycles(pick.sat.consecutiveEmpty)} pass(es) landed nothing, so the cadence is ${cadenceDays(pick.sat.consecutiveEmpty)} days and the ${seat === "openai" ? "second" : "house"} seat looks` : ""}${fresh.length === 0 ? " (every case is saturated; the least recent goes anyway)" : ""}`;
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
