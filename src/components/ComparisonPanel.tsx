import type { EditionComparison } from "@/src/domain/schema";
import { comparisonInWords } from "@/src/domain/comparison";

const chose: Record<EditionComparison["seats"][number]["prefers"], string> = {
  candidate: "preferred this edition",
  incumbent: "preferred the edition before it",
  neither: "preferred neither",
};

/**
 * How this edition was chosen: each seat of the panel read it beside the
 * edition it replaced, as a reader would, without being told which was the
 * new one (each was marked with the evidence it was written from, which
 * marks the newer when the ledger had moved: protocols/compare-v1.md).
 * Shown with every seat's own reasons and what it said should still
 * be fixed — AI readers' preferences, labelled as that; the verdicts are
 * judged separately, blind.
 */
export function ComparisonPanel({ comparison }: { comparison: EditionComparison }) {
  return (
    <section id="chosen" className="mt-6 border border-line bg-paper px-5 py-4 sm:px-7 scroll-mt-28">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-copper">how this edition was chosen</h2>
      <p className="mt-2 text-[14.5px] leading-[1.7] text-ink-soft">{comparisonInWords(comparison)}</p>
      <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
        a preference among AI readers, not a human review · the verdicts are judged separately, blind · read beside {comparison.against} under {comparison.protocol}
      </p>
      <div className="mt-3 border-t border-line">
        {comparison.seats.map((s) => (
          <details key={s.seat} className="group border-b border-line/60 last:border-b-0">
            <summary className="cursor-pointer py-2.5 list-none [&::-webkit-details-marker]:hidden">
              <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <span aria-hidden className="font-mono text-[10px] text-faint transition-transform group-open:rotate-90">▸</span>
                <span className="font-mono text-[11px] tracking-[0.06em] text-ink-soft">{s.seat}</span>
                <span className={`font-mono text-[10px] uppercase tracking-[0.14em] ${s.prefers === "candidate" ? "text-copper" : "text-ochre"}`}>
                  {chose[s.prefers]}
                  {s.margin ? `, ${s.margin === "clear" ? "clearly" : "slightly"}` : ""}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">read it {s.candidateShownAs === "A" ? "first" : "second"}</span>
              </span>
            </summary>
            <div className="pb-4 pl-6 max-w-4xl">
              <p className="text-[14px] leading-[1.7] text-ink-soft">{s.reasons}</p>
              {s.notes.length > 0 ? (
                <>
                  <h3 className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">what it said should still be fixed</h3>
                  <ul className="mt-1.5 list-disc pl-5 space-y-1 text-[13.5px] leading-[1.65] text-ink-soft">
                    {s.notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          </details>
        ))}
      </div>
      {comparison.failed?.length ? (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-faint">did not answer: {comparison.failed.join(" · ")}</p>
      ) : null}
    </section>
  );
}
