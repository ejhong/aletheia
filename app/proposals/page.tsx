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

export default function ProposalsPage() {
  const runs = loadProposalRuns();
  // Proposals may exist for cases that are not (yet) published pages;
  // link only the live ones — a dead link is a checker failure and a
  // reader betrayal alike.
  const liveSlugs = new Set(loadAllCases().map((c) => c.record.slug));

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
        and the constitutional panel. Ignoring a proposal is the default
        outcome, not a decision.
      </p>

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
                      <p className={label}>
                        <span className="text-copper">{p.kind}</span>
                        <span className="ml-3">effort: {p.effortTier}</span>
                      </p>
                      <h3 className="mt-2 font-serif text-xl tracking-tight">
                        {p.title}
                      </h3>
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
