import type { Metadata } from "next";
import Link from "next/link";
import { loadProposalRuns } from "@/src/domain/agendaProposals";
import { loadAllCases } from "@/src/domain/load";
import { site } from "@/src/config/site";

/**
 * The proposals shelf: the machine's own suggested next questions, from
 * the weekly agenda-generation run. Deliberately framed as ideas under
 * review — nothing here is a claim, a grade, or an agenda item until it
 * is adopted through the normal gates.
 */

export const metadata: Metadata = { title: "Proposals" };

const label = "font-mono text-[11px] uppercase tracking-[0.16em] text-faint";

/** One seat's score as a quiet glyph; the full text lives in the title. */
function seatGlyph(seat: string): { glyph: string; cls: string } {
  if (seat.endsWith(": high")) return { glyph: "●", cls: "text-copper" };
  if (seat.endsWith(": medium")) return { glyph: "◐", cls: "text-slate-mist" };
  if (seat.endsWith(": low")) return { glyph: "○", cls: "text-slate-mist" };
  return { glyph: "×", cls: "text-faint" }; // failed seat: reported, never neutral
}

/** The proposal's one-word fate, derived — never stored, never guessed. */
function fate(p: {
  score?: { advances: boolean; concerns: string[]; highs: number };
  draftedAs?: string;
  kind: string;
}): { label: string; cls: string } | null {
  if (!p.score) return null; // unscored run: no fate to report yet
  if (p.draftedAs)
    return { label: `pre-registered · ${p.draftedAs}`, cls: "text-copper" };
  if (p.score.concerns.length > 0)
    return { label: "blocked — constitutional concern", cls: "text-ink-soft" };
  if (p.score.advances)
    return { label: "advancing — freeze queued", cls: "text-copper" };
  return { label: `retired · ${p.score.highs}/5 high`, cls: "text-faint" };
}

export default function ProposalsPage() {
  const runs = loadProposalRuns();
  // Proposals may exist for cases that are not (yet) published pages;
  // link only the live ones — a dead link is a checker failure and a
  // reader betrayal alike.
  const liveSlugs = new Set(loadAllCases().map((c) => c.record.slug));

  const all = runs.flatMap((r) => r.files.flatMap((f) => f.proposals));
  const scored = all.filter((p) => p.score);
  const totals = {
    proposals: all.length,
    preRegistered: all.filter((p) => p.draftedAs).length,
    advancing: all.filter((p) => p.score?.advances && !p.draftedAs).length,
    blocked: scored.filter((p) => (p.score?.concerns.length ?? 0) > 0).length,
    retired: scored.filter(
      (p) => !p.score?.advances && (p.score?.concerns.length ?? 0) === 0,
    ).length,
    unscored: all.length - scored.length,
  };

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <p className={label}>agenda generation · weekly</p>
      <h1 className="font-serif text-4xl tracking-tight mt-3">Proposals</h1>
      <p className="mt-3 text-ink-soft max-w-2xl">
        Once a week, the maintenance run reads each case&apos;s ledger and
        proposes what it implies but does not yet contain — a new claim, a
        new research item, or a new frozen-criteria study. Everything on
        this page is a <em>proposal only</em>: it enters the record only if
        adopted through the same gates as any other change — editorial
        judgment, pre-registration where applicable, the risk classifier,
        and the constitutional panel. Since 2026-09-01 every proposal is
        also scored by the five-vendor panel for expected information
        gain: four seats high with no constitutional concern advances a
        study to pre-registration; everything else retires on the record,
        with five opinions instead of silence.
      </p>

      {totals.proposals > 0 && (
        <div className="mt-8 border border-line bg-paper px-5 py-4 flex flex-wrap gap-x-8 gap-y-2">
          {(
            [
              ["proposed", totals.proposals],
              ["pre-registered", totals.preRegistered],
              ["advancing", totals.advancing],
              ["retired", totals.retired],
              ["blocked", totals.blocked],
              ...(totals.unscored > 0
                ? ([["awaiting scores", totals.unscored]] as const)
                : []),
            ] as const
          ).map(([name, n]) => (
            <div key={name}>
              <span className="font-serif text-2xl tracking-tight">{n}</span>
              <span className={`ml-2 ${label}`}>{name}</span>
            </div>
          ))}
        </div>
      )}

      {runs.length === 0 ? (
        <p className="mt-10 border border-line bg-paper px-5 py-4 max-w-2xl text-[13.5px] text-ink-soft">
          No proposals yet. The first weekly agenda-generation run to
          produce any will populate this page.
        </p>
      ) : (
        runs.map((run) => (
          <section key={run.runId} className="mt-10">
            <h2 className="font-serif text-2xl tracking-tight">
              Run of {run.date}
              <span className="ml-3 font-mono text-[11px] tracking-[0.14em] text-faint">
                {run.runId}
              </span>
            </h2>
            {run.files.map((file) => (
              <div key={file.caseSlug} className="mt-6">
                <p className={label}>
                  {liveSlugs.has(file.caseSlug) ? (
                    <Link
                      href={`/cases/${file.caseSlug}/`}
                      className="text-copper hover:underline"
                    >
                      {file.caseSlug}
                    </Link>
                  ) : (
                    <span>{file.caseSlug} (case not yet published)</span>
                  )}{" "}
                  · {file.proposals.length} proposal
                  {file.proposals.length === 1 ? "" : "s"}
                  {file.skippedBlocks > 0
                    ? ` · ${file.skippedBlocks} malformed block(s) skipped`
                    : ""}
                </p>
                <ul className="mt-3 space-y-4">
                  {file.proposals.map((p) => (
                    <li key={p.title} className="border border-line bg-paper p-5">
                      <p className={`${label} flex flex-wrap items-baseline gap-x-3 gap-y-1`}>
                        <span className="text-copper">{p.kind}</span>
                        <span>effort: {p.effortTier}</span>
                        {p.score && (
                          <span
                            className="tracking-[0.3em]"
                            title={p.score.seats.join("\n")}
                          >
                            {p.score.seats.map((s, i) => {
                              const g = seatGlyph(s);
                              return (
                                <span key={i} className={g.cls}>
                                  {g.glyph}
                                </span>
                              );
                            })}
                          </span>
                        )}
                        {(() => {
                          const f = fate(p);
                          return f ? (
                            <span className={`ml-auto ${f.cls}`}>{f.label}</span>
                          ) : null;
                        })()}
                      </p>
                      <h3 className="mt-2 font-serif text-xl tracking-tight">
                        {p.title}
                      </h3>
                      {p.score && p.score.concerns.length > 0 && (
                        <p className="mt-2 text-[13px] leading-relaxed text-ink-soft border-l-2 border-line pl-3">
                          <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">
                            concern
                          </span>{" "}
                          {p.score.concerns.join(" · ")}
                        </p>
                      )}
                      <p className="mt-2 text-[14px] leading-relaxed">
                        {p.question}
                      </p>
                      <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
                        <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">
                          closest existing
                        </span>{" "}
                        {p.closestExisting.join(", ")} — {p.gap}
                      </p>
                      <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
                        <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">
                          would settle
                        </span>{" "}
                        {p.wouldSettle}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="mt-4 font-mono text-[11px] tracking-[0.1em] text-faint">
              provenance: {run.files[0]?.model}, promptVersion{" "}
              {run.files[0]?.promptVersion} —{" "}
              <a
                href={`${site.repoUrl}/tree/main/proposals/agenda/${run.runId}`}
                className="text-copper hover:underline"
              >
                raw files in the repository →
              </a>
            </p>
          </section>
        ))
      )}
    </div>
  );
}
