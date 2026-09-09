/** History: the case changelog, what counts as housekeeping, the last content update, and the site-wide feed. */
import { type ChangeLogEntry, type LoadedCase } from "./schema.ts";

/**
 * Display-layer classification of history entries. History files are
 * append-only, so past entries are never rewritten to carry `kind`; this
 * heuristic ranks them for the homepage feed instead (an explicit `kind`
 * on new entries always wins). Epistemic changes lead; artwork, watch
 * configuration, and tooling are housekeeping.
 */
export function isHousekeepingEntry(entry: ChangeLogEntry): boolean {
  if (entry.kind) return entry.kind === "housekeeping";
  return /literature watch|watch\.yaml|cover art|cover candidates|artwork|style-v2|generate-case-art|images\.yaml/i.test(
    entry.change,
  );
}

/**
 * Date shown on the case dossier as "last update": the newest
 * content-bearing history entry. Housekeeping (art, watch config) does
 * not count. Falls back to `lastReviewed` when the log has no content
 * entries — that field is a hand-set human-review date on the case
 * record, not auto-updated by intake.
 */
export function lastContentUpdate(loaded: {
  record: { lastReviewed: string };
  history: ChangeLogEntry[];
}): string {
  const newest = loaded.history
    .filter((h) => !isHousekeepingEntry(h))
    .map((h) => h.date)
    .sort()
    .at(-1);
  return newest ?? loaded.record.lastReviewed;
}

/** A change-log entry attributed to its case, for cross-case feeds. */
export type FeedEntry = ChangeLogEntry & {
  caseTitle: string;
  caseSlug: string;
};

/** The slice of a LoadedCase the feed needs (narrow for testability). */
type FeedCase = {
  record: { title: string; slug: string };
  history: ChangeLogEntry[];
};

/**
 * History entries newest-first. Dates are day-granular and history files are
 * append-only logs, so same-date entries are ordered by file position with
 * the later-appended entry treated as the more recent one.
 */
export function historyNewestFirst<T extends ChangeLogEntry>(
  entries: T[],
): T[] {
  return entries
    .map((entry, i) => ({ entry, i }))
    .sort((a, b) => b.entry.date.localeCompare(a.entry.date) || b.i - a.i)
    .map(({ entry }) => entry);
}

/**
 * Cross-case "recent changes" feed, capped at `limit` entries.
 *
 * Entries are selected round-robin by per-case recency rank: every case's
 * single most recent entry is admitted before any case's second entry, and
 * so on. This guarantees a burst of same-day activity on one case cannot
 * evict another case's latest change (e.g. a brand-new case launch) from
 * the capped feed. Display order is newest-first by date; within a rank,
 * newer dates win the remaining slots.
 */
export function recentChanges(cases: FeedCase[], limit: number): FeedEntry[] {
  const perCase = cases.map((c) =>
    historyNewestFirst(
      c.history.map((h) => ({
        ...h,
        caseTitle: c.record.title,
        caseSlug: c.record.slug,
      })),
    ),
  );
  const selected: FeedEntry[] = [];
  for (let rank = 0; selected.length < limit; rank++) {
    const atRank = perCase
      .map((h) => h[rank])
      .filter((e): e is FeedEntry => e !== undefined)
      .sort((a, b) => b.date.localeCompare(a.date));
    if (atRank.length === 0) break;
    selected.push(...atRank.slice(0, limit - selected.length));
  }
  // Stable sort: same-date entries keep selection priority (rank) order.
  return [...selected].sort((a, b) => b.date.localeCompare(a.date));
}
