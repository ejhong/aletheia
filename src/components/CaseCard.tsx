import Link from "next/link";
import { AssessmentBadge } from "./AssessmentBadge";
import { PriorityBadge } from "./PriorityBadge";
import { assetPath } from "@/src/config/assets";
import type {
  AssessmentState,
  CaseComponent,
  CaseRecord,
  ImageRecord,
  ResearchPriorityLevel,
} from "@/src/domain/schema";
import { standingGlosses, standingInWords, type Ratification } from "@/src/domain/standing";
import { withoutIdList } from "@/src/domain/text";

/** Component verdicts shown on a card before "and N more": a card is a glance, the case page has them all. */
const COMPONENTS_SHOWN = 4;

/**
 * A case card leads with the question and shows two outputs, not one: the
 * evidence state (component rows where a single word would mislead) and the
 * research priority — then, in one plain line, who made the judgment and
 * what stands behind it. Judgments come from the case view's adopted
 * assessment; identity from the record.
 *
 * The whole card is one link, made by stretching the title's link over it.
 * It used to be an anchor wrapped around another anchor, which no browser
 * accepts: the parser closed the outer one early and the card fell apart
 * until the scripts loaded and rebuilt it.
 */
export function CaseCard({
  record,
  components,
  priority,
  verdict,
  standing,
  reviewCoverage,
  cover,
  question,
}: {
  record: CaseRecord;
  /** The case's question as it stands (load.ts caseQuestion). */
  question?: string;
  components: CaseComponent[];
  priority: ResearchPriorityLevel | null;
  verdict: AssessmentState | null;
  standing: Pick<Ratification, "status" | "agreeing" | "panel"> | null;
  reviewCoverage: { reviewed: number; total: number };
  cover?: ImageRecord | null;
}) {
  const shown = components.slice(0, COMPONENTS_SHOWN);
  const more = components.length - shown.length;
  return (
    <article className="group relative flex flex-col border border-line bg-paper hover:border-copper/60 focus-within:border-copper/60">
      {cover ? (
        <div className="overflow-hidden border-b border-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={assetPath(cover.file)}
            alt={cover.alt}
            loading="lazy"
            // Slightly enlarged inside its frame: some covers carry a dark sliver at their edges.
            className="block w-full aspect-[16/9] object-cover scale-[1.05]"
          />
        </div>
      ) : null}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono text-[10px] tracking-[0.16em] text-copper">{record.id}</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">{record.domain}</span>
        </div>
        <h3 className="font-serif text-2xl tracking-tight mt-2">
          <Link
            href={`/cases/${record.slug}/`}
            className="group-hover:text-copper focus-visible:outline-none after:absolute after:inset-0 after:content-['']"
          >
            {record.title}
          </Link>
        </h3>
        <p className="font-serif italic text-[15px] leading-snug text-ink-soft mt-2">
          {question ?? record.subtitle}
        </p>
        <div className="mt-4">
          {shown.length > 0 ? (
            <ul className="space-y-1.5">
              {shown.map((c) => (
                <li key={c.label} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                  <AssessmentBadge state={c.state} />
                  <span className="text-[13px] text-ink-soft">{withoutIdList(c.label)}</span>
                </li>
              ))}
            </ul>
          ) : verdict ? (
            <AssessmentBadge state={verdict} />
          ) : null}
          {more > 0 ? (
            <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">and {more} more on the case page</p>
          ) : null}
        </div>
        <div className="mt-auto pt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {priority ? <PriorityBadge level={priority} /> : null}
          <p
            className={`font-mono text-[10px] uppercase tracking-[0.14em] ${standing?.status === "contested" ? "text-ochre" : "text-faint"}`}
            title={standing ? standingGlosses[standing.status] : undefined}
          >
            {verdict && standing
              ? `AI assessment · ${standingInWords(standing, { short: true })}`
              : "a question, with no assessment yet"}
            {verdict
              ? reviewCoverage.reviewed > 0
                ? ` · ${reviewCoverage.reviewed} of ${reviewCoverage.total} featured claims human-reviewed`
                : " · no human review"
              : ""}
          </p>
        </div>
      </div>
    </article>
  );
}
