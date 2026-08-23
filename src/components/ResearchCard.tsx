import Link from "next/link";
import { LinkedRecordText } from "./LinkedRecordText";
import type { ResearchOpportunity } from "@/src/domain/schema";

const trackLabels = {
  publication_prize: "Publication prize",
  small_grant: "Small grant",
  either: "Prize or grant",
} as const;

const effortLabels = { desk: "Desk", field: "Field", lab: "Lab" } as const;

export function ResearchCard({ item }: { item: ResearchOpportunity }) {
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
