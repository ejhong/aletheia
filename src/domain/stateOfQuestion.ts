import {
  crossModelSummary,
  displayAssessment,
  historyNewestFirst,
  isHousekeepingEntry,
  featuredClaims,
  catalogClaims,
} from "./load";
import type { AssessmentState, LoadedCase } from "./schema";

/**
 * The state of the question (docs/AUTOMATION.md, "the researcher
 * surface"): the returning researcher's scoreboard, assembled
 * MECHANICALLY from ledger records — never written, never drafted, and
 * therefore never in need of ratification of its own: every number and
 * sentence here is a projection of records that were already ratified
 * (or honestly labeled) individually. It answers "where does this stand
 * today and what would move it?" for the reader who skips the article.
 */

export interface OpenTest {
  id: string;
  title: string;
  effortTier: string;
  /** open = no study yet; frozen = pre-registered, collection pending. */
  status: "open" | "frozen";
  /** Study id when frozen. */
  studyId?: string;
}

export interface ExecutedStudy {
  id: string;
  title: string;
  /** The study's first aggregate finding, verbatim. */
  headlineFinding: string | null;
}

export interface StateOfTheQuestion {
  /** Displayed assessment, or null when no run exists yet. */
  verdict: AssessmentState | null;
  standing: "ratified" | "contested" | "unratified" | null;
  assessedOn: string | null;
  /** The displayed run's steelman disclosure, when it carries one. */
  steelman: string | null;
  /** Newest content-bearing change — what last moved this case, and when. */
  lastMoved: { date: string; change: string } | null;
  /** Research items with no completed study, in ledger order. */
  openTests: OpenTest[];
  /** Studies with collected rows, newest id last (ids are sequential). */
  executedStudies: ExecutedStudy[];
  counts: {
    featuredClaims: number;
    catalogClaims: number;
    evidence: number;
    supports: number;
    undermines: number;
    sources: number;
  };
  /** Independent check-panel agreement with the displayed assessment. */
  concurrence: {
    models: number;
    caseUnanimous: boolean;
    exact: number;
    compared: number;
    split: number;
  } | null;
}

export function stateOfTheQuestion(loaded: LoadedCase): StateOfTheQuestion {
  const shown = displayAssessment(loaded);
  const checks = crossModelSummary(loaded);

  const lastContent = historyNewestFirst(loaded.history).find(
    (e) => !isHousekeepingEntry(e),
  );

  // A research item is settled by a study only once that study has rows;
  // a frozen (zero-row) study is a commitment, not an answer.
  const openTests: OpenTest[] = [];
  for (const r of loaded.research) {
    const executing = loaded.studies.filter((s) => s.researchIds.includes(r.id));
    if (executing.some((s) => s.rows.length > 0)) continue;
    const frozen = executing.find((s) => s.rows.length === 0);
    openTests.push({
      id: r.id,
      title: r.title,
      effortTier: r.effortTier,
      status: frozen ? "frozen" : "open",
      ...(frozen ? { studyId: frozen.id } : {}),
    });
  }

  const executedStudies: ExecutedStudy[] = loaded.studies
    .filter((s) => s.rows.length > 0)
    .map((s) => ({
      id: s.id,
      title: s.title,
      headlineFinding: s.findings[0]?.statement ?? null,
    }));

  return {
    verdict: shown?.run.caseAssessment.verdict ?? null,
    standing: shown?.ratification.status ?? null,
    assessedOn: shown?.run.date ?? null,
    steelman: shown?.run.caseAssessment.steelman ?? null,
    lastMoved: lastContent
      ? { date: lastContent.date, change: lastContent.change }
      : null,
    openTests,
    executedStudies,
    counts: {
      featuredClaims: featuredClaims(loaded).length,
      catalogClaims: catalogClaims(loaded).length,
      evidence: loaded.evidence.length,
      supports: loaded.evidence.filter((e) => e.direction === "supports").length,
      undermines: loaded.evidence.filter((e) => e.direction === "undermines")
        .length,
      sources: loaded.sources.length,
    },
    concurrence: checks
      ? {
          models: checks.models.length,
          caseUnanimous: checks.caseUnanimousWithDisplayed,
          exact: checks.exact,
          compared: checks.claimsCompared,
          split: checks.split,
        }
      : null,
  };
}
