import Link from "next/link";
import { AssessmentBadge } from "./AssessmentBadge";
import type { AssessmentState, CaseRecord } from "@/src/domain/schema";

export function CaseCard({
  record,
  verdict,
  featured = false,
}: {
  record: CaseRecord;
  verdict: AssessmentState | null;
  featured?: boolean;
}) {
  return (
    <Link
      href={`/cases/${record.slug}/`}
      className={`group block border border-line bg-paper hover:border-copper/60 ${
        featured ? "sm:grid sm:grid-cols-[1fr_auto]" : ""
      }`}
    >
      <div className={featured ? "p-6 sm:p-8" : "p-5"}>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono text-[10px] tracking-[0.16em] text-copper">
            {record.id}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
            {record.domain}
          </span>
        </div>
        <h3
          className={`font-serif tracking-tight mt-2 group-hover:text-copper ${
            featured ? "text-3xl sm:text-4xl" : "text-2xl"
          }`}
        >
          {record.title}
        </h3>
        <p
          className={`font-serif italic text-ink-soft mt-2 ${
            featured ? "text-lg max-w-2xl" : "text-[15px]"
          }`}
        >
          {record.subtitle}
        </p>
        {featured ? (
          <p className="mt-4 text-[14.5px] leading-relaxed text-ink-soft max-w-2xl">
            {record.summary}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {verdict ? <AssessmentBadge state={verdict} /> : null}
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
            last review {record.lastReviewed}
          </span>
        </div>
      </div>
    </Link>
  );
}
