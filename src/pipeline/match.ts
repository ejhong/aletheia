import { titleContainment, TITLE_NEAR } from "../domain/keys.ts";

/**
 * A named work matched to an index result — the one matcher for every path that turns a name into a document:
 * references named in a supplied text (src/pipeline/references.ts, the inbox) and leads a report names without
 * opening (src/pipeline/resolve.ts, the draft). By title when the text gave one (the title rule, and the year when
 * both have one); when the text described the work rather than naming it, by a named author AND the year with a
 * looser title bar — never by year or a vague phrase alone. Moved here from references.ts on 2026-09-17 so the two
 * paths cannot drift.
 */

export interface Reference {
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  url: string | null;
}

/** An index result in OpenAlex's shape; the other indexes are mapped into it (src/pipeline/resolve.ts). */
export type OpenAlexResult = {
  title?: string | null;
  display_name?: string | null;
  doi?: string | null;
  publication_year?: number | null;
  open_access?: { oa_url?: string | null } | null;
  authorships?: { author?: { display_name?: string | null } | null }[];
};

/** A surname as an essay writes it, lower-cased, without initials or particles' punctuation. */
export const surname = (a: string) => a.split(",")[0].trim().split(/\s+/).at(-1)?.toLowerCase().replace(/[^a-zÀ-ɏ-]/g, "") ?? "";

/** Whether one of the reference's authors is among the result's. */
export function authorMatch(ref: Reference, r: OpenAlexResult): boolean {
  const mine = ref.authors.map(surname).filter((s) => s.length > 2);
  if (!mine.length) return false;
  const theirs = (r.authorships ?? []).map((a) => (a.author?.display_name ?? "").toLowerCase());
  return mine.some((m) => theirs.some((t) => t.split(/\s+/).includes(m) || t.endsWith(` ${m}`)));
}

/** A descriptive reference ("Shah's microdialysis study") matches on author and year with a looser title bar. */
export const TITLE_WITH_AUTHOR = 0.35;

/** Whether two titles share a topical stem — a content word of five letters or more, compared on its first six. */
export function topicOverlap(a: string, b: string): boolean {
  const stems = (t: string) => new Set(t.toLowerCase().match(/[a-zÀ-ɏ]{5,}/g)?.map((w) => w.slice(0, 6)) ?? []);
  const sa = stems(a);
  return [...stems(b)].some((s) => sa.has(s));
}

/**
 * Pure: the result that is the reference. By title when the text gave one (the title rule, and the year when both
 * have one); when the text described the work rather than naming it, by a named author AND the year, with a looser
 * title bar — never by year or a vague phrase alone.
 */
export function bestMatch<T extends OpenAlexResult>(ref: Reference, results: T[]): T | null {
  let best: { r: T; score: number } | null = null;
  for (const r of results) {
    const title = r.title ?? r.display_name ?? "";
    if (!title) continue;
    const yearOk = !ref.year || !r.publication_year || Math.abs(ref.year - r.publication_year) <= 1;
    if (!yearOk) continue;
    const score = titleContainment(ref.title, title);
    const byTitle = score >= TITLE_NEAR;
    const byAuthor = Boolean(ref.year) && Boolean(r.publication_year) && authorMatch(ref, r) && (score >= TITLE_WITH_AUTHOR || topicOverlap(ref.title, title));
    if (!byTitle && !byAuthor) continue;
    const ranked = score + (byTitle ? 1 : 0) + (authorMatch(ref, r) ? 0.5 : 0);
    if (!best || ranked > best.score) best = { r, score: ranked };
  }
  return best?.r ?? null;
}
