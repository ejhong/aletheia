/**
 * Small text derivations the reading layer shares: the opening of a long
 * judgment, the length of an article in a reader's terms, a label without
 * its ledger ids. Pure; the text itself is never changed — what is not
 * shown first is one gesture away.
 */

/** A full stop after one of these is an abbreviation's, not a sentence's ("Bodnia et al. (2019)", "slab No. 2", "J. Smith"). */
const ABBREVIATION = "al|e\\.g|i\\.e|cf|vs|viz|[Ff]igs?|[Nn]os?|Dr|Mr|Mrs|Ms|Prof|St|ca|approx|pp|p|[Vv]ol|[Ee]q|eds?|esp|incl|c";
/**
 * The end of a sentence: closing punctuation, then space, then something a
 * sentence starts with — a capital or a figure, a numbered point "(2) …", or
 * a bracket that opens on a word. A bracket that opens on a record id
 * ("…the drugs?' (TIK-E024).") belongs to the sentence before it.
 */
const SENTENCE_END = new RegExp(
  `(?:(?<!\\b(?:${ABBREVIATION})|\\b[A-Z])\\.|[!?])["'”’)]?(?=\\s+(?:["'“‘\\[]?[A-Z0-9]|\\(\\d+\\)\\s|\\([A-Z][a-z]))`,
  "g",
);

/**
 * The opening of a text as whole sentences, up to about `max` characters,
 * and what follows, untouched (its paragraph breaks kept). The first
 * sentence is always kept whole, however long; an opening that came out
 * very short (one brief sentence before a long one) takes the next sentence
 * too, within half again of `max`, so a reader is not left with a slogan;
 * `rest` is empty when the text fits.
 */
export function lede(text: string, max = 320): { lede: string; rest: string } {
  const t = text.trim();
  if (t.length <= max) return { lede: t, rest: "" };
  const ends = [...t.matchAll(SENTENCE_END)].map((m) => m.index + m[0].length);
  if (ends.length === 0) return { lede: t, rest: "" };
  let i = 0;
  while (i + 1 < ends.length && ends[i + 1] <= max) i++;
  if (ends[i] < max * 0.4 && i + 1 < ends.length && ends[i + 1] <= max * 1.5) i++;
  const cut = ends[i];
  return { lede: t.slice(0, cut).trim(), rest: t.slice(cut).trim() };
}

/** A text cut to `n` characters at a word boundary, with an ellipsis when cut. */
export function clip(text: string, n: number): string {
  const t = text.trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > n * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:—–-]+$/, "")}…`;
}

/** Words in an article's markdown, its claim markers, plate lines and headings' marks not counted. */
export function articleWords(markdown: string): number {
  return markdown
    .replace(/^\{plate:[^}]+\}$/gm, " ")
    .replace(/\{claim=[^}]+\}/g, "")
    .replace(/^\s*(?:[-*>]|#{1,6}|-{3,})\s/gm, " ")
    .replace(/[#*>[\]]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

/** Minutes to read `words` at an unhurried 230 a minute; never less than one. */
export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 230));
}

/**
 * A component label without the list of record ids an assessment sometimes
 * closes it with — "The salt line (GEO-C003, GEO-C506)" reads as "The salt
 * line" on a card. The ids stay on the case page's claim ladder, where they
 * lead somewhere.
 */
export function withoutIdList(label: string): string {
  return label.replace(/\s*\((?:[A-Z]{2,}-[A-Z]?\d{2,}(?:\s*[,;–-]\s*)?)+\)\s*$/, "").trim();
}

/** An ISO date as a reader writes it: 2026-09-23 → 23 September 2026. */
export function longDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`;
}
