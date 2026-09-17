import { UA } from "./fetch.ts";

/**
 * Leads into documents (2026-09-17). The research seat names works it did not open; the drafter may write no
 * record from a text it was not shown; verify checks only what was proposed. So a named-but-unopened work fell
 * through every verb as a blocked disposition — 139 of the ledger's 176 blocked candidates, most of them not
 * paywalled papers but leads nobody had pinned to a document. This module pins them, mechanically, through open
 * scholarly indexes — OpenAlex, Semantic Scholar, Europe PMC, the Internet Archive — and accepts a candidate only
 * when its title, year and an author agree with the lead. Google Scholar has no API and forbids robots; these do
 * not. What resolves is fetched like any other work and shown to the drafter with how it was found; what does not
 * stays blocked, with the search on the record.
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
  /** A stable identifier for the source record: doi:…, pmid:…, arxiv:…, archive:…. */
  identifier: string;
  /** Which index answered, and with what. */
  via: string;
  score: number;
}

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const tokens = (t: string) => norm(t).split(" ").filter((w) => w.length > 2);

/** The share of a lead's title words a candidate title carries (0–1); 0 when the lead is too short to mean anything. */
export function titleScore(lead: string, candidate: string): number {
  const a = tokens(lead);
  if (a.length < 3) return 0;
  const b = new Set(tokens(candidate));
  return a.filter((w) => b.has(w)).length / a.length;
}

/**
 * A lead line as the report protocol asks for it — `- <author> et al., <year>, "<title>" — <why>` — parsed leniently:
 * a quoted title, a four-digit year, and the words before the year as authors. A line with none of these is a
 * bare text lead, searched as it stands.
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
    if (/^\s*[-*]\s+\S/.test(l)) out.push(parseLead(l));
  }
  return out;
}

const surname = (s: string) => norm(s).split(" ").pop() ?? "";
const yearNear = (a?: string, b?: string) => !a || !b || Math.abs(Number(a) - Number(b)) <= 1;
const authorMatch = (lead: Lead, names: string[]) => !lead.authors?.length || lead.authors.some((a) => names.some((n) => norm(n).includes(surname(a))));

type Candidate = Resolved;

/** Accept a candidate only when the lead's title (or, for a bare lead, its text) is carried, the year is near, and an author agrees. */
export function acceptCandidate(lead: Lead, c: Candidate): boolean {
  const need = lead.title ? 0.8 : 0.6;
  return c.score >= need && yearNear(lead.year, c.year) && authorMatch(lead, c.authors);
}

const q = (lead: Lead) => encodeURIComponent((lead.title ?? lead.text).slice(0, 200));
const getJson = async (url: string, fetchImpl: typeof fetch): Promise<unknown> => {
  try {
    const res = await fetchImpl(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
};

async function openAlex(lead: Lead, fetchImpl: typeof fetch): Promise<Candidate[]> {
  const j = (await getJson(`https://api.openalex.org/works?search=${q(lead)}&per-page=5`, fetchImpl)) as { results?: Array<{ title?: string; publication_year?: number; doi?: string; authorships?: { author?: { display_name?: string } }[]; open_access?: { oa_url?: string }; best_oa_location?: { pdf_url?: string; landing_page_url?: string } }> } | null;
  return (j?.results ?? []).flatMap((w) => {
    if (!w.title) return [];
    const doi = w.doi?.replace(/^https?:\/\/doi\.org\//i, "");
    const url = w.best_oa_location?.pdf_url ?? w.open_access?.oa_url ?? w.best_oa_location?.landing_page_url ?? (doi ? `https://doi.org/${doi}` : undefined);
    if (!url) return [];
    return [{ title: w.title, year: w.publication_year ? String(w.publication_year) : undefined, authors: (w.authorships ?? []).map((a) => a.author?.display_name ?? "").filter(Boolean), doi, url, identifier: doi ? `doi:${doi}` : `url:${url}`, via: `OpenAlex works search: "${w.title}"${w.publication_year ? ` (${w.publication_year})` : ""}`, score: titleScore(lead.title ?? lead.text, w.title) }];
  });
}

async function semanticScholar(lead: Lead, fetchImpl: typeof fetch): Promise<Candidate[]> {
  const j = (await getJson(`https://api.semanticscholar.org/graph/v1/paper/search?query=${q(lead)}&limit=5&fields=title,year,authors,externalIds,openAccessPdf,url`, fetchImpl)) as { data?: Array<{ title?: string; year?: number; authors?: { name?: string }[]; externalIds?: Record<string, string>; openAccessPdf?: { url?: string } | null; url?: string }> } | null;
  return (j?.data ?? []).flatMap((p) => {
    if (!p.title) return [];
    const doi = p.externalIds?.DOI;
    const arxiv = p.externalIds?.ArXiv;
    const url = p.openAccessPdf?.url ?? (arxiv ? `https://arxiv.org/abs/${arxiv}` : doi ? `https://doi.org/${doi}` : p.url);
    if (!url) return [];
    const identifier = doi ? `doi:${doi}` : arxiv ? `arxiv:${arxiv}` : p.externalIds?.PubMed ? `pmid:${p.externalIds.PubMed}` : `url:${url}`;
    return [{ title: p.title, year: p.year ? String(p.year) : undefined, authors: (p.authors ?? []).map((a) => a.name ?? "").filter(Boolean), doi, url, identifier, via: `Semantic Scholar search: "${p.title}"${p.year ? ` (${p.year})` : ""}`, score: titleScore(lead.title ?? lead.text, p.title) }];
  });
}

async function europePmc(lead: Lead, fetchImpl: typeof fetch): Promise<Candidate[]> {
  const j = (await getJson(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${q(lead)}&format=json&pageSize=5`, fetchImpl)) as { resultList?: { result?: Array<{ title?: string; pubYear?: string; authorString?: string; doi?: string; pmid?: string; pmcid?: string; isOpenAccess?: string }> } } | null;
  return (j?.resultList?.result ?? []).flatMap((r) => {
    if (!r.title) return [];
    const url = r.pmcid && r.isOpenAccess === "Y" ? `https://europepmc.org/api/fulltextRepo?pprId=${r.pmcid}&type=FILE&fileName=${r.pmcid}.pdf` : r.pmcid ? `https://europepmc.org/article/PMC/${r.pmcid}` : r.doi ? `https://doi.org/${r.doi}` : undefined;
    if (!url) return [];
    return [{ title: r.title.replace(/\.$/, ""), year: r.pubYear, authors: (r.authorString ?? "").split(",").map((s) => s.trim()).filter(Boolean), doi: r.doi, url, identifier: r.doi ? `doi:${r.doi}` : r.pmid ? `pmid:${r.pmid}` : `url:${url}`, via: `Europe PMC search: "${r.title}"${r.pubYear ? ` (${r.pubYear})` : ""}`, score: titleScore(lead.title ?? lead.text, r.title) }];
  });
}

async function internetArchive(lead: Lead, fetchImpl: typeof fetch): Promise<Candidate[]> {
  const j = (await getJson(`https://archive.org/advancedsearch.php?q=${q(lead)}&fl[]=identifier&fl[]=title&fl[]=year&fl[]=creator&rows=5&output=json`, fetchImpl)) as { response?: { docs?: Array<{ identifier?: string; title?: string | string[]; year?: string | number; creator?: string | string[] }> } } | null;
  return (j?.response?.docs ?? []).flatMap((d) => {
    const title = Array.isArray(d.title) ? d.title[0] : d.title;
    if (!title || !d.identifier) return [];
    const creators = Array.isArray(d.creator) ? d.creator : d.creator ? [d.creator] : [];
    return [{ title, year: d.year ? String(d.year) : undefined, authors: creators, url: `https://archive.org/details/${d.identifier}`, identifier: `archive:${d.identifier}`, via: `Internet Archive search: "${title}"${d.year ? ` (${d.year})` : ""}`, score: titleScore(lead.title ?? lead.text, title) }];
  });
}

/** The best matching document for a lead across the open indexes, or null when none agrees on title, year and author. */
export async function resolveLead(lead: Lead, fetchImpl: typeof fetch = fetch): Promise<Resolved | null> {
  const found = (await Promise.all([openAlex(lead, fetchImpl), semanticScholar(lead, fetchImpl), europePmc(lead, fetchImpl), internetArchive(lead, fetchImpl)])).flat();
  // Best title match first; among equals, a document to read (an open PDF, an item page) before a bare DOI page.
  const doiPage = (u: string) => /^https?:\/\/(dx\.)?doi\.org\//i.test(u) ? 1 : 0;
  const ok = found.filter((c) => acceptCandidate(lead, c)).sort((a, b) => b.score - a.score || doiPage(a.url) - doiPage(b.url));
  return ok[0] ?? null;
}
