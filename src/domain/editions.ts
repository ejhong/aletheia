/** Editions: their order, the current one, the question and accounts as they stand, and the assessment the current edition adopts. */
import { type AssessmentRun, type Edition, type LoadedCase } from "./schema.ts";
import { editionErrors } from "./load.ts";

/**
 * Editions in succession order: the chain through `previous`, from the
 * edition with none to the one nobody succeeds. Filename or date order is
 * not enough — two editions written on the same day sorted the migration
 * after its successor and the site kept showing the old one (2026-09-08).
 * When the chain does not form a single line (an unknown predecessor, two
 * heads), the date order is kept and editionErrors reports the break.
 */
export function orderEditions(editions: Edition[]): Edition[] {
  const roots = editions.filter((e) => e.previous === null);
  const byPrevious = new Map<string, Edition[]>();
  for (const e of editions) {
    if (e.previous === null) continue;
    byPrevious.set(e.previous, [...(byPrevious.get(e.previous) ?? []), e]);
  }
  if (roots.length !== 1) return editions;
  const ordered: Edition[] = [];
  let cursor: Edition | undefined = roots[0];
  while (cursor) {
    ordered.push(cursor);
    const next: Edition[] = byPrevious.get(cursor.runId) ?? [];
    if (next.length > 1) return editions; // a fork: not one chain
    cursor = next[0];
  }
  return ordered.length === editions.length ? ordered : editions;
}

export function currentEdition(loaded: LoadedCase): Edition {
  const ed = loaded.editions.at(-1);
  if (!ed) throw new Error(`[content:${loaded.record.slug}] no edition`);
  return ed;
}

/** The case's question as it stands: the current edition's restatement, else the case file's subtitle — the founding question. */
export function caseQuestion(loaded: LoadedCase): string {
  return loaded.editions.at(-1)?.question ?? loaded.record.subtitle;
}

/** The accounts the current edition sets side by side, when it names them. */
export function caseAccounts(loaded: LoadedCase): string[] {
  return loaded.editions.at(-1)?.accounts ?? [];
}

/**
 * The edition that restated the standing question — the earliest of the
 * unbroken run of editions carrying it, since a later candidate that says
 * nothing inherits the wording verbatim. Null when the founding question
 * stands. The page credits this edition, not the latest (§3.14).
 */
export function questionRestatedBy(loaded: LoadedCase): Edition | null {
  const eds = loaded.editions;
  const q = eds.at(-1)?.question;
  if (!q) return null;
  let origin = eds[eds.length - 1];
  for (let i = eds.length - 2; i >= 0; i--) {
    if (eds[i].question === q) origin = eds[i];
    else break;
  }
  return origin;
}

/**
 * The assessment the current edition adopts — the only run that narrates.
 * Null for a question-only opening. Check runs never narrate; newer draft
 * runs that no edition has adopted do not either (that is the point of
 * editions: a newer unadopted draft cannot change the verdict beneath the
 * essay a reader is looking at).
 */
export function adoptedAssessment(loaded: LoadedCase): AssessmentRun | null {
  const ref = currentEdition(loaded).assessment;
  if (!ref) return null;
  return loaded.assessmentRuns.find((r) => r.runId === ref.runId) ?? null;
}

export function latestAssessment(loaded: LoadedCase): AssessmentRun | null {
  return loaded.assessmentRuns.at(-1) ?? null;
}
