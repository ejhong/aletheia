import { caseView } from "@/src/domain/caseView";
import { ArticleReader } from "@/src/components/ArticleReader";
import { ComponentVerdicts } from "@/src/components/ComponentVerdicts";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArgumentLadder } from "@/src/components/ArgumentLadder";
import { ArticleBody } from "@/src/components/ArticleBody";
import { AssessmentPanel } from "@/src/components/AssessmentPanel";
import { ChangeTimeline } from "@/src/components/ChangeTimeline";
import { DossierHeader } from "@/src/components/DossierHeader";
import { EvidenceCard } from "@/src/components/EvidenceCard";
import { ResearchCard } from "@/src/components/ResearchCard";
import { SectionNav } from "@/src/components/SectionNav";
import { LinkedRecordText } from "@/src/components/LinkedRecordText";
import { site } from "@/src/config/site";
import { ConjectureCard } from "@/src/components/ConjectureCard";
import { CrossModelPanel } from "@/src/components/CrossModelPanel";
import {
  caseCover,
  crossModelSummary,
  historyNewestFirst,
  latestCheckPerModel,
  loadAllCases,
  survivingObjections,
} from "@/src/domain/load";
import { paramsOrPlaceholder } from "@/src/domain/staticExport";

export function generateStaticParams() {
  return paramsOrPlaceholder(
    "slug",
    loadAllCases().map((c) => c.record.slug),
  );
}

export function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  return params.then(({ slug }) => {
    const loaded = loadAllCases().find((c) => c.record.slug === slug);
    return { title: loaded ? loaded.record.title : "Not found" };
  });
}

const sections = [
  ["article", "Essay"],
  ["assessment", "Assessment"],
  ["evidence", "Evidence"],
  ["research", "Next questions"],
  ["history", "Changes"],
] as const;

export default async function CasePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const found = loadAllCases().find((c) => c.record.slug === slug);
  if (!found) notFound();
  const loaded = found;
  const view = caseView(loaded);
  const claims = view.featured;
  const shown = view.assessment;
  const checks = crossModelSummary(loaded);
  const sourceById = new Map(loaded.sources.map((s) => [s.id, s]));
  const previews = claims.flatMap((claim) =>
    ["supports", "undermines", "qualifies", "context"].flatMap((direction) => {
      const e = loaded.evidence.find(
        (e) => e.direction === direction && e.claimIds.includes(claim.id),
      );
      if (!e) return [];
      return [
        {
          claimId: claim.id,
          evidenceId: e.id,
          direction,
          statement: e.sourceStatement,
          sourceId: e.sourceId,
          sourceTitle: sourceById.get(e.sourceId)!.title,
          sourceVerification: sourceById.get(e.sourceId)!.verification,
          locator: e.exactLocator ?? null,
        },
      ];
    }),
  );

  const strongest = (direction: "supports" | "undermines") =>
    loaded.evidence
      .filter((e) => e.direction === direction)
      .sort(
        (a, b) =>
          ["decisive", "strong", "moderate", "weak"].indexOf(a.strength) -
          ["decisive", "strong", "moderate", "weak"].indexOf(b.strength),
      )
      .slice(0, 3);

  return (
    <div>
      <DossierHeader
        record={loaded.record}
        lastUpdated={view.lastUpdated}
        verdict={shown?.run.caseAssessment.verdict ?? null}
        standing={shown?.ratification ?? null}
        cover={caseCover(loaded)}
      />

      <SectionNav
        sections={sections.filter(
          ([id]) => id !== "assessment" || Boolean(shown),
        )}
        slug={slug}
        hasStudies={loaded.studies.length > 0}
      />

      <div className="mx-auto max-w-6xl px-5">
        <section id="article" className="pt-10 sm:pt-14 scroll-mt-32">
          <p className="mx-auto mb-7 max-w-[46rem] font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
            {view.isStarting
              ? "A question before an answer"
              : "The essay · select an underlined claim to inspect its evidence"}
          </p>
          <ArticleReader claims={claims} evidence={previews}>
            <ArticleBody markdown={view.article} images={loaded.images} />
          </ArticleReader>
        </section>

        {shown ? (
          <section id="assessment" className="pt-14 scroll-mt-32">
            <h2 className="mb-4 font-serif text-3xl tracking-tight">
              How the evidence reads
            </h2>
            {loaded.record.components.length > 0 ? (
              <div className="mb-5">
                <p className="mb-2 text-[13px] text-faint">
                  Recorded component assessments
                </p>
                <ComponentVerdicts components={loaded.record.components} />
              </div>
            ) : null}
            <details
              className="edition-disclosure"
              open={shown.ratification.status === "contested"}
            >
              <summary>
                Read the assessment and its strongest unanswered objection
              </summary>
              <div className="pt-4">
                <AssessmentPanel
                  run={shown.run}
                  standing={shown.ratification}
                  claims={claims}
                />
                {shown.ratification.status !== "ratified" ? (
                  <p className="mt-3 border border-ochre/40 bg-ochre/8 px-4 py-2.5 font-mono text-[11px] tracking-[0.06em] text-ochre">
                    {shown.ratification.status === "contested"
                      ? `Contested: ${shown.ratification.reason}. The disagreement is shown below, not resolved by hiding it.`
                      : `Not yet ratified: ${shown.ratification.reason}.`}
                  </p>
                ) : (
                  /* Ratification tolerates one dissenter — but a conclusion
                 ships with its surviving objections attached, not
                 sanitized away. */
                  survivingObjections(loaded, shown.run).map((o) => (
                    <p
                      key={o.seat}
                      className="mt-3 border border-line bg-paper px-4 py-2.5 text-[12.5px] leading-relaxed text-ink-soft"
                    >
                      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ochre">
                        surviving objection
                      </span>{" "}
                      — {o.seat} grades this case{" "}
                      <span className="font-mono">{o.verdictLabel}</span>:{" "}
                      {o.firstSentence}{" "}
                      <Link
                        href="/panel"
                        className="font-mono text-[11px] text-copper underline underline-offset-2"
                      >
                        full reasoning →
                      </Link>
                    </p>
                  ))
                )}
              </div>
            </details>
            <details className="edition-disclosure mt-3">
              <summary>Independent reviews and their disagreements</summary>
              {checks ? (
                <CrossModelPanel
                  summary={checks}
                  runs={latestCheckPerModel(loaded)}
                />
              ) : (
                <p className="py-4 text-[14px] text-ink-soft">
                  No independent reviews recorded yet.
                </p>
              )}
            </details>
          </section>
        ) : null}

        {loaded.conjectures.length > 0 ? (
          <section id="conjectures" className="pt-10 scroll-mt-28 space-y-4">
            {loaded.conjectures.map((c) => (
              <ConjectureCard key={c.id} conjecture={c} />
            ))}
          </section>
        ) : null}

        {claims.length > 0 ? (
          <section id="ladder" className="pt-8 scroll-mt-32">
            <details className="edition-disclosure">
              <summary>
                Follow the argument, from observation to explanation
              </summary>
              <div className="pt-4">
                <ArgumentLadder claims={claims} />
              </div>
            </details>
          </section>
        ) : null}

        <section id="evidence" className="pt-14 scroll-mt-28">
          <h2 className="font-serif text-3xl tracking-tight">
            Evidence highlights
          </h2>
          <p className="mt-2 text-[14px] text-ink-soft max-w-2xl">
            Supporting and undermining records, selected by their recorded
            strength. Each separates what the source states from what we infer.{" "}
            <Link
              href={`/cases/${slug}/evidence/`}
              className="underline decoration-copper/50 underline-offset-2 hover:decoration-copper text-copper"
            >
              Browse the full ledger ({loaded.evidence.length} records) →
            </Link>
          </p>
          <div className="grid lg:grid-cols-2 gap-4 mt-6">
            <div className="space-y-4">
              <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-verdigris">
                strongest supporting
              </h3>
              {strongest("supports").length === 0 ? (
                <p className="text-sm text-faint">
                  No supporting observations recorded yet.
                </p>
              ) : null}
              {strongest("supports").map((e) => (
                <EvidenceCard
                  key={e.id}
                  evidence={e}
                  source={sourceById.get(e.sourceId)!}
                  showClaims
                />
              ))}
            </div>
            <div className="space-y-4">
              <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-terracotta">
                strongest undermining
              </h3>
              {strongest("undermines").length === 0 ? (
                <p className="text-sm text-faint">
                  No undermining observations recorded yet.
                </p>
              ) : null}
              {strongest("undermines").map((e) => (
                <EvidenceCard
                  key={e.id}
                  evidence={e}
                  source={sourceById.get(e.sourceId)!}
                  showClaims
                />
              ))}
            </div>
          </div>
        </section>

        <section id="conventional" className="pt-14 scroll-mt-28">
          <details className="edition-disclosure">
            <summary>Competing explanations and the question at stake</summary>
            <div className="pt-4">
              <h2 className="font-serif text-3xl tracking-tight">
                The best conventional explanation
              </h2>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
                steelmanned — the account the featured hypothesis must beat
              </p>
              <p className="mt-4 text-[15.5px] leading-[1.75] text-ink-soft max-w-3xl">
                <LinkedRecordText
                  text={
                    loaded.record.bestConventionalExplanation ||
                    "Competing explanations have not yet been mapped."
                  }
                />
              </p>
              <dl className="mt-5 grid gap-5 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-copper">What is claimed</dt>
                  <dd className="mt-2 text-[14px] leading-relaxed">
                    <LinkedRecordText text={loaded.record.whatIsClaimed} />
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-copper">
                    Where the disagreement lives
                  </dt>
                  <dd className="mt-2 text-[14px] leading-relaxed">
                    <LinkedRecordText
                      text={loaded.record.whereDisagreementLives}
                    />
                  </dd>
                </div>
              </dl>
            </div>
          </details>
        </section>

        <section id="research" className="pt-14 scroll-mt-28">
          <h2 className="font-serif text-3xl tracking-tight">
            What would move this forward?
          </h2>
          <p className="mt-2 text-[14px] text-ink-soft max-w-2xl">
            <LinkedRecordText text={loaded.record.whatWouldSettleIt} />
          </p>
          {loaded.record.researchPriority ? (
            <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-faint">
              {loaded.record.researchPriority.reason}
            </p>
          ) : null}
          {loaded.record.externalResearch ? (
            loaded.record.externalResearch.url ? (
              <a
                href={loaded.record.externalResearch.url}
                className="inline-block mt-3 font-mono text-[12px] uppercase tracking-[0.14em] text-copper underline underline-offset-4"
              >
                {loaded.record.externalResearch.label} →
              </a>
            ) : (
              <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-faint">
                {loaded.record.externalResearch.label} — forthcoming
              </p>
            )
          ) : null}
          <div className="grid sm:grid-cols-2 gap-4 mt-6">
            {loaded.research.map((r) => (
              <ResearchCard
                key={r.id}
                item={r}
                study={loaded.studies.find((s) => s.researchIds.includes(r.id))}
                caseSlug={loaded.record.slug}
              />
            ))}
          </div>
        </section>

        <section id="history" className="pt-14 pb-6 scroll-mt-28">
          <h2 className="font-serif text-3xl tracking-tight mb-2">
            Change history
          </h2>
          <p className="text-[14px] text-ink-soft max-w-2xl mb-6">
            Trust comes partly from showing changed minds. {site.name} records
            what changed, why, and who — including the AI&apos;s role.
          </p>
          <details className="edition-disclosure">
            <summary>
              {loaded.history.length} recorded changes · last updated{" "}
              {view.lastUpdated}
            </summary>
            <div className="pt-5">
              <ChangeTimeline entries={historyNewestFirst(loaded.history)} />
            </div>
            <p className="mt-4 break-all text-[11px] text-faint">
              Case version {view.version}
              {shown
                ? ` · displayed assessment ${shown.run.runId}`
                : " · no assessment"}
            </p>
          </details>
        </section>
      </div>
    </div>
  );
}
