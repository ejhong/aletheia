import { isoDate } from "../lib/overlay-ids.mjs";
import { callVendorDetailed, VENDORS as SEAT_TABLE } from "../lib/vendors.mjs";
import { loadTariffs, priceOf, recordSpend, type Meter } from "./spend.ts";

export type { Meter } from "./spend.ts";

/**
 * The model transport (docs/AUTOMATION.md, "The code"): the one path a
 * verb takes to a model, with the spend ledger inside it. A call names the
 * run it belongs to; the reply comes back with the vendor's usage, and a
 * spend row is written before the caller sees the text. No verb calls a
 * vendor directly.
 *
 * Seats are the panel's own table (src/lib/vendors.mjs), so "the
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

export interface Reply {
  text: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number };
  usd: number | null;
}

export function seatAvailable(name: string): boolean {
  return Boolean(VENDORS[name]?.key());
}

export async function callSeat(
  name: string,
  /** `cachedPrefix`: text this call shares with its neighbours (the constitution a panel judges against), placed first and marked as the cache breakpoint on Anthropic (src/lib/vendors.mjs). */
  prompt: { system: string; user: string; maxTokens?: number; timeoutMs?: number; cachedPrefix?: string },
  meter: Meter,
): Promise<Reply> {
  if (!VENDORS[name]) throw new Error(`unknown seat ${name}`);
  const record = (model: string, usage: Reply["usage"]): number | null => {
    const usd = priceOf(model, usage, loadTariffs(meter.root));
    recordSpend(
      {
        date: isoDate(),
        runId: meter.runId,
        verb: meter.verb,
        case: meter.case,
        model,
        calls: 1,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens ?? 0,
        cacheWriteTokens: usage.cacheWriteTokens ?? 0,
        usd,
      },
      meter.root,
    );
    return usd;
  };
  let answered: Awaited<ReturnType<typeof callVendorDetailed>>;
  try {
    answered = await callVendorDetailed(name, prompt);
  } catch (e) {
    // A call that failed after the vendor counted its tokens (an empty reply: the seat thought to its ceiling, or
    // declined) is recorded before the failure goes on: the ledger is the whole bill, a failed seat's share included.
    const billed = e as { usage?: Reply["usage"]; model?: string };
    if (billed.usage && billed.model) record(billed.model, billed.usage);
    throw e;
  }
  const { text, usage, model } = answered;
  return { text, model, usage, usd: record(model, usage) };
}
