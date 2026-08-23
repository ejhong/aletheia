import Link from "next/link";
import { AssessmentBadge } from "./AssessmentBadge";
import { assetPath } from "@/src/config/assets";
import type {
  AssessmentState,
  CaseRecord,
  ImageRecord,
} from "@/src/domain/schema";

export function CaseCard({
  record,
  verdict,
  cover,
}: {
  record: CaseRecord;
  verdict: AssessmentState | null;
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
