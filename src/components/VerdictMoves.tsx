import Link from "next/link";
import { AssessmentBadge } from "./AssessmentBadge";
import { assessmentLabels } from "@/src/domain/schema";
import type { CaseEditionMoves, EditionMoves, VerdictMove } from "@/src/domain/moves";
import { clip, longDate } from "@/src/domain/text";

/** One verdict's move: what it is about, the word it had, the word it has. */
export function MoveLine({ move, caseSlug }: { move: VerdictMove; caseSlug?: string }) {
  const subject = move.claimId ? clip(move.subject, 150) : "The case verdict";
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="inline-flex max-w-full flex-wrap items-center gap-1.5">
        <AssessmentBadge state={move.from} />
        <span aria-hidden className="font-mono text-[11px] text-faint">→</span>
        <span className="sr-only">
          moved from {assessmentLabels[move.from]} to {assessmentLabels[move.to]}:
        </span>
        <AssessmentBadge state={move.to} />
      </span>
      <span className="min-w-0 basis-64 grow text-[13.5px] leading-snug text-ink-soft">
        {move.claimId && move.live ? (
          <Link href={`/claims/${move.claimId}/`} className="underline decoration-line underline-offset-2 hover:text-copper hover:decoration-copper/60">
            {subject}
          </Link>
        ) : move.claimId ? (
          // A claim refused since: its record is a tombstone with no page, so its words stand here unlinked.
          <>
            {subject} <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">since refused</span>
          </>
        ) : caseSlug ? (
          <Link href={`/cases/${caseSlug}/`} className="underline decoration-line underline-offset-2 hover:text-copper hover:decoration-copper/60">
            {subject}
          </Link>
        ) : (
          subject
        )}
      </span>
    </li>
  );
}

/**
 * Where the assessments moved: each edition that changed a verdict, with
 * the word before and the word after. The change history in a reader's
 * terms — what the site changed its mind about, a reversal included.
 * `perEdition` caps the lines shown for one edition; the rest are counted.
 */
export function VerdictMoves({
  editions,
  perEdition = 6,
}: {
  editions: (EditionMoves | CaseEditionMoves)[];
  perEdition?: number;
}) {
  return (
    <ol className="relative border-l border-line pl-6 space-y-6">
      {editions.map((e) => {
        const inCase = "caseSlug" in e ? e : null;
        const hidden = e.moves.length - perEdition;
        return (
          <li key={`${inCase?.caseSlug ?? ""}${e.edition}`} className="relative">
            <span aria-hidden className="absolute -left-[29px] top-1.5 size-2.5 rounded-full border border-copper bg-paper" />
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <time dateTime={e.date} className="font-mono text-[11px] tracking-[0.14em] text-copper">
                {longDate(e.date)}
              </time>
              {inCase ? (
                <Link href={`/cases/${inCase.caseSlug}/`} className="font-serif text-[17px] leading-none hover:text-copper">
                  {inCase.caseTitle}
                </Link>
              ) : null}
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                {e.moves.length} verdict{e.moves.length === 1 ? "" : "s"} moved
              </span>
            </div>
            <ul className="mt-2.5 space-y-2">
              {e.moves.slice(0, perEdition).map((m) => (
                <MoveLine key={m.claimId ?? "case"} move={m} caseSlug={inCase?.caseSlug} />
              ))}
            </ul>
            {hidden > 0 ? (
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                and {hidden} more{inCase ? " — on the case page" : ""}
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
