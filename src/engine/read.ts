import fs from "node:fs";
import path from "node:path";
import { sha256Hex } from "../domain/hash.ts";
import { retrieve, type FetchedSource, type FetchOptions } from "./fetch.ts";
import { normalizeForMatch } from "./quotes.ts";

/**
 * Reading a source: the text the quote check will read, kept whole, with a
 * PDF's page markers ([p. N]) in place. What is quoted into the ledger comes
 * from here and from nowhere else — a page summarized by a browsing tool is
 * not the page — so that the writer of a record and the check that admits it
 * read the same text (2026-09-10: they did not, and fifty-two records were
 * refused for quotes that were in the paper).
 *
 * Texts are cached under .cache/read/ (never committed: the texts are other
 * people's work) so that paging through a long report costs one fetch.
 */

/** Long enough for a book's OCR text or a few hundred pages of a report; the quote check reads the same. */
export const FULL_TEXT_CHARS = 6_000_000;
export const FULL_TEXT_PAGES = 1_500;

export interface ReadResult extends FetchedSource {
  /** The cache file the text is kept in, when it was read. */
  cached?: string;
}

const cacheDir = (root: string) => path.join(root, ".cache", "read");

/** The key a target is cached under: its URL, or its DOI when it has no URL. */
export function readKey(target: { url?: string; doi?: string }): string {
  return target.url ?? (target.doi ? `https://doi.org/${target.doi}` : "");
}

/** The whole text of a source, from the cache when it holds it (and `fresh` is not asked), else fetched and cached. */
export async function readSource(
  target: { url?: string; doi?: string },
  opts: FetchOptions & { root?: string; fresh?: boolean; retryDelayMs?: number } = {},
): Promise<ReadResult> {
  const root = opts.root ?? process.cwd();
  const key = readKey(target);
  if (!key) return { url: "", ok: false, status: null, contentType: null, text: null, reason: "no URL and no DOI to read" };
  const base = path.join(cacheDir(root), sha256Hex(key).slice(0, 24));
  if (!opts.fresh && fs.existsSync(`${base}.json`) && fs.existsSync(`${base}.txt`)) {
    const meta = JSON.parse(fs.readFileSync(`${base}.json`, "utf8")) as FetchedSource;
    return { ...meta, text: fs.readFileSync(`${base}.txt`, "utf8"), cached: `${base}.txt` };
  }
  const got = await retrieve(target, { maxChars: FULL_TEXT_CHARS, maxPages: FULL_TEXT_PAGES, ...opts });
  if (!got.ok || got.text === null) return got;
  fs.mkdirSync(cacheDir(root), { recursive: true });
  const { text, ...meta } = got;
  fs.writeFileSync(`${base}.txt`, text);
  fs.writeFileSync(`${base}.json`, JSON.stringify(meta, null, 2));
  return { ...got, cached: `${base}.txt` };
}

/** A text split at its PDF page markers: page number to that page's text. A text without markers is one page, numbered 0. */
export function pagesOf(text: string): Map<number, string> {
  const out = new Map<number, string>();
  const parts = text.split(/\[p\. (\d+)\]/);
  if (parts.length === 1) return new Map([[0, text]]);
  if (parts[0].trim()) out.set(0, parts[0]);
  for (let i = 1; i < parts.length; i += 2) out.set(Number(parts[i]), (out.get(Number(parts[i])) ?? "") + parts[i + 1]);
  return out;
}

/** The pages of a text a passage occurs on, matched as the quote check matches (normalized); [0] for a text without page markers. */
export function pagesContaining(text: string, passage: string): number[] {
  const needle = normalizeForMatch(passage);
  if (!needle) return [];
  const pages = pagesOf(text);
  const found = [...pages].filter(([, body]) => normalizeForMatch(body).includes(needle)).map(([n]) => n);
  if (found.length || pages.size === 1) return found;
  // A passage that runs over a page break is on both pages: try each page with the next.
  const nums = [...pages.keys()];
  for (let i = 0; i + 1 < nums.length; i++) {
    if (normalizeForMatch(`${pages.get(nums[i])} ${pages.get(nums[i + 1])}`).includes(needle)) found.push(nums[i], nums[i + 1]);
  }
  return found;
}

/**
 * Where a phrase occurs, each with its page and the words around it as the source has them (not normalized), for
 * finding the passage to quote. Matching is case- and whitespace-insensitive; at most `limit` hits.
 */
export function findInText(text: string, phrase: string, opts: { context?: number; limit?: number } = {}): { page: number; excerpt: string }[] {
  const context = opts.context ?? 300;
  const limit = opts.limit ?? 20;
  const words = phrase.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length || !words[0]) return [];
  const re = new RegExp(words.join("\\s+"), "gi");
  const hits: { page: number; excerpt: string }[] = [];
  for (const [page, body] of pagesOf(text)) {
    for (const m of body.matchAll(re)) {
      const at = m.index ?? 0;
      hits.push({ page, excerpt: body.slice(Math.max(0, at - context), at + m[0].length + context).replace(/\s+/g, " ").trim() });
      if (hits.length >= limit) return hits;
    }
  }
  return hits;
}
