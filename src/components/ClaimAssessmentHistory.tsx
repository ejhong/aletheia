import type { AssessmentRun } from "@/src/domain/schema";
import { AssessmentBadge } from "./AssessmentBadge";
import { LinkedRecordText } from "./LinkedRecordText";

/** Preserved judgments remain inspectable even before an edition adopts them. */
export function ClaimAssessmentHistory({ claimId, runs, displayedRunId }: {
  claimId: string; runs: AssessmentRun[]; displayedRunId?: string;
}) {
  const history = runs.flatMap(run => {
    const entry = run.claimAssessments.find(assessment => assessment.claimId === claimId);
    return entry ? [{ run, entry }] : [];
  });
  if (!history.length) return null;
  return (
    <details className="edition-disclosure mt-10 scroll-mt-24">
      <summary>
        Assessment history{" "}
        <span className="ml-3 font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
          {history.length} {history.length === 1 ? "record" : "records"}
        </span>
      </summary>
      <p className="mt-3 text-[13px] text-faint">
        Each assessment keeps its original author and explanation. A draft can
        be inspected here before an edition adopts it.
      </p>
      <div className="mt-4 space-y-3">
        {history.map(({ run, entry }) => (
          <div key={run.runId} className="border border-line bg-paper p-4">
            <div className="flex flex-wrap items-center gap-3">
              <AssessmentBadge state={entry.verdict} />
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                {run.runId === displayedRunId ? "current assessment" : run.role === "check" ? "independent check" : "draft assessment"}
                {" · "}{run.humanReviewed ? "human-reviewed" : "AI-generated"}
                {" · "}<time dateTime={run.date} className="whitespace-nowrap">{run.date}</time>{" · "}confidence: {entry.confidence}
              </span>
            </div>
            <p className="mt-2 text-[14px] leading-relaxed text-ink-soft"><LinkedRecordText text={entry.reasoning} /></p>
            <p className="mt-2 break-words font-mono text-[10px] text-faint">{run.model} · run {run.runId}</p>
            {entry.treatment ? (
              <details className="edition-disclosure mt-4">
                <summary>Interpretation in this assessment</summary>
                <p className="mt-3 text-sm text-ink-soft"><LinkedRecordText text={entry.treatment.plainLanguage} /></p>
                <p className="mt-3 font-mono text-[10px] text-faint">importance: {entry.treatment.importance} · {entry.treatment.claimType}</p>
                <p className="mt-3 text-sm text-ink-soft">Diagnosticity: {entry.treatment.diagnosticity}. <LinkedRecordText text={entry.treatment.diagnosticitySummary} /></p>
                <p className="mt-3 text-sm text-ink-soft">Strongest objection: <LinkedRecordText text={entry.treatment.strongestObjection} /></p>
                <p className="mt-3 text-sm text-ink-soft">What would change this assessment:</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
                  {entry.treatment.whatWouldChangeOurMind.map((reason, i) => <li key={i}><LinkedRecordText text={reason} /></li>)}
                </ul>
              </details>
            ) : null}
          </div>
        ))}
      </div>
    </details>
  );
}
