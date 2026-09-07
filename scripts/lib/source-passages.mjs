import { createHash } from "node:crypto";
import { inspectPdf, PDF_EXTRACTOR, MAX_PDF_BYTES } from "./pdf-passages.mjs";

export const sha256 = value => createHash("sha256").update(value).digest("hex");
export const EXTRACTOR = "html-text-v1";
export const normalizePassage = text => String(text).replace(/\s+/gu, " ").trim();

/** Deliberately modest extraction: article/main where present, otherwise the
 * document. No OCR or PDF claims. Unknown named entities remain visible. */
export function extractSourceText(html) {
  let text = html.replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  const body = text.match(/<article\b[^>]*>([\s\S]*?)<\/article\s*>/i) ??
    text.match(/<main\b[^>]*>([\s\S]*?)<\/main\s*>/i);
  if (body) text = body[1];
  text = text.replace(/<[^>]*>/g, " ");
  const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", hellip: "…" };
  text = text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (!entity.startsWith("#")) return entities[entity] ?? match;
    const code = entity.toLowerCase().startsWith("#x") ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : match;
  });
  return normalizePassage(text);
}

function publicUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password ||
    !url.hostname.includes(".") || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[)/.test(url.hostname))
    throw new Error("source retrieval requires a public HTTPS URL without credentials");
  return url;
}

/** @param {string} url
 * @param {{fetchImpl?: typeof fetch, maxBytes?: number, maxPdfBytes?: number, maxText?: number,
 * timeoutMs?: number, now?: () => string, readPdf?: typeof inspectPdf}} options */
export async function retrieveSource(url, { fetchImpl = fetch, maxBytes = 2000000, maxPdfBytes = MAX_PDF_BYTES,
  maxText = 80000, timeoutMs = 20000, now = () => new Date().toISOString(), readPdf = inspectPdf } = {}) {
  const started = Date.now();
  let current = publicUrl(url);
  let response;
  const signal = AbortSignal.timeout(timeoutMs);
  for (let redirects = 0; redirects <= 4; redirects++) {
    response = await fetchImpl(current.href, { redirect: "manual", signal,
      headers: { "User-Agent": "AletheiaResearch/1.0 (+https://github.com/ejhong/aletheia)" } });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      if (!response.headers.get("location")) throw new Error("source redirect has no location");
      current = publicUrl(new URL(response.headers.get("location"), current).href);
      continue;
    }
    break;
  }
  if (!response?.ok) { await response?.body?.cancel(); throw new Error(`source HTTP ${response?.status}`); }
  const type = response.headers.get("content-type") ?? "";
  const pdf = /^application\/pdf\b/i.test(type);
  if (!pdf && !/^(text\/html|text\/plain|application\/xhtml\+xml)\b/i.test(type)) {
    await response.body?.cancel(); throw new Error(`unsupported source type: ${type}`);
  }
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > (pdf ? maxPdfBytes : maxBytes)) throw new Error("source exceeds retrieval byte limit");
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  if (pdf) {
    const remaining = timeoutMs - (Date.now() - started);
    if (remaining < 1) throw new Error("PDF retrieval deadline reached");
    const pdf = await readPdf(bytes, { timeoutMs: remaining });
    return { url: current.href, requestedUrl: url, retrievedAt: now(), responseHash: sha256(bytes),
      textHash: null, text: null, extractor: PDF_EXTRACTOR, pdf,
      document: { data: bytes.toString("base64"), pages: pdf.pages } };
  }
  const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const text = type.startsWith("text/plain") ? normalizePassage(raw) : extractSourceText(raw);
  if (text.length < 80 || text.length > maxText) throw new Error("source text outside readable size limits; no truncated reading");
  return { url: current.href, requestedUrl: url, retrievedAt: now(), responseHash: sha256(bytes),
    textHash: sha256(text), extractor: type.startsWith("text/plain") ? "plain-text-v1" : EXTRACTOR, text };
}

export function locatePassage(capture, quote, sourceId, pdfPage = /** @type {number | undefined} */ (undefined)) {
  const exact = normalizePassage(quote);
  if (exact.length < 12 || exact.split(" ").length > 25)
    throw new Error("a source passage must be a short explicit quotation");
  const { url, retrievedAt, responseHash, textHash, extractor } = capture;
  if (extractor === PDF_EXTRACTOR) {
    if (!Number.isInteger(pdfPage) || pdfPage < 1 || pdfPage > capture.pdf.pages)
      throw new Error("PDF quote requires a valid physical PDF page number");
    // Provisional anchor. The source reader must add a successful independent
    // page check before this can validate as a public Passage receipt.
    return { sourceId, url, retrievedAt, responseHash, textHash: null, extractor,
      pdfPage, pdfPageCount: capture.pdf.pages,
      locator: `PDF page ${pdfPage} of ${capture.pdf.pages} (file page count, not printed pagination; AI page reading)`, quote: exact };
  }
  if (pdfPage !== undefined) throw new Error("PDF page supplied for a text source");
  const offset = capture.text.indexOf(exact);
  if (offset < 0) throw new Error("quoted passage not found in retrieved text");
  return { sourceId, url, retrievedAt, responseHash, textHash, extractor,
    locator: `${extractor}, characters ${offset + 1}–${offset + exact.length} (retrieved text; not a printed-page locator)`, quote: exact };
}
