/**
 * The stable identity of a panel SEAT across model upgrades.
 *
 * A check run's `model` string names the model that produced it
 * ("Kimi K3 (Moonshot, via Venice) — independent check run via kimi-k3").
 * The concurrence panel must report each seat's *current* judgment, so
 * when a seat's model is upgraded (2026-09-05: GPT-5.1 → GPT-5.6 Sol,
 * Kimi K3 → GLM 5.3 Flash) the new run has to supersede the old one
 * rather than sit beside it — otherwise a re-panelled case would count
 * one API vendor twice and let a judgment of superseded content survive.
 * The seat is therefore keyed by the API vendor in the label's
 * parenthetical, with "via X" naming the seat for reseller-hosted models,
 * and falls back to the label's first token for the few early records
 * written without one. Used by the loader, the /panel derivations, and
 * the reconciliation loop, so all three agree on who "a seat" is.
 *
 * @param {string} model
 * @returns {string}
 */
export function seatKey(model) {
  const paren = model.match(/\(([^)]*)\)/);
  if (paren) {
    const inner = paren[1].trim();
    const via = inner.match(/\bvia\s+([^,]+)/i);
    const vendor = (via ? via[1] : inner.split(",")[0]).trim().toLowerCase();
    return SEAT_ALIASES[vendor] ?? vendor;
  }
  return model.trim().split(/[\s,(]/)[0].toLowerCase();
}

/** One early run was labeled "(Claude)" for the Anthropic seat. */
const SEAT_ALIASES = { claude: "anthropic" };
