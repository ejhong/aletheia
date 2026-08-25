import Link from "next/link";
import { CaseCard } from "@/src/components/CaseCard";
import { ChangeTimeline } from "@/src/components/ChangeTimeline";
import { assetPath } from "@/src/config/assets";
import { site } from "@/src/config/site";
import {
  caseCover,
  crossModelSummary,
  displayAssessment,
  isHousekeepingEntry,
  loadAllCases,
  recentChanges,
  reviewCoverage,
  siteImage,
} from "@/src/domain/load";

export default function HomePage() {
  const cases = loadAllCases();
  const divider = siteImage("IMG-SITE-DIVIDER-STRATA");
  const tailpiece = siteImage("IMG-SITE-TAILPIECE");
  // Epistemic changes lead the homepage feed; artwork/tooling entries stay
  // on each case's own history. At least one slot per live case, so a new
  // case's launch always shows.
  const contentOnly = cases.map((c) => ({
    record: c.record,
    history: c.history.filter((h) => !isHousekeepingEntry(h)),
  }));
  const feed = recentChanges(contentOnly, Math.max(4, cases.length));
  const housekeepingCount = cases.reduce(
    (n, c) => n + c.history.filter(isHousekeepingEntry).length,
    0,
  );

  return (
    <div>
      <section className="mx-auto max-w-6xl px-5 pt-10 sm:pt-12 pb-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-copper">
          {site.subtitle}
        </p>
        <h1 className="font-serif text-2xl sm:text-3xl tracking-tight mt-3 leading-[1.15] max-w-2xl">
          Controversies are argued at the wrong scale. We take them apart.
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-soft max-w-2xl">
          {site.mission}
        </p>
        <p className="mt-4 flex flex-wrap gap-x-8 gap-y-2">
          <Link
            href="/research/"
            className="font-mono text-[11px] uppercase tracking-[0.14em] text-copper underline underline-offset-4 hover:text-ink"
          >
            The Price of Truth — every decisive test, priced →
          </Link>
          <Link
            href="/method/"
            className="font-mono text-[11px] uppercase tracking-[0.14em] text-copper underline underline-offset-4 hover:text-ink"
          >
            How the atlas works →
          </Link>
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-8">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint mb-4">
          cases
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {cases.map((c) => {
            const shown = displayAssessment(c);
            const sum = crossModelSummary(c);
            return (
              <CaseCard
                key={c.record.id}
                record={c.record}
                verdict={shown?.run.caseAssessment.verdict ?? null}
                standing={shown?.ratification.status ?? null}
                reviewCoverage={reviewCoverage(c)}
                check={
                  sum
                    ? {
                        models: sum.models.length,
                        concur: sum.caseUnanimousWithDisplayed,
                      }
                    : null
                }
                cover={caseCover(c)}
              />
            );
          })}
        </div>
      </section>

      <section className="bg-dossier text-dossier-text mt-10">
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
                "Every case shows two outputs — what the evidence supports today, and how valuable resolving it would be. Assessments are labeled AI draft until a named human endorses them, and independent models from rival vendors re-judge each case blind; where they disagree is published, not smoothed over.",
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
          recent changes · evidence &amp; assessments
        </h2>
        <ChangeTimeline entries={feed} />
        {housekeepingCount > 0 ? (
          <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
            + {housekeepingCount} housekeeping changes (artwork, tooling) —
            recorded in each case&apos;s full history
          </p>
        ) : null}
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
