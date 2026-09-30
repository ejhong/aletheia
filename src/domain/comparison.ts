/**
 * The comparison in a reader's words: how the panel's seats, reading an
 * edition beside the one it replaced, chose between them
 * (src/pipeline/compare.ts writes the record; this reads it for the page).
 * Pure. It says what models preferred and never that the edition is
 * better: a preference among five AI readers is what it is.
 */
import { currentEdition } from "./editions.ts";
import type { EditionComparison, LoadedCase } from "./schema.ts";
import { articleWords } from "./text.ts";

const count = (n: number, all: number) => (n === all ? (all === 2 ? "both" : `all ${all}`) : String(n));

/** One sentence on how the seats chose; null when the edition carries no comparison. */
export function comparisonInWords(c: EditionComparison | undefined): string | null {
  if (!c) return null;
  const answered = c.seats.length;
  const silent = c.failed?.length ? `; ${c.failed.length} did not answer` : "";
  if (c.outcome === "undecided") {
    return `Too few of the panel's AI models answered to compare it with the edition before it (${answered} did${silent}); it replaced that edition because the evidence had changed.`;
  }
  const lead = `${answered} AI models read it beside the edition before it, as a reader would`;
  const tally = [
    c.candidate ? `${count(c.candidate, answered)} preferred this one` : "",
    c.incumbent ? `${count(c.incumbent, answered)} the one before` : "",
    c.neither ? `${count(c.neither, answered)} neither` : "",
  ].filter(Boolean).join(", ");
  const kept = c.outcome === "candidate-preferred" ? "" : " It replaced that edition because the evidence had changed or the panel had to be answered, not because it was preferred.";
  return `${lead}: ${tally}${silent}.${kept}`;
}

/** The article's length in this edition and in the one before it, when there was one. */
export function articleLengths(loaded: Pick<LoadedCase, "editions">): { now: number; before: number | null } {
  const current = currentEdition(loaded as LoadedCase);
  const previous = loaded.editions.find((e) => e.runId === current.previous);
  return { now: articleWords(current.article), before: previous ? articleWords(previous.article) : null };
}
