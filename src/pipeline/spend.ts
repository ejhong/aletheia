import fs from "node:fs";
import path from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { z } from "zod";
import { SpendRowSchema, type SpendRowInput, type Verb } from "../domain/intake.ts";
import { loadConfig } from "../domain/config.ts";
import { readSpend, spendFile } from "../domain/spend.ts";

// The read side of the ledger lives in the domain (src/domain/spend.ts); the pipeline writes through it.
export { readSpend, spendByCase, spendFile, spendFor, sumCost } from "../domain/spend.ts";

/**
 * The spend ledger (docs/AUTOMATION.md, "The code"): one place, inside the
 * model transport, so every paid call is recorded by construction. Rows
 * carry the vendor's reported tokens; dollars are computed ONLY from a
 * reviewed tariff in config/tariffs.yaml, and are null otherwise — the
 * ledger never estimates a price it was not given.
 */


/** What a paid call is charged to: the run, its verb and case, and the repository root. */
export interface Meter {
  runId: string;
  verb: Verb;
  case: string | null;
  root?: string;
}

const TariffsSchema = z.object({
  models: z.record(
    z.string(),
    z.object({
      /** USD per million input tokens; null when not yet reviewed. */
      inputPerMTok: z.number().nonnegative().nullable(),
      outputPerMTok: z.number().nonnegative().nullable(),
      /** Prompt-cache read (hit) rate; a missing rate prices reads at the base input rate. */
      cachedInputPerMTok: z.number().nonnegative().nullable().optional(),
      /** Prompt-cache write rate (5-minute); a missing rate prices writes at the base input rate. */
      cacheWritePerMTok: z.number().nonnegative().nullable().optional(),
      /** Where the price was read, and when — a tariff is provenance too. */
      source: z.string().nullable(),
      checked: z.string().nullable(),
    }),
  ),
  /** Per-call fees for server-side tools (web search), keyed vendor:tool. */
  tools: z
    .record(
      z.string(),
      z.object({
        perCallUsd: z.number().nonnegative().nullable(),
        note: z.string().optional(),
        source: z.string().nullable(),
        checked: z.string().nullable(),
      }),
    )
    .default({}),
});
export type Tariffs = z.infer<typeof TariffsSchema>;

/** A root without tariffs (a test tree) prices nothing: every row is honestly null. */
export function loadTariffs(root = process.cwd()): Tariffs {
  return loadConfig("tariffs", TariffsSchema, { root, ifMissing: () => ({ models: {}, tools: {} }) });
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

/** The three input rates a tariff implies; cache rates fall back to the base rate, the honest upper bound. */
export function inputRates(t: Tariffs["models"][string]): { input: number; read: number; write: number } | null {
  if (t.inputPerMTok === null) return null;
  return { input: t.inputPerMTok, read: t.cachedInputPerMTok ?? t.inputPerMTok, write: t.cacheWritePerMTok ?? t.inputPerMTok };
}

/** Dollars for a usage, or null when the model has no reviewed tariff. */
export function priceOf(model: string, usage: TokenUsage, tariffs = loadTariffs()): number | null {
  const t = tariffs.models[model];
  const rates = t ? inputRates(t) : null;
  if (!t || !rates || t.outputPerMTok === null) return null;
  const perMTok =
    usage.inputTokens * rates.input +
    (usage.cacheReadTokens ?? 0) * rates.read +
    (usage.cacheWriteTokens ?? 0) * rates.write +
    usage.outputTokens * t.outputPerMTok;
  return Number((perMTok / 1e6).toFixed(6));
}

export function recordSpend(row: SpendRowInput, root = process.cwd()): void {
  const parsed = SpendRowSchema.parse(row);
  const rows = readSpend(root);
  rows.push(parsed);
  const file = spendFile(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    "# Spend ledger — every paid model call, appended by the transport (src/pipeline/spend.ts).\n" +
      "# Tokens are the vendor's report; usd is null unless config/tariffs.yaml carries a reviewed tariff.\n" +
      stringifyYaml(rows, { lineWidth: 0 }),
  );
}

export type { Verb };
