import Link from "next/link";
import { LinkedRecordText } from "./LinkedRecordText";
import type { ResearchOpportunity, Study } from "@/src/domain/schema";

const trackLabels = {
  publication_prize: "Publication prize",
  small_grant: "Small grant",
  either: "Prize or grant",
} as const;

const effortLabels = { desk: "Desk", field: "Field", lab: "Lab" } as const;

export function ResearchCard({
  item,
  study,
  caseSlug,
}: {
  item: ResearchOpportunity;
  /** A study executing this item, if one exists (pending or collected). */
  study?: Study;
  caseSlug?: string;
}) {
  return (
    <article
      id={`research-${item.id}`}
      className="scroll-mt-28 border border-line bg-paper p-4 sm:p-5 flex flex-col"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] tracking-[0.14em] text-faint">
          {item.id}
          {item.rfpTopicRef ? ` · RFP ${item.rfpTopicRef}` : ""}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-copper">
          {trackLabels[item.track]} · {effortLabels[item.effortTier]}
        </span>
      </div>
      <h4 className="font-serif text-lg mt-2 leading-snug">{item.title}</h4>
      <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">
        <LinkedRecordText text={item.summary} />
      </p>
      <div className="mt-3">
        <h5 className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
          expected information gain
        </h5>
        <p className="mt-0.5 text-[13.5px] leading-relaxed text-ink-soft">
          <LinkedRecordText text={item.informationGain} />
        </p>
      </div>
      {study && caseSlug ? (
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em]">
          <Link
            href={`/cases/${caseSlug}/studies/${study.id.toLowerCase()}/`}
            className="text-copper hover:underline"
          >
            study {study.id}
          </Link>{" "}
          <span className="text-faint">
            —{" "}
            {study.rows.length === 0
              ? `pre-registered ${study.criteria.frozenOn}, collection pending`
              : `table published, ${study.rows.length} rows`}
          </span>
        </p>
      ) : null}
      <div className="mt-auto pt-3 flex flex-wrap gap-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint self-center">
          would update:
        </span>
        {item.claimIds.map((id) => (
          <Link
            key={id}
            href={`/claims/${id}/`}
            className="font-mono text-[10px] tracking-[0.12em] text-copper hover:underline"
          >
            {id}
          </Link>
        ))}
      </div>
    </article>
  );
}
