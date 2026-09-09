import Link from "next/link";
import type { Sitting, SittingRow } from "@/src/domain/record";
import { site } from "@/src/config/site";

const ROWS_SHOWN = 80;

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

/** Where an admitted record lives on the site, by its id's shape — only for records that still have a page (a tombstoned claim has none). */
function recordHref(id: string, slug: string, linkable: Set<string>): string | null {
  if (!linkable.has(id)) return null;
  if (/-C\d+$/.test(id)) return `/claims/${id}/`;
  if (/^SRC-/.test(id)) return `/sources/${id}/`;
  if (/-E\d+$/.test(id)) return `/cases/${slug}/evidence/#evidence-${id}`;
  return null;
}

function Row({ r, slug, linkable }: { r: SittingRow; slug: string; linkable: Set<string> }) {
  const href = r.as ? recordHref(r.as, slug, linkable) : null;
  return (
    <li className="py-2 border-b border-line/60 last:border-b-0 text-[13px] leading-relaxed text-ink-soft">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint w-[4.5rem] shrink-0">{r.kind}</span>
        <span className={`font-mono text-[10px] uppercase tracking-[0.12em] w-[5.5rem] shrink-0 ${r.disposition === "in" ? "text-copper" : "text-ochre"}`}>{r.disposition}</span>
        {r.as ? (
          href ? (
            <Link href={href} className="font-mono text-[11px] underline underline-offset-2 hover:text-copper">{r.as}</Link>
          ) : (
            <span className="font-mono text-[11px]">{r.as}</span>
          )
        ) : null}
        <span className="min-w-0 text-ink">{clip(r.observed, 160)}</span>
      </div>
      {r.reason ? <p className="mt-0.5 pl-[10.5rem] text-[12.5px] text-ink-soft">{clip(r.reason, 320)}</p> : null}
      {r.reopenIf ? <p className="mt-0.5 pl-[10.5rem] text-[12px] text-faint">reopen if: {clip(r.reopenIf, 200)}</p> : null}
    </li>
  );
}

/**
 * The record layer: every sitting on the case, newest first, with what it
 * proposed and what it refused and why. The counts are the row's
 * dispositions; the reasons are the verifier's own; the file behind them
 * is one click away.
 */
export function RecordPanel({ sittings, slug, caseDir, linkable }: { sittings: Sitting[]; slug: string; caseDir: string; linkable: Set<string> }) {
  const fileUrl = `${site.repoUrl}/blob/main/content/cases/${caseDir}/dispositions.yaml`;
  return (
    <section id="record" className="pt-14 scroll-mt-28">
      <h2 className="font-serif text-3xl tracking-tight mb-2">The record</h2>
      <p className="text-[14px] text-ink-soft max-w-2xl mb-6">
        Every sitting on this case, newest first: what it proposed, what it admitted, and what it refused with the reason the verifier wrote. A candidate that is not on the ledger is here, with why.{" "}
        <a href={fileUrl} className="underline underline-offset-2 hover:text-copper">The dispositions file</a> holds every row.
      </p>
      {sittings.length === 0 ? <p className="text-[13.5px] text-ink-soft">No sitting has run on this case yet.</p> : null}
      <div className="border border-line bg-paper">
        {sittings.map((s) => {
          const counts = Object.entries(s.counts).map(([k, n]) => `${n} ${k}`).join(" · ");
          return (
            <details key={s.runId} id={`sitting-${s.runId}`} className="group border-b border-line last:border-b-0">
              <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 list-none [&::-webkit-details-marker]:hidden">
                <span aria-hidden className="font-mono text-[10px] text-faint transition-transform group-open:rotate-90">▸</span>
                <span className="font-mono text-[10.5px] tracking-[0.06em] text-faint w-[6.5rem] shrink-0">{s.date}</span>
                <span className={`font-mono text-[10.5px] uppercase tracking-[0.12em] w-[4.5rem] shrink-0 ${s.recorded ? "text-copper" : "text-faint"}`}>{s.verb ?? "—"}</span>
                <span className="text-[13px] text-ink-soft min-w-0">
                  {s.summary}
                  {!s.recorded ? <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ochre">no run record</span> : null}
                  {s.recorded && s.outcome !== "completed" ? <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ochre">{s.outcome}</span> : null}
                  {counts ? <span className="ml-2 font-mono text-[10px] text-faint">{counts}</span> : null}
                  {s.usd !== null ? <span className="ml-2 font-mono text-[10px] text-faint">${s.usd.toFixed(2)}</span> : null}
                </span>
              </summary>
              <div className="px-4 pb-4 pl-10">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                  {s.recorded ? `run ${s.runId}` : `rows name ${s.runId}; no run record exists for it, so its verb, outcome and cost are not known — the rows themselves are the record`}
                </p>
                {s.refused.length > 0 ? (
                  <>
                    <h4 className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ochre">refused, with the reason</h4>
                    <ul className="mt-1">
                      {s.refused.slice(0, ROWS_SHOWN).map((r) => (
                        <Row key={`${r.key}-${r.disposition}`} r={r} slug={slug} linkable={linkable} />
                      ))}
                    </ul>
                    {s.refused.length > ROWS_SHOWN ? (
                      <p className="mt-1 text-[12px] text-faint">
                        and {s.refused.length - ROWS_SHOWN} more in <a href={fileUrl} className="underline underline-offset-2 hover:text-copper">the dispositions file</a>
                      </p>
                    ) : null}
                  </>
                ) : null}
                {s.admitted.length > 0 ? (
                  <>
                    <h4 className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-copper">admitted</h4>
                    <ul className="mt-1">
                      {s.admitted.slice(0, ROWS_SHOWN).map((r) => (
                        <Row key={`${r.key}-${r.as}`} r={r} slug={slug} linkable={linkable} />
                      ))}
                    </ul>
                    {s.admitted.length > ROWS_SHOWN ? <p className="mt-1 text-[12px] text-faint">and {s.admitted.length - ROWS_SHOWN} more in the file</p> : null}
                  </>
                ) : null}
                {s.refused.length === 0 && s.admitted.length === 0 ? <p className="mt-2 text-[12.5px] text-faint">This run wrote no disposition rows.</p> : null}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
