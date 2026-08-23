import Link from "next/link";
import { AssessmentBadge } from "./AssessmentBadge";
import { LinkedRecordText } from "./LinkedRecordText";
import type { AssessmentRun, Claim } from "@/src/domain/schema";

/**
 * The structural roll-up: an argued synthesis over the claim ladder,
 * honestly labeled as an AI-generated draft until a human reviews it.
 */
export function AssessmentPanel({
  run,
  claims,
}: {
  run: AssessmentRun;
  claims: Claim[];
}) {
  const claimById = new Map(claims.map((c) => [c.id, c]));
  const chip = (id: string) => {
    const claim = claimById.get(id);
    return (
      <Link
        key={id}
        href={`/claims/${id}/`}
        title={claim?.statement}
        className="inline-flex items-center gap-1 border border-line bg-paper px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] text-ink-soft hover:border-copper/60 hover:text-copper"
      >
        {id}
      </Link>
    );
  };

  return (
    <section className="border border-line bg-paper-deep/50">
      <div className="p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AssessmentBadge state={run.caseAssessment.verdict} size="lg" />
            <h3 className="font-serif text-xl">Current assessment</h3>
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-copper">
            AI-generated draft — not human reviewed
          </p>
        </div>
        <p className="mt-4 text-[15px] leading-[1.75] text-ink-soft whitespace-pre-line">
          <LinkedRecordText text={run.caseAssessment.synthesis} />
        </p>
        <div className="mt-5 grid sm:grid-cols-2 gap-4">
          <div>
            <h4 className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
              load-bearing claims
            </h4>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {run.caseAssessment.loadBearing.map(chip)}
            </div>
          </div>
          <div>
            <h4 className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
              weakest links
            </h4>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {run.caseAssessment.weakestLinks.map(chip)}
            </div>
          </div>
        </div>
      </div>
      <div className="border-t border-line px-5 sm:px-7 py-2.5 flex flex-wrap gap-x-5 gap-y-1">
        {[
          ["run", run.runId],
          ["model", run.model],
          ["prompt", run.promptVersion],
          ["date", run.date],
        ].map(([k, v]) => (
          <span
            key={k}
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint"
          >
            {k}: <span className="text-ink-soft normal-case">{v}</span>
          </span>
        ))}
      </div>
    </section>
  );
}
