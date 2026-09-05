import type { FeaturedClaimView } from "@/src/domain/caseView";
import Link from "next/link";
import { AssessmentBadge } from "./AssessmentBadge";
import { ProvenanceBadge } from "./ProvenanceBadge";
import {
  assessmentStateCaptions,
  claimTypeCaptions,
  rungLabels,
} from "@/src/domain/schema";

export function ClaimCard({ claim }: { claim: FeaturedClaimView }) {
  return (
    <Link
      href={`/claims/${claim.id}/`}
      className="group block border border-line bg-paper p-4 hover:border-copper/60"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[10px] tracking-[0.14em] text-copper">
          {claim.id}
          {claim.importance === "headline" ? (
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
        <AssessmentBadge state={claim.credibility} />
        <ProvenanceBadge
          state={claim.reviewState}
          detail={`${claim.origin.extractedBy} · ${claim.origin.runId}`}
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
          diagnosticity: {claim.diagnosticity}
        </span>
      </div>
      <p className="mt-2 text-[11px] text-faint">
        {claim.assessment
          ? `AI assessment · ${claim.assessment.standing}`
          : "Assessment recorded with the claim"}
      </p>
      {claimTypeCaptions[claim.claimType] ? (
        <p className="mt-1.5 font-mono text-[10px] tracking-[0.06em] text-faint">
          ⚠ {claimTypeCaptions[claim.claimType]}
        </p>
      ) : null}
      {assessmentStateCaptions[claim.credibility] ? (
        <p className="mt-1.5 font-mono text-[10px] tracking-[0.06em] text-faint">
          ⚠ {assessmentStateCaptions[claim.credibility]}
        </p>
      ) : null}
    </Link>
  );
}
