import { CaseCard } from "./CaseCard";
import { caseQuestion } from "@/src/domain/editions";
import { caseCover } from "@/src/domain/load";
import type { LoadedCase } from "@/src/domain/schema";
import { caseView, reviewCoverage } from "@/src/domain/view";

/** The cases as cards, two abreast: the home page and the case index show the same grid. */
export function CaseGrid({ cases }: { cases: LoadedCase[] }) {
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {cases.map((c) => {
        const view = caseView(c);
        return (
          <CaseCard
            key={c.record.id}
            record={c.record}
            question={caseQuestion(c)}
            components={view.header.components}
            priority={view.header.researchPriority?.level ?? null}
            verdict={view.assessment?.caseAssessment.verdict ?? null}
            standing={view.standing}
            reviewCoverage={reviewCoverage(view)}
            cover={caseCover(c)}
          />
        );
      })}
    </div>
  );
}
