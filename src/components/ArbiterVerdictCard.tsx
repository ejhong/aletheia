import { site } from "@/src/config/site";
import type { ArbiterRecord } from "@/src/domain/schema";

/**
 * One harvested constitutional-arbiter verdict, in full: the tally, each
 * seat's vote with the rules it cited, and — expandable per seat — the
 * complete reasoning text, verbatim from the harvested record. Links go to
 * the pull request it judged and to the verbatim YAML record in the
 * repository, so a reader can always check this rendering against the
 * ledger.
 */

const voteChip: Record<string, string> = {
  complies: "text-verdigris border-verdigris/40",
  violates: "text-terracotta border-terracotta/40",
  unsure: "text-ochre border-ochre/40",
};

export function ArbiterVerdictCard({ record }: { record: ArbiterRecord }) {
  const parked = record.verdict === "park";
  return (
    <article
      id={`arbiter-pr-${record.pr}`}
      className="border border-line bg-paper-deep/40 px-4 py-4 scroll-mt-24"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          className={`border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${
            parked
              ? "text-terracotta border-terracotta/40"
              : "text-verdigris border-verdigris/40"
          }`}
        >
          {parked ? "parked" : "passed"}
        </span>
        <a
          href={record.url}
          className="font-serif text-lg hover:text-copper"
        >
          PR #{record.pr}: {record.title}
        </a>
        <span className="font-mono text-[11px] text-faint ml-auto">
          {record.outcomeAt} · {record.outcome}
          {parked && record.outcome === "merged"
            ? " by founder tap (dry period)"
            : ""}
        </span>
      </div>

      <p className="mt-2 text-[13.5px] text-ink-soft">{record.reason}</p>

      <div className="mt-3 space-y-1.5">
        {record.seats.map((s) => (
          <details key={s.seat} className="group border-t border-line/50 pt-1.5">
            <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden flex flex-wrap items-center gap-2 py-0.5">
              <span
                aria-hidden
                className="font-mono text-[10px] text-faint transition-transform group-open:rotate-90"
              >
                ▸
              </span>
              <span className="font-mono text-[12px]">{s.seat}</span>
              <span
                className={`border px-1.5 py-px font-mono text-[10px] uppercase tracking-[0.12em] ${voteChip[s.vote]}`}
              >
                {s.vote}
              </span>
              {s.rules.length > 0 && (
                <span className="font-mono text-[11px] text-faint">
                  cites {s.rules.join(", ")}
                </span>
              )}
              <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.12em] text-faint group-open:hidden">
                read reasoning
              </span>
            </summary>
            <p className="mt-2 mb-2 pl-5 text-[13px] leading-[1.7] text-ink-soft whitespace-pre-wrap">
              {s.reasoning}
            </p>
          </details>
        ))}
      </div>

      <p className="mt-3 border-t border-line/50 pt-2 font-mono text-[10.5px] tracking-[0.04em] text-faint">
        judged against constitution {record.judgedAgainst} ·{" "}
        {record.promptVersion} ·{" "}
        <a
          href={`${site.repoUrl}/blob/main/governance/arbiter/pr-${record.pr}.yaml`}
          className="underline underline-offset-2 hover:text-copper"
        >
          verbatim record
        </a>{" "}
        ·{" "}
        <a
          href={record.url}
          className="underline underline-offset-2 hover:text-copper"
        >
          pull request
        </a>
      </p>
    </article>
  );
}
