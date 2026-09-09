import Link from "next/link";
import type { Activity } from "@/src/domain/activity";

/**
 * What this case has been through lately, at the top of its page: the
 * current edition's own account of what changed, then the last sittings
 * in a reader's words. Every line is a record the loop wrote; the links
 * lead to the record itself.
 */
export function LatestStrip({ activity }: { activity: Activity }) {
  const a = activity;
  return (
    <section id="latest" className="border border-line bg-paper px-5 py-4 sm:px-7 scroll-mt-28">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-copper">as of {a.edition.date}</h3>
        <Link href="#history" className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint hover:text-copper">
          last content update {a.lastContentUpdate} · the changelog →
        </Link>
      </div>
      <p className="mt-2 text-[14.5px] leading-[1.7] text-ink-soft">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint mr-2">the edition says</span>
        {a.edition.excerpt}
      </p>
      {a.edition.rationale.length > a.edition.excerpt.length ? (
        <details className="mt-1.5 group">
          <summary className="cursor-pointer list-none font-mono text-[10px] uppercase tracking-[0.12em] text-copper [&::-webkit-details-marker]:hidden">
            <span aria-hidden className="inline-block transition-transform group-open:rotate-90">▸</span> the whole rationale · {a.edition.runId}
          </summary>
          <p className="mt-2 text-[13.5px] leading-[1.7] text-ink-soft whitespace-pre-line">{a.edition.rationale}</p>
        </details>
      ) : null}
      {a.sittings.length > 0 ? (
        <ul className="mt-3 border-t border-line pt-2.5 space-y-1">
          {a.sittings.map((r) => (
            <li key={r.runId} className="flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] leading-relaxed text-ink-soft">
              <span className="font-mono text-[10.5px] tracking-[0.06em] text-faint w-[6.5rem] shrink-0">{r.date}</span>
              <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-copper w-[4.5rem] shrink-0">{r.verb}</span>
              <span className="min-w-0">
                {r.summary}
                {r.usd !== null ? <span className="ml-2 font-mono text-[10px] text-faint">${r.usd.toFixed(2)}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
