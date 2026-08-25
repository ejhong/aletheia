import Link from "next/link";
import { AssessmentBadge } from "./AssessmentBadge";
import { ComponentVerdicts } from "./ComponentVerdicts";
import { PriorityBadge } from "./PriorityBadge";
import { assetPath } from "@/src/config/assets";
import type {
  AssessmentState,
  CaseRecord,
  ImageRecord,
} from "@/src/domain/schema";

/**
 * A case card leads with the question and shows two outputs, not one:
 * the evidence state (component rows where a single word would mislead)
 * and the research priority — plus honest review provenance.
 */
export function CaseCard({
  record,
  verdict,
  standing,
  reviewCoverage,
  check,
  cover,
}: {
  record: CaseRecord;
  verdict: AssessmentState | null;
  standing: "ratified" | "contested" | "unratified" | null;
  reviewCoverage: { reviewed: number; total: number };
  /** Cross-model check summary line: judge count and case-level concurrence. */
  check?: { models: number; concur: boolean } | null;
  cover?: ImageRecord | null;
}) {
  return (
    <Link
      href={`/cases/${record.slug}/`}
      className="group block border border-line bg-paper hover:border-copper/60"
    >
      {cover ? (
        <div className="border-b border-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={assetPath(cover.file)}
            alt={cover.alt}
            loading="lazy"
            className="block w-full aspect-[16/9] object-cover"
          />
        </div>
      ) : null}
      <div className="p-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono text-[10px] tracking-[0.16em] text-copper">
            {record.id}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
            {record.domain}
          </span>
        </div>
        <h3 className="font-serif text-2xl tracking-tight mt-2 group-hover:text-copper">
          {record.title}
        </h3>
        <p className="font-serif italic text-[15px] text-ink-soft mt-2">
          {record.subtitle}
        </p>
        <div className="mt-4">
          {record.components.length > 0 ? (
            <ComponentVerdicts components={record.components} />
          ) : verdict ? (
            <AssessmentBadge state={verdict} />
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <PriorityBadge level={record.researchPriority.level} />
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
            {verdict
              ? standing === "ratified"
                ? "assessment · ratified"
                : standing === "contested"
                  ? "assessment · contested"
                  : "AI draft · unratified"
              : "no assessment yet"}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
            human review {reviewCoverage.reviewed}/{reviewCoverage.total} claims
          </span>
          {check ? (
            <span
              className={`font-mono text-[10px] uppercase tracking-[0.14em] ${check.concur ? "text-verdigris" : "text-ochre"}`}
              title="Independent models re-assessed this case blind to all prior assessments"
            >
              {check.models}-model check · {check.concur ? "concur" : "diverge"}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
