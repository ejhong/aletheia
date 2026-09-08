import { ArtCredit } from "./ArtCredit";
import { AssessmentBadge } from "./AssessmentBadge";
import { ComponentVerdicts } from "./ComponentVerdicts";
import { LinkedRecordText } from "./LinkedRecordText";
import { PriorityBadge } from "./PriorityBadge";
import { assetPath } from "@/src/config/assets";
import type {
  AssessmentState,
  CaseRecord,
  ImageRecord,
} from "@/src/domain/schema";
import type { CaseHeader } from "@/src/domain/view";

/**
 * The case dossier header — dark register. Answers the three questions above
 * the fold: what is claimed, where the disagreement lives, what would settle
 * it. Those answers, the priority, and the component verdicts are judgments
 * and come from the edition's adopted assessment (CaseHeader); identity comes
 * from the case record. Cover art is mounted like a frontispiece plate.
 */
export function DossierHeader({
  record,
  header,
  lastUpdated,
  verdict,
  standing,
  cover,
}: {
  record: CaseRecord;
  header: CaseHeader;
  /** Newest content-bearing changelog date; links to #history. */
  lastUpdated: string;
  verdict: AssessmentState | null;
  /** Ratification standing of the displayed assessment (load.ts). */
  standing: { status: "ratified" | "contested" | "unratified"; agreeing: number; panel: number } | null;
  cover?: ImageRecord | null;
}) {
  const questions = [
    ["What is claimed", header.whatIsClaimed],
    ["Where the disagreement lives", header.whereDisagreementLives],
    ["What would settle it", header.whatWouldSettleIt],
  ].filter((q): q is [string, string] => q[1] !== null);

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
              <a
                href="#history"
                className="font-mono text-[11px] uppercase tracking-[0.2em] text-dossier-faint underline decoration-dossier-faint/40 underline-offset-4 hover:text-copper hover:decoration-copper/50"
              >
                last update {lastUpdated}
              </a>
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
                <span
                  className={`font-mono text-[10px] uppercase tracking-[0.14em] ${
                    standing?.status === "contested"
                      ? "text-ochre"
                      : "text-dossier-faint"
                  }`}
                >
                  {standing?.status === "ratified"
                    ? `AI assessment · ratified by ${standing.agreeing} of ${standing.panel} independent models`
                    : standing?.status === "contested"
                      ? "AI assessment · contested — independent models split"
                      : "AI-drafted assessment · not yet independently ratified"}
                </span>
                {header.researchPriority ? (
                  <PriorityBadge level={header.researchPriority.level} size="lg" />
                ) : null}
              </div>
            ) : null}
            {header.components.length > 0 ? (
              <div className="mt-4">
                <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-dossier-faint mb-2">
                  by component — one word would mislead
                </h2>
                <ComponentVerdicts components={header.components} dark />
              </div>
            ) : null}
            {header.researchPriority ? (
              <p className="mt-4 text-[13.5px] leading-relaxed text-dossier-text/80 max-w-2xl">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-copper mr-2">
                  why this priority
                </span>
                {header.researchPriority.reason}
              </p>
            ) : null}
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
        {questions.length > 0 ? (
          <div className="grid sm:grid-cols-3 gap-px bg-dossier-line border border-dossier-line mt-8">
            {questions.map(([label, text]) => (
              <div key={label} className="bg-dossier-soft p-5">
                <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-copper">
                  {label}
                </h2>
                <p className="mt-2.5 text-[15px] leading-relaxed text-dossier-text/90">
                  <LinkedRecordText text={text} />
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
