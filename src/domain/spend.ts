import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { SpendRowSchema, type Cost, type SpendRow } from "./intake.ts";

/**
 * The spend ledger, read side (governance/spend.yaml): every paid model
 * call, appended by the pipeline's transport, priced only from a reviewed
 * tariff and null otherwise. The pages and the budget guard read it here.
 */
export const spendFile = (root = process.cwd()) => path.join(root, "governance", "spend.yaml");

export function readSpend(root = process.cwd()): SpendRow[] {
  const file = spendFile(root);
  if (!fs.existsSync(file)) return [];
  const raw = parseYaml(fs.readFileSync(file, "utf8"));
  return Array.isArray(raw) ? raw.map((r) => SpendRowSchema.parse(r)) : [];
}

/** Sum a set of spend rows into a cost; dollars only when every row was priced. */
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

/**
 * Dollars spent by rows matching a date prefix (a day "2026-09-09" or a month
 * "2026-09"): the sum of the priced rows, and the count of rows no tariff
 * priced — said separately, so a total is never silently a floor.
 */
export function spentOn(rows: SpendRow[], prefix: string): { usd: number; rows: number; unpriced: number } {
  const hit = rows.filter((r) => r.date.startsWith(prefix));
  return {
    usd: Number(hit.reduce((n, r) => n + (r.usd ?? 0), 0).toFixed(2)),
    rows: hit.length,
    unpriced: hit.filter((r) => r.usd === null).length,
  };
}
