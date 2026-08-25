import Link from "next/link";
import { AssessmentBadge } from "./AssessmentBadge";
import {
  assessmentLabels,
  type AssessmentRun,
  type AssessmentState,
} from "@/src/domain/schema";
import type { CrossModelSummary } from "@/src/domain/load";

/** "GPT-5.1 (OpenAI), independent judge run" → "GPT-5.1 (OpenAI)". */
function shortModel(label: string): string {
  return label.replace(/\s*(,\s*independent.*|—\s*independent.*)$/i, "");
}

/**
 * Concurrence of independent cross-model check runs with the displayed
 * assessment. A check run is produced blind — a different vendor's model,
 * given the case file with all prior assessments removed — so agreement
 * here means the verdicts are a property of the evidence file, not one
 * model's disposition. Disagreement is displayed just as prominently:
 * split claims are exactly where human review should start.
 */
export function CrossModelPanel({
  summary,
  runs,
}: {
  summary: CrossModelSummary;
  runs: AssessmentRun[];
}) {
  const s = summary;
  const chip = (id: string) => (
    <Link
      key={id}
      href={`/claims/${id}/`}
      className="inline-flex items-center border border-line bg-paper px-1.5 py-0.5 font-mono text-[10px] tracking-[0.12em] text-ink-soft hover:border-copper/60 hover:text-copper"
    >
      {id}
    </Link>
  );
  const caseTally = Object.entries(s.caseVerdicts)
    .map(
      ([v, n]) =>
        `${assessmentLabels[v as AssessmentState] ?? v}${n > 1 ? ` ×${n}` : ""}`,
    )
    .join(" · ");
  return (
    <aside className="mt-3 border border-line bg-paper px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link
          href="/panel"
          className="font-mono text-[11px] uppercase tracking-[0.18em] text-copper hover:underline underline-offset-4"
        >
          cross-model check · {s.latestDate} → the panel
        </Link>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
          independent · blind to prior assessments
        </span>
      </div>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
        {s.models.length} independent model
        {s.models.length === 1 ? "" : "s"} re-assessed this case from the
        evidence file alone. Case verdict{s.models.length === 1 ? "" : "s"}:{" "}
        {caseTally}
        {s.caseUnanimousWithDisplayed
          ? " — matching the assessment shown above."
          : " — diverging from the assessment shown above."}{" "}
        Claim-level agreement: {s.exact} of {s.claimsCompared} exact
        {s.adjacent > 0 ? `, ${s.adjacent} within one step` : ""}
        {s.split > 0 ? `, ${s.split} split` : ", none split"}.
      </p>
      {s.staleSince ? (
        <p className="mt-2 font-mono text-[11px] tracking-[0.06em] text-ochre">
          the case file has changed since this check (content updated{" "}
          {s.staleSince}) — these judgments were made on an earlier version
        </p>
      ) : null}
      {s.splitClaimIds.length > 0 ? (
        <p className="mt-1.5 font-mono text-[11px] tracking-[0.06em] text-ochre">
          split claims — where review should start:{" "}
          {s.splitClaimIds.map((id, i) => (
            <span key={id}>
              {i > 0 ? " · " : ""}
              <Link href={`/claims/${id}/`} className="underline underline-offset-2 hover:text-copper">
                {id}
              </Link>
            </span>
          ))}
        </p>
      ) : null}
      <div className="mt-3 border-t border-line pt-1">
        {runs.map((run) => (
          <details
            key={run.runId}
            id={`check-${run.runId}`}
            className="group border-b border-line/60 last:border-b-0"
          >
            <summary className="flex cursor-pointer flex-wrap items-center gap-2.5 py-2 list-none [&::-webkit-details-marker]:hidden">
              <span
                aria-hidden
                className="font-mono text-[10px] text-faint transition-transform group-open:rotate-90"
              >
                ▸
              </span>
              <span className="font-mono text-[11px] tracking-[0.06em] text-ink-soft">
                {shortModel(run.model)}
              </span>
              <AssessmentBadge state={run.caseAssessment.verdict} />
            </summary>
            <div className="pb-4 pl-6">
              <p className="text-[14px] leading-[1.7] text-ink-soft whitespace-pre-line">
                {run.caseAssessment.synthesis}
              </p>
              <div className="mt-3 grid sm:grid-cols-2 gap-3">
                <div>
                  <h4 className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
                    it saw as load-bearing
                  </h4>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {run.caseAssessment.loadBearing.map(chip)}
                  </div>
                </div>
                <div>
                  <h4 className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
                    it saw as weakest links
                  </h4>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {run.caseAssessment.weakestLinks.map(chip)}
                  </div>
                </div>
              </div>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                run {run.runId} · {run.date} · not human reviewed — per-claim
                verdicts on each claim page
              </p>
            </div>
          </details>
        ))}
      </div>
    </aside>
  );
}
