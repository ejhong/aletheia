import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleBody } from "@/src/components/ArticleBody";
import { AssessmentBadge } from "@/src/components/AssessmentBadge";
import { loadAllCases } from "@/src/domain/load";
import { PLACEHOLDER_PARAM } from "@/src/domain/staticExport";
import { editionDraft } from "@/scripts/lib/review-state.mjs";

type Params = Promise<{ slug: string; edition: string }>;
export function generateStaticParams() {
  const pairs = loadAllCases().flatMap(c => c.editions.map(e => ({ slug: c.record.slug, edition: e.runId })));
  return pairs.length ? pairs : [{ slug: PLACEHOLDER_PARAM, edition: PLACEHOLDER_PARAM }];
}
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, edition } = await params;
  const loaded = loadAllCases().find(c => c.record.slug === slug);
  const record = loaded?.editions.find(e => e.runId === edition);
  return { title: record ? `${loaded!.record.title} · edition ${record.generatedAt.slice(0, 10)}` : "Not found" };
}

export default async function EditionPage({ params }: { params: Params }) {
  const { slug, edition: id } = await params;
  const loaded = loadAllCases().find(c => c.record.slug === slug);
  const edition = loaded?.editions.find(e => e.runId === id);
  if (!loaded || !edition) notFound();
  const assessment = editionDraft(loaded.assessmentRuns, edition);
  const current = edition === loaded.editions.at(-1);
  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <header className="mx-auto mb-10 max-w-[46rem]">
        <Link href={`/cases/${slug}/`} className="text-sm text-copper underline underline-offset-4">← Current case</Link>
        <p className="mt-7 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
          {current ? "Current saved edition" : "Earlier edition"} · {edition.generatedAt.slice(0, 10)}
        </p>
        <h1 className="mt-3 font-serif text-4xl tracking-tight">{loaded.record.title}</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">{edition.rationale}</p>
        <p className="mt-3 text-[12px] text-faint">
          The essay and its chosen assessment are preserved here. Links and
          photographic captions refer to the current ledger. Current review
          standing appears on the case page.
        </p>
      </header>
      <ArticleBody markdown={edition.article} images={loaded.images} />
      <section className="mx-auto mt-12 max-w-[46rem] border-t border-line pt-6">
        <h2 className="font-serif text-2xl">Assessment in this edition</h2>
        {assessment ? (
          <>
            <div className="mt-4"><AssessmentBadge state={assessment.caseAssessment.verdict} /></div>
            <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-ink-soft">{assessment.caseAssessment.synthesis}</p>
            {assessment.caseAssessment.steelman ? (
              <p className="mt-5 border-l-2 border-copper pl-4 text-[14px] leading-relaxed text-ink-soft">{assessment.caseAssessment.steelman}</p>
            ) : null}
            <p className="mt-4 text-[12px] text-faint">AI assessment · {assessment.model} · {assessment.date}</p>
          </>
        ) : <p className="mt-3 text-[14px] text-ink-soft">This edition leaves the question unassessed.</p>}
        <details className="edition-disclosure mt-6">
          <summary>Edition provenance</summary>
          <p className="mt-3 break-words text-[12px] text-ink-soft">{edition.model} · {edition.generatedAt}</p>
          <p className="mt-2 break-all font-mono text-[10px] text-faint">{edition.runId} · {edition.promptVersion}</p>
        </details>
      </section>
    </div>
  );
}
