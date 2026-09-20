import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * Retrieval for the drafter and the verifier: the text of a source, as the
 * model will be shown it. HTML is reduced to text; a PDF is read page by
 * page with page markers, so a locator can name the page; anything else is
 * reported, never guessed at. When a URL will not serve (a login wall, a
 * bot challenge, a dead link) and the work has a DOI, OpenAlex is asked for
 * an open-access copy and that is read instead — with `via` recording where
 * the text actually came from; a PubMed Central page that will not serve is
 * read from Europe PMC's full-text service, and a DOI with no open copy is
 * looked up there for its PMCID. A source whose text cannot be retrieved is
 * `blocked` with the route, not read from memory.
 *
 * The first paid day (2026-09-08) is why: six of ten sources a good report
 * proposed were PDFs or walled pages, and the ledger admitted a proponent
 * web page while the primary papers that answered it stayed out.
 */

export interface FetchedSource {
  url: string;
  ok: boolean;
  status: number | null;
  contentType: string | null;
  /** Plain text, capped; null when the body is not text. */
  text: string | null;
  reason?: string;
  /** Where the text came from when not from `url` itself (an open-access copy). */
  via?: string;
  /**
   * True when the text is a stand-in for the cited document — an open-access copy, an arXiv PDF read for an
   * abstract page — set only where the fetch layer chose that stand-in. Verify treats a quote missed in a
   * stand-in as unverified (blocked, with a route to the cited text), never as false (review notes #315, #318).
   */
  substitute?: boolean;
  /** The document's own title where one was read — the HTML <title> or citation_title, the PDF metadata title — kept even when the text could not be, so an unreadable document can still be matched to the record that cites it. */
  pageTitle?: string;
  /** Page count, for PDFs. */
  pages?: number;
  /** For a supplied document: the permission line the intake recorded, which a Source proposed from it must carry verbatim (§3.15). */
  permission?: string;
}

export const UA = "Mozilla/5.0 (compatible; Aletheia/1.0; +https://github.com/ejhong/aletheia)";
const ACCEPT = "text/html,application/xhtml+xml,application/pdf,text/plain;q=0.9,*/*;q=0.5";
export const MAX_CHARS = 120_000;

const SUPERSCRIPT: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻" };
/** Superscript digits as the page renders them (mm², 10³), so a quote of a unit or a power reads the same from HTML, JATS and a PDF. */
const renderSup = (markup: string) => markup.replace(/<sup>([0-9+-]+)<\/sup>/gi, (_, d: string) => [...d].map((c) => SUPERSCRIPT[c] ?? c).join(""));

export function stripHtml(html: string): string {
  return renderSup(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li|tr|br|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

/** The text of a PDF, page by page, each page headed `[p. N]` so a quote can carry its page. */
export async function pdfText(bytes: Uint8Array, maxPages = 150): Promise<{ text: string; pages: number; title?: string }> {
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true, disableFontFace: true, verbosity: 0 }).promise;
  let title: string | undefined;
  try {
    const meta = (await doc.getMetadata()) as { info?: { Title?: unknown } };
    const t = meta?.info?.Title;
    if (typeof t === "string" && t.trim().length >= 3) title = t.trim();
  } catch {
    title = undefined;
  }
  try {
    const n = Math.min(doc.numPages, maxPages);
    const parts: string[] = [];
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const line = content.items
        .map((it) => ("str" in it ? it.str + (it.hasEOL ? "\n" : " ") : ""))
        .join("")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/ {2,}/g, " ")
        .trim();
      parts.push(`[p. ${i}]\n${line}`);
    }
    if (doc.numPages > n) parts.push(`[${doc.numPages - n} more pages not extracted]`);
    return { text: parts.join("\n\n"), pages: doc.numPages };
  } finally {
    await doc.cleanup();
  }
}

const isPdf = (type: string, url: string, bytes: Uint8Array) =>
  type.includes("pdf") || url.toLowerCase().split(/[?#]/)[0].endsWith(".pdf") || (bytes.length > 4 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-");

/**
 * A 200 that is not the page: bot challenges and consent walls serve a short
 * interstitial with a success status (Nature's "Client Challenge", 2026-09-08).
 * Treated as not retrieved, so the open-access fallback runs and no quote is
 * ever checked against a challenge page.
 */
export function looksLikeWall(text: string): string | null {
  const head = text.slice(0, 1500).toLowerCase();
  const patterns: [RegExp, string][] = [
    [/client challenge|a required part of this site couldn.t load/, "bot challenge page"],
    [/just a moment\.\.\.|checking your browser|verify you are human|are you a robot/, "bot challenge page"],
    [/enable javascript and cookies to continue|please enable cookies/, "bot challenge page"],
    [/access denied|you don.t have permission to access/, "access denied page"],
    [/attention required!? *\| *cloudflare/, "bot challenge page"],
  ];
  if (text.length < 4000) for (const [re, why] of patterns) if (re.test(head)) return why;
  return null;
}

const cap = (text: string, max: number) =>
  text.length > max ? text.slice(0, max) + `\n\n[truncated at ${max} characters of ${text.length}]` : text;

/** The title a page gives itself: citation_title (scholarly pages) first, else <title>; entities decoded, whitespace folded. */
export function htmlTitle(body: string): string | undefined {
  const head = body.slice(0, 200_000);
  const meta = /<meta[^>]+(?:name|property)=["'](?:citation_title|og:title|dc\.title)["'][^>]*content=["']([^"']{3,300})["']/i.exec(head)?.[1] ?? /<meta[^>]+content=["']([^"']{3,300})["'][^>]*(?:name|property)=["'](?:citation_title|og:title|dc\.title)["']/i.exec(head)?.[1];
  const tag = /<title[^>]*>([^<]{3,300})<\/title>/i.exec(head)?.[1];
  const raw = (meta ?? tag)?.replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
  return raw && raw.length >= 3 ? raw : undefined;
}

export async function fetchSource(
  url: string,
  opts: { timeoutMs?: number; maxChars?: number; fetchImpl?: typeof fetch } = {},
): Promise<FetchedSource> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: { "User-Agent": UA, Accept: ACCEPT, "Accept-Language": "en" },
      redirect: "follow",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
    });
  } catch (e) {
    return { url, ok: false, status: null, contentType: null, text: null, reason: `fetch failed: ${(e as Error).message}` };
  }
  const contentType = res.headers.get("content-type");
  if (!res.ok) {
    return { url, ok: false, status: res.status, contentType, text: null, reason: `HTTP ${res.status}` };
  }
  const type = (contentType ?? "").toLowerCase();
  const bytes = new Uint8Array(await res.arrayBuffer());
  const max = opts.maxChars ?? MAX_CHARS;
  if (isPdf(type, url, bytes)) {
    try {
      const { text, pages, title } = await pdfText(bytes);
      if (!text.replace(/\[p\. \d+\]/g, "").trim()) {
        return { url, ok: false, status: res.status, contentType, text: null, pages, reason: `PDF has no extractable text (${pages} pages; scanned images need OCR)`, ...(title ? { pageTitle: title } : {}) };
      }
      return { url, ok: true, status: res.status, contentType, text: cap(text, max), pages, ...(title ? { pageTitle: title } : {}) };
    } catch (e) {
      return { url, ok: false, status: res.status, contentType, text: null, reason: `PDF text extraction failed: ${(e as Error).message}` };
    }
  }
  if (!(type.includes("html") || type.includes("text") || type.includes("xml") || type === "")) {
    return { url, ok: false, status: res.status, contentType, text: null, reason: `unsupported content type ${contentType}` };
  }
  const body = new TextDecoder().decode(bytes);
  const html = type.includes("html") || /<html/i.test(body.slice(0, 2000));
  const pageTitle = html ? htmlTitle(body) : undefined;
  const text = html ? stripHtml(body) : body.trim();
  const wall = looksLikeWall(text);
  if (wall) return { url, ok: false, status: res.status, contentType, text: null, reason: `${wall} served with HTTP ${res.status}`, ...(pageTitle ? { pageTitle } : {}) };
  return { url, ok: true, status: res.status, contentType, text: cap(text, max), ...(pageTitle ? { pageTitle } : {}) };
}

// ------------------------------------------------------------ open access

/** A DOI carried in a URL — doi.org links, publisher paths that embed it, Nature's article ids. */
export function doiFromUrl(url: string): string | null {
  const m = url.match(/10\.\d{4,9}\/[^\s"<>#?]+/i);
  if (m) return decodeURIComponent(m[0]).replace(/[.,;:)]+$/, "");
  const nature = url.match(/nature\.com\/articles\/([a-z0-9-]+)/i);
  if (nature) return `10.1038/${nature[1]}`;
  return null;
}

/** Every DOI written in a text, in order of first appearance. */
export function doisInText(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(/\b10\.\d{4,9}\/[^\s"'<>\]]+/g)) {
    // DOIs may contain parentheses (Elsevier's S-prefixed journals do); only an unbalanced closing one is sentence punctuation.
    let doi = m[0].replace(/[.,;:]+$/, "");
    while (doi.endsWith(")") && (doi.match(/\(/g) ?? []).length < (doi.match(/\)/g) ?? []).length) doi = doi.slice(0, -1).replace(/[.,;:]+$/, "");
    seen.add(doi.toLowerCase());
  }
  return [...seen];
}

type OpenAlexWork = {
  best_oa_location?: { pdf_url?: string | null; landing_page_url?: string | null } | null;
  open_access?: { oa_url?: string | null } | null;
  locations?: { is_oa?: boolean; pdf_url?: string | null; landing_page_url?: string | null }[];
};

/** Open-access URLs an OpenAlex work record offers, PDFs first, deduplicated. */
export function oaCandidates(work: OpenAlexWork): string[] {
  const pdfs = [work.best_oa_location?.pdf_url, ...(work.locations ?? []).filter((l) => l.is_oa).map((l) => l.pdf_url)];
  const pages = [work.open_access?.oa_url, work.best_oa_location?.landing_page_url, ...(work.locations ?? []).filter((l) => l.is_oa).map((l) => l.landing_page_url)];
  const out: string[] = [];
  for (const u of [...pdfs, ...pages]) if (u && !out.includes(u)) out.push(u);
  return out;
}

export async function openAccessUrls(doi: string, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  try {
    const res = await fetchImpl(`https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return [];
    return oaCandidates((await res.json()) as OpenAlexWork);
  } catch {
    return [];
  }
}

export interface RetrievalTarget {
  url?: string;
  doi?: string | null;
}

/** The Internet Archive item a URL names — a details, stream or download page; null otherwise. */
export function archiveItemOf(url: string | null | undefined): string | null {
  const m = String(url ?? "").match(/archive\.org\/(?:details|stream|download)\/([^/?#]+)/i);
  return m ? m[1] : null;
}

/**
 * The PubMed Central identifier a URL names — pmc.ncbi.nlm.nih.gov/articles/PMC…, the older
 * ncbi.nlm.nih.gov/pmc/articles/PMC…, or a Europe PMC article page; null otherwise.
 */
export function pmcIdOf(url: string | null | undefined): string | null {
  const m = String(url ?? "").match(/(?:pmc\.ncbi\.nlm\.nih\.gov\/articles|ncbi\.nlm\.nih\.gov\/pmc\/articles|europepmc\.org\/(?:article\/PMC|articles|abstract\/PMC))\/(PMC\d+)/i);
  return m ? m[1].toUpperCase() : null;
}

/**
 * JATS XML — the form Europe PMC's full-text service serves an article in — reduced to the text a model is shown:
 * the title, the abstract, the body's headings and paragraphs, tables as rows with cells separated by " | " and
 * their labels and captions kept, superscript digits as the article renders them (mm², 10³); citation markers
 * and the reference list dropped.
 */
export function jatsToText(xml: string): string {
  const pick = (re: RegExp) => xml.match(re)?.[1] ?? "";
  const title = pick(/<article-title>([\s\S]*?)<\/article-title>/i);
  const abstract = pick(/<abstract[^>]*>([\s\S]*?)<\/abstract>/i);
  const body = pick(/<body>([\s\S]*?)<\/body>/i) || xml;
  const floats = pick(/<floats-group>([\s\S]*?)<\/floats-group>/i);
  const marked = [title, abstract && `Abstract\n${abstract}`, body, floats]
    .filter(Boolean)
    .join("\n\n")
    .replace(/<ref-list[\s\S]*?<\/ref-list>/gi, " ")
    .replace(/<xref[^>]*>[\s\S]*?<\/xref>/gi, "")
    .replace(/<xref[^>]*\/>/gi, "")
    .replace(/<\/(td|th)>/gi, " | ")
    .replace(/<\/(title|sec|caption|label|abstract|table-wrap|fig|tr|p)>/gi, "\n");
  return stripHtml(marked);
}

/** Europe PMC's full text for a PMCID, as the text of the PMC page it stands in for (`key`). */
async function europePmcFullText(
  pmcid: string,
  key: string,
  opts: { timeoutMs?: number; maxChars?: number; fetchImpl?: typeof fetch },
): Promise<FetchedSource> {
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/${pmcid}/fullTextXML`;
  const fetchImpl = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await fetchImpl(url, { headers: { "User-Agent": UA, Accept: "application/xml,text/xml;q=0.9,*/*;q=0.5" }, signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000) });
  } catch (e) {
    return { url: key, ok: false, status: null, contentType: null, text: null, reason: `Europe PMC full text for ${pmcid}: fetch failed: ${(e as Error).message}` };
  }
  const contentType = res.headers.get("content-type");
  if (!res.ok) return { url: key, ok: false, status: res.status, contentType, text: null, reason: `Europe PMC full text for ${pmcid}: HTTP ${res.status}` };
  const xml = await res.text();
  if (!/<article[\s>]/i.test(xml)) return { url: key, ok: false, status: res.status, contentType, text: null, reason: `Europe PMC full text for ${pmcid}: not a JATS article` };
  const text = jatsToText(xml);
  if (!text.trim()) return { url: key, ok: false, status: res.status, contentType, text: null, reason: `Europe PMC full text for ${pmcid}: empty` };
  const title = xml.match(/<article-title>([\s\S]*?)<\/article-title>/i)?.[1];
  return {
    url: key,
    ok: true,
    status: res.status,
    contentType,
    text: cap(text, opts.maxChars ?? MAX_CHARS),
    via: `Europe PMC full text (JATS XML) for ${pmcid} at ${url}, read for the page`,
    substitute: true,
    ...(title ? { pageTitle: stripHtml(title) } : {}),
  };
}

/** The PMCID Europe PMC's index gives a DOI, or null. */
async function pmcIdForDoi(doi: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await fetchImpl(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(`DOI:"${doi}"`)}&format=json&pageSize=3`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { resultList?: { result?: Array<{ pmcid?: string; doi?: string }> } };
    return j.resultList?.result?.find((r) => r.pmcid && (r.doi ?? "").toLowerCase() === doi.toLowerCase())?.pmcid ?? null;
  } catch {
    return null;
  }
}

/** The arXiv identifier a URL names (an abstract or PDF page), version suffix kept; null otherwise. */
export function arxivIdOf(url: string | null | undefined): string | null {
  const m = String(url ?? "").match(/arxiv\.org\/(?:abs|pdf)\/((?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?)/i);
  return m ? m[1] : null;
}

/**
 * The text of a work: its URL first; failing that, any open-access copy
 * OpenAlex knows for its DOI. The result keeps the original `url` as its
 * key and says in `via` where the text came from.
 */
export async function retrieve(
  target: RetrievalTarget,
  opts: { timeoutMs?: number; maxChars?: number; fetchImpl?: typeof fetch; retryDelayMs?: number } = {},
): Promise<FetchedSource> {
  const doi = target.doi ?? (target.url ? doiFromUrl(target.url) : null);
  const key = target.url ?? (doi ? `https://doi.org/${doi}` : "");
  // An arXiv abstract page is the record's public locator, but the paper's text is the PDF: read that
  // first, under the abstract's key, and say so. (2026-09-10: a drafter read two preprints as PDFs from the
  // links a post supplied and recorded the sources by their abstract pages; the verifier fetched the
  // abstract pages, found none of the quotes, and refused fifty-two records at no cost.)
  const arxiv = arxivIdOf(target.url);
  if (arxiv && !/\/pdf\//i.test(target.url ?? "")) {
    const pdfUrl = `https://arxiv.org/pdf/${arxiv}`;
    const full = await fetchSource(pdfUrl, opts);
    if (full.ok) return { ...full, url: key, via: `arXiv full text (PDF) at ${pdfUrl}, read for the abstract page`, substitute: true };
  }
  // An Internet Archive item page shows a scan; its text is the OCR layer the Archive serves beside it. Read that
  // first, under the item's key, and say so — the OCR stands in for the page image, so a quote it misses is
  // unverified, not false (2026-09-17: the ledger held eight blocked routes reading "download the FULL TEXT from
  // archive.org", and nothing could follow them).
  const item = archiveItemOf(target.url);
  if (item) {
    // The OCR text under download/, then the same text as the stream page serves it; a 429 or 5xx is asked once
    // more after a pause, because the Archive throttles a runner that has just read a book from it (2026-09-17: a
    // verify pass ten minutes after the draft's read got the item page instead and failed forty-four records).
    const routes = [`https://archive.org/download/${item}/${item}_djvu.txt`, `https://archive.org/stream/${item}/${item}_djvu.txt`];
    const tried: string[] = [];
    for (const txt of routes) {
      let full = await fetchSource(txt, opts);
      if (!full.ok && full.status !== null && (full.status === 429 || full.status >= 500)) {
        await new Promise((r) => setTimeout(r, opts.retryDelayMs ?? 5_000));
        full = await fetchSource(txt, opts);
      }
      if (full.ok) return { ...full, url: key, via: `Internet Archive OCR text at ${txt}, read for the item page`, substitute: true };
      tried.push(`${txt} — ${full.reason ?? "not readable"}`);
    }
    // The item page is a viewer, not the text: it answers only with its title, so the record can still be matched.
    const page = target.url ? await fetchSource(target.url, opts) : null;
    return { url: key, ok: false, status: page?.status ?? null, contentType: page?.contentType ?? null, text: null, reason: `Internet Archive OCR text not served (${tried.join("; ")}); the item page is a viewer, not the text`, ...(page?.pageTitle ? { pageTitle: page.pageTitle } : {}) };
  }
  // PubMed Central serves a runner a bot-challenge page with HTTP 200 in place of the article (2026-09-20: the
  // answer step's re-reading of a record on #372 was left unread for it, and the operator read the article through
  // Europe PMC by hand). The page is tried as the record's locator; failing it, Europe PMC's full-text service
  // serves the same article as JATS XML, read under the page's key and marked as a stand-in.
  const pmc = pmcIdOf(target.url);
  if (pmc && target.url) {
    const page = await fetchSource(target.url, opts);
    if (page.ok) return page;
    const epmc = await europePmcFullText(pmc, key, opts);
    if (epmc.ok) return epmc;
    return { ...page, reason: `${page.reason ?? "not readable"}; ${epmc.reason}` };
  }
  const first = target.url ? await fetchSource(target.url, opts) : null;
  if (first?.ok) return first;
  if (doi) {
    for (const candidate of await openAccessUrls(doi, opts.fetchImpl)) {
      if (candidate === target.url) continue;
      const r = await fetchSource(candidate, opts);
      if (r.ok) return { ...r, url: key, via: `open-access copy via OpenAlex: ${candidate}`, substitute: true };
    }
    // A walled page with no open copy OpenAlex knows may still be in PubMed Central: Europe PMC's index gives
    // the PMCID for the DOI, and its full-text service the article.
    const viaDoi = await pmcIdForDoi(doi, opts.fetchImpl);
    if (viaDoi) {
      const epmc = await europePmcFullText(viaDoi, key, opts);
      if (epmc.ok) return { ...epmc, via: `Europe PMC full text (JATS XML) for ${viaDoi}, found by DOI ${doi}` };
    }
  }
  return (
    first ?? { url: key, ok: false, status: null, contentType: null, text: null, reason: doi ? "no URL on the record and no open-access copy known to OpenAlex" : "no URL and no DOI on the record" }
  );
}
