/**
 * Retrieval for the drafter and the verifier: the text of a source, as the
 * model will be shown it. HTML is reduced to text; anything else (a PDF, an
 * image) is reported, never guessed at — a source whose text cannot be
 * retrieved is `blocked` with the route, not read from memory.
 */

export interface FetchedSource {
  url: string;
  ok: boolean;
  status: number | null;
  contentType: string | null;
  /** Plain text, capped; null when the body is not text. */
  text: string | null;
  reason?: string;
}

const UA = "Mozilla/5.0 (compatible; Aletheia/1.0; +https://github.com/ejhong/aletheia)";

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

export async function fetchSource(
  url: string,
  opts: { timeoutMs?: number; maxChars?: number; fetchImpl?: typeof fetch } = {},
): Promise<FetchedSource> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5" },
      redirect: "follow",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 45_000),
    });
  } catch (e) {
    return { url, ok: false, status: null, contentType: null, text: null, reason: `fetch failed: ${(e as Error).message}` };
  }
  const contentType = res.headers.get("content-type");
  if (!res.ok) {
    return { url, ok: false, status: res.status, contentType, text: null, reason: `HTTP ${res.status}` };
  }
  const type = (contentType ?? "").toLowerCase();
  if (type.includes("pdf") || url.toLowerCase().endsWith(".pdf")) {
    return { url, ok: false, status: res.status, contentType, text: null, reason: "PDF — text extraction not built yet; read it by hand or through an HTML/landing page" };
  }
  if (!(type.includes("html") || type.includes("text") || type.includes("xml") || type === "")) {
    return { url, ok: false, status: res.status, contentType, text: null, reason: `unsupported content type ${contentType}` };
  }
  const body = await res.text();
  const text = type.includes("html") || /<html/i.test(body.slice(0, 2000)) ? stripHtml(body) : body.trim();
  const max = opts.maxChars ?? 60_000;
  return {
    url,
    ok: true,
    status: res.status,
    contentType,
    text: text.length > max ? text.slice(0, max) + `\n\n[truncated at ${max} characters of ${text.length}]` : text,
  };
}
