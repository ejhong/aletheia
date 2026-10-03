import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountsList } from "@/src/components/AccountsList";
import { ArgumentLadder } from "@/src/components/ArgumentLadder";
import { ArticleBody } from "@/src/components/ArticleBody";
import { ArticleOutline } from "@/src/components/ArticleOutline";
import { AtAGlance } from "@/src/components/AtAGlance";
import { DossierHeader } from "@/src/components/DossierHeader";
import { EvidenceCard } from "@/src/components/EvidenceCard";
import { LinkedRecordText } from "@/src/components/LinkedRecordText";
import { ResearchCard } from "@/src/components/ResearchCard";
import { SectionNav } from "@/src/components/SectionNav";
import { StandingPanel } from "@/src/components/StandingPanel";
import { VerdictMoves } from "@/src/components/VerdictMoves";
import { pageMeta } from "@/src/config/meta";
import { site } from "@/src/config/site";
import { articleLengths, comparisonInWords } from "@/src/domain/comparison";
import { caseAccounts, caseQuestion, currentEdition, questionRestatedBy } from "@/src/domain/editions";
import { historyNewestFirst, isHousekeepingEntry, lastContentUpdate } from "@/src/domain/history";
import { caseCover, liveClaims, liveEvidence, loadAllCases, verifiedEvidence } from "@/src/domain/load";
import { currentMoves, verdictMoves } from "@/src/domain/moves";
import { unpublishedChecks } from "@/src/domain/record";
import { crossModelSummary, currentChecks, latestCheckPerModel } from "@/src/domain/standing";
import { paramsOrPlaceholder } from "@/src/domain/staticExport";
import { articleWords, clip, readingMinutes } from "@/src/domain/text";
import { caseView } from "@/src/domain/view";

export function generateStaticParams() {
  return paramsOrPlaceholder(
    "slug",
    loadAllCases().map((c) => c.record.slug),
  );
}

/**
 * A case shared as a link is shown by its own title, its own question and its
 * own cover — not the site's. (Every case page used to carry the site's
 * description and card, so a shared case previewed as "Aletheia".)
 */
export function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  return params.then(({ slug }) => {
    const loaded = loadAllCases().find((c) => c.record.slug === slug);
    if (!loaded) return { title: "Not found" };
    const cover = caseCover(loaded);
    return pageMeta({
      title: loaded.record.title,
      description: clip(caseQuestion(loaded), 300),
      path: `/cases/${slug}/`,
      image: cover ? { url: cover.file, alt: cover.alt } : null,
      article: true,
    });
  });
}

/** Research items in the edition's crux order; anything unordered follows in file order. */
function orderedResearch<T extends { id: string }>(order: string[], items: T[]): T[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...items].sort(
    (a, b) => (rank.get(a.id) ?? order.length) - (rank.get(b.id) ?? order.length),
  );
}

/** Research items shown before the disclosure: the edition orders them by what would move the case most. */
const RESEARCH_SHOWN = 4;
/** Changelog entries shown on the case page; the record page has the whole log. */
const CHANGES_SHOWN = 3;

/* Labels stay one word each: the navigator must survive a phone viewport
   without wrapping. The order is the order a reader needs: the question
   and what the site makes of it, the telling, then the machinery under it. */
const sections = [
  ["overview", "Overview"],
  ["judgment", "Judgment"],
  ["article", "Article"],
  ["ladder", "Ladder"],
  ["evidence", "Evidence"],
  ["research", "Research"],
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
  const view = caseView(loaded);
  const claims = view.featured;
  const shown =
    view.assessment && view.standing
      ? { run: view.assessment, ratification: view.standing }
      : null;
  const panel = latestCheckPerModel(loaded);
  const sourceById = new Map(loaded.sources.map((s) => [s.id, s]));
  const restated = questionRestatedBy(loaded);

  const strongest = (direction: "supports" | "undermines") =>
    verifiedEvidence(loaded)
      .filter((e) => e.direction === direction)
      .sort(
        (a, b) =>
          ["decisive", "strong", "moderate", "weak"].indexOf(a.strength) -
          ["decisive", "strong", "moderate", "weak"].indexOf(b.strength),
      )
      .slice(0, 3);

  const research = orderedResearch(view.edition.cruxOrder, loaded.research);
  const open = research.filter((r) => (r.status ?? "open") === "open");
  const settled = research.filter((r) => (r.status ?? "open") !== "open");
  const studyFor = (id: string) => loaded.studies.find((s) => s.researchIds.includes(id));

  const moved = [...verdictMoves(loaded)].reverse();
  const changes = historyNewestFirst(loaded.history.filter((h) => !isHousekeepingEntry(h)));
  const minutes = readingMinutes(articleWords(view.article));

  return (
    <div>
      <SectionNav
        sections={sections.filter(([id]) => id !== "judgment" || shown !== null)}
        slug={slug}
        hasStudies={loaded.studies.length > 0}
      />

      <DossierHeader
        record={loaded.record}
        question={caseQuestion(loaded)}
        questionNote={restated ? `as restated by the edition of ${restated.date} (${restated.runId}); the founding question: ${loaded.record.subtitle}` : undefined}
        header={view.header}
        // An edition is an update too: a case re-told today was updated today, whatever the ledger's changelog last says.
        lastUpdated={[lastContentUpdate(loaded), currentEdition(loaded).date].sort().at(-1)!}
        verdict={shown?.run.caseAssessment.verdict ?? null}
        standing={shown?.ratification ?? null}
        cover={caseCover(loaded)}
      />

      <div className="mx-auto max-w-6xl px-5">
        <div className="pt-8">
          <AtAGlance
            slug={slug}
            editionDate={currentEdition(loaded).date}
            isFirstEdition={loaded.editions.length < 2}
            moves={currentMoves(loaded)}
            counts={{ claims: liveClaims(loaded).length, evidence: liveEvidence(loaded).length, sources: loaded.sources.length }}
            minutes={minutes}
            words={articleLengths(loaded)}
            chosen={comparisonInWords(currentEdition(loaded).comparison)}
          />
        </div>

        {shown ? (
          <section id="judgment" className="pt-6 scroll-mt-28">
            <StandingPanel
              run={shown.run}
              standing={shown.ratification}
              checks={panel}
              current={currentChecks(loaded, panel).map((r) => r.runId)}
              summary={crossModelSummary(loaded)}
              claims={view.claims.map((c) => c.claim)}
              unpublished={unpublishedChecks(loaded)}
              recordHref={`/cases/${loaded.record.slug}/record/`}
            />
          </section>
        ) : null}

        <AccountsList accounts={caseAccounts(loaded)} editionDate={currentEdition(loaded).date} />

        <section id="article" className="pt-14 scroll-mt-28">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 mb-5">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
              the article · a marked sentence opens the exact claim behind it
            </h2>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
              about {minutes} minute{minutes === 1 ? "" : "s"}
            </p>
          </div>
          <ArticleOutline markdown={view.article} />
          <ArticleBody
            markdown={view.article}
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
              Browse the full ledger ({liveEvidence(loaded).length} records) →
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

        {view.header.bestConventionalExplanation ? (
          <section id="conventional" className="pt-14 scroll-mt-28">
            <div className="border border-line bg-paper-deep/50 p-6 sm:p-8">
              <h2 className="font-serif text-3xl tracking-tight">
                The best conventional explanation
              </h2>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
                steelmanned — the account the featured hypothesis must beat
              </p>
              <p className="mt-4 text-[15.5px] leading-[1.75] text-ink-soft max-w-3xl">
                <LinkedRecordText text={view.header.bestConventionalExplanation} quiet />
              </p>
            </div>
          </section>
        ) : null}

        <section id="research" className="pt-14 scroll-mt-28">
          <h2 className="font-serif text-3xl tracking-tight">
            What would change our mind
          </h2>
          <p className="mt-2 text-[14px] text-ink-soft max-w-2xl">
            The case does not end in a verdict; it ends in the studies that
            would move it, in the order this edition judges they would move
            it most. A result in either direction counts.
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
            {open.slice(0, RESEARCH_SHOWN).map((r) => (
              <ResearchCard key={r.id} item={r} study={studyFor(r.id)} caseSlug={slug} />
            ))}
          </div>
          {open.length > RESEARCH_SHOWN ? (
            <details className="group mt-4">
              <summary className="cursor-pointer list-none font-mono text-[11px] uppercase tracking-[0.16em] text-copper [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">▸ {open.length - RESEARCH_SHOWN} more studies on the agenda</span>
                <span className="hidden group-open:inline">▾ the rest of the agenda</span>
              </summary>
              <div className="grid sm:grid-cols-2 gap-4 mt-4">
                {open.slice(RESEARCH_SHOWN).map((r) => (
                  <ResearchCard key={r.id} item={r} study={studyFor(r.id)} caseSlug={slug} />
                ))}
              </div>
            </details>
          ) : null}
          {settled.length > 0 ? (
            <details className="group mt-4">
              <summary className="cursor-pointer list-none font-mono text-[11px] uppercase tracking-[0.16em] text-faint [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">▸ {settled.length} settled — answered, superseded or retired</span>
                <span className="hidden group-open:inline">▾ settled — kept as the record of what was asked</span>
              </summary>
              <div className="grid sm:grid-cols-2 gap-4 mt-4">
                {settled.map((r) => (
                  <ResearchCard key={r.id} item={r} study={studyFor(r.id)} caseSlug={slug} />
                ))}
              </div>
            </details>
          ) : null}
        </section>

        <section id="history" className="pt-14 pb-6 scroll-mt-28">
          <h2 className="font-serif text-3xl tracking-tight mb-2">
            How the assessment has moved
          </h2>
          <p className="text-[14px] text-ink-soft max-w-2xl mb-6">
            Trust comes partly from showing changed minds. Each entry is an
            edition that changed a verdict, with the word before and the word
            after — a reversal included.
          </p>
          {moved.length > 0 ? (
            <VerdictMoves editions={moved} perEdition={8} />
          ) : (
            <p className="text-[14px] text-ink-soft">
              {loaded.editions.length < 2
                ? "This case has had one edition; no verdict has had the chance to move."
                : "No verdict has moved between this case's editions."}
            </p>
          )}

          <h3 className="font-serif text-2xl tracking-tight mt-12 mb-2">The change log</h3>
          <p className="text-[14px] text-ink-soft max-w-2xl mb-4">
            {site.name} records every change to a case: what changed, why, and
            who made it — including the AI&apos;s role. The latest:
          </p>
          <ul className="max-w-4xl border-y border-line divide-y divide-line/70">
            {changes.slice(0, CHANGES_SHOWN).map((h, i) => (
              <li key={i} className="flex gap-4 py-2.5 text-[13.5px] leading-relaxed text-ink-soft">
                <time dateTime={h.date} className="shrink-0 font-mono text-[11px] tracking-[0.1em] text-copper pt-0.5">{h.date}</time>
                <span className="min-w-0">{clip(h.change, 190)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5">
            <Link
              href={`/cases/${slug}/record/#history`}
              className="font-mono text-[11px] uppercase tracking-[0.16em] text-copper underline underline-offset-4 hover:text-ink"
            >
              All {loaded.history.length} entries, and every run with what it refused and why →
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
