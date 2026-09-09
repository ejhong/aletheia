import { titleContainment, TITLE_NEAR } from "../domain/keys.ts";
import { MODELS } from "../../scripts/lib/models.mjs";
import { anthropicJson } from "./models.ts";
import { loadProtocol, renderProtocol } from "./protocols.ts";
import type { Meter } from "./spend.ts";

/**
 * Sources named in supplied text, resolved to locators the retrieval layer
 * can read. An essay or a note names works without linking them; the drafter
 * may only quote text it was shown, so every named work must first become a
 * URL. The reader lists the references (protocol references-v1); OpenAlex
 * matches each by title, and only a match the title-similarity rule accepts
 * counts — an unmatched reference is reported as such, never guessed.
 */

export interface Reference {
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  url: string | null;
}

export const REFERENCES_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["references"],
  properties: {
    references: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "authors", "year", "venue", "url"],
        properties: {
          title: { type: "string" },
          authors: { type: "array", items: { type: "string" } },
          year: { type: ["integer", "null"] },
          venue: { type: ["string", "null"] },
          url: { type: ["string", "null"] },
        },
      },
    },
  },
};

export type ReferenceLister = (text: string, meter: Meter) => Promise<Reference[]>;

export const defaultLister: ReferenceLister = async (text, meter) => {
  const protocol = loadProtocol("references");
  const r = await anthropicJson<{ references: Reference[] }>(
    { ...MODELS.reader, system: renderProtocol(protocol, {}), user: text, schema: REFERENCES_SCHEMA, maxTokens: 16000, effort: "low" },
    meter,
  );
  return r.data.references;
};

type OpenAlexResult = {
  title?: string | null;
  display_name?: string | null;
  doi?: string | null;
  publication_year?: number | null;
  open_access?: { oa_url?: string | null } | null;
  authorships?: { author?: { display_name?: string | null } | null }[];
};

/** A surname as an essay writes it, lower-cased, without initials or particles' punctuation. */
const surname = (a: string) => a.split(",")[0].trim().split(/\s+/).at(-1)?.toLowerCase().replace(/[^a-z\u00C0-\u024F-]/g, "") ?? "";

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
  const stems = (t: string) => new Set(t.toLowerCase().match(/[a-z\u00C0-\u024F]{5,}/g)?.map((w) => w.slice(0, 6)) ?? []);
  const sa = stems(a);
  return [...stems(b)].some((s) => sa.has(s));
}

export interface Resolved {
  reference: Reference;
  doi: string | null;
  url: string | null;
  matched: string | null;
  /** Title similarity of the match (0–1), for the drafter to weigh; null when the text gave the locator. */
  similarity: number | null;
  note: string;
}

/**
 * Pure: the OpenAlex result that is the reference. By title when the text
 * gave one (the title rule, and the year when both have one); when the text
 * described the work rather than naming it, by a named author AND the year,
 * with a looser title bar — never by year or a vague phrase alone.
 */
export function bestMatch(ref: Reference, results: OpenAlexResult[]): OpenAlexResult | null {
  let best: { r: OpenAlexResult; score: number } | null = null;
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

export type Searcher = (query: string) => Promise<OpenAlexResult[]>;

export const openAlexSearch: Searcher = async (query) => {
  const res = await fetch(`https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=8&select=title,display_name,doi,publication_year,open_access,authorships`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Aletheia/1.0; +https://github.com/ejhong/aletheia)", Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return [];
  return ((await res.json()) as { results?: OpenAlexResult[] }).results ?? [];
};

/** A reference with a URL or DOI already written keeps it; the rest are matched by title. */
export async function resolveReferences(refs: Reference[], search: Searcher = openAlexSearch): Promise<Resolved[]> {
  const out: Resolved[] = [];
  for (const reference of refs) {
    if (reference.url) {
      const doi = reference.url.match(/10\.\d{4,9}\/[^\s"<>#?]+/)?.[0] ?? null;
      out.push({ reference, doi, url: doi ? `https://doi.org/${doi}` : reference.url, matched: null, similarity: null, note: "locator written in the text" });
      continue;
    }
    if (reference.title.trim().length < 12) {
      out.push({ reference, doi: null, url: null, matched: null, similarity: null, note: "title too short to match" });
      continue;
    }
    let results: OpenAlexResult[] = [];
    try {
      // The first author's surname sharpens a descriptive title; OpenAlex's search is full-text relevance.
      const query = [reference.title, reference.authors[0] ? surname(reference.authors[0]) : ""].filter(Boolean).join(" ");
      results = await search(query);
    } catch (e) {
      out.push({ reference, doi: null, url: null, matched: null, similarity: null, note: `OpenAlex lookup failed: ${(e as Error).message}` });
      continue;
    }
    const hit = bestMatch(reference, results);
    if (!hit) {
      out.push({ reference, doi: null, url: null, matched: null, similarity: null, note: results.length ? "no OpenAlex result close enough" : "no OpenAlex result" });
      continue;
    }
    const doi = hit.doi?.replace(/^https?:\/\/doi\.org\//, "") ?? null;
    const matchedTitle = hit.title ?? hit.display_name ?? "";
    const similarity = Number(titleContainment(reference.title, matchedTitle).toFixed(2));
    const how = similarity >= TITLE_NEAR ? `candidate by title (similarity ${similarity})` : `candidate by author and year (title similarity ${similarity})`;
    out.push({ reference, doi, url: doi ? `https://doi.org/${doi}` : hit.open_access?.oa_url ?? null, matched: matchedTitle || null, similarity, note: doi ? `${how} — confirm from the retrieved text before anchoring anything to it` : `${how}; no DOI, open-access URL used — confirm before use` });
  }
  return out;
}
