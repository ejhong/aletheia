import Link from "next/link";
import { AssessmentBadge } from "./AssessmentBadge";
import { ProvenanceBadge } from "./ProvenanceBadge";
import {
  assessmentStateCaptions,
  claimTypeCaptions,
  rungLabels,
} from "@/src/domain/schema";
import type { ClaimView } from "@/src/domain/view";

/** A featured claim's card: the proposition with its current judgment. */
export function ClaimCard({ claim: view }: { claim: ClaimView }) {
  const { claim, verdict, treatment } = view;
  return (
    <Link
      href={`/claims/${claim.id}/`}
      className="group block border border-line bg-paper p-4 hover:border-copper/60"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[10px] tracking-[0.14em] text-copper">
          {claim.id}
          {treatment?.importance === "headline" ? (
            <span className="text-terracotta"> · headline</span>
          ) : null}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
          {rungLabels[claim.rung]}
        </span>
      </div>
      <p className="mt-2 text-[14.5px] leading-snug text-ink group-hover:text-ink">
        {claim.statement}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {verdict ? <AssessmentBadge state={verdict} /> : null}
        <ProvenanceBadge
          state={claim.reviewState}
          detail={`${claim.origin.extractedBy} · ${claim.origin.runId}`}
        />
        {treatment ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
            diagnosticity: {treatment.diagnosticity}
          </span>
        ) : null}
      </div>
      {claim.claimType && claimTypeCaptions[claim.claimType] ? (
        <p className="mt-1.5 font-mono text-[10px] tracking-[0.06em] text-faint">
          ⚠ {claimTypeCaptions[claim.claimType]}
        </p>
      ) : null}
      {verdict && assessmentStateCaptions[verdict] ? (
        <p className="mt-1.5 font-mono text-[10px] tracking-[0.06em] text-faint">
          ⚠ {assessmentStateCaptions[verdict]}
        </p>
      ) : null}
    </Link>
  );
}
