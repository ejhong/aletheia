import Link from "next/link";
import type { Conjecture } from "@/src/domain/schema";

/**
 * An on-the-record editorial conjecture: a named person's bet, admitted as
 * intuition, with predicted findings and explicit disconfirmers. Displayed
 * apart from the evidence ledger — a conjecture carries no evidential
 * weight; its job is to make the site's own editors falsifiable.
 */
export function ConjectureCard({ conjecture }: { conjecture: Conjecture }) {
  const c = conjecture;
  return (
    <article className="border border-copper/40 bg-paper">
      <div className="border-b border-copper/30 bg-copper/6 px-5 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-copper">
          editorial conjecture · {c.id} · not evidence
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
          {c.by} · {c.date} · status: {c.status}
        </span>
      </div>
      <div className="p-5 sm:p-6">
        <p className="font-serif text-lg leading-snug">{c.statement}</p>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
          stated confidence: <span className="text-ink-soft normal-case">{c.confidence}</span>
        </p>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">
          {c.rationale}
        </p>
        <div className="mt-4 grid sm:grid-cols-2 gap-4">
          <div>
            <h4 className="font-mono text-[10px] uppercase tracking-[0.16em] text-verdigris">
              predicted findings
            </h4>
            <ul className="mt-1.5 space-y-1 text-[13.5px] text-ink-soft list-disc pl-4">
              {c.predictedFindings.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-mono text-[10px] uppercase tracking-[0.16em] text-terracotta">
              what would prove it wrong
            </h4>
            <ul className="mt-1.5 space-y-1 text-[13.5px] text-ink-soft list-disc pl-4">
              {c.disconfirmers.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </div>
        </div>
        {c.decisiveTestIds.length > 0 ? (
          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
            decisive tests:{" "}
            {c.decisiveTestIds.map((id, i) => (
              <span key={id} className="text-copper">
                {i > 0 ? " · " : ""}
                <Link href="#research" className="hover:underline">
                  {id}
                </Link>
              </span>
            ))}
          </p>
        ) : null}
      </div>
    </article>
  );
}
