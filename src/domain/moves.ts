/**
 * Verdict moves: where an adopted assessment's word for the case or for a
 * claim changed from one edition to the next. Derived from the editions and
 * the assessments they adopt; nothing is stored for it.
 *
 * This is the change history in a reader's terms (AGENTS.md §2: "a
 * transparent record of how assessments change"). The changelog says what
 * the loop did; a move says what it changed its mind about. Every move is
 * shown as recorded, a reversal included — judgments are append-only.
 */
import type { AssessmentRun, AssessmentState, LoadedCase } from "./schema.ts";

export interface VerdictMove {
  /** Null when the case verdict itself moved. */
  claimId: string | null;
  /** The claim's statement as the ledger holds it (a refused claim keeps its record), or the case title. */
  subject: string;
  /** False when the claim has since been refused: its record is kept as a tombstone and it has no page of its own. */
  live: boolean;
  from: AssessmentState;
  to: AssessmentState;
}

/** One edition's moves against its predecessor. */
export interface EditionMoves {
  edition: string;
  date: string;
  moves: VerdictMove[];
}

/** An edition's moves with the case they belong to, for feeds across cases. */
export type CaseEditionMoves = EditionMoves & { caseSlug: string; caseTitle: string };

/** The slice of a LoadedCase the derivation reads (narrow for tests). */
type MovesCase = Pick<LoadedCase, "editions" | "assessmentRuns" | "claims"> & { record: { title: string; slug: string } };

/**
 * Every edition that changed a verdict, oldest first. Two editions are
 * compared only when both adopt an assessment and the assessments differ;
 * a claim is compared only when both assessments grade it, so a claim that
 * entered or left the featured set is not a move.
 */
export function verdictMoves(loaded: MovesCase): EditionMoves[] {
  const runs = new Map<string, AssessmentRun>(loaded.assessmentRuns.map((r) => [r.runId, r]));
  const statement = new Map(loaded.claims.map((c) => [c.id, c.statement]));
  const refused = new Set(loaded.claims.filter((c) => c.reviewState === "rejected").map((c) => c.id));
  const out: EditionMoves[] = [];
  for (let i = 1; i < loaded.editions.length; i++) {
    const before = loaded.editions[i - 1].assessment;
    const after = loaded.editions[i].assessment;
    if (!before || !after || before.runId === after.runId) continue;
    const a = runs.get(before.runId);
    const b = runs.get(after.runId);
    if (!a || !b) continue;
    const moves: VerdictMove[] = [];
    if (a.caseAssessment.verdict !== b.caseAssessment.verdict) {
      moves.push({ claimId: null, subject: loaded.record.title, live: true, from: a.caseAssessment.verdict, to: b.caseAssessment.verdict });
    }
    const was = new Map(a.claimAssessments.map((ca) => [ca.claimId, ca.verdict]));
    for (const ca of b.claimAssessments) {
      const from = was.get(ca.claimId);
      if (from && from !== ca.verdict) moves.push({ claimId: ca.claimId, subject: statement.get(ca.claimId) ?? ca.claimId, live: statement.has(ca.claimId) && !refused.has(ca.claimId), from, to: ca.verdict });
    }
    if (moves.length) out.push({ edition: loaded.editions[i].runId, date: loaded.editions[i].date, moves });
  }
  return out;
}

/** The moves the current edition made against its predecessor; empty when it moved nothing or is the first. */
export function currentMoves(loaded: MovesCase): VerdictMove[] {
  const current = loaded.editions.at(-1);
  if (!current) return [];
  return verdictMoves(loaded).find((m) => m.edition === current.runId)?.moves ?? [];
}

/**
 * A case's moves day by day, oldest first: where several editions fell on
 * one day, each verdict's move is from the word it had that morning to the
 * word it had that night, and a verdict that ended the day where it began
 * is not a move. (An edition and its correction an hour later are one
 * day's work to a reader; the case page keeps every edition apart.)
 */
export function dailyMoves(loaded: MovesCase): EditionMoves[] {
  const days: EditionMoves[] = [];
  for (const e of verdictMoves(loaded)) {
    const day = days.at(-1)?.date === e.date ? days.at(-1)! : null;
    if (!day) {
      days.push({ edition: e.edition, date: e.date, moves: e.moves.map((m) => ({ ...m })) });
      continue;
    }
    day.edition = e.edition;
    for (const m of e.moves) {
      const earlier = day.moves.find((x) => x.claimId === m.claimId);
      if (earlier) earlier.to = m.to;
      else day.moves.push({ ...m });
    }
  }
  return days.map((d) => ({ ...d, moves: d.moves.filter((m) => m.from !== m.to) })).filter((d) => d.moves.length > 0);
}

/**
 * The latest days on which a case's verdicts moved, across cases, newest
 * first. Chosen round-robin by each case's recency — every case's latest
 * day before any case's second — so a case revised five times in a week
 * does not crowd the others out of a short list.
 */
export function recentMoves(cases: MovesCase[], limit: number): CaseEditionMoves[] {
  const perCase = cases.map((c) =>
    [...dailyMoves(c)].reverse().map((m) => ({ ...m, caseSlug: c.record.slug, caseTitle: c.record.title })),
  );
  const selected: CaseEditionMoves[] = [];
  for (let rank = 0; selected.length < limit; rank++) {
    const atRank = perCase
      .map((days) => days[rank])
      .filter((d): d is CaseEditionMoves => d !== undefined)
      .sort((a, b) => b.date.localeCompare(a.date) || a.caseSlug.localeCompare(b.caseSlug));
    if (atRank.length === 0) break;
    selected.push(...atRank.slice(0, limit - selected.length));
  }
  return selected.sort((a, b) => b.date.localeCompare(a.date) || a.caseSlug.localeCompare(b.caseSlug));
}
