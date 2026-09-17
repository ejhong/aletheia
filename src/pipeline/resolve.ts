import { titleContainment, TITLE_NEAR } from "../domain/keys.ts";
import { UA } from "./fetch.ts";
import { authorAgreement, bestMatch, type OpenAlexResult, type Reference } from "./match.ts";

/**
 * Leads into documents (2026-09-17). The research seat names works it did not open; the drafter may write no
 * record from a text it was not shown; verify checks only what was proposed. So a named-but-unopened work fell
 * through every verb as a blocked disposition — 139 of the ledger's 176 blocked candidates, most of them not
 * paywalled papers but leads nobody had pinned to a document. This module pins them through the open scholarly
 * indexes — OpenAlex, Semantic Scholar, Europe PMC, the Internet Archive; Google Scholar has no API and forbids
 * robots — and decides by the one matcher the inbox's references already use (src/pipeline/match.ts): a title
 * that is the title, or a named author and the year. What resolves is fetched like any other work and shown to
 * the drafter with how it was found; what does not stays blocked, with the search on the record.
 */

export interface Lead {
  /** The lead as the report wrote it. */
  text: string;
  title?: string;
  authors?: string[];
  year?: string;
}

export interface Resolved {
  title: string;
  year?: string;
  authors: string[];
  doi?: string;
  /** The page or file to read: an open-access PDF where one is known, else the landing page, else the DOI. */
  url: string;
  /** A stable identifier for the source record: doi:…, pmid:…, arxiv:…, archive:…, else url:…. */
  identifier: string;
  /** Which index answered, and with what. */
  via: string;
  /** Title containment of the match (0–1), for the drafter to weigh. */
  similarity: number;
  /** What agreed between the lead and the document: the title, the year, an author — the provenance says exactly this and no more (review note #339). */
  agreed: ("title" | "year" | "author")[];
  /** The checks as they were made — the containment score against its threshold, the year gap, the surname found and the name it was found in — one line each (review note #344). */
  checks: string[];
}

/** An index result in OpenAlex's shape, carrying where it came from and what to read. */
export type IndexedResult = OpenAlexResult & { via: string; identifier: string; url: string };

/**
 * A lead line as the report protocol asks for it — `- <author> et al., <year>, "<title>" — <why>` — parsed leniently:
 * a quoted title, a four-digit year, and the capitalised names before the year as authors. A line with none of
 * these is a bare text lead, searched as it stands.
 */
export function parseLead(line: string): Lead {
  const text = line.replace(/^\s*[-*]\s*/, "").trim();
  const title = /[“"]([^”"]{8,300})[”"]/.exec(text)?.[1]?.trim();
  const year = /\b(1[5-9]\d{2}|20\d{2})[a-z]?\b/.exec(text)?.[1];
  const before = year ? text.slice(0, text.indexOf(year)) : title ? text.slice(0, text.indexOf(title)) : "";
  const authors = before
    .replace(/[“"].*$/, "")
    .split(/,|;|\band\b|&/)
    .map((s) => s.replace(/\bet al\.?/i, "").replace(/[()]/g, "").trim())
    .filter((s) => /^[A-Z][A-Za-z'’\-]+(\s[A-Z][A-Za-z'’\-]+)*$/.test(s) && s.length <= 40);
  return { text, ...(title ? { title } : {}), ...(year ? { year } : {}), ...(authors.length ? { authors } : {}) };
}

/** The leads a report lists under its "Named, not opened" section (report protocol v2); empty when it has none. */
export function leadsNamedInReport(markdown: string): Lead[] {
  const lines = markdown.split("\n");
  const start = lines.findIndex((l) => /^\s*(#+\s*|\d+\.\s*)?\**\s*named,?\s+(but\s+)?not\s+opened/i.test(l));
  if (start === -1) return [];
  const out: Lead[] = [];
  for (const l of lines.slice(start + 1)) {
    if (/^\s*(#+\s|\d+\.\s+\*\*)/.test(l)) break; // the next section
    if (/^\s*[-*]\s+\S/.test(l) && !/^\s*[-*]\s+none\b/i.test(l)) out.push(parseLead(l));
  }
  return out;
}

/** The reference the matcher reads a lead as: the quoted title, else the lead's text; the year and authors when given. */
export function referenceOf(lead: Lead): Reference {
  return { title: lead.title ?? lead.text, authors: lead.authors ?? [], year: lead.year ? Number(lead.year) : null, venue: null, url: null };
}

const getJson = async (url: string, fetchImpl: typeof fetch): Promise<unknown> => {
  try {
    const res = await fetchImpl(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
};
const enc = (q: string) => encodeURIComponent(q.slice(0, 200));
const names = (list: string[]) => list.filter(Boolean).map((n) => ({ author: { display_name: n } }));

async function openAlex(query: string, fetchImpl: typeof fetch): Promise<IndexedResult[]> {
  const j = (await getJson(`https://api.openalex.org/works?search=${enc(query)}&per-page=5`, fetchImpl)) as { results?: Array<{ title?: string; publication_year?: number; doi?: string; authorships?: { author?: { display_name?: string } }[]; open_access?: { oa_url?: string | null }; best_oa_location?: { pdf_url?: string | null; landing_page_url?: string | null } | null }> } | null;
  return (j?.results ?? []).flatMap((w) => {
    if (!w.title) return [];
    const doi = w.doi?.replace(/^https?:\/\/doi\.org\//i, "");
    const url = w.best_oa_location?.pdf_url ?? w.open_access?.oa_url ?? w.best_oa_location?.landing_page_url ?? (doi ? `https://doi.org/${doi}` : null);
    if (!url) return [];
    return [{ title: w.title, publication_year: w.publication_year ?? null, doi: doi ?? null, authorships: (w.authorships ?? []).map((a) => ({ author: { display_name: a.author?.display_name ?? "" } })), open_access: { oa_url: url }, url, identifier: doi ? `doi:${doi}` : `url:${url}`, via: `OpenAlex works search: "${w.title}"${w.publication_year ? ` (${w.publication_year})` : ""}` }];
  });
}

async function semanticScholar(query: string, fetchImpl: typeof fetch): Promise<IndexedResult[]> {
  const j = (await getJson(`https://api.semanticscholar.org/graph/v1/paper/search?query=${enc(query)}&limit=5&fields=title,year,authors,externalIds,openAccessPdf,url`, fetchImpl)) as { data?: Array<{ title?: string; year?: number; authors?: { name?: string }[]; externalIds?: Record<string, string>; openAccessPdf?: { url?: string } | null; url?: string }> } | null;
  return (j?.data ?? []).flatMap((p) => {
    if (!p.title) return [];
    const doi = p.externalIds?.DOI;
    const arxiv = p.externalIds?.ArXiv;
    const url = p.openAccessPdf?.url ?? (arxiv ? `https://arxiv.org/abs/${arxiv}` : doi ? `https://doi.org/${doi}` : p.url);
    if (!url) return [];
    const identifier = doi ? `doi:${doi}` : arxiv ? `arxiv:${arxiv}` : p.externalIds?.PubMed ? `pmid:${p.externalIds.PubMed}` : `url:${url}`;
    return [{ title: p.title, publication_year: p.year ?? null, doi: doi ?? null, authorships: names((p.authors ?? []).map((a) => a.name ?? "")), open_access: { oa_url: url }, url, identifier, via: `Semantic Scholar search: "${p.title}"${p.year ? ` (${p.year})` : ""}` }];
  });
}

async function europePmc(query: string, fetchImpl: typeof fetch): Promise<IndexedResult[]> {
  const j = (await getJson(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${enc(query)}&format=json&pageSize=5`, fetchImpl)) as { resultList?: { result?: Array<{ title?: string; pubYear?: string; authorString?: string; doi?: string; pmid?: string; pmcid?: string; isOpenAccess?: string }> } } | null;
  return (j?.resultList?.result ?? []).flatMap((r) => {
    if (!r.title) return [];
    const url = r.pmcid && r.isOpenAccess === "Y" ? `https://europepmc.org/api/fulltextRepo?pprId=${r.pmcid}&type=FILE&fileName=${r.pmcid}.pdf` : r.pmcid ? `https://europepmc.org/article/PMC/${r.pmcid}` : r.doi ? `https://doi.org/${r.doi}` : null;
    if (!url) return [];
    const title = r.title.replace(/\.$/, "");
    return [{ title, publication_year: r.pubYear ? Number(r.pubYear) : null, doi: r.doi ?? null, authorships: names((r.authorString ?? "").split(",").map((s) => s.trim())), open_access: { oa_url: url }, url, identifier: r.doi ? `doi:${r.doi}` : r.pmid ? `pmid:${r.pmid}` : `url:${url}`, via: `Europe PMC search: "${title}"${r.pubYear ? ` (${r.pubYear})` : ""}` }];
  });
}

async function internetArchive(query: string, fetchImpl: typeof fetch): Promise<IndexedResult[]> {
  const j = (await getJson(`https://archive.org/advancedsearch.php?q=${enc(query)}&fl[]=identifier&fl[]=title&fl[]=year&fl[]=creator&rows=5&output=json`, fetchImpl)) as { response?: { docs?: Array<{ identifier?: string; title?: string | string[]; year?: string | number; creator?: string | string[] }> } } | null;
  return (j?.response?.docs ?? []).flatMap((d) => {
    const title = Array.isArray(d.title) ? d.title[0] : d.title;
    if (!title || !d.identifier) return [];
    const creators = Array.isArray(d.creator) ? d.creator : d.creator ? [d.creator] : [];
    const url = `https://archive.org/details/${d.identifier}`;
    return [{ title, publication_year: d.year ? Number(d.year) : null, doi: null, authorships: names(creators), open_access: { oa_url: url }, url, identifier: `archive:${d.identifier}`, via: `Internet Archive search: "${title}"${d.year ? ` (${d.year})` : ""}` }];
  });
}

/** One query against every open index at once; results in OpenAlex's shape, each saying where it came from. */
export const multiIndexSearch = async (query: string, fetchImpl: typeof fetch = fetch): Promise<IndexedResult[]> =>
  (await Promise.all([openAlex(query, fetchImpl), semanticScholar(query, fetchImpl), europePmc(query, fetchImpl), internetArchive(query, fetchImpl)])).flat();

/** The document a lead names, by the shared matcher, or null when no index result is that work. */
export async function resolveLead(lead: Lead, fetchImpl: typeof fetch = fetch): Promise<Resolved | null> {
  const reference = referenceOf(lead);
  if (reference.title.trim().length < 12) return null;
  const query = [reference.title, reference.authors[0] ?? ""].filter(Boolean).join(" ");
  const results = await multiIndexSearch(query, fetchImpl);
  // Among equal matches, a document to read (an open PDF, an item page) before a bare DOI page.
  const doiPage = (u: string) => (/^https?:\/\/(dx\.)?doi\.org\//i.test(u) ? 1 : 0);
  const ordered = [...results].sort((a, b) => doiPage(a.url) - doiPage(b.url));
  const hit = bestMatch(reference, ordered);
  if (!hit) return null;
  const title = hit.title ?? hit.display_name ?? "";
  // The provenance names what agreed and no more. A lead that gave a year or an author is resolved only when that
  // agrees too — a title alone does not settle which edition, or whose paper, when the lead said (review note #339).
  const similarity = Number(titleContainment(reference.title, title).toFixed(2));
  // The provenance names each check as it was made — the score against its threshold, the year gap, the surname
  // found and where — not a category the check did not earn: "author agreed" would claim more than a surname test
  // (review note #344).
  const agreed: Resolved["agreed"] = [];
  const checks: string[] = [];
  if (similarity >= TITLE_NEAR) agreed.push("title");
  checks.push(`title containment ${similarity} (${similarity >= TITLE_NEAR ? `at or above the ${TITLE_NEAR} threshold` : `below the ${TITLE_NEAR} threshold; taken on the author match`})`);
  if (reference.year && hit.publication_year) {
    const gap = Math.abs(reference.year - hit.publication_year);
    if (gap <= 1) {
      agreed.push("year");
      checks.push(gap === 0 ? `year ${hit.publication_year} exact` : `year within one (the lead said ${reference.year}, the index ${hit.publication_year})`);
    }
  }
  const author = reference.authors.length ? authorAgreement(reference, hit) : null;
  if (author) {
    agreed.push("author");
    checks.push(`author surname "${author.surname}" found in the index's "${author.name}"`);
  }
  if (reference.year && !agreed.includes("year")) return null;
  if (reference.authors.length && !agreed.includes("author")) return null;
  return {
    title,
    ...(hit.publication_year ? { year: String(hit.publication_year) } : {}),
    authors: (hit.authorships ?? []).map((a) => a.author?.display_name ?? "").filter(Boolean),
    ...(hit.doi ? { doi: hit.doi } : {}),
    url: hit.url,
    identifier: hit.identifier,
    via: `${hit.via} — matched on ${checks.join("; ")}`,
    similarity,
    agreed,
    checks,
  };
}
