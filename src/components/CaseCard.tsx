import Link from "next/link";
import { ArtCredit } from "./ArtCredit";
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
  featured = false,
}: {
  record: CaseRecord;
  verdict: AssessmentState | null;
  cover?: ImageRecord | null;
  featured?: boolean;
}) {
  return (
    <Link
      href={`/cases/${record.slug}/`}
      className={`group block border border-line bg-paper hover:border-copper/60 ${
        featured
          ? "lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-center"
          : ""
      }`}
    >
      {cover && !featured ? (
        <div className="border-b border-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={assetPath(cover.file)}
            alt={cover.alt}
            loading="lazy"
            className="block w-full aspect-[21/9] object-cover"
          />
        </div>
      ) : null}
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
      {cover && featured ? (
        <div className="px-6 pb-6 sm:px-8 sm:pb-8 lg:p-6">
          <div className="border border-line bg-paper-deep/40 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={assetPath(cover.file)}
              alt={cover.alt}
              loading="lazy"
              className="block w-full"
            />
          </div>
          <ArtCredit className="mt-1.5 block" />
        </div>
      ) : null}
    </Link>
  );
}
