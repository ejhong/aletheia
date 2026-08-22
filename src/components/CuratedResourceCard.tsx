import { VerificationBadge } from "./VerificationBadge";
import {
  curatedResourceTypeLabels,
  type CuratedResource,
} from "@/src/domain/schema";

/**
 * One hand-curated reading-guide entry (resources.yaml) — learning material,
 * not evidence. Always links out and always shows its verification label.
 */
export function CuratedResourceCard({ item }: { item: CuratedResource }) {
  return (
    <li className="border border-line bg-paper-deep/40 p-4">
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-copper">
        {curatedResourceTypeLabels[item.type]}
      </span>
      <h4 className="font-serif text-lg leading-snug mt-1.5">
        <a
          href={item.url}
          className="hover:text-copper underline decoration-line underline-offset-4"
          rel="noopener"
        >
          {item.title} <span aria-hidden>↗</span>
        </a>
      </h4>
      {item.by || item.year ? (
        <p className="mt-1 text-[13.5px] text-ink-soft">
          {[item.by, item.year].filter(Boolean).join(" · ")}
        </p>
      ) : null}
      {item.note ? (
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">
          {item.note}
        </p>
      ) : null}
      <div className="mt-2.5">
        <VerificationBadge state={item.verification} />
      </div>
    </li>
  );
}
