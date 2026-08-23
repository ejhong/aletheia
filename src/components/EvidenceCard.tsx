import Link from "next/link";
import { DirectionTag } from "./DirectionTag";
import { LinkedRecordText } from "./LinkedRecordText";
import type { Evidence, Source } from "@/src/domain/schema";
import { VerificationBadge } from "./VerificationBadge";

export function EvidenceCard({
  evidence,
  source,
  showClaims = false,
}: {
  evidence: Evidence;
  source: Source;
  showClaims?: boolean;
}) {
  return (
    <article
      id={`evidence-${evidence.id}`}
      className="scroll-mt-28 border border-line bg-paper p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <DirectionTag direction={evidence.direction} strength={evidence.strength} />
        <span className="font-mono text-[10px] tracking-[0.14em] text-faint">
          {evidence.id}
        </span>
      </div>
      <h4 className="font-serif text-lg mt-2 leading-snug">{evidence.title}</h4>
      <dl className="mt-3 space-y-2.5 text-[13.5px] leading-relaxed">
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
            what the source states
          </dt>
          <dd className="text-ink-soft mt-0.5">
            <LinkedRecordText text={evidence.sourceStatement} />
          </dd>
        </div>
        {evidence.editorInference ? (
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
              what we infer
            </dt>
            <dd className="text-ink-soft mt-0.5">
              <LinkedRecordText text={evidence.editorInference} />
            </dd>
          </div>
        ) : null}
        {evidence.limitations.length > 0 ? (
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
              limitations
            </dt>
            <dd className="mt-0.5">
              <ul className="list-disc pl-4 space-y-1 text-ink-soft">
                {evidence.limitations.map((l, i) => (
                  <li key={i}>
                    <LinkedRecordText text={l} />
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
      </dl>
      <div className="mt-3 pt-3 border-t border-line flex flex-wrap items-center gap-2 text-[12.5px]">
        <Link
          href={`/sources/${source.id}/`}
          className="underline decoration-copper/50 underline-offset-2 hover:decoration-copper text-ink-soft"
        >
          {source.authors[0] ?? source.organization ?? source.title}
          {source.year ? ` (${source.year})` : ""}
        </Link>
        <VerificationBadge state={source.verification} />
        {showClaims
          ? evidence.claimIds.map((id) => (
              <Link
                key={id}
                href={`/claims/${id}/`}
                className="font-mono text-[10px] tracking-[0.12em] text-copper hover:underline"
              >
                {id}
              </Link>
            ))
          : null}
      </div>
    </article>
  );
}
