import Link from "next/link";
import { ArtCredit } from "@/src/components/ArtCredit";
import { CaseCard } from "@/src/components/CaseCard";
import { ChangeTimeline } from "@/src/components/ChangeTimeline";
import { assetPath } from "@/src/config/assets";
import { site } from "@/src/config/site";
import {
  caseCover,
  latestAssessment,
  loadAllCases,
  siteImage,
} from "@/src/domain/load";

export default function HomePage() {
  const cases = loadAllCases();
  const [featured, ...rest] = cases;
  const hero = siteImage("IMG-SITE-HERO");
  const divider = siteImage("IMG-SITE-DIVIDER-STRATA");
  const tailpiece = siteImage("IMG-SITE-TAILPIECE");
  const recentChanges = cases
    .flatMap((c) => c.history.map((h) => ({ ...h, caseTitle: c.record.title })))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);

  return (
    <div>
      <section className="mx-auto max-w-6xl px-5 pt-14 sm:pt-20 pb-10">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_460px] lg:gap-14 lg:items-center">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-copper">
              {site.subtitle}
            </p>
            <h1 className="font-serif text-4xl sm:text-6xl tracking-tight mt-4 leading-[1.08]">
              Controversies are argued at the wrong scale. We take them apart.
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-ink-soft max-w-2xl">
              {site.mission}
            </p>
          </div>
          <div className="mt-10 lg:mt-0">
            <div className="border border-line bg-paper-deep/40 p-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={assetPath(hero.file)}
                alt={hero.alt}
                className="block w-full"
              />
            </div>
            <div className="mt-1.5 flex justify-between items-baseline">
              <span className="font-serif italic text-[13px] text-faint">
                Aletheia: truth as unconcealment
              </span>
              <ArtCredit />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-8">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint mb-4">
          featured case
        </h2>
        {featured ? (
          <CaseCard
            record={featured.record}
            verdict={latestAssessment(featured)?.caseAssessment.verdict ?? null}
            cover={caseCover(featured)}
            featured
          />
        ) : null}
        {rest.length > 0 ? (
          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            {rest.map((c) => (
              <CaseCard
                key={c.record.id}
                record={c.record}
                verdict={latestAssessment(c)?.caseAssessment.verdict ?? null}
                cover={caseCover(c)}
              />
            ))}
          </div>
        ) : null}
      </section>

      <section className="bg-dossier text-dossier-text mt-10">
        <div className="mx-auto max-w-6xl px-5 py-12">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-copper">
            how the atlas works
          </h2>
          <div className="grid sm:grid-cols-3 gap-px bg-dossier-line border border-dossier-line mt-5">
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
                "A case doesn't end in a verdict; it ends in a research agenda. Each unresolved crux is attached to the funded study that would move it — and the assessment says in advance what would change its mind.",
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
            , including exactly how AI is and is not used.
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

      <section className="mx-auto max-w-6xl px-5 py-12">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint mb-6">
          recent changes
        </h2>
        <ChangeTimeline entries={recentChanges} />
      </section>

      {/* tailpiece ornament */}
      <div aria-hidden className="mx-auto max-w-xs px-5 pb-4">
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
