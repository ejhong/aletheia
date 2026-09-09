import { z } from "zod";
import { loadConfig } from "./config.ts";

/**
 * The spend ceiling (config/budget.yaml): standing caps, a dated crunch
 * that lifts them until it ends, and dated single-day exemptions — every
 * one founder-granted, on the record. Read here by the domain; the
 * pipeline's guard enforces it before every paid call.
 */
export const BudgetSchema = z.object({
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
  /**
   * The crunch: caps that hold until a date and then fall to the standing
   * caps — the bootstrap is the expensive part, and it ends on the record.
   */
  crunch: z
    .object({
      until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      perDay: z.number().positive(),
      perMonth: z.number().positive(),
      reason: z.string().min(3),
      by: z.string().min(1),
    })
    .optional(),
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

/** The caps in force on a date: a dated exemption first, then the crunch while it lasts, then the standing caps. */
export function capsFor(budget: Budget, today: string): { perRun: number; perDay: number; perMonth: number; phase: "exemption" | "crunch" | "standing" } {
  const exemption = budget.exemptions.find((e) => e.date === today);
  if (exemption) return { perRun: budget.usd.perRun, perDay: exemption.perDay, perMonth: exemption.perMonth ?? budget.crunch?.perMonth ?? budget.usd.perMonth, phase: "exemption" };
  const crunch = budget.crunch && today <= budget.crunch.until ? budget.crunch : null;
  if (crunch) return { perRun: budget.usd.perRun, perDay: crunch.perDay, perMonth: crunch.perMonth, phase: "crunch" };
  return { perRun: budget.usd.perRun, perDay: budget.usd.perDay, perMonth: budget.usd.perMonth, phase: "standing" };
}

export function loadBudget(root = process.cwd()): Budget {
  return loadConfig("budget", BudgetSchema, { root, whyRequired: "no paid call runs without a ceiling" });
}

