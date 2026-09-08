import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { Verb } from "../domain/intake.ts";
import { loadTariffs, readSpend, type Tariffs } from "./spend.ts";

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
});
export type Budget = z.infer<typeof BudgetSchema>;

export const budgetFile = (root = process.cwd()) => path.join(root, "config", "budget.yaml");

export function loadBudget(root = process.cwd()): Budget {
  const file = budgetFile(root);
  if (!fs.existsSync(file)) throw new Error("config/budget.yaml is missing — no paid call runs without a ceiling");
  return BudgetSchema.parse(parseYaml(fs.readFileSync(file, "utf8")));
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
}

/** Rough tokens from characters — 3.5 chars per token, on the conservative side. */
export const tokensFromChars = (chars: number) => Math.ceil(chars / 3.5);

/** Conservative USD for a call, or null when the model (or its tool) has no reviewed tariff. */
export function estimateUsd(call: CallEstimate, tariffs: Tariffs = loadTariffs()): number | null {
  const t = tariffs.models[call.model];
  if (!t || t.inputPerMTok === null || t.outputPerMTok === null) return null;
  let usd = (tokensFromChars(call.inputChars) * t.inputPerMTok + call.maxOutputTokens * t.outputPerMTok) / 1e6;
  if (call.searches && call.searches.count > 0) {
    const tool = tariffs.tools[call.searches.toolKey];
    if (!tool || tool.perCallUsd === null) return null;
    usd += call.searches.count * tool.perCallUsd;
    // Search results are billed as input; allow roughly 4k tokens per search.
    usd += (call.searches.count * 4000 * t.inputPerMTok) / 1e6;
  }
  return Number(usd.toFixed(4));
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
  const today = ctx.today ?? new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
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
  if (day + estimate > budget.usd.perDay) throw fail("per-day", day, budget.usd.perDay);
  if (mon + estimate > budget.usd.perMonth) throw fail("per-month", mon, budget.usd.perMonth);
  return estimate;
}
