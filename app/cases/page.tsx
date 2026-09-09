import type { Metadata } from "next";
import { CaseCard } from "@/src/components/CaseCard";
import { caseCover, loadAllCases } from "@/src/domain/load";
import { crossModelSummary } from "@/src/domain/standing";
import { caseQuestion } from "@/src/domain/editions";
import { caseView, reviewCoverage } from "@/src/domain/view";

export const metadata: Metadata = { title: "Cases" };

export default function CasesPage() {
  const cases = loadAllCases();
  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <h1 className="font-serif text-4xl tracking-tight">Cases</h1>
      <p className="mt-3 text-ink-soft max-w-2xl">
        Each case maps one contested hypothesis: an overview you can read, a
        claim ladder you can audit, evidence with provenance, and the
        experiments that would settle it.
      </p>
      {cases.length === 0 ? (
        <div className="border border-line px-6 py-10 max-w-2xl mt-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-copper">
            no cases published yet
          </p>
          <p className="mt-3 text-[14.5px] leading-relaxed text-ink-soft">
            The first case dossiers are in preparation and will appear here
            when their claims, evidence, and sources meet the site&apos;s
            provenance standards.
          </p>
        </div>
      ) : null}
      <div className="grid sm:grid-cols-2 gap-4 mt-8">
        {cases.map((c) => {
          const view = caseView(c);
          const sum = crossModelSummary(c);
          return (
            <CaseCard
              key={c.record.id}
              record={c.record}
              question={caseQuestion(c)}
              components={view.header.components}
              priority={view.header.researchPriority?.level ?? null}
              verdict={view.assessment?.caseAssessment.verdict ?? null}
              standing={view.standing?.status ?? null}
              reviewCoverage={reviewCoverage(view)}
              check={
                sum
                  ? {
                      models: sum.models.length,
                      concur: sum.caseUnanimousWithDisplayed,
                    }
                  : null
              }
              cover={caseCover(c)}
            />
          );
        })}
      </div>
    </div>
  );
}
