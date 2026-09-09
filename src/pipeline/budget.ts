import { z } from "zod";
import type { Verb } from "../domain/intake.ts";
import { isoDate } from "../../scripts/lib/overlay-ids.mjs";
import { loadConfig } from "./config.ts";
import { inputRates, loadTariffs, readSpend, type Tariffs } from "./spend.ts";

/**
 * The spend ceiling (config/budget.yaml), enforced before every paid call.
 * A call that would carry the run, the day, or the month past its cap is
 * refused with the reason, and the verb ends `failed` — never a silent
 * partial. Estimates are conservative (full input at the model's rate,
 * the whole output allowance, every permitted search) and are made only
 * from reviewed tariffs: an unpriced model cannot be budgeted, so it
 * cannot be called, unless ALETHEIA_ALLOW_UNPRICED=1 says the founder
 * accepts an unpriced call for this run.
 */

const BudgetSchema = z.object({
  usd: z.object({
    perRun: z.number().positive(),
    perDay: z.number().positive(),
    perMonth: z.number().positive(),
  }),
  /**
   * Founder-granted, dated exceptions to the daily cap — the constitutional
   * way to spend past it: on the record, for one day, with a reason and a
   * name, self-expiring. Never an environment variable.
   */
  exemptions: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        perDay: z.number().positive(),
        /** The month's cap as it stands on that date, when the grant lifts it too. */
        perMonth: z.number().positive().optional(),
        reason: z.string().min(3),
        by: z.string().min(1),
      }),
    )
    .default([]),
});
export type Budget = z.infer<typeof BudgetSchema>;

export function loadBudget(root = process.cwd()): Budget {
  return loadConfig("budget", BudgetSchema, { root, whyRequired: "no paid call runs without a ceiling" });
}

export class BudgetExceeded extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetExceeded";
  }
}

export interface CallEstimate {
  model: string;
  inputChars: number;
  maxOutputTokens: number;
  /** Server-side searches the call may perform, and the tariff key for them. */
  searches?: { count: number; toolKey: string };
  /** Server-side page fetches the call may perform, each capped at this many tokens. */
  fetches?: { count: number; maxContentTokens: number };
}

/** Rough tokens from characters — 3.5 chars per token, on the conservative side. */
export const tokensFromChars = (chars: number) => Math.ceil(chars / 3.5);
/** Input tokens one search result adds to the context. */
export const SEARCH_RESULT_TOKENS = 4000;

/**
 * Conservative USD for a call, or null when the model (or its tool) has no
 * reviewed tariff. A call with server tools is a loop the vendor runs for
 * us: after every tool result the model reads the whole context again. The
 * first paid run (2026-09-08) made 39 such passes and was billed 3.6M input
 * tokens against a 39k-token prompt; the estimate had counted the prompt
 * once. So: every new token — the prompt and each tool result — is written
 * to the prompt cache once at the write rate, and every pass re-reads all
 * that came before at the read rate. Without cache rates in the tariff both
 * fall back to the base rate, which is what a call without caching costs.
 */
export function estimateUsd(call: CallEstimate, tariffs: Tariffs = loadTariffs()): number | null {
  const t = tariffs.models[call.model];
  const rates = t ? inputRates(t) : null;
  if (!t || !rates || t.outputPerMTok === null) return null;
  const base = tokensFromChars(call.inputChars);
  const searches = call.searches?.count ?? 0;
  const fetches = call.fetches?.count ?? 0;
  const passes = searches + fetches;
  let perMTok = call.maxOutputTokens * t.outputPerMTok;
  let fees = 0;
  if (passes === 0) {
    perMTok += base * rates.input;
  } else {
    if (searches > 0) {
      const tool = tariffs.tools[call.searches!.toolKey];
      if (!tool || tool.perCallUsd === null) return null;
      fees += searches * tool.perCallUsd;
    }
    const toolTokens = searches * SEARCH_RESULT_TOKENS + fetches * (call.fetches?.maxContentTokens ?? 0);
    const writes = base + toolTokens;
    const reads = passes * base + (toolTokens / passes) * ((passes * (passes - 1)) / 2);
    perMTok += writes * rates.write + reads * rates.read;
  }
  return Number((perMTok / 1e6 + fees).toFixed(4));
}

export interface BudgetContext {
  runId: string;
  verb: Verb;
  today?: string;
  root?: string;
}

/** Throws BudgetExceeded when spending `estimate` would pass a cap. Returns the estimate. */
export function assertWithinBudget(estimate: number | null, ctx: BudgetContext): number {
  const root = ctx.root ?? process.cwd();
  if (estimate === null) {
    if (process.env.ALETHEIA_ALLOW_UNPRICED === "1") return 0;
    throw new BudgetExceeded(
      "the model or its search tool has no reviewed tariff in config/tariffs.yaml, so the call cannot be budgeted; fill the tariff, or set ALETHEIA_ALLOW_UNPRICED=1 to accept an unpriced call",
    );
  }
  const budget = loadBudget(root);
  const today = ctx.today ?? isoDate();
  const month = today.slice(0, 7);
  const exemption = budget.exemptions.find((e) => e.date === today);
  const perDay = exemption ? exemption.perDay : budget.usd.perDay;
  const perMonth = exemption?.perMonth ?? budget.usd.perMonth;
  const rows = readSpend(root);
  const sum = (pred: (r: (typeof rows)[number]) => boolean) =>
    rows.filter(pred).reduce((n, r) => n + (r.usd ?? 0), 0);
  const run = sum((r) => r.runId === ctx.runId);
  const day = sum((r) => r.date === today);
  const mon = sum((r) => r.date.startsWith(month));
  const fail = (scope: string, spent: number, cap: number) =>
    new BudgetExceeded(
      `${scope} cap: $${spent.toFixed(2)} spent + $${estimate.toFixed(2)} estimated > $${cap.toFixed(2)} (config/budget.yaml); nothing was sent`,
    );
  if (run + estimate > budget.usd.perRun) throw fail("per-run", run, budget.usd.perRun);
  if (day + estimate > perDay) throw fail("per-day", day, perDay);
  if (mon + estimate > perMonth) throw fail("per-month", mon, perMonth);
  return estimate;
}
