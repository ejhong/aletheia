import type { Metadata } from "next";
import { pageMeta } from "@/src/config/meta";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChangeTimeline } from "@/src/components/ChangeTimeline";
import { LatestStrip } from "@/src/components/LatestStrip";
import { RecordPanel } from "@/src/components/RecordPanel";
import { site } from "@/src/config/site";
import { caseActivity } from "@/src/domain/activity";
import { historyNewestFirst } from "@/src/domain/history";
import { liveClaims, liveEvidence, loadAllCases } from "@/src/domain/load";
import { caseRecord } from "@/src/domain/record";
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
    return loaded
      ? pageMeta({
          title: `The record · ${loaded.record.title}`,
          description: `How the case “${loaded.record.title}” was made: every run, what it admitted, what it refused and why, and every change to the record.`,
          path: `/cases/${slug}/record/`,
        })
      : { title: "Not found" };
  });
}

/**
 * The record layer of a case, on a page of its own: how the current edition
 * was made, every sitting with what it admitted and what it refused and
 * why, and the whole change history. The case page is for reading the case;
 * this page is for checking how it was made. It used to sit at the foot of
 * the case page, where it was two thirds of the page's words.
 */
export default async function CaseRecordPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const found = loadAllCases().find((c) => c.record.slug === slug);
  if (!found) notFound();
  const loaded = found;
  const sittings = caseRecord(loaded);
  const history = historyNewestFirst(loaded.history);
  const jump = "font-mono text-[11px] uppercase tracking-[0.14em] text-copper border border-line px-2 py-1 hover:border-copper/60";

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint">
        <Link href={`/cases/${slug}/`} className="text-copper hover:underline">
          {loaded.record.title}
        </Link>{" "}
        · the record
      </p>
      <h1 className="font-serif text-4xl tracking-tight mt-3">The record</h1>
      <p className="mt-3 text-ink-soft max-w-2xl">
        How this case was made. {site.name} is operated by AI, and what makes
        that accountable is that nothing it does is hidden: every run is
        here with what it proposed, what it admitted, and what it refused
        with the reason; every change to the case is dated, explained and
        attributed.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <a href="#latest" className={jump}>the current edition</a>
        <a href="#record" className={jump}>run by run ({sittings.length})</a>
        <a href="#history" className={jump}>change history ({history.length})</a>
      </div>

      <div className="mt-10">
        <LatestStrip activity={caseActivity(loaded)} />
      </div>

      <RecordPanel
        sittings={sittings}
        slug={loaded.record.slug}
        caseDir={loaded.dir}
        linkable={new Set([...liveClaims(loaded).map((c) => c.id), ...loaded.sources.map((s) => s.id), ...liveEvidence(loaded).map((e) => e.id)])}
      />

      <section id="history" className="pt-14 scroll-mt-28">
        <h2 className="font-serif text-3xl tracking-tight mb-2">Change history</h2>
        <p className="text-[14px] text-ink-soft max-w-2xl mb-6">
          Every change to this case, newest first: what changed, why, and who
          made it — including the AI&apos;s role. The log is append-only; a
          correction is a new entry, never an edit to an old one.
        </p>
        <ChangeTimeline entries={history} />
      </section>
    </div>
  );
}
