/**
 * The mechanical quote match (AGENTS.md §3.8): a quoted span in an evidence
 * record or claim anchor must occur verbatim in the retrieved source text.
 * Whitespace, line-break hyphenation, typographic quotes, and case are
 * normalized on both sides; the words must be exact. A quote the source
 * never said is rejected, never repaired.
 */

export function normalizeForMatch(s: string): string {
  return s
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[-‐-―]\s*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Every double-quoted span of 12+ characters in `text`. */
export function quotedSpans(text: string): string[] {
  return [...String(text).matchAll(/[“"]([^“”"]{12,})[”"]/g)].map((m) => m[1]);
}

/** Surrounding quotation marks are punctuation, not part of the span. */
function bareQuote(quote: string): string {
  return quote.trim().replace(/^[“"‘']+|[”"’']+$/g, "");
}

export function quoteOccurs(quote: string, sourceText: string): boolean {
  return normalizeForMatch(sourceText).includes(normalizeForMatch(bareQuote(quote)));
}

/** The quoted spans in `statement` that do NOT occur in the source. Empty means verified. */
export function unverifiedQuotes(statement: string, sourceText: string): string[] {
  const text = normalizeForMatch(sourceText);
  return quotedSpans(statement).filter((q) => !text.includes(normalizeForMatch(bareQuote(q))));
}
