import Link from "next/link";
import {
  assessmentFamily,
  assessmentLabels,
  rungLabels,
  rungOrder,
  type FeaturedClaim,
} from "@/src/domain/schema";

const dotClasses: Record<string, string> = {
  supported: "bg-verdigris",
  contested: "bg-ochre",
  against: "bg-terracotta",
  open: "bg-slate-mist",
};

const rungGloss: Record<string, string> = {
  attribution: "Was it actually done? The claims the thesis stands or falls on.",
  mechanism: "Could it have been done? Ingredients, chemistry, and method.",
  observation: "What is actually there? Measurements, records, and anomalies.",
};

/**
 * The argument ladder — dark register, hand-built. Rungs are stacked with
 * attribution at the top; the reader sees credibility decay as the argument
 * climbs from what is observable toward what is claimed.
 */
export function ArgumentLadder({ claims }: { claims: FeaturedClaim[] }) {
  const rungs = [...rungOrder].reverse(); // attribution on top

  return (
    <div className="bg-dossier text-dossier-text border border-dossier-line">
      <div className="px-5 sm:px-8 pt-6 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-mono text-[12px] uppercase tracking-[0.2em] text-copper">
          the argument ladder
        </h3>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-dossier-faint">
          evidence for a lower rung does not automatically climb
        </p>
      </div>
      <div className="p-5 sm:p-8 space-y-0">
        {rungs.map((rung, i) => {
          const rungClaims = claims
            .filter((c) => c.rung === rung)
            .sort(
              (a, b) =>
                ["headline", "major", "supporting"].indexOf(a.importance) -
                ["headline", "major", "supporting"].indexOf(b.importance),
            );
          if (rungClaims.length === 0) return null;
          return (
            <div key={rung} className="relative pl-6 sm:pl-8">
              {/* rail */}
              <div
                aria-hidden
                className="absolute left-1.5 sm:left-2.5 top-0 bottom-0 w-px bg-dossier-line"
              />
              <div
                aria-hidden
                className="absolute left-0 sm:left-1 top-6 size-3 rounded-full border border-copper bg-dossier"
              />
              <div className={i > 0 ? "pt-6" : ""}>
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <h4 className="font-serif text-xl">{rungLabels[rung]}</h4>
                  <p className="text-[13px] text-dossier-faint">
                    {rungGloss[rung]}
                  </p>
                </div>
                <ul className="mt-3 mb-6 grid gap-2 sm:grid-cols-2">
                  {rungClaims.map((claim) => {
                    const family = assessmentFamily(claim.credibility);
                    return (
                      <li key={claim.id}>
                        <Link
                          href={`/claims/${claim.id}/`}
                          className="group block border border-dossier-line bg-dossier-soft p-3 hover:border-copper/60"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[10px] tracking-[0.14em] text-dossier-faint">
                              {claim.id}
                              {claim.importance === "headline" ? (
                                <span className="text-copper"> · headline</span>
                              ) : null}
                            </span>
                            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-dossier-faint">
                              <span
                                className={`inline-block size-1.5 rounded-full ${dotClasses[family]}`}
                              />
                              {assessmentLabels[claim.credibility]}
                            </span>
                          </div>
                          <p className="mt-1.5 text-[13.5px] leading-snug text-dossier-text/90 group-hover:text-dossier-text line-clamp-3">
                            {claim.statement}
                          </p>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
