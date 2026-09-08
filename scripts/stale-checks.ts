#!/usr/bin/env node
/**
 * Print the case directories whose blind panel is stale — no check exists,
 * the ledger moved after a counted check judged it (hash first, date
 * fallback), or the adopted assessment is a reconsideration no fresh blind
 * check has judged — one per line, for the content-response workflow to
 * re-panel. The rule lives once, in src/domain/load.ts (`checksStale`);
 * this script only prints its answer.
 */
import { checksStale, loadAllCases } from "../src/domain/load.ts";

for (const loaded of loadAllCases()) {
  if (checksStale(loaded)) console.log(loaded.dir);
}
