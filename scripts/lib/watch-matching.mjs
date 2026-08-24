/**
 * Matching and de-duplication primitives for the literature watch
 * (scripts/watch-literature.mjs). Pure and dependency-free so the filters
 * that decide what a human ever sees can be tested directly.
 */

const STOP_WORDS = new Set([
  "a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "of", "on",
  "or", "the", "to", "with", "is", "are", "be", "using", "use", "via", "new",
  "study", "towards", "toward", "case", "cases",
]);

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Does `haystack` contain `term` starting at a word boundary?
 *
 * Boundary-anchored rather than exact-word, because the watch configs use
 * deliberate stems (`archaeolog`, `anesthe`, `preregist`) that must still
 * match their inflections. Anchoring only the start keeps those working
 * while preventing a term from matching inside an unrelated word.
 */
export function hasTerm(haystack, term) {
  return new RegExp(`\\b${escapeRegex(term)}`, "i").test(haystack);
}

/**
 * Keyword filter. `keywords` is a flat OR; `keywordGroups` is an AND of ORs
 * and every group must hit. When both are present both must pass.
 *
 * A flat OR list is only as narrow as its broadest term, which is how a
 * query for Younger Dryas nanodiamonds surfaced nanodiamond contact lenses.
 */
export function matchesKeywords(item, query) {
  const haystack = `${item.title ?? ""} ${item.abstractSnippet ?? ""}`;
  if (query.keywords?.length && !query.keywords.some((k) => hasTerm(haystack, k)))
    return false;
  if (query.keywordGroups?.length) {
    for (const group of query.keywordGroups) {
      if (!group.some((k) => hasTerm(haystack, k))) return false;
    }
  }
  return true;
}

/** Content words of a title, for comparing a preprint against its published form. */
export function titleTokens(title) {
  return new Set(
    String(title ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
  );
}

/**
 * Overlap of two titles as a fraction of the shorter one (0–1).
 *
 * Containment rather than Jaccard: a journal retitles a preprint by adding
 * or dropping words, so the shorter title is nearly a subset of the longer.
 * Jaccard punishes exactly that and scores real matches too low — the arXiv
 * and Scientific Reports versions of the Bruehl transient-ML paper share
 * eight content words but score 0.53 by Jaccard and 0.73 by containment.
 */
export function titleOverlap(a, b) {
  const [x, y] = [titleTokens(a), titleTokens(b)];
  if (x.size === 0 || y.size === 0) return 0;
  let shared = 0;
  for (const t of x) if (y.has(t)) shared++;
  return shared / Math.min(x.size, y.size);
}

/** Above this, two titles are probably the same work in two venues. */
export const NEAR_DUPLICATE_THRESHOLD = 0.7;

/**
 * The existing source a surfaced item is probably a version of, or null.
 *
 * Deliberately advisory. An exact DOI or arXiv id match is proof and drops
 * the item silently; a title match is a guess, and a wrong guess here is
 * invisible suppression of a genuinely new paper — the one failure mode a
 * discovery tool must not have. So this only labels, and a human decides.
 */
export function nearDuplicateOf(item, sources) {
  let best = null;
  for (const s of sources) {
    const score = titleOverlap(item.title, s.title);
    if (score >= NEAR_DUPLICATE_THRESHOLD && (!best || score > best.score)) {
      best = { id: s.id, title: s.title, score: Number(score.toFixed(2)) };
    }
  }
  return best;
}
