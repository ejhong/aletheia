import type { Metadata } from "next";
import { pageMeta } from "@/src/config/meta";
import Link from "next/link";
import { AssessmentBadge } from "@/src/components/AssessmentBadge";
import { GateRow } from "@/src/components/GateRow";
import { VerdictDot } from "@/src/components/VerdictDot";
import { seatTallies, unanimousRejections, voteSummary } from "@/src/domain/gate";
import { loadArbiterRecords } from "@/src/domain/governance";
import { loadAllCases } from "@/src/domain/load";
import { operationsView } from "@/src/domain/operations";
import { assessmentLabels } from "@/src/domain/schema";
import { site } from "@/src/config/site";
import {
  caseStandings,
  dissentGallery,
  opsFeed,
  seatRecords,
} from "@/src/domain/panel";

export const metadata: Metadata = pageMeta({
  title: "Operations",
  description: `How ${site.name} runs itself and how it is going: what the operator did, how every change was reviewed, what it has spent, what the panel of independent models has judged, and where they disagree.`,
  path: "/operations/",
});

/** Verdicts shown on this page; the gate's archive has every one. */
const VERDICTS_SHOWN = 10;

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
/** The panel's own bill, summed from harvested verdicts that carry a cost (since 2026-09-09). */
function verdictsCost(records: { cost?: { usd: number | null } | undefined }[]): { usd: number; judgments: number } {
  const priced = records.filter((r) => typeof r.cost?.usd === "number");
  return { usd: Number(priced.reduce((n, r) => n + (r.cost!.usd as number), 0).toFixed(2)), judgments: priced.length };
}

export default function OperationsPage() {
  const standings = caseStandings();
  const dissent = dissentGallery();
  const seats = seatRecords();
  const events = opsFeed();

  const ops = operationsView();
  const cases = loadAllCases();
  const caseTitle = (slug: string) => cases.find((c) => c.record.slug === slug || c.dir === slug)?.record.title ?? slug;
  const caseSlug = (key: string) => cases.find((c) => c.record.slug === key || c.dir === key)?.record.slug ?? null;
  const published = ops.reviews.filter((r) => r.outcome === "merged").length;
  const usd = (n: number | null) => (n === null ? "unpriced in part" : `$${n.toFixed(2)}`);
  const panelUsd = verdictsCost(loadArbiterRecords());
  const verdicts = loadArbiterRecords();

  return (
    <div className="mx-auto max-w-6xl px-5 py-14">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-copper">
        operations
      </p>
      <h1 className="font-serif text-4xl tracking-tight mt-3">
        How this site runs, and how it is going
      </h1>
      <p className="mt-4 font-serif text-lg italic text-ink-soft max-w-3xl">
        {site.name} is operated by AI under a constitution. An AI agent — the
        operator — reads the sources, writes the records and the articles,
        and proposes every change as a pull request. Models from four other
        companies review each change before it publishes: is the site better
        or worse for it, and would publishing it do harm. Five models from
        five companies judge each case blind, and their agreement is the
        standing a judgment carries. The founder holds two powers only: the
        kill switch and the constitution. This page is the public record of
        all of it, derived from the repository at every build. Disagreement
        is displayed, never resolved by hiding it.
      </p>

      {/* ── state, schedule, what is next ─────────────────────────── */}
      <section id="state" className="mt-12 scroll-mt-24">
        <h2 className="font-serif text-3xl tracking-tight">The state</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="border border-line bg-paper-deep/40 px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">automation</p>
            <p className={`mt-1 font-serif text-2xl ${ops.operation.state === "live" ? "text-verdigris" : "text-ochre"}`}>{ops.operation.state}</p>
            <p className="mt-1 text-[12.5px] text-ink-soft">since {ops.operation.since}, by the {ops.operation.by}</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-faint">{ops.operation.reason}</p>
          </div>
          <div className="border border-line bg-paper-deep/40 px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">the operator</p>
            <p className="mt-1 font-serif text-2xl">{ops.schedule.cron ? "at work" : "by hand"}</p>
            <p className="mt-1 text-[12.5px] text-ink-soft">{ops.schedule.human}</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-faint">One session at a time, each under a hard spending cap, choosing what most needs doing: answering reviewers, opening a new question, searching for what has appeared since. Its instructions are in the repository, and every session leaves a log.</p>
          </div>
          <div className="border border-line bg-paper-deep/40 px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">the review</p>
            <p className="mt-1 font-serif text-2xl">{ops.reviews.length ? `${published} of ${ops.reviews.length} published` : "no review yet"}</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-faint">Every change is read by models from vendors other than the operator&apos;s. It publishes when most judge it better, at most one worse, and none flags a harm; their notes become the operator&apos;s next work.</p>
          </div>
        </div>
      </section>

      {/* ── spend against the caps ────────────────────────────────── */}
      <section id="spend" className="mt-14 scroll-mt-24">
        <h2 className="font-serif text-3xl tracking-tight">Spend</h2>
        <p className="mt-2 text-[14px] text-ink-soft max-w-2xl">
          Every paid model call of the pipeline since 2026-09-08 is a row in the spend ledger, priced only from a reviewed tariff; the panel&apos;s calls are metered since 2026-09-09 and were unmetered before, so the all-time figures are a floor for the site&apos;s true bill. The caps are the founder&apos;s, on the record; a call that would pass one is refused, never trimmed.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {[
            ["today", `$${ops.spend.day.usd.toFixed(2)} of $${ops.spend.caps.perDay}`, `${ops.spend.day.rows} call(s)${ops.spend.day.unpriced ? `, ${ops.spend.day.unpriced} unpriced` : ""} · ${ops.spend.caps.phase} caps`],
            ["this month", `$${ops.spend.month.usd.toFixed(2)} of $${ops.spend.caps.perMonth}`, `${ops.spend.month.rows} call(s)${ops.spend.month.unpriced ? `, ${ops.spend.month.unpriced} unpriced` : ""}${ops.spend.budget.crunch ? ` · crunch until ${ops.spend.budget.crunch.until}` : ""}`],
            ["all time", usd(ops.spend.allTime.usd), `${ops.spend.allTime.calls} call(s) · ${ops.spend.allTime.inputTokens.toLocaleString("en-US")} tokens in`],
            ["the panel", panelUsd.judgments ? `$${panelUsd.usd.toFixed(2)}` : "unpriced before 2026-09-09", `${panelUsd.judgments} priced judgment(s), kept with each verdict below`],
          ].map(([k, v, note]) => (
            <div key={k} className="border border-line bg-paper-deep/40 px-4 py-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">{k}</p>
              <p className="mt-1 font-serif text-2xl">{v}</p>
              <p className="mt-1 text-[12px] text-faint">{note}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 font-mono text-[11px] tracking-[0.04em] text-faint">
          by verb: {ops.spend.byVerb.map((v) => `${v.verb} ${usd(v.usd)} (${v.rows})`).join(" · ")}
        </p>
      </section>

      {/* ── recent sittings ───────────────────────────────────────── */}
      <section id="sittings" className="mt-14 scroll-mt-24">
        <h2 className="font-serif text-3xl tracking-tight">Recent work</h2>
        <p className="mt-2 text-[14px] text-ink-soft max-w-2xl">What was done lately, across cases: the operator&apos;s sessions, each with its log, and the panel&apos;s checks — and, before 2026-10-19, the steps of the fixed pipeline that preceded the operator. Each line is a run record; each case&apos;s page carries its full record.</p>
        <ul className="mt-4 border border-line bg-paper">
          {ops.sittings.map((r) => (
            <li key={r.runId} className="flex flex-wrap gap-x-3 gap-y-0.5 border-b border-line/60 last:border-b-0 px-4 py-2 text-[13px] leading-relaxed text-ink-soft">
              <span className="font-mono text-[10.5px] tracking-[0.06em] text-faint w-[6.5rem] shrink-0">{r.date}</span>
              <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-copper w-[4.5rem] shrink-0">{r.verb}</span>
              {caseSlug(r.case) ? (
                <Link href={`/cases/${caseSlug(r.case)}/record/#sitting-${r.runId}`} className="w-[12rem] shrink-0 truncate hover:text-copper">{caseTitle(r.case)}</Link>
              ) : (
                <span className="w-[12rem] shrink-0 truncate">across the site</span>
              )}
              {r.verb === "session" ? (
                <a href={`${site.repoUrl}/blob/main/runs/${r.runId}/log.md`} className="font-mono text-[10px] uppercase tracking-[0.12em] underline underline-offset-2 hover:text-copper">the log</a>
              ) : null}
              <span className="min-w-0">
                {r.summary}
                {r.outcome !== "completed" ? <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ochre">{r.outcome}</span> : null}
                {r.usd !== null ? <span className="ml-2 font-mono text-[10px] text-faint">${r.usd.toFixed(2)}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── reviews ───────────────────────────────────────────────── */}
      <section id="reviews" className="mt-14 scroll-mt-24">
        <h2 className="font-serif text-3xl tracking-tight">Reviews</h2>
        <p className="mt-2 text-[14px] text-ink-soft max-w-2xl">
          Every change the operator proposes is read, before it publishes, by models from vendors other than the operator&apos;s. Each says whether the change leaves the site better, no better or worse for a reader seeking the truth, whether publishing it would cause a harm that cannot be taken back — a fabricated or misattributed source, confidential material, an unsupported statement about a living person — and what would improve it. A change publishes when most judge it better, at most one worse, and no harm stands. The notes never block; they are the operator&apos;s next work.
        </p>
        {ops.reviews.length === 0 ? (
          <p className="mt-3 text-[13.5px] text-faint">No change has been reviewed under this rule yet; the first reviews arrive with the operator&apos;s first sessions.</p>
        ) : (
          <ul className="mt-4 border border-line bg-paper">
            {ops.reviews.slice(0, 20).map((r) => {
              const last = r.rounds.at(-1)!;
              const count = (v: string) => last.seats.filter((s) => s.verdict === v).length;
              const harms = last.seats.filter((s) => s.harm);
              return (
                <li key={r.pr} className="flex flex-wrap gap-x-3 gap-y-0.5 border-b border-line/60 last:border-b-0 px-4 py-2 text-[13px] leading-relaxed text-ink-soft">
                  <span className={`font-mono text-[10px] uppercase tracking-[0.14em] w-[5.5rem] shrink-0 ${r.outcome === "merged" ? "text-verdigris" : "text-faint"}`}>{r.outcome === "merged" ? "published" : "withdrawn"}</span>
                  <span className="font-mono text-[10.5px] tracking-[0.06em] text-faint w-[6.5rem] shrink-0">{r.outcomeAt.slice(0, 10)}</span>
                  <span className="min-w-0 flex-1">
                    <a href={r.url} className="hover:text-copper">#{r.pr} — {r.title}</a>
                    <span className="block font-mono text-[10.5px] text-faint">
                      {last.seats.length ? `${count("better")} better · ${count("no_better")} no better · ${count("worse")} worse` : last.reason}{harms.length ? ` · harm flagged: ${harms.map((h) => h.harm!.kind).join(", ")}` : ""}
                      {r.rounds.length > 1 ? ` · ${r.rounds.length} rounds` : ""}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <details className="mt-6">
          <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.14em] text-faint hover:text-copper">The constitutional gate&apos;s review notes, 2026-09-09 to 2026-10-19</summary>
        <p className="mt-2 text-[14px] text-ink-soft max-w-2xl">
          Before 2026-10-19 every change faced a constitutional gate that voted complies or violates; when four seats passed a change over one seat&apos;s objection, the objection became an issue the operator answered on the record. That gate was replaced by the review above (founder amendment of AGENTS.md §3.15, 2026-10-19); its notes are kept here as they stood.
        </p>
        {ops.reviewNotes.length === 0 ? (
          <p className="mt-3 text-[13.5px] text-faint">None.</p>
        ) : (
          <ul className="mt-4 border border-line bg-paper">
            {ops.reviewNotes.map((n) => (
              <li key={n.number} className="flex flex-wrap gap-x-3 gap-y-0.5 border-b border-line/60 last:border-b-0 px-4 py-2 text-[13px] leading-relaxed text-ink-soft">
                <span className={`font-mono text-[10px] uppercase tracking-[0.14em] w-[3.5rem] shrink-0 ${n.state === "open" ? "text-ochre" : "text-faint"}`}>{n.state}</span>
                <span className="font-mono text-[10.5px] tracking-[0.06em] text-faint w-[6.5rem] shrink-0">{n.createdAt}</span>
                <span className="min-w-0 flex-1">
                  <a href={n.url} className="hover:text-copper">
                    {n.pr !== null ? `#${n.pr} — ` : ""}{n.seat ?? "a seat"}: {n.rules.join(", ")}{n.paradigm ? ` (${n.paradigm})` : ""}
                  </a>
                  {n.commit ? <span className="ml-2 font-mono text-[10px] text-faint">on {n.commit.slice(0, 7)}</span> : null}
                  {n.answer ? (
                    <span className="block text-[12px] text-ink-soft">
                      answered by {n.answer.by} on {n.answer.at}: {n.answer.excerpt.length > 160 ? n.answer.excerpt.slice(0, 159).trimEnd() + "…" : n.answer.excerpt}{" "}
                      <a href={n.answer.url} className="font-mono text-[10px] underline underline-offset-2 hover:text-copper">the reply</a>
                    </span>
                  ) : n.state === "closed" ? (
                    <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-ochre">closed without an answer on the record</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
        </details>
      </section>

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
          <h2 className="font-serif text-3xl tracking-tight">The constitutional gate, 2026-09-09 to 2026-10-19</h2>
          <p className="mt-2 text-[14px] text-ink-soft max-w-2xl">
            Before the review above, every consequential change was judged by a
            constitutional panel voting complies or violates:{" "}
            {verdicts.filter((r) => r.verdict === "pass").length} passed and{" "}
            {verdicts.filter((r) => r.verdict === "park").length} parked. It
            asked whether a change could be defended, not whether it made the
            site truer, and one seat cast nearly every objection; the founder
            replaced it on 2026-10-19. Its record is kept: each verdict opens
            to every seat&apos;s vote and reasoning in full.
          </p>
          <ul className="mt-5 border border-line bg-paper">
            {verdicts.slice(0, VERDICTS_SHOWN).map((r) => (
              <GateRow key={r.pr} record={r} summary={voteSummary(r)} />
            ))}
          </ul>
          <p className="mt-3">
            <Link href="/operations/gate/" className="font-mono text-[11px] uppercase tracking-[0.16em] text-copper underline underline-offset-4 hover:text-ink">
              All {verdicts.length} verdicts →
            </Link>
          </p>

          <h3 className="font-serif text-2xl tracking-tight mt-10">How each seat has voted</h3>
          <p className="mt-2 text-[14px] text-ink-soft max-w-2xl">
            A panel is only as independent as its seats are different. If one
            seat does all the objecting, the others are agreeing rather than
            judging, and this table is where that would show.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
                  <th className="text-left py-2 pr-4 font-normal">Seat</th>
                  <th className="text-right px-3 font-normal">Judged</th>
                  <th className="text-right px-3 font-normal">Complies</th>
                  <th className="text-right px-3 font-normal">Unsure</th>
                  <th className="text-right px-3 font-normal">Violates</th>
                  <th className="text-right pl-3 font-normal">Objected alone</th>
                </tr>
              </thead>
              <tbody>
                {seatTallies(verdicts).map((t) => (
                  <tr key={t.key} className="border-b border-line/60">
                    <td className="py-2.5 pr-4 font-mono text-[12px]" title={t.labels.length > 1 ? `This seat has been held by: ${t.labels.join("; ")}` : undefined}>
                      {t.label}
                      {t.labels.length > 1 ? <span className="text-faint"> and {t.labels.length - 1} before it</span> : null}
                    </td>
                    <td className="text-right px-3">{t.judged}</td>
                    <td className="text-right px-3">{t.complies}</td>
                    <td className="text-right px-3">{t.unsure}</td>
                    <td className="text-right px-3">{t.violates}</td>
                    <td className="text-right pl-3">{t.alone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-faint max-w-2xl">
            Every seat voted &ldquo;violates&rdquo; on {unanimousRejections(verdicts).length} changes;
            the panel must reject any edit to the constitution, which is the
            founder&apos;s alone to make, so a unanimous rejection is usually that. A
            seat that objects alone does not stop a change unless the
            objection is to a fabrication, to material supplied in confidence,
            or to an edit of the constitution; otherwise it is recorded as a
            review note, above.
          </p>
        </section>
      )}

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
