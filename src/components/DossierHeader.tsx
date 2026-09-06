import { ArtCredit } from "./ArtCredit";
import { AssessmentBadge } from "./AssessmentBadge";
import { assetPath } from "@/src/config/assets";
import type {
  AssessmentState,
  CaseRecord,
  ImageRecord,
} from "@/src/domain/schema";

/** The frontispiece introduces the question; the essay is the next thing to read. */
export function DossierHeader({
  record,
  lastUpdated,
  verdict,
  standing,
  cover,
}: {
  record: CaseRecord;
  lastUpdated: string;
  verdict: AssessmentState | null;
  standing: {
    status: "ratified" | "contested" | "unratified";
    agreeing: number;
    panel: number;
  } | null;
  cover?: ImageRecord | null;
}) {
  return (
    <section className="bg-dossier text-dossier-text">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:py-12">
        <div
          className={`grid gap-7 sm:gap-10 ${cover ? "sm:grid-cols-[minmax(0,1fr)_28%] sm:items-center" : ""}`}
        >
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.17em] text-dossier-faint">
              {record.domain}{" "}
              <span className="mx-2" aria-hidden>
                ·
              </span>{" "}
              {record.id}
            </p>
            <h1 className="mt-4 max-w-3xl font-serif text-[2.6rem] leading-[1.05] tracking-tight sm:text-6xl">
              {record.title}
            </h1>
            <p className="mt-4 max-w-2xl font-serif text-lg italic leading-relaxed text-dossier-faint sm:text-xl">
              {record.subtitle}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
              {verdict ? (
                <AssessmentBadge state={verdict} />
              ) : (
                <span className="text-[13px] text-dossier-faint">
                  An open research question · no assessment yet
                </span>
              )}
              {standing ? (
                <a
                  href="#assessment"
                  className="text-[12px] text-dossier-faint underline decoration-dossier-line underline-offset-4 hover:text-dossier-text"
                >
                  {standing.status === "ratified"
                    ? `AI assessment · ${standing.agreeing}/${standing.panel} models concur`
                    : standing.status === "contested"
                      ? "AI assessment · contested"
                      : "AI assessment · awaiting current review"}
                </a>
              ) : null}
            </div>
            <a
              href="#history"
              className="mt-4 inline-block font-mono text-[10px] tracking-[0.06em] text-dossier-faint underline decoration-dossier-line underline-offset-4 hover:text-dossier-text"
            >
              Updated {lastUpdated} · view changes
            </a>
          </div>
          {cover ? (
            <div className="hidden sm:block">
              <div className="border border-dossier-line bg-paper p-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={assetPath(cover.file)}
                  alt={cover.alt}
                  className="block aspect-square w-full object-cover"
                />
              </div>
              <ArtCredit className="mt-2 block text-dossier-faint" />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
