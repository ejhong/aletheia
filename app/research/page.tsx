import type { Metadata } from "next";
import Link from "next/link";
import { PriorityBadge } from "@/src/components/PriorityBadge";
import { ResearchCard } from "@/src/components/ResearchCard";
import { loadAllCases } from "@/src/domain/load";
import type {
  LoadedCase,
  ResearchOpportunity,
} from "@/src/domain/schema";

export const metadata: Metadata = { title: "The Price of Truth" };

type Entry = {
  item: ResearchOpportunity;
  caseTitle: string;
  caseSlug: string;
  casePriority: LoadedCase["record"]["researchPriority"]["level"];
  /** Set when a founder conjecture names this test as decisive for it. */
  testsConjecture: boolean;
};

const tiers = [
  {
    key: "desk" as const,
    title: "Desk work",
    blurb:
      "Reanalysis, preregistration, and mathematics on existing data and public archives. No instrument time, no fieldwork — the cheapest truths on the menu.",
  },
  {
    key: "lab" as const,
    title: "Laboratory",
    blurb:
      "Bench experiments and instrument time: blinded materials analysis, coherence measurements, replications under preregistered protocols.",
  },
  {
    key: "field" as const,
    title: "Field",
    blurb:
      "Work that leaves the building: site sampling, archives in person, multi-year observational designs.",
  },
];

export default function ResearchPage() {
  const cases = loadAllCases();
  const entries: Entry[] = cases.flatMap((c) => {
    const conjectureTests = new Set(
      c.conjectures.flatMap((j) => j.decisiveTestIds),
    );
    return c.research.map((item) => ({
      item,
      caseTitle: c.record.title,
      caseSlug: c.record.slug,
      casePriority: c.record.researchPriority.level,
      testsConjecture: conjectureTests.has(item.id),
    }));
  });

  const byTier = (tier: "desk" | "lab" | "field") =>
    entries
      .filter((e) => e.item.effortTier === tier)
      .sort(
        (a, b) =>
          ["high", "medium", "low"].indexOf(a.casePriority) -
          ["high", "medium", "low"].indexOf(b.casePriority),
      );

  const counts = {
    desk: byTier("desk").length,
    lab: byTier("lab").length,
    field: byTier("field").length,
  };

  return (
    <div>
      <section className="bg-dossier text-dossier-text">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-copper">
            the research agenda, priced
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl mt-3 tracking-tight">
            The Price of Truth
          </h1>
          <p className="mt-4 text-[15.5px] leading-relaxed text-dossier-text/90 max-w-3xl">
            Every case on this site ends the same way: not in a verdict, but
            in the specific study that would move it. This page collects all
            of them — {entries.length} decisive tests across {cases.length}{" "}
            contested questions. Most have never been run. Many cost less
            than the argument about them has. Each is designed so that either
            outcome is informative: a program that funds tests in both
            directions, not confirmations.
          </p>
          <div className="grid sm:grid-cols-3 gap-px bg-dossier-line border border-dossier-line mt-8 max-w-3xl">
            {tiers.map((t) => (
              <div key={t.key} className="bg-dossier-soft p-5">
                <p className="font-serif text-3xl">{counts[t.key]}</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-copper mt-1">
                  {t.title} tests
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-5">
        {tiers.map((t) => {
          const group = byTier(t.key);
          if (group.length === 0) return null;
          return (
            <section key={t.key} className="pt-12 scroll-mt-28" id={t.key}>
              <h2 className="font-serif text-3xl tracking-tight">
                {t.title}
              </h2>
              <p className="mt-2 text-[14px] text-ink-soft max-w-2xl">
                {t.blurb}
              </p>
              <div className="grid sm:grid-cols-2 gap-4 mt-6">
                {group.map((e) => (
                  <div key={e.item.id} className="flex flex-col">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <Link
                        href={`/cases/${e.caseSlug}/`}
                        className="font-mono text-[10px] uppercase tracking-[0.14em] text-copper hover:underline underline-offset-2"
                      >
                        {e.caseTitle}
                      </Link>
                      <PriorityBadge level={e.casePriority} />
                      {e.testsConjecture ? (
                        <span
                          className="font-mono text-[10px] uppercase tracking-[0.12em] text-ochre"
                          title="A named editor has staked an on-the-record conjecture on this test's outcome"
                        >
                          tests a founder conjecture
                        </span>
                      ) : null}
                    </div>
                    <ResearchCard item={e.item} />
                  </div>
                ))}
              </div>
            </section>
          );
        })}

        <section className="py-14">
          <div className="border border-line bg-paper-deep/50 p-6 sm:p-8 max-w-3xl">
            <h2 className="font-serif text-2xl tracking-tight">
              Why this page exists
            </h2>
            <p className="mt-3 text-[14.5px] leading-relaxed text-ink-soft">
              Long-running controversies survive on ambiguity: every result
              gets absorbed, every anomaly explained away, and the argument
              outlives everyone in it. The tests above are written to end
              that — rules fixed before anyone looks, statistics both sides
              endorse in advance, and outcomes that proponents and critics
              alike have agreed would count. History&apos;s vindicated
              heresies were not won by rhetoric; they were won by a decisive,
              repeatable signature that forced the issue. This is the menu of
              such signatures, waiting for someone to order.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
