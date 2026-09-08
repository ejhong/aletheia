import type { Verb } from "../domain/intake.ts";
import { callVendorDetailed, VENDORS as SEAT_TABLE } from "../../scripts/lib/vendors.mjs";
import { priceOf, recordSpend } from "./spend.ts";

/**
 * The model transport (docs/AUTOMATION.md, "The code"): the one path a
 * verb takes to a model, with the spend ledger inside it. A call names the
 * run it belongs to; the reply comes back with the vendor's usage, and a
 * spend row is written before the caller sees the text. No verb calls a
 * vendor directly.
 *
 * Seats are the panel's own table (scripts/lib/vendors.mjs), so "the
 * model" a stamp names is the same identity everywhere on the site.
 */

export type Seat = {
  key: () => string | undefined;
  model: string;
  label: string;
  tag: string;
  effort: string;
};
export const VENDORS = SEAT_TABLE as Record<string, Seat>;

export interface Meter {
  runId: string;
  verb: Verb;
  case: string | null;
}

export interface Reply {
  text: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  usd: number | null;
}

export function seatAvailable(name: string): boolean {
  return Boolean(VENDORS[name]?.key());
}

export async function callSeat(
  name: string,
  prompt: { system: string; user: string; maxTokens?: number; timeoutMs?: number },
  meter: Meter,
): Promise<Reply> {
  if (!VENDORS[name]) throw new Error(`unknown seat ${name}`);
  const { text, usage, model } = await callVendorDetailed(name, prompt);
  const usd = priceOf(model, usage);
  recordSpend({
    date: new Date().toISOString().slice(0, 10),
    runId: meter.runId,
    verb: meter.verb,
    case: meter.case,
    model,
    calls: 1,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    usd,
  });
  return { text, model, usage, usd };
}
