/**
 * Durable locators (AGENTS.md §3.8): when a source is admitted, its URL is
 * looked up in the Wayback Machine and, if no recent snapshot exists, saved.
 * The archive URL is written on the source record so the locator outlives
 * the page. Best effort: a slow or refusing archive is a note, never a
 * failed admission.
 */

const UA = "Aletheia/1.0 (+https://github.com/ejhong/aletheia)";
export const WAYBACK_AVAILABLE = "https://archive.org/wayback/available?url=";
export const WAYBACK_SAVE = "https://web.archive.org/save/";

type Availability = { archived_snapshots?: { closest?: { available?: boolean; url?: string; timestamp?: string } } };

/** The closest snapshot an availability reply names, as https, with its timestamp. */
export function snapshotFrom(reply: Availability): { url: string; timestamp: string } | null {
  const c = reply.archived_snapshots?.closest;
  if (!c?.available || !c.url || !c.timestamp) return null;
  return { url: c.url.replace(/^http:\/\//, "https://"), timestamp: c.timestamp };
}

const ageDays = (timestamp: string, now: Date) => {
  const t = Date.UTC(+timestamp.slice(0, 4), +timestamp.slice(4, 6) - 1, +timestamp.slice(6, 8), +timestamp.slice(8, 10) || 0);
  return (now.getTime() - t) / 86_400_000;
};

export interface ArchiveOptions {
  fetchImpl?: typeof fetch;
  /** Reuse an existing snapshot no older than this; otherwise ask for a new one. */
  maxAgeDays?: number;
  /** Ask the archive to save the page when no fresh snapshot exists. */
  save?: boolean;
  now?: Date;
  timeoutMs?: number;
}

export type Archived = { archivedUrl: string | null; note: string };

export async function archiveUrl(url: string, opts: ArchiveOptions = {}): Promise<Archived> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? new Date();
  const lookup = async (): Promise<{ url: string; timestamp: string } | null> => {
    const res = await fetchImpl(WAYBACK_AVAILABLE + encodeURIComponent(url), { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    return snapshotFrom((await res.json()) as Availability);
  };
  try {
    const existing = await lookup();
    if (existing && ageDays(existing.timestamp, now) <= (opts.maxAgeDays ?? 30)) {
      return { archivedUrl: existing.url, note: `Wayback snapshot ${existing.timestamp}` };
    }
    if (opts.save !== false) {
      await fetchImpl(WAYBACK_SAVE + url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(opts.timeoutMs ?? 90_000) }).catch(() => null);
      const saved = await lookup();
      if (saved) return { archivedUrl: saved.url, note: `Wayback snapshot ${saved.timestamp}${ageDays(saved.timestamp, now) > 1 ? " (save requested; older snapshot returned)" : " (saved now)"}` };
    }
    if (existing) return { archivedUrl: existing.url, note: `Wayback snapshot ${existing.timestamp} (older than ${opts.maxAgeDays ?? 30} days; save requested)` };
    return { archivedUrl: null, note: "no Wayback snapshot and the save request did not produce one" };
  } catch (e) {
    return { archivedUrl: null, note: `Wayback unavailable: ${(e as Error).message}` };
  }
}
