/**
 * Mechanical keys for candidates (docs/AUTOMATION.md, "The verbs" — the
 * coverage diff). One implementation, used by every producer and by the
 * loader. Folds together what three scripts used to do separately: the
 * promoter's identifier extraction (DOIs with balanced parentheses), the
 * watch's title matching (containment, because journals retitle preprints
 * by adding or dropping words), and the extraction pipeline's statement
 * similarity (Jaccard over content words).
 *
 * Identifier equality is mechanical and decides. Title and text similarity
 * are advisory: they report a probable duplicate for a judge, never decide.
 */

export type KeyKind = "doi" | "arxiv" | "url" | "title" | "text";

/** Strip trailing punctuation without cutting a balanced DOI suffix like "(12)". */
function citationEnd(value: string): string {
  let out = value.replace(/[.,;:]+$/, "");
  for (const [open, close] of [["(", ")"], ["[", "]"]] as const) {
    while (out.endsWith(close) && out.split(close).length > out.split(open).length) {
      out = out.slice(0, -1).replace(/[.,;:]+$/, "");
    }
  }
  return out;
}

/** A DOI from a bare DOI, a "DOI: …" note, or a doi.org URL (URL-decoded). */
export function normalizeDoi(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let text = String(raw).trim();
  if (/^https?:\/\/(?:dx\.)?doi\.org\//i.test(text)) {
    try {
      text = decodeURIComponent(new URL(text).pathname.slice(1));
    } catch {
      return null;
    }
  }
  const m = text.match(/\b10\.\d{4,9}\/[^\s"'<>]+/i);
  return m ? citationEnd(m[0]).toLowerCase() : null;
}

/** An arXiv id without its version, from an id, an "arXiv:" note, or an arxiv.org URL. */
export function normalizeArxiv(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = String(raw).match(
    /(?:\barxiv(?:\.org)?[:\s/]*(?:abs\/|pdf\/)?|^\s*)(\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?(?:\.pdf)?(?=$|[\s?#)\],;])/i,
  );
  return m?.[1]?.toLowerCase() ?? null;
}

const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref$)/i;

/**
 * A canonical URL: http(s) only, lowercase scheme and host, `www.` dropped,
 * tracking parameters and fragment removed, trailing slash removed. Path
 * case and the remaining query are kept — they may name different material.
 */
export function canonicalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(String(raw).trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const params = new URLSearchParams(
    [...url.searchParams.entries()]
      .filter(([k]) => !TRACKING_PARAMS.test(k))
      .sort(([a], [b]) => a.localeCompare(b)),
  ).toString();
  const query = params ? `?${params}` : "";
  const path = url.pathname.replace(/\/+$/, "");
  return `${host}${path}${query}`;
}

/** Lowercase alphanumerics and single spaces — the watch seen-list's title form. */
export function normalizeText(raw: string | null | undefined): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const STOP_WORDS = new Set(
  "a an and are as at be by for from has have in into is it its of on or that the this to was were which with within without not no".split(" "),
);

export function contentTokens(text: string | null | undefined): Set<string> {
  return new Set(
    normalizeText(text)
      .split(" ")
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
  );
}

/**
 * Overlap of two titles as a fraction of the shorter one (0–1). Containment
 * rather than Jaccard: the arXiv and journal versions of one paper share
 * most content words but the journal adds or drops a few, which Jaccard
 * punishes and containment does not.
 */
export function titleContainment(a: string, b: string): number {
  const [x, y] = [contentTokens(a), contentTokens(b)];
  if (x.size === 0 || y.size === 0) return 0;
  let shared = 0;
  for (const t of x) if (y.has(t)) shared++;
  return shared / Math.min(x.size, y.size);
}

/** Jaccard over content words — the extraction pipeline's statement similarity. */
export function textJaccard(a: string, b: string): number {
  const [x, y] = [contentTokens(a), contentTokens(b)];
  if (x.size === 0 || y.size === 0) return 0;
  let shared = 0;
  for (const t of x) if (y.has(t)) shared++;
  return shared / (x.size + y.size - shared);
}

/** Above this, two titles are probably the same work in two venues (watch's threshold). */
export const TITLE_NEAR = 0.7;
/** Above this, two propositions are probably one claim twice (extraction's threshold). */
export const TEXT_NEAR = 0.55;

export interface SourceLike {
  doi?: string | null;
  arxivId?: string | null;
  identifier?: string | null;
  url?: string | null;
  title?: string | null;
}

/** Every mechanical key a source-like thing carries, most specific first. */
export function sourceKeys(src: SourceLike): string[] {
  const fields = [src.doi, src.arxivId, src.identifier, src.url];
  const doi = fields.map(normalizeDoi).find(Boolean) ?? null;
  const arxiv = fields.map(normalizeArxiv).find(Boolean) ?? null;
  const url = canonicalUrl(src.url);
  const title = normalizeText(src.title);
  return [
    doi && `doi:${doi}`,
    arxiv && `arxiv:${arxiv}`,
    url && `url:${url}`,
    title.length > 12 && `title:${title}`,
  ].filter((k): k is string => Boolean(k));
}

/** The key for a proposition (claim, research item, study, edition change). */
export function textKey(statement: string): string | null {
  const t = normalizeText(statement);
  return t.length > 12 ? `text:${t}` : null;
}

export function keyKind(key: string): KeyKind {
  return key.slice(0, key.indexOf(":")) as KeyKind;
}
