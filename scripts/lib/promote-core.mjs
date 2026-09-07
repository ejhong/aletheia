/**
 * Promotion pipe core (docs/AUTOMATION.md, build step 1): the pure logic
 * of promoting verified import proposals into ledger records, kept
 * model-free and unit-tested. The outside review of 2026-09-01 found
 * this pipe missing — verified proposals died in proposals/ on the
 * 60-day timer because nothing authored the evidence records the
 * admission rule requires. The promoter drafts them; every unsafe step
 * here is mechanical and fail-closed, and the judgment steps ride the
 * normal gates (needs-approval PR, citation-checking arbiter, founder
 * tap, content-response ripple).
 */

import { nearDuplicateOf } from "./watch-matching.mjs";

/** Site-wide cap on promotions drafted per run. */
export const MAX_PROMOTIONS_PER_RUN = 3;

const ARXIV_RE = /arxiv\.org\/(?:abs|pdf)\/([0-9]{4}\.[0-9]{4,5})(?:v\d+)?/i;
const DOI_RE = /doi\.org\/(10\.[^\s"']+?)(?:[)\].,;]*)$/i;

/** Pull comparable identifiers out of a proposed or ledger source. */
export function extractIdentifiers(src) {
  const hay = [src.url ?? "", src.identifier ?? ""].join(" ");
  const arxiv = hay.match(ARXIV_RE)?.[1] ?? null;
  // Greedy to the first whitespace/quote, then strip trailing punctuation:
  // DOIs contain dots and parentheses internally (the paren truncation bug
  // of 2026-08-26 is not being reintroduced by its own fix).
  const doi =
    hay
      .match(/\b(10\.\d{4,9}\/[^\s"']+)/)?.[1]
      ?.replace(/[).,;\]]+$/, "") ?? null;
  const urlNorm = (src.url ?? "")
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?/, "")
    .replace(/\/+$/, "");
  return { arxiv, doi, urlNorm: urlNorm || null };
}

/**
 * Dedupe a proposed source against the ledger. Exact identifier matches
 * decide; a near-duplicate TITLE match (the arXiv-id-versus-journal-DOI
 * aliasing that has already fooled this pipeline once — the Bruehl
 * lesson) blocks promotion and reports as a probable duplicate rather
 * than importing the same work twice (§3.10).
 */
export function alreadyCarried(proposed, ledgerSources) {
  const p = extractIdentifiers(proposed);
  for (const s of ledgerSources) {
    const l = extractIdentifiers(s);
    if (p.arxiv && l.arxiv && p.arxiv === l.arxiv)
      return { id: s.id, via: "arxiv id" };
    if (p.doi && l.doi && p.doi === l.doi) return { id: s.id, via: "doi" };
    if (p.urlNorm && l.urlNorm && p.urlNorm === l.urlNorm)
      return { id: s.id, via: "url" };
  }
  const near = nearDuplicateOf({ title: proposed.title ?? "" }, ledgerSources);
  if (near) return { id: near.id ?? near, via: "title similarity" };
  return null;
}

// Hyphen plus any following whitespace vanish together (line-break
// hyphenation joins: "re-\nproducible" → "reproducible"); remaining
// whitespace runs collapse. Applied to both sides, so intra-word hyphens
// compare equal whether the source spells "short-duration" or split it.
const normalize = (s) =>
  s
    .replace(/[-\u2010-\u2015]\s*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/**
 * Verbatim check: every double-quoted span in the drafted sourceStatement
 * must appear in the fetched source text (whitespace-, hyphen- and
 * case-insensitive; words exact). Returns the failing spans; empty =
 * verified. Quotes are the load-bearing §3.8 surface of an evidence
 * record, and no model's memory of a source is trusted over the source.
 */
export function unverifiedQuotes(sourceStatement, fetchedText) {
  const text = normalize(fetchedText);
  const failures = [];
  for (const m of String(sourceStatement).matchAll(/[“"]([^”"]{12,})[”"]/g)) {
    if (!text.includes(normalize(m[1]))) failures.push(m[1]);
  }
  return failures;
}

const DIRECTIONS = ["supports", "undermines", "qualifies", "context"];
const STRENGTHS = ["decisive", "strong", "moderate", "weak"];

/**
 * Mechanical validation of one LLM-drafted evidence record before it is
 * allowed near the ledger. Judgment quality is the panel's business;
 * this guards shape, enums, claim anchoring, and quote verbatimness.
 */
export function evidenceDraftErrors(draft, { claimIds, fetchedText }) {
  const errors = [];
  if (!/^[A-Z]+-E\d{3}$/.test(draft?.id ?? ""))
    errors.push(`bad evidence id: ${draft?.id}`);
  if (!Array.isArray(draft?.claimIds) || draft.claimIds.length === 0)
    errors.push("no claimIds");
  else
    for (const c of draft.claimIds)
      if (!claimIds.has(c)) errors.push(`unknown claim ${c}`);
  if (!DIRECTIONS.includes(draft?.direction))
    errors.push(`bad direction: ${draft?.direction}`);
  if (!STRENGTHS.includes(draft?.strength))
    errors.push(`bad strength: ${draft?.strength}`);
  if (typeof draft?.sourceStatement !== "string" || draft.sourceStatement.length < 40)
    errors.push("sourceStatement missing or too thin");
  else {
    const bad = unverifiedQuotes(draft.sourceStatement, fetchedText);
    for (const q of bad)
      errors.push(`quote not found verbatim in source: "${q.slice(0, 60)}…"`);
  }
  if (typeof draft?.editorInference !== "string" || draft.editorInference.length < 20)
    errors.push("editorInference missing or too thin");
  return errors;
}

/** Budgeted selection over promotable proposals, with reasons. */
export function selectPromotions(candidates, limit = MAX_PROMOTIONS_PER_RUN) {
  return {
    selected: candidates.slice(0, limit),
    deferred: candidates
      .slice(limit)
      .map((c) => ({ ...c, reason: `run budget (${limit}) spent` })),
  };
}
