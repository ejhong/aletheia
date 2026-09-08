import {
  latestByKey,
  type CandidateKind,
  type Disposition,
} from "./intake.ts";
import {
  sourceKeys,
  textJaccard,
  textKey,
  TEXT_NEAR,
  TITLE_NEAR,
  titleContainment,
} from "./keys.ts";
import type { LoadedCase } from "./schema.ts";

/**
 * The one coverage diff (docs/AUTOMATION.md, "The verbs"). Every producer
 * calls it before writing anything; it is the only deduplication code in
 * the repository.
 *
 *   coverageDiff(candidates, case) → { novel, seen, probable, declined }
 *
 * `seen` is decided mechanically: an identifier or normalised text key that
 * the ledger or a disposition already carries. `probable` is advisory: a
 * title or statement close enough that a judge should see both. `declined`
 * is the case's current declined set, handed to producers so they may
 * re-propose by naming what changed rather than repeating themselves.
 */

export interface Candidate {
  kind: CandidateKind;
  /** The proposed record id, when the producer assigned one. */
  id?: string;
  title?: string | null;
  statement?: string | null;
  doi?: string | null;
  arxivId?: string | null;
  identifier?: string | null;
  url?: string | null;
}

export interface Seen {
  candidate: Candidate;
  key: string;
  via: "ledger" | "disposition";
  /** The ledger record that carries the key, when via === "ledger". */
  record?: string;
  /** The latest disposition of the key, when via === "disposition". */
  disposition?: Disposition;
}

export interface Probable {
  candidate: Candidate;
  matches: { kind: "source" | "claim" | "research" | "study" | "disposition"; id: string; score: number }[];
}

export interface Coverage {
  novel: Candidate[];
  seen: Seen[];
  probable: Probable[];
  declined: Disposition[];
}

/** Every mechanical key a candidate carries. */
export function candidateKeys(c: Candidate): string[] {
  if (c.kind === "source" || c.kind === "image") return sourceKeys(c);
  const text = c.statement ?? c.title ?? "";
  const k = textKey(text);
  return k ? [k] : [];
}

/** The keys the ledger carries, each mapped to the record that carries it. */
export function ledgerKeys(loaded: LoadedCase): Map<string, string> {
  const out = new Map<string, string>();
  const put = (keys: string[], id: string) => {
    for (const k of keys) if (!out.has(k)) out.set(k, id);
  };
  for (const s of loaded.sources) put(sourceKeys(s), s.id);
  for (const c of loaded.claims) if (c.reviewState !== "rejected") put([textKey(c.statement)].filter(Boolean) as string[], c.id);
  for (const r of loaded.research) put([textKey(r.title)].filter(Boolean) as string[], r.id);
  for (const s of loaded.studies) put([textKey(s.title)].filter(Boolean) as string[], s.id);
  for (const i of loaded.images) put(sourceKeys({ url: i.provenance?.sourceUrl, title: i.depicts }), i.id);
  return out;
}

export function coverageDiff(candidates: Candidate[], loaded: LoadedCase): Coverage {
  const ledger = ledgerKeys(loaded);
  const dispositions = latestByKey(loaded.dispositions);
  const novel: Candidate[] = [];
  const seen: Seen[] = [];
  const probable: Probable[] = [];

  for (const c of candidates) {
    const keys = candidateKeys(c);
    let hit: Seen | null = null;
    for (const key of keys) {
      const record = ledger.get(key);
      if (record) {
        hit = { candidate: c, key, via: "ledger", record };
        break;
      }
      const d = dispositions.get(key);
      if (d) {
        hit = { candidate: c, key, via: "disposition", disposition: d };
        break;
      }
    }
    if (hit) {
      seen.push(hit);
      continue;
    }
    const matches = probableMatches(c, loaded);
    if (matches.length > 0) probable.push({ candidate: c, matches });
    else novel.push(c);
  }

  return {
    novel,
    seen,
    probable,
    declined: [...dispositions.values()].filter((d) => d.disposition !== "in"),
  };
}

function probableMatches(c: Candidate, loaded: LoadedCase): Probable["matches"] {
  const out: Probable["matches"] = [];
  const consider = (kind: Probable["matches"][number]["kind"], id: string, score: number, near: number) => {
    if (score >= near) out.push({ kind, id, score: Number(score.toFixed(2)) });
  };
  if (c.kind === "source" || c.kind === "image") {
    if (c.title) {
      for (const s of loaded.sources) consider("source", s.id, titleContainment(c.title, s.title), TITLE_NEAR);
      for (const d of loaded.dispositions) {
        if (d.kind === "source") consider("disposition", d.key, titleContainment(c.title, d.observed), TITLE_NEAR);
      }
    }
    return dedupe(out);
  }
  const text = c.statement ?? c.title ?? "";
  if (!text) return out;
  if (c.kind === "claim" || c.kind === "evidence") {
    for (const k of loaded.claims) {
      if (k.reviewState === "rejected") continue;
      consider("claim", k.id, textJaccard(text, k.statement), TEXT_NEAR);
    }
  }
  if (c.kind === "research") {
    for (const r of loaded.research) consider("research", r.id, textJaccard(text, `${r.title} ${r.summary}`), TEXT_NEAR);
  }
  if (c.kind === "study") {
    for (const s of loaded.studies) consider("study", s.id, textJaccard(text, `${s.title} ${s.question}`), TEXT_NEAR);
  }
  for (const d of loaded.dispositions) {
    if (d.kind === c.kind) consider("disposition", d.key, textJaccard(text, d.observed), TEXT_NEAR);
  }
  return dedupe(out);
}

function dedupe(matches: Probable["matches"]): Probable["matches"] {
  const best = new Map<string, Probable["matches"][number]>();
  for (const m of matches) {
    const prev = best.get(m.id);
    if (!prev || m.score > prev.score) best.set(m.id, m);
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}
