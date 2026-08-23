import type { Metadata } from "next";
import { CaseCard } from "@/src/components/CaseCard";
import {
  caseCover,
  crossModelSummary,
  displayAssessment,
  loadAllCases,
  reviewCoverage,
} from "@/src/domain/load";

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
      <div className="grid sm:grid-cols-2 gap-4 mt-8">
        {cases.map((c) => {
          const shown = displayAssessment(c);
          const sum = crossModelSummary(c);
          return (
            <CaseCard
              key={c.record.id}
              record={c.record}
              verdict={shown?.run.caseAssessment.verdict ?? null}
              verdictHumanEndorsed={shown?.humanEndorsed ?? false}
              reviewCoverage={reviewCoverage(c)}
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
