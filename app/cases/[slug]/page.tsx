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
  displayAssessment,
  featuredClaims,
  historyNewestFirst,
  lastContentUpdate,
  latestCheckPerModel,
  loadAllCases,
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
  ["assessment", "Assessment"],
  ["article", "Article"],
  ["ladder", "Claim ladder"],
  ["evidence", "Evidence"],
  ["conventional", "Conventional view"],
  ["research", "Research agenda"],
  ["history", "History"],
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
  const claims = featuredClaims(loaded);
  const shown = displayAssessment(loaded);
  const checks = crossModelSummary(loaded);
  const sourceById = new Map(loaded.sources.map((s) => [s.id, s]));

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
      <SectionNav sections={sections} slug={slug} />

      <DossierHeader
        record={loaded.record}
        lastUpdated={lastContentUpdate(loaded)}
        verdict={shown?.run.caseAssessment.verdict ?? null}
        standing={shown?.ratification ?? null}
        cover={caseCover(loaded)}
      />

      <div className="mx-auto max-w-6xl px-5">
        {shown ? (
          <section id="assessment" className="pt-10 scroll-mt-28">
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
            ) : null}
            {checks ? (
              <CrossModelPanel
                summary={checks}
                runs={latestCheckPerModel(loaded)}
              />
            ) : null}
          </section>
        ) : null}

        {loaded.conjectures.length > 0 ? (
          <section id="conjectures" className="pt-10 scroll-mt-28 space-y-4">
            {loaded.conjectures.map((c) => (
              <ConjectureCard key={c.id} conjecture={c} />
            ))}
          </section>
        ) : null}

        <section id="article" className="pt-12 scroll-mt-28">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint mb-6">
            overview · marked sentences open the exact claim
          </h2>
          <ArticleBody
            markdown={loaded.overviewMarkdown}
            claims={claims}
            images={loaded.images}
          />
        </section>

        <section id="ladder" className="pt-14 scroll-mt-28">
          <ArgumentLadder claims={claims} />
        </section>

        <section id="evidence" className="pt-14 scroll-mt-28">
          <h2 className="font-serif text-3xl tracking-tight">
            Evidence highlights
          </h2>
          <p className="mt-2 text-[14px] text-ink-soft max-w-2xl">
            The strongest records on each side, structurally symmetric. Every
            record separates what the source states from what we infer.{" "}
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
          <div className="border border-line bg-paper-deep/50 p-6 sm:p-8">
            <h2 className="font-serif text-3xl tracking-tight">
              The best conventional explanation
            </h2>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
              steelmanned — the account the featured hypothesis must beat
            </p>
            <p className="mt-4 text-[15.5px] leading-[1.75] text-ink-soft max-w-3xl">
              <LinkedRecordText text={loaded.record.bestConventionalExplanation} />
            </p>
          </div>
        </section>

        <section id="research" className="pt-14 scroll-mt-28">
          <h2 className="font-serif text-3xl tracking-tight">
            Research agenda
          </h2>
          <p className="mt-2 text-[14px] text-ink-soft max-w-2xl">
            The case does not end in a verdict; it ends in the studies that
            would move it. Curated from the public request for proposals.
            The program funds tests in either direction.
          </p>
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
              <ResearchCard key={r.id} item={r} />
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
          <ChangeTimeline entries={historyNewestFirst(loaded.history)} />
        </section>
      </div>
    </div>
  );
}
