import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { SpendRowSchema, type Cost, type SpendRow } from "./intake.ts";

/**
 * The spend ledger, read side (governance/spend.yaml): every paid model
 * call, appended by the pipeline's transport, priced only from a reviewed
 * tariff and null otherwise. The pages and the budget guard read it here.
 */
/** The original single ledger: every row through 2026-09-16. Read, never written to, since then. */
export const spendFile = (root = process.cwd()) => path.join(root, "governance", "spend.yaml");
/**
 * Since 2026-09-16 the transport writes one file per run under governance/spend/, so two sittings that
 * overlap never touch the same file: the single ledger made every pair of concurrent chain PRs conflict,
 * and the second sat unmergeable with every check green until a hand resolved it.
 */
export const spendDir = (root = process.cwd()) => path.join(root, "governance", "spend");
/** A run id is already a file name — letters, digits, dot, underscore, hyphen, starting with a letter or digit (every run id the verbs mint is). Anything else is refused, never mapped, so two run ids can never share a file (review note #316). */
export const RUN_ID_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
export const spendRunFile = (runId: string, root = process.cwd()) => {
  if (!RUN_ID_FILE.test(runId)) throw new Error(`run id "${runId}" is not a file name (letters, digits, dot, underscore, hyphen); no spend row can be written for it`);
  return path.join(spendDir(root), `${runId}.yaml`);
};

/** The rows of one ledger file; none when the file is absent. */
export function readSpendFile(file: string): SpendRow[] {
  if (!fs.existsSync(file)) return [];
  const raw = parseYaml(fs.readFileSync(file, "utf8"));
  return Array.isArray(raw) ? raw.map((r) => SpendRowSchema.parse(r)) : [];
}

/** The whole ledger: the single file's rows first, then each run's file in name order (run ids begin with their date). */
export function readSpend(root = process.cwd()): SpendRow[] {
  const dir = spendDir(root);
  const perRun = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".yaml")).sort() : [];
  return [...readSpendFile(spendFile(root)), ...perRun.flatMap((f) => readSpendFile(path.join(dir, f)))];
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
