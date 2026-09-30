import type { Metadata } from "next";
import Link from "next/link";
import { CaseGrid } from "@/src/components/CaseGrid";
import { VerdictMoves } from "@/src/components/VerdictMoves";
import { assetPath } from "@/src/config/assets";
import { site } from "@/src/config/site";
import { liveClaims, liveEvidence, loadAllCases, siteImage } from "@/src/domain/load";
import { recentMoves } from "@/src/domain/moves";

/** The front page keeps the site's own title and card (app/layout.tsx) and states its address. */
export const metadata: Metadata = { alternates: { canonical: "/" } };

/** Editions shown under "Where the assessments moved"; each case's page has its whole history. */
const MOVES_SHOWN = 6;

export default function HomePage() {
  const cases = loadAllCases();
  const divider = siteImage("IMG-SITE-DIVIDER-STRATA");
  const tailpiece = siteImage("IMG-SITE-TAILPIECE");
  const moved = recentMoves(cases, MOVES_SHOWN);
  const totals = {
    claims: cases.reduce((n, c) => n + liveClaims(c).length, 0),
    evidence: cases.reduce((n, c) => n + liveEvidence(c).length, 0),
    sources: cases.reduce((n, c) => n + c.sources.length, 0),
  };

  return (
    <div>
      <section className="mx-auto max-w-6xl px-5 pt-10 sm:pt-14 pb-10">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-copper">
          {site.subtitle}
        </p>
        <h1 className="font-serif text-3xl sm:text-[2.6rem] tracking-tight mt-3 leading-[1.12] max-w-3xl">
          Controversies are argued at the wrong scale. We take them apart.
        </h1>
        <p className="mt-5 text-[16px] leading-relaxed text-ink-soft max-w-2xl">
          {site.mission}
        </p>
        <p className="mt-5 flex flex-wrap items-baseline gap-x-8 gap-y-2">
          <Link
            href="/method/"
            className="font-mono text-[11px] uppercase tracking-[0.14em] text-copper underline underline-offset-4 hover:text-ink"
          >
            How the atlas works →
          </Link>
          {cases.length > 0 ? (
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">
              {cases.length} cases · {totals.claims} claims · {totals.evidence} evidence records · {totals.sources} sources
            </span>
          ) : null}
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-8">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint mb-4">
          cases
        </h2>
        {cases.length === 0 ? (
          <div className="border border-line px-6 py-10 max-w-2xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-copper">
              no cases published yet
            </p>
            <p className="mt-3 text-[14.5px] leading-relaxed text-ink-soft">
              The first case dossiers are in preparation. A case is published
              only when its claims, evidence records, and sources meet the
              provenance standards described on the{" "}
              <Link
                href="/method/"
                className="underline underline-offset-2 decoration-copper/60 hover:text-ink"
              >
                method page
              </Link>
              — nothing ships early to fill this space.
            </p>
          </div>
        ) : null}
        <CaseGrid cases={cases} />
      </section>

      <section className="mx-auto max-w-6xl px-5 pt-10 pb-4">
        <div className="max-w-3xl">
          <h2 className="font-serif text-3xl tracking-tight">Where the assessments moved</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            A map that never changes its mind is not tracking anything. These
            are the latest editions that changed a verdict, with the word
            before and the word after. Each case keeps its whole history.
          </p>
          <div className="mt-7">
            {moved.length === 0 ? (
              <p className="text-[14px] text-ink-soft">
                No verdict has moved yet. When an edition changes what a case
                or a claim is judged to be, the move appears here with the
                word before and the word after.
              </p>
            ) : (
              <VerdictMoves editions={moved} perEdition={3} />
            )}
          </div>
        </div>
      </section>

      <section className="bg-dossier text-dossier-text mt-12">
        <div className="mx-auto max-w-6xl px-5 py-12">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-copper">
            how the atlas works
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-dossier-line border border-dossier-line mt-5">
            {[
              [
                "01 · Atomic claims",
                "Every case is decomposed into single propositions with clear truth conditions, arranged on a ladder from what is observable to what is claimed. Credibility is assessed per rung — evidence for a lower rung does not automatically climb.",
              ],
              [
                "02 · Symmetric evidence",
                "Evidence for and against gets the same structure and the same seriousness. What a source states is kept separate from what we infer. Every record carries its provenance: who extracted it, who checked it, and who hasn't yet.",
              ],
              [
                "03 · Decisive experiments",
                "A case doesn't end in a verdict; it ends in a research agenda. Each unresolved crux is attached to the study that would move it — and the assessment says in advance what would change its mind.",
              ],
              [
                "04 · Honest provenance",
                "The site is written, checked and maintained by AI, and says so on every page. No assessment stands on one model's word: models from rival vendors judge each case blind, and where they disagree is published, not smoothed over. Every run and every refusal is on the record.",
              ],
            ].map(([title, text]) => (
              <div key={title} className="bg-dossier-soft p-6">
                <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-copper">
                  {title}
                </h3>
                <p className="mt-3 text-[14px] leading-relaxed text-dossier-text/85">
                  {text}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-[13px] text-dossier-faint">
            Read the full{" "}
            <Link
              href="/method/"
              className="underline decoration-copper/60 underline-offset-2 hover:text-dossier-text"
            >
              methodology
            </Link>
            , including exactly how AI is and is not used, or watch it work on the{" "}
            <Link
              href="/operations/"
              className="underline decoration-copper/60 underline-offset-2 hover:text-dossier-text"
            >
              operations page
            </Link>
            .
          </p>
        </div>
      </section>

      {/* engraved strata divider */}
      <div aria-hidden className="mx-auto max-w-3xl px-5 pt-14">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={assetPath(divider.file)}
          alt=""
          loading="lazy"
          className="block w-full h-16 object-cover opacity-80"
        />
      </div>

      {/* tailpiece ornament */}
      <div aria-hidden className="mx-auto max-w-xs px-5 pt-10 pb-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={assetPath(tailpiece.file)}
          alt=""
          loading="lazy"
          className="block w-full mix-blend-multiply opacity-90"
        />
      </div>
    </div>
  );
}
