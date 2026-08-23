import Link from "next/link";
import { assessmentLabels, type AssessmentState } from "@/src/domain/schema";
import type { CrossModelSummary } from "@/src/domain/load";

/**
 * Concurrence of independent cross-model check runs with the displayed
 * assessment. A check run is produced blind — a different vendor's model,
 * given the case file with all prior assessments removed — so agreement
 * here means the verdicts are a property of the evidence file, not one
 * model's disposition. Disagreement is displayed just as prominently:
 * split claims are exactly where human review should start.
 */
export function CrossModelPanel({ summary }: { summary: CrossModelSummary }) {
  const s = summary;
  const caseTally = Object.entries(s.caseVerdicts)
    .map(
      ([v, n]) =>
        `${assessmentLabels[v as AssessmentState] ?? v}${n > 1 ? ` ×${n}` : ""}`,
    )
    .join(" · ");
  return (
    <aside className="mt-3 border border-line bg-paper px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-copper">
          cross-model check · {s.latestDate}
        </h3>
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
      <p className="mt-1.5 font-mono text-[10px] tracking-[0.04em] text-faint">
        models: {s.models.join(" · ")} — full verdicts per claim on each
        claim page
      </p>
    </aside>
  );
}
