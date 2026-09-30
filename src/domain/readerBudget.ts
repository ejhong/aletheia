/**
 * The reader's budget: how long an edition's article and the fields a reader
 * meets first may be. Mechanical, so that "better is not longer"
 * (docs/AUTOMATION.md, "The goal") is a property of every edition and not a
 * hope: between 2026-09-08 and 2026-09-23 every case the loop touched grew
 * its article — one from 2,178 words to 7,502 over twenty editions, counted
 * without markup as the budget counts — and the header's three answers grew
 * from about a hundred words to several hundred, because each edition added
 * what it had learned and none was asked to take anything out.
 *
 * Two figures per field: a `target`, which the protocol asks for, and a
 * `ceiling`, above which the verb refuses the candidate. Every ceiling but
 * two is one the ten editions of 2026-09-08 — written before the loop, and
 * readable — already kept: their longest article was 2,698 words, their
 * longest header answers 117, 122 and 115, their longest priority reason 44,
 * conventional explanation 194, synthesis 381, claim reasoning 172. The two
 * that are new: the steelman's (those editions had none) and the opening
 * sentence's (theirs ran to 93 words), because the page now shows a field's
 * first sentence and keeps the rest one gesture away. The space between
 * target and ceiling is slack for a model that cannot count its own words
 * exactly.
 *
 * Pure. The edition verb enforces it on what a candidate writes
 * (src/pipeline/edition.ts); an incumbent written before the budget is not
 * made invalid by it.
 */
import type { AssessmentRun } from "./schema.ts";
import { articleWords } from "./text.ts";

export interface Limit {
  target: number;
  ceiling: number;
}

export const READER_BUDGET = {
  /** The article, in words without markup (src/domain/text.ts, articleWords). */
  article: { target: 2500, ceiling: 3000 },
  whatIsClaimed: { target: 60, ceiling: 120 },
  whereDisagreementLives: { target: 80, ceiling: 130 },
  whatWouldSettleIt: { target: 80, ceiling: 130 },
  priorityReason: { target: 40, ceiling: 60 },
  bestConventionalExplanation: { target: 150, ceiling: 200 },
  synthesis: { target: 300, ceiling: 400 },
  steelman: { target: 200, ceiling: 300 },
  componentNote: { target: 30, ceiling: 60 },
  claimReasoning: { target: 100, ceiling: 180 },
  /**
   * The first sentence of each header answer, of the priority's reason and of the synthesis: the page shows it
   * first and the rest on request (src/components/Lede.tsx), so it has to be the answer by itself.
   */
  opening: { target: 30, ceiling: 45 },
} as const satisfies Record<string, Limit>;

/** Words in a passage of prose: whitespace-separated, nothing stripped. */
export const proseWords = (text: string | null | undefined): number => (text ?? "").split(/\s+/).filter(Boolean).length;

/**
 * The words before a passage's first full stop, question mark or exclamation mark that ends a sentence (followed by
 * space and a capital, a figure, a quote or a bracket, or by the end of the text). A passage with no such stop is one
 * sentence. Deliberately simple — an abbreviation's stop ("et al. 2019") ends the opening early, which only makes the
 * count smaller; the rule can refuse an opening for being long, never for being short.
 */
export function openingWords(text: string | null | undefined): number {
  const t = (text ?? "").trim();
  const end = t.search(/[.!?]["'”’)]?(?:\s+["'“‘(\[]?[A-Z0-9]|\s*$)/);
  return proseWords(end < 0 ? t : t.slice(0, end + 1));
}

const over = (what: string, words: number, limit: Limit, unit = "words") =>
  words > limit.ceiling ? [`${what} is ${words.toLocaleString("en-US")} ${unit}; the ceiling is ${limit.ceiling.toLocaleString("en-US")} (aim for ${limit.target.toLocaleString("en-US")} or fewer)`] : [];

/** The article against its ceiling. */
export function articleBudgetErrors(article: string): string[] {
  return over("the article", articleWords(article), READER_BUDGET.article, "words without markup");
}

/** An assessment's reader-facing fields against their ceilings: one line per field over, naming the count and the limit. */
export function assessmentBudgetErrors(a: Pick<AssessmentRun, "caseAssessment" | "claimAssessments">): string[] {
  const ca = a.caseAssessment;
  const errors: string[] = [];
  const field = (name: string, text: string | null | undefined, limit: Limit, opening = false) => {
    errors.push(...over(`assessment ${name}`, proseWords(text), limit));
    if (opening) errors.push(...over(`assessment ${name}'s first sentence`, openingWords(text), READER_BUDGET.opening));
  };
  field("whatIsClaimed", ca.whatIsClaimed, READER_BUDGET.whatIsClaimed, true);
  field("whereDisagreementLives", ca.whereDisagreementLives, READER_BUDGET.whereDisagreementLives, true);
  field("whatWouldSettleIt", ca.whatWouldSettleIt, READER_BUDGET.whatWouldSettleIt, true);
  field("researchPriority.reason", ca.researchPriority?.reason, READER_BUDGET.priorityReason, true);
  field("bestConventionalExplanation", ca.bestConventionalExplanation, READER_BUDGET.bestConventionalExplanation);
  field("synthesis", ca.synthesis, READER_BUDGET.synthesis, true);
  field("steelman", ca.steelman, READER_BUDGET.steelman);
  for (const c of ca.components ?? []) field(`component "${c.label}" note`, c.note, READER_BUDGET.componentNote);
  for (const c of a.claimAssessments) field(`claim ${c.claimId} reasoning`, c.reasoning, READER_BUDGET.claimReasoning);
  return errors;
}

/**
 * The budget as the edition protocol states it, generated from the figures. The protocol carries these lines as
 * literal text — so a record's `promptVersion` always points at the words its run was given — and a test holds the
 * protocol's text to this function: change a figure, and the test fails until the protocol has a new version.
 */
export function readerBudgetText(): string {
  const b = READER_BUDGET;
  const line = (name: string, l: Limit) => `${name} ${l.target} (ceiling ${l.ceiling})`;
  return [
    `- Each limit is a target and a ceiling. Write to the target. The ceiling is where the verb refuses, and a model's count of its own words runs low: a draft you judge to be near a ceiling is over it.`,
    `- \`article\`: ${b.article.target.toLocaleString("en-US")} words or fewer (ceiling ${b.article.ceiling.toLocaleString("en-US")}), counted without markup.`,
    `- The dossier header, in words: ${line("`whatIsClaimed`", b.whatIsClaimed)}, ${line("`whereDisagreementLives`", b.whereDisagreementLives)}, ${line("`whatWouldSettleIt`", b.whatWouldSettleIt)}, ${line("`researchPriority.reason`", b.priorityReason)}.`,
    `- The judgment, in words: ${line("`synthesis`", b.synthesis)}, ${line("`steelman`", b.steelman)}, ${line("`bestConventionalExplanation`", b.bestConventionalExplanation)}, ${line("a component's `note`", b.componentNote)}, ${line("a claim's `reasoning`", b.claimReasoning)}.`,
    `- The first sentence of each of the three header answers, of \`researchPriority.reason\` and of \`synthesis\`: ${b.opening.target} words (ceiling ${b.opening.ceiling}).`,
  ].join("\n");
}
