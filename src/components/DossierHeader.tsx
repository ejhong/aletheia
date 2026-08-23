import { ArtCredit } from "./ArtCredit";
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
 * The case dossier header — dark register. Answers the three questions above
 * the fold: what is claimed, where the disagreement lives, what would settle
 * it. Cover art is mounted like a frontispiece plate beside the title.
 */
export function DossierHeader({
  record,
  verdict,
  verdictHumanEndorsed,
  cover,
}: {
  record: CaseRecord;
  verdict: AssessmentState | null;
  verdictHumanEndorsed: boolean;
  cover?: ImageRecord | null;
}) {
  return (
    <section className="bg-dossier text-dossier-text">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:py-14">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-12 lg:items-start">
          <div>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-dossier-faint">
                case file {record.id}
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-dossier-faint">
                {record.domain}
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-dossier-faint">
                last review {record.lastReviewed}
              </span>
            </div>
            <h1 className="font-serif text-4xl sm:text-5xl mt-4 tracking-tight">
              {record.title}
            </h1>
            <p className="font-serif italic text-lg sm:text-xl text-dossier-faint mt-3 max-w-3xl">
              {record.subtitle}
            </p>
            {verdict ? (
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <AssessmentBadge state={verdict} size="lg" />
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-dossier-faint">
                  {verdictHumanEndorsed
                    ? "editorial assessment · human-reviewed"
                    : "AI-drafted assessment · awaiting human review"}
                </span>
                <PriorityBadge level={record.researchPriority.level} size="lg" />
              </div>
            ) : null}
            {record.components.length > 0 ? (
              <div className="mt-4">
                <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-dossier-faint mb-2">
                  by component — one word would mislead
                </h2>
                <ComponentVerdicts components={record.components} dark />
              </div>
            ) : null}
            <p className="mt-4 text-[13.5px] leading-relaxed text-dossier-text/80 max-w-2xl">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-copper mr-2">
                why this priority
              </span>
              {record.researchPriority.reason}
            </p>
          </div>
          {cover ? (
            <div className="mt-8 lg:mt-1">
              <div className="border border-dossier-line bg-paper p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={assetPath(cover.file)}
                  alt={cover.alt}
                  className="block w-full"
                />
              </div>
              <ArtCredit className="mt-1.5 block text-dossier-faint" />
            </div>
          ) : null}
        </div>
        <div className="grid sm:grid-cols-3 gap-px bg-dossier-line border border-dossier-line mt-8">
          {(
            [
              ["What is claimed", record.whatIsClaimed],
              ["Where the disagreement lives", record.whereDisagreementLives],
              ["What would settle it", record.whatWouldSettleIt],
            ] as const
          ).map(([label, text]) => (
            <div key={label} className="bg-dossier-soft p-5">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-copper">
                {label}
              </h2>
              <p className="mt-2.5 text-[15px] leading-relaxed text-dossier-text/90">
                {text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
