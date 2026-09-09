/**
 * What this case has been through lately, for the top of its page: the
 * current edition's own account of what changed, the last sittings' run
 * records in a reader's words, and the last content update. Derived from
 * the records the loop writes; nothing is stored for it.
 */
import type { RunRecord } from "./intake.ts";
import type { LoadedCase } from "./schema.ts";
import { currentEdition } from "./editions.ts";
import { lastContentUpdate } from "./history.ts";
import { describeRun, readRuns } from "./runs.ts";

export interface Activity {
  edition: { runId: string; date: string; excerpt: string; rationale: string };
  /** The last completed runs on the case, newest first. */
  sittings: { runId: string; verb: RunRecord["verb"]; date: string; summary: string; usd: number | null }[];
  lastContentUpdate: string;
}

/** The first sentences of a text, whole, up to about `max` characters. */
export function excerpt(text: string, max = 360): string {
  const sentences = text.trim().split(/(?<=[.!?])\s+/);
  let out = "";
  for (const s of sentences) {
    if (out && (out + " " + s).length > max) break;
    out = out ? `${out} ${s}` : s;
    if (out.length >= max) break;
  }
  return out.length > max ? out.slice(0, max - 1).trimEnd() + "…" : out;
}

export function caseActivity(loaded: LoadedCase, root = process.cwd(), limit = 5): Activity {
  const ed = currentEdition(loaded);
  const runs = readRuns(root)
    .filter((r) => r.case === loaded.record.slug && r.outcome === "completed")
    .reverse()
    .slice(0, limit);
  return {
    edition: { runId: ed.runId, date: ed.date, excerpt: excerpt(ed.rationale), rationale: ed.rationale },
    sittings: runs.map((r) => ({ runId: r.runId, verb: r.verb, date: r.date, summary: describeRun(r), usd: r.cost?.usd ?? null })),
    lastContentUpdate: lastContentUpdate(loaded),
  };
}
