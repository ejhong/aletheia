import fs from "node:fs";
import { z } from "zod";

const money = z.number().finite().nonnegative();
const tokens = z.number().int().positive();
export const AllowanceSchema = z.strictObject({ enabled: z.boolean(), monthlyUsd: money, dailyUsd: money, reviewReserveUsd: money })
  .refine(p => p.reviewReserveUsd <= p.monthlyUsd, "review reserve exceeds monthly allowance");
const Rate = z.strictObject({
  provider: z.enum(["openai", "anthropic", "gemini", "xai", "venice"]),
  input: money, cacheWrite: money.optional(), output: money,
  context: tokens, maxOutput: tokens,
  longThreshold: tokens.optional(), longInputFactor: money.optional(), longOutputFactor: money.optional(),
  source: z.url(),
});
const PolicyObject = z.strictObject({
  version: z.literal(1), enabled: z.boolean(), monthlyUsd: money, dailyUsd: money, reviewReserveUsd: money,
  main: z.strictObject({ provider: z.enum(["openai", "anthropic"]), model: z.string().min(1),
    effort: z.enum(["low", "medium", "high"]), maxOutputTokens: tokens }),
  operator: z.strictObject({ model: z.string().min(1), effort: z.enum(["low", "medium", "high"]) }),
  sourceDraft: z.string(), sourceCheck: z.string(), imageModel: z.string(), rateDate: z.iso.date(),
  rates: z.record(z.string(), Rate),
});
export const PolicySchema = PolicyObject.superRefine((p, ctx) => {
  if (p.reviewReserveUsd > p.monthlyUsd) ctx.addIssue({ code: "custom", message: "review reserve exceeds monthly allowance" });
  for (const model of [p.main.model, p.operator.model, p.sourceDraft, p.sourceCheck, p.imageModel])
    if (!p.rates[model]) ctx.addIssue({ code: "custom", message: `no tariff for ${model}` });
  if (p.rates[p.main.model]?.provider !== p.main.provider)
    ctx.addIssue({ code: "custom", message: "main model/provider mismatch" });
});

export const PolicyConfigSchema = PolicyObject.omit({ enabled: true, monthlyUsd: true, dailyUsd: true, reviewReserveUsd: true })
  .extend({ initialBudget: AllowanceSchema });
export function parsePolicyConfig(value) {
  const { initialBudget, ...models } = PolicyConfigSchema.parse(value);
  return PolicySchema.parse({ ...models, ...initialBudget });
}

export const POLICY_FILE = new URL("../../config/ai.json", import.meta.url);
export const AI_POLICY = parsePolicyConfig(JSON.parse(fs.readFileSync(POLICY_FILE, "utf8")));
export const microUsd = usd => Math.ceil(usd * 1e6);

export class BudgetStopped extends Error {
  constructor(message) { super(message); this.name = "BudgetStopped"; this.kind = "budget_exhausted"; }
}

export function tariff(model, policy = AI_POLICY) {
  const rate = policy.rates[model];
  if (!rate) throw new BudgetStopped(`No recorded tariff for ${model}; update config/ai.json before using it.`);
  return rate;
}

/** Conservative tariff accounting: no cache-read discounts; cache-write and
 * long-context premiums included. This is an allowance, not a vendor invoice. */
export function tokenCost(rate, input, output, { reserve = false, cacheWrite = 0 } = {}) {
  if (![input, output, cacheWrite].every(n => Number.isSafeInteger(n) && n >= 0) || cacheWrite > input)
    throw new BudgetStopped("Invalid token usage; reservation retained.");
  const long = rate.longThreshold !== undefined && input > rate.longThreshold;
  const inputRate = rate.input * (long ? rate.longInputFactor : 1);
  const writeRate = (rate.cacheWrite ?? rate.input) * (long ? rate.longInputFactor : 1);
  const outputRate = rate.output * (long ? rate.longOutputFactor : 1);
  return Math.ceil((reserve ? input * Math.max(inputRate, writeRate)
    : (input - cacheWrite) * inputRate + cacheWrite * writeRate) + output * outputRate);
}
