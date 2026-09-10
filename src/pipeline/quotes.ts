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

/**
 * Surrounding quotation marks, and the punctuation at a span's edges, are not
 * part of the span: a drafter who closes a quote with the sentence's period
 * has quoted the sentence, and a source that follows it with a citation
 * bracket or a comma has still said it. (2026-09-10: three records were
 * refused for ". " against "( 6 , 15 )" and a seat read a contradiction
 * between the refused span and the same words, admitted, without the stop.)
 * Inside the span, every word stays exact.
 */
function bareQuote(quote: string): string {
  return quote.trim().replace(/^[“"‘'\s.,;:!?…]+|[”"’'\s.,;:!?…]+$/g, "");
}

export function quoteOccurs(quote: string, sourceText: string): boolean {
  return normalizeForMatch(sourceText).includes(normalizeForMatch(bareQuote(quote)));
}

/** The quoted spans in `statement` that do NOT occur in the source. Empty means verified. */
export function unverifiedQuotes(statement: string, sourceText: string): string[] {
  const text = normalizeForMatch(sourceText);
  return quotedSpans(statement).filter((q) => !text.includes(normalizeForMatch(bareQuote(q))));
}
