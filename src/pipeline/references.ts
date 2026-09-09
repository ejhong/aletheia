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

type OpenAlexResult = { title?: string | null; display_name?: string | null; doi?: string | null; publication_year?: number | null; open_access?: { oa_url?: string | null } | null };

export interface Resolved {
  reference: Reference;
  doi: string | null;
  url: string | null;
  matched: string | null;
  note: string;
}

/** Pure: the OpenAlex result that is the reference, by the title rule (and the year when both have one). */
export function bestMatch(ref: Reference, results: OpenAlexResult[]): OpenAlexResult | null {
  let best: { r: OpenAlexResult; score: number } | null = null;
  for (const r of results) {
    const title = r.title ?? r.display_name ?? "";
    if (!title) continue;
    const score = titleContainment(ref.title, title);
    if (score < TITLE_NEAR) continue;
    if (ref.year && r.publication_year && Math.abs(ref.year - r.publication_year) > 1) continue;
    if (!best || score > best.score) best = { r, score };
  }
  return best?.r ?? null;
}

export type Searcher = (query: string) => Promise<OpenAlexResult[]>;

export const openAlexSearch: Searcher = async (query) => {
  const res = await fetch(`https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=5`, {
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
      out.push({ reference, doi, url: doi ? `https://doi.org/${doi}` : reference.url, matched: null, note: "locator written in the text" });
      continue;
    }
    if (reference.title.trim().length < 12) {
      out.push({ reference, doi: null, url: null, matched: null, note: "title too short to match" });
      continue;
    }
    let results: OpenAlexResult[] = [];
    try {
      results = await search(reference.title);
    } catch (e) {
      out.push({ reference, doi: null, url: null, matched: null, note: `OpenAlex lookup failed: ${(e as Error).message}` });
      continue;
    }
    const hit = bestMatch(reference, results);
    if (!hit) {
      out.push({ reference, doi: null, url: null, matched: null, note: results.length ? "no OpenAlex result close enough in title" : "no OpenAlex result" });
      continue;
    }
    const doi = hit.doi?.replace(/^https?:\/\/doi\.org\//, "") ?? null;
    out.push({ reference, doi, url: doi ? `https://doi.org/${doi}` : hit.open_access?.oa_url ?? null, matched: hit.title ?? hit.display_name ?? null, note: doi ? "matched by title on OpenAlex" : "matched by title on OpenAlex; no DOI, open-access URL used" });
  }
  return out;
}
