import { ArtCredit } from "./ArtCredit";
import { AssessmentBadge } from "./AssessmentBadge";
import { ComponentVerdicts } from "./ComponentVerdicts";
import { Lede } from "./Lede";
import { PriorityBadge } from "./PriorityBadge";
import { assetPath } from "@/src/config/assets";
import { imageSize } from "@/src/domain/imageSize";
import type {
  AssessmentState,
  CaseRecord,
  ImageRecord,
} from "@/src/domain/schema";
import { standingGlosses, standingInWords, type Ratification } from "@/src/domain/standing";
import { longDate } from "@/src/domain/text";
import type { CaseHeader } from "@/src/domain/view";

/**
 * The case dossier header — dark register. Answers the three questions above
 * the fold: what is claimed, where the disagreement lives, what would settle
 * it. Those answers, the priority, and the component verdicts are judgments
 * and come from the edition's adopted assessment (CaseHeader); identity comes
 * from the case record. Cover art is mounted like a frontispiece plate.
 *
 * Each answer opens with its first sentences and keeps the rest behind a
 * disclosure: the assessments grew these three fields to several hundred
 * words apiece, and a header that takes three screens to pass is not above
 * any fold. Nothing is cut; the whole answer is in the page.
 */
export function DossierHeader({
  record,
  header,
  lastUpdated,
  verdict,
  standing,
  cover,
  question,
  questionNote,
}: {
  record: CaseRecord;
  header: CaseHeader;
  /** Newest content-bearing changelog date; links to #history. */
  lastUpdated: string;
  verdict: AssessmentState | null;
  /** Ratification standing of the displayed assessment (standing.ts). */
  standing: Pick<Ratification, "status" | "agreeing" | "panel"> | null;
  /** The case's question as it stands (editions.ts caseQuestion); the case file's subtitle when absent. */
  question?: string;
  /** Shown under the question when an edition restated it, e.g. "as restated by the edition of 2026-09-10". */
  questionNote?: string;
  cover?: ImageRecord | null;
}) {
  const questions = [
    ["What is claimed", header.whatIsClaimed],
    ["Where the disagreement lives", header.whereDisagreementLives],
    ["What would settle it", header.whatWouldSettleIt],
  ].filter((q): q is [string, string] => q[1] !== null);

  return (
    <section id="overview" className="bg-dossier text-dossier-text scroll-mt-28">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:py-12">
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
                updated {longDate(lastUpdated)}
              </a>
            </div>
            <h1 className="font-serif text-4xl sm:text-5xl mt-4 tracking-tight">
              {record.title}
            </h1>
            <p className="font-serif italic text-lg sm:text-xl text-dossier-faint mt-3 max-w-3xl">
              {question ?? record.subtitle}
            </p>
            {questionNote ? (
              <p className="text-xs text-dossier-faint mt-1 max-w-3xl">{questionNote}</p>
            ) : null}
            {verdict ? (
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <AssessmentBadge state={verdict} size="lg" />
                {header.researchPriority ? (
                  <PriorityBadge level={header.researchPriority.level} size="lg" dark />
                ) : null}
                <a
                  href="#judgment"
                  title={standing ? standingGlosses[standing.status] : undefined}
                  className={`font-mono text-[10px] uppercase tracking-[0.14em] underline decoration-transparent underline-offset-4 hover:decoration-current ${
                    standing?.status === "contested" ? "text-ochre" : "text-dossier-faint"
                  }`}
                >
                  AI assessment · {standing ? standingInWords(standing, { short: true }) : "not yet ratified"}
                </a>
              </div>
            ) : null}
            {header.components.length > 0 ? (
              <div className="mt-5">
                <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-dossier-faint mb-2">
                  by component — one word would mislead
                </h2>
                <ComponentVerdicts components={header.components} dark />
              </div>
            ) : null}
            {header.researchPriority ? (
              <div className="mt-5 max-w-2xl">
                <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-copper mb-1">
                  why this research priority
                </h2>
                <Lede
                  text={header.researchPriority.reason}
                  max={260}
                  dark
                  className="text-[13.5px] leading-relaxed text-dossier-text/80"
                />
              </div>
            ) : null}
          </div>
          {cover ? (
            <div className="mt-8 lg:mt-1">
              <div className="border border-dossier-line bg-paper p-2">
                <div className="overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={assetPath(cover.file)}
                    alt={cover.alt}
                    width={imageSize(cover.file)?.width}
                    height={imageSize(cover.file)?.height}
                    // Slightly enlarged inside its mat: some covers carry a dark sliver at their edges.
                    className="block h-auto w-full scale-[1.05]"
                  />
                </div>
              </div>
              <ArtCredit className="mt-1.5 block text-dossier-faint" />
            </div>
          ) : null}
        </div>
        {questions.length > 0 ? (
          <div className="grid md:grid-cols-3 gap-px bg-dossier-line border border-dossier-line mt-9">
            {questions.map(([label, text]) => (
              <div key={label} className="bg-dossier-soft p-5">
                <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-copper">
                  {label}
                </h2>
                <div className="mt-2.5">
                  <Lede
                    text={text}
                    max={300}
                    dark
                    className="text-[15px] leading-relaxed text-dossier-text/90"
                  />
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
