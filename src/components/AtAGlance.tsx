import Link from "next/link";
import { MoveLine } from "./VerdictMoves";
import type { VerdictMove } from "@/src/domain/moves";
import { longDate } from "@/src/domain/text";

/** Moves listed in the strip before "and N more": the history section has them all. */
const MOVES_SHOWN = 3;

/**
 * The edition a reader is looking at, in one strip under the header: when
 * it was made, what it changed its mind about, how much stands behind it
 * and how long the article takes — each figure a way into the ledger.
 *
 * What changed is said as verdicts that moved, which a reader can use. How
 * the edition was made — its rationale, the runs, what was refused — is the
 * record, one link away.
 */
export function AtAGlance({
  slug,
  editionDate,
  isFirstEdition,
  moves,
  counts,
  minutes,
}: {
  slug: string;
  editionDate: string;
  /** No predecessor to have moved from. */
  isFirstEdition: boolean;
  /** Verdicts this edition moved against the one before it. */
  moves: VerdictMove[];
  counts: { claims: number; evidence: number; sources: number };
  /** Minutes to read the article. */
  minutes: number;
}) {
  const figure = "font-serif text-[22px] leading-none text-ink";
  const unit = "mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-faint group-hover:text-copper";
  return (
    <section id="glance" className="border border-line bg-paper scroll-mt-28">
      <div className="grid md:grid-cols-[minmax(0,1fr)_auto] md:divide-x divide-line">
        <div className="px-5 py-4 sm:px-7">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-copper">
            this edition · {longDate(editionDate)}
          </h2>
          {moves.length > 0 ? (
            <>
              <p className="mt-2 text-[14px] text-ink-soft">
                {moves.length === 1 ? "One verdict moved" : `${moves.length} verdicts moved`} since the edition before it:
              </p>
              <ul className="mt-2.5 space-y-2">
                {moves.slice(0, MOVES_SHOWN).map((m) => (
                  <MoveLine key={m.claimId ?? "case"} move={m} />
                ))}
              </ul>
              {moves.length > MOVES_SHOWN ? (
                <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                  and {moves.length - MOVES_SHOWN} more, <a href="#history" className="underline underline-offset-2 hover:text-copper">in the history below</a>
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
              {isFirstEdition
                ? "The case's first edition: nothing has moved yet."
                : "No verdict moved in this edition."}
            </p>
          )}
          <p className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[10px] uppercase tracking-[0.14em]">
            <a href="#history" className="text-copper hover:underline underline-offset-4">how the assessment has moved ↓</a>
            <Link href={`/cases/${slug}/record/`} className="text-copper hover:underline underline-offset-4">how this edition was made →</Link>
          </p>
        </div>
        <ul className="grid grid-cols-4 md:grid-cols-2 gap-x-6 gap-y-4 border-t border-line md:border-t-0 px-5 py-4 sm:px-7 md:w-[19rem] content-center">
          {(
            [
              [counts.claims, "claims", `/cases/${slug}/claims/`],
              [counts.evidence, "evidence records", `/cases/${slug}/evidence/`],
              [counts.sources, "sources", `/cases/${slug}/resources/`],
            ] as const
          ).map(([n, label, href]) => (
            <li key={label}>
              <Link href={href} className="group block">
                <span className={`block ${figure}`}>{n}</span>
                <span className={`block ${unit}`}>{label}</span>
              </Link>
            </li>
          ))}
          <li>
            <a href="#article" className="group block">
              <span className={`block ${figure}`}>{minutes}</span>
              <span className={`block ${unit}`}>minute read</span>
            </a>
          </li>
        </ul>
      </div>
    </section>
  );
}
