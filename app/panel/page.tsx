import type { Metadata } from "next";
import Link from "next/link";
import { ArbiterVerdictCard } from "@/src/components/ArbiterVerdictCard";
import { AssessmentBadge } from "@/src/components/AssessmentBadge";
import { VerdictDot } from "@/src/components/VerdictDot";
import { loadArbiterRecords, loadPromotionsLedger } from "@/src/domain/governance";
import { loadProposalRuns } from "@/src/domain/agendaProposals";
import { loadAllCases } from "@/src/domain/load";
import { assessmentLabels } from "@/src/domain/schema";
import {
  caseStandings,
  dissentGallery,
  opsFeed,
  seatRecords,
} from "@/src/domain/panel";

export const metadata: Metadata = { title: "The Panel" };

const statusChip: Record<string, string> = {
  ratified: "text-verdigris border-verdigris/40",
  contested: "text-ochre border-ochre/40",
  unratified: "text-faint border-line",
};

const kindTag: Record<string, string> = {
  arbiter: "text-copper",
  panel: "text-verdigris",
  content: "text-ink-soft",
  quarantine: "text-terracotta",
};

/**
 * The site's governance, made visible. Everything on this page is derived
 * at build time from the same records the rest of the site runs on —
 * nothing here is authored, so it cannot drift from the ledger.
 */
export default function PanelPage() {
  const standings = caseStandings();
  const dissent = dissentGallery();
  const seats = seatRecords();
  const events = opsFeed();

  // Metabolism vitals, derived from the same ledgers the loops write —
  // no stored counters, nothing to drift. KISS by founder direction:
  // one row of numbers, each backed by an inspectable file.
  const allProposals = loadProposalRuns().flatMap((r) =>
    r.files.flatMap((f) => f.proposals),
  );
  const promotions = loadPromotionsLedger();
  const studies = loadAllCases().flatMap((c) => c.studies);
  const metabolism: Array<[string, number]> = [
    ["proposals scored", allProposals.filter((p) => p.score).length],
    [
      "advanced by the panel",
      allProposals.filter((p) => p.score?.advances || p.draftedAs).length,
    ],
    ["studies pre-registered", studies.filter((s) => s.rows.length === 0).length],
    ["studies collected", studies.filter((s) => s.rows.length > 0).length],
    [
      "sources promoted",
      promotions.filter((e) => e.disposition === "promoted").length,
    ],
    [
      "duplicates refused",
      promotions.filter((e) => e.disposition === "duplicate").length,
    ],
  ];
  const verdicts = loadArbiterRecords();

  return (
    <div className="mx-auto max-w-6xl px-5 py-14">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-copper">
        the panel
      </p>
      <h1 className="font-serif text-4xl tracking-tight mt-3">
        Who judges this site, and how it is going
      </h1>
      <p className="mt-4 font-serif text-lg italic text-ink-soft max-w-3xl">
        Aletheia is operated by AI. Five independent models — different
        vendors, judging blind — ratify or contest every assessment, and a
        constitutional panel votes on every consequential change. This page
        is their public record, derived from the ledger at every build.
        Disagreement is displayed, never resolved by hiding it.
      </p>

      {/* ── standings ─────────────────────────────────────────────── */}
      <section id="standings" className="mt-12 scroll-mt-24">
        <h2 className="font-serif text-3xl tracking-tight">Standings</h2>
        <p className="mt-2 text-[14px] text-ink-soft max-w-2xl">
          Contested first, because disagreement is the news. Dots are the
          five seats&apos; case verdicts; the hollow ring is the house
          draft&apos;s.
        </p>
        <div className="mt-6 space-y-2">
          {standings.map((s) => (
            <div
              key={s.slug}
              id={s.slug}
              className="border border-line bg-paper-deep/40 px-4 py-3 scroll-mt-24"
            >
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href={`/cases/${s.slug}/`}
                  className="font-serif text-lg hover:text-copper min-w-44"
                >
                  {s.title}
                </Link>
                <AssessmentBadge state={s.verdict} />
                <span
                  className={`border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${statusChip[s.ratification.status]}`}
                >
                  {s.ratification.status}
                  {s.ratification.panel > 0
                    ? ` · ${s.ratification.agreeing}/${s.ratification.panel}`
                    : ""}
                </span>
                <span className="flex items-center gap-1.5 ml-auto">
                  <VerdictDot state={s.verdict} hollow label="house draft" />
                  <span className="w-2" />
                  {s.seatVerdicts.map((v) => (
                    <VerdictDot key={v.seat} state={v.verdict} label={v.seat} />
                  ))}
                </span>
              </div>
              <p className="mt-1.5 font-mono text-[11px] tracking-[0.04em] text-faint">
                {s.ratification.reason}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── dissent gallery ───────────────────────────────────────── */}
      <section id="dissent" className="mt-14 scroll-mt-24">
        <h2 className="font-serif text-3xl tracking-tight">
          Where the models disagree
        </h2>
        <p className="mt-2 text-[14px] text-ink-soft max-w-2xl">
          Every claim on which the current panel splits against the house
          draft — the most honest content this site can show. Open a row for
          each seat&apos;s reasoning.
        </p>
        <div className="mt-6 grid md:grid-cols-2 gap-3">
          {dissent.map((d) => (
            <details
              key={`${d.caseSlug}-${d.claimId}`}
              className="border border-line bg-paper px-4 py-3 group"
            >
              <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <span className="flex flex-wrap items-center gap-2">
                  <span
                    aria-hidden
                    className="font-mono text-[10px] text-faint transition-transform group-open:rotate-90"
                  >
                    ▸
                  </span>
                  <Link
                    href={`/claims/${d.claimId}/`}
                    className="font-mono text-[12px] tracking-[0.06em] text-copper hover:underline"
                  >
                    {d.claimId}
                  </Link>
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                    {d.caseTitle}
                  </span>
                  <span className="flex items-center gap-1.5 ml-auto">
                    <VerdictDot
                      state={d.houseVerdict}
                      hollow
                      label="house draft"
                    />
                    <span className="w-1.5" />
                    {d.seats.map((s) => (
                      <VerdictDot
                        key={s.seat}
                        state={s.verdict}
                        label={s.seat}
                      />
                    ))}
                  </span>
                </span>
              </summary>
              <div className="mt-3 space-y-2.5 border-t border-line/60 pt-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
                  house: {assessmentLabels[d.houseVerdict]}
                </p>
                {d.seats.map((s) => (
                  <p key={s.seat} className="text-[13px] leading-[1.65] text-ink-soft">
                    <span className="font-mono text-[11px] text-copper">
                      {s.seat}
                    </span>{" "}
                    <span className="font-mono text-[10px] uppercase text-faint">
                      ({assessmentLabels[s.verdict]})
                    </span>{" "}
                    — {s.reasoning}
                  </p>
                ))}
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* ── seat records ──────────────────────────────────────────── */}
      <section id="seats" className="mt-14 scroll-mt-24">
        <h2 className="font-serif text-3xl tracking-tight">The seats</h2>
        <p className="mt-2 text-[14px] text-ink-soft max-w-2xl">
          Five models, five vendors, judged by their record — not their
          reputation. If these numbers ever converge to unanimity, model
          diversity has stopped doing work, and this table will be the first
          to say so.
        </p>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
                <th className="text-left py-2 pr-4">Seat</th>
                <th className="text-right px-3">Cases judged</th>
                <th className="text-right px-3">Agrees with house</th>
                <th className="text-right px-3">Claim-level exact</th>
                <th className="text-left pl-4">Closest ally / furthest</th>
              </tr>
            </thead>
            <tbody>
              {seats.map((s) => {
                const pairs = Object.entries(s.pairwise)
                  .map(([seat, p]) => ({ seat, rate: p.agree / p.total }))
                  .sort((a, b) => b.rate - a.rate);
                const first = pairs[0];
                const last = pairs[pairs.length - 1];
                return (
                  <tr
                    key={s.seat}
                    id={`seat-${s.seat.split(" ")[0].toLowerCase()}`}
                    className="border-b border-line/60 scroll-mt-24"
                  >
                    <td className="py-2.5 pr-4 font-mono text-[12px]">{s.seat}</td>
                    <td className="text-right px-3">{s.casesJudged}</td>
                    <td className="text-right px-3">
                      {s.agreesWithHouse}/{s.casesJudged}
                    </td>
                    <td className="text-right px-3">
                      {s.claimVotes > 0
                        ? `${Math.round((100 * s.claimExact) / s.claimVotes)}%`
                        : "—"}
                    </td>
                    <td className="pl-4 font-mono text-[11px] text-ink-soft">
                      {first
                        ? `${first.seat.split(" (")[0]} ${Math.round(first.rate * 100)}% · ${last.seat.split(" (")[0]} ${Math.round(last.rate * 100)}%`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── the gate ──────────────────────────────────────────────── */}
      {verdicts.length > 0 && (
        <section id="gate" className="mt-14 scroll-mt-24">
          <h2 className="font-serif text-3xl tracking-tight">The gate</h2>
          <p className="mt-2 text-[14px] text-ink-soft max-w-2xl">
            Every consequential change is judged by the constitutional panel
            before it merges. Each verdict below is shown in full — every
            seat&apos;s vote, the rules it cited, and its complete reasoning,
            verbatim from the harvested record.
          </p>
          <div className="mt-6 space-y-4">
            {verdicts.map((r) => (
              <ArbiterVerdictCard key={r.pr} record={r} />
            ))}
          </div>
        </section>
      )}

      {/* ── metabolism vitals ─────────────────────────────────────── */}
      <section id="metabolism" className="mt-14 scroll-mt-24">
        <h2 className="font-serif text-3xl tracking-tight">Metabolism</h2>
        <p className="mt-2 text-[14px] text-ink-soft max-w-2xl">
          What the automated loops have produced, in totals derived from
          the repository&apos;s own ledgers — the{" "}
          <Link href="/proposals/" className="underline underline-offset-2 hover:text-copper">
            proposal shelf
          </Link>{" "}
          for the Bench, and the promotions dispositions ledger for the
          import pipe. Every artifact behind these numbers rode the same
          gates as any human change.
        </p>
        <div className="mt-6 border border-line bg-paper px-5 py-4 flex flex-wrap gap-x-8 gap-y-2">
          {metabolism.map(([name, n]) => (
            <div key={name}>
              <span className="font-serif text-2xl tracking-tight">{n}</span>
              <span className="ml-2 font-mono text-[11px] uppercase tracking-[0.16em] text-faint">
                {name}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── operations log ────────────────────────────────────────── */}
      <section id="operations" className="mt-14 scroll-mt-24">
        <h2 className="font-serif text-3xl tracking-tight">Operations log</h2>
        <p className="mt-2 text-[14px] text-ink-soft max-w-2xl">
          The machine&apos;s visible metabolism: panels convened, verdicts
          on pull requests, content changes, quarantined replies. Derived
          from the repository —{" "}
          <a
            href="https://github.com/ejhong/aletheia"
            className="underline underline-offset-2 hover:text-copper"
          >
            watch it live on GitHub
          </a>
          .
        </p>
        <div className="mt-6 border-t border-line">
          {events.map((e, i) => (
            <div
              key={i}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-line/50 py-2"
            >
              <span className="font-mono text-[11px] text-faint w-24 shrink-0">
                {e.date}
              </span>
              <span
                className={`font-mono text-[10px] uppercase tracking-[0.14em] w-24 shrink-0 ${kindTag[e.kind]}`}
              >
                {e.kind}
              </span>
              <span className="text-[13.5px]">
                {e.href ? (
                  e.href.startsWith("/") ? (
                    <Link href={e.href} className="hover:text-copper">
                      {e.title}
                    </Link>
                  ) : (
                    <a href={e.href} className="hover:text-copper">
                      {e.title}
                    </a>
                  )
                ) : (
                  e.title
                )}{" "}
                <span className="text-faint text-[12.5px]">— {e.detail}</span>
                {e.sourceHref && (
                  <a
                    href={e.sourceHref}
                    className="ml-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint underline underline-offset-2 hover:text-copper whitespace-nowrap"
                  >
                    {e.sourceLabel ?? "record"} ↗
                  </a>
                )}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
