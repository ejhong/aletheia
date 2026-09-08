import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * Retrieval for the drafter and the verifier: the text of a source, as the
 * model will be shown it. HTML is reduced to text; a PDF is read page by
 * page with page markers, so a locator can name the page; anything else is
 * reported, never guessed at. When a URL will not serve (a login wall, a
 * bot challenge, a dead link) and the work has a DOI, OpenAlex is asked for
 * an open-access copy and that is read instead — with `via` recording where
 * the text actually came from. A source whose text cannot be retrieved is
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
  /** Page count, for PDFs. */
  pages?: number;
}

const UA = "Mozilla/5.0 (compatible; Aletheia/1.0; +https://github.com/ejhong/aletheia)";
const ACCEPT = "text/html,application/xhtml+xml,application/pdf,text/plain;q=0.9,*/*;q=0.5";
export const MAX_CHARS = 120_000;

export function stripHtml(html: string): string {
  return html
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
export async function pdfText(bytes: Uint8Array, maxPages = 150): Promise<{ text: string; pages: number }> {
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true, disableFontFace: true, verbosity: 0 }).promise;
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
      const { text, pages } = await pdfText(bytes);
      if (!text.replace(/\[p\. \d+\]/g, "").trim()) {
        return { url, ok: false, status: res.status, contentType, text: null, pages, reason: `PDF has no extractable text (${pages} pages; scanned images need OCR)` };
      }
      return { url, ok: true, status: res.status, contentType, text: cap(text, max), pages };
    } catch (e) {
      return { url, ok: false, status: res.status, contentType, text: null, reason: `PDF text extraction failed: ${(e as Error).message}` };
    }
  }
  if (!(type.includes("html") || type.includes("text") || type.includes("xml") || type === "")) {
    return { url, ok: false, status: res.status, contentType, text: null, reason: `unsupported content type ${contentType}` };
  }
  const body = new TextDecoder().decode(bytes);
  const text = type.includes("html") || /<html/i.test(body.slice(0, 2000)) ? stripHtml(body) : body.trim();
  const wall = looksLikeWall(text);
  if (wall) return { url, ok: false, status: res.status, contentType, text: null, reason: `${wall} served with HTTP ${res.status}` };
  return { url, ok: true, status: res.status, contentType, text: cap(text, max) };
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

/**
 * The text of a work: its URL first; failing that, any open-access copy
 * OpenAlex knows for its DOI. The result keeps the original `url` as its
 * key and says in `via` where the text came from.
 */
export async function retrieve(
  target: RetrievalTarget,
  opts: { timeoutMs?: number; maxChars?: number; fetchImpl?: typeof fetch } = {},
): Promise<FetchedSource> {
  const doi = target.doi ?? (target.url ? doiFromUrl(target.url) : null);
  const key = target.url ?? (doi ? `https://doi.org/${doi}` : "");
  const first = target.url ? await fetchSource(target.url, opts) : null;
  if (first?.ok) return first;
  if (doi) {
    for (const candidate of await openAccessUrls(doi, opts.fetchImpl)) {
      if (candidate === target.url) continue;
      const r = await fetchSource(candidate, opts);
      if (r.ok) return { ...r, url: key, via: `open-access copy via OpenAlex: ${candidate}` };
    }
  }
  return (
    first ?? { url: key, ok: false, status: null, contentType: null, text: null, reason: doi ? "no URL on the record and no open-access copy known to OpenAlex" : "no URL and no DOI on the record" }
  );
}
