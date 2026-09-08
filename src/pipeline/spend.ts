import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";
import { SpendRowSchema, type Cost, type SpendRow, type SpendRowInput, type Verb } from "../domain/intake.ts";
import { loadConfig } from "./config.ts";

/**
 * The spend ledger (docs/AUTOMATION.md, "The code"): one place, inside the
 * model transport, so every paid call is recorded by construction. Rows
 * carry the vendor's reported tokens; dollars are computed ONLY from a
 * reviewed tariff in config/tariffs.yaml, and are null otherwise — the
 * ledger never estimates a price it was not given.
 */

export const spendFile = (root = process.cwd()) => path.join(root, "governance", "spend.yaml");

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

export function readSpend(root = process.cwd()): SpendRow[] {
  const file = spendFile(root);
  if (!fs.existsSync(file)) return [];
  const raw = parseYaml(fs.readFileSync(file, "utf8"));
  return Array.isArray(raw) ? raw.map((r) => SpendRowSchema.parse(r)) : [];
}

/** Sum a set of spend rows into a run's cost. */
export function sumCost(rows: SpendRow[]): Cost {
  const usd = rows.every((r) => r.usd !== null) && rows.length > 0
    ? Number(rows.reduce((n, r) => n + (r.usd ?? 0), 0).toFixed(6))
    : rows.length === 0
      ? 0
      : null;
  return {
    calls: rows.length,
    // Every input token the model processed, cached or not.
    inputTokens: rows.reduce((n, r) => n + r.inputTokens + r.cacheReadTokens + r.cacheWriteTokens, 0),
    outputTokens: rows.reduce((n, r) => n + r.outputTokens, 0),
    usd,
  };
}

export function spendFor(runId: string, root = process.cwd()): SpendRow[] {
  return readSpend(root).filter((r) => r.runId === runId);
}

export function spendByCase(root = process.cwd()): Record<string, Cost> {
  const out: Record<string, SpendRow[]> = {};
  for (const r of readSpend(root)) (out[r.case ?? "(site)"] ??= []).push(r);
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, sumCost(v)]));
}

export type { Verb };
