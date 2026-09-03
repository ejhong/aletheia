/**
 * Assessment-overlay run ids.
 *
 * Extracted from the two scripts that mint them (cross-model-check.mjs,
 * reassess-changed.mjs) because the id carries two invariants that a
 * comment cannot enforce, and #156 is what it costs when one breaks:
 *
 * UNIQUE WITHOUT LOOKING AT THE FILESYSTEM. The namespace that must be
 * unique is the merged git history, not one checkout. The original scheme
 * probed `fs.existsSync` and suffixed -r2 on collision; two runs
 * branching off the same `main` each saw no file and each took the same
 * name, colliding on merge and — since the id IS the runId — minting two
 * panel runs under one runId, which breaks revert-by-runId
 * (docs/MAINTENANCE.md) and the §3.15 reconstruction guarantee. A clock
 * reading needs no lookup, so concurrent runs cannot agree on it.
 *
 * MONOTONIC, NOT MERELY UNIQUE. `latestCheckPerModel` in
 * src/domain/load.ts breaks same-date ties by string-comparing runIds. A
 * random token (which the auto- overlays used) is collision-safe but
 * orders arbitrarily, so the morning's draft could outrank the
 * afternoon's. A UTC time-of-day sorts chronologically as a string, and
 * any suffixed id sorts after a legacy unsuffixed one sharing its prefix,
 * so overlays minted before this change keep their order.
 *
 * The date stays the first 10 characters, which is what date-ordering and
 * any `runId.slice(0, 10)` reader depend on.
 */

/**
 * UTC time-of-day as HHMMSS — lexically sortable, no separators.
 *
 * @param {Date} [now]
 * @returns {string}
 */
export function hhmmssUTC(now = new Date()) {
  return now.toISOString().slice(11, 19).replace(/:/g, "");
}

/**
 * Build an overlay run id from its parts plus a UTC timestamp.
 *
 * `exists` is a local-collision probe that only settles the one case a
 * clock cannot — two ids minted in the SAME SECOND in the SAME tree.
 * Across branches the timestamps already differ, so it is a tiebreak,
 * never the uniqueness mechanism.
 *
 * @param {string[]} parts e.g. ["2026-09-03", "check", "gpt"] or [date, "auto"]
 * @param {{ now?: Date, exists?: (id: string) => boolean }} [opts]
 * @returns {string}
 */
export function overlayRunId(parts, { now = new Date(), exists = () => false } = {}) {
  const stem = [...parts, hhmmssUTC(now)].join("-");
  let id = stem;
  for (let n = 2; exists(id); n++) id = `${stem}-r${n}`;
  return id;
}
