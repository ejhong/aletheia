import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AssessmentBadge } from "@/src/components/AssessmentBadge";
import { EvidenceCard } from "@/src/components/EvidenceCard";
import { LinkedRecordText } from "@/src/components/LinkedRecordText";
import { Plate } from "@/src/components/Plate";
import { ProvenanceBadge } from "@/src/components/ProvenanceBadge";
import { liveClaims, loadAllCases } from "@/src/domain/load";
import { paramsOrPlaceholder } from "@/src/domain/staticExport";
import {
  assessmentStateCaptions,
  claimTypeCaptions,
  directionLabels,
  rungLabels,
  type ClaimGenealogy,
  type EvidenceDirection,
} from "@/src/domain/schema";
import {
  findClaimView,
  type CaseView,
  type ClaimView,
} from "@/src/domain/view";

/**
 * The claim's public genealogy — earliest known appearance, rendered in the
 * dossier strip. "First known" is exactly that: the earliest appearance
 * found, never asserted as absolute priority.
 */
function GenealogyLine({ genealogy }: { genealogy: ClaimGenealogy }) {
  return (
    <p className="mt-3 max-w-3xl font-mono text-[11px] leading-relaxed tracking-[0.04em] text-dossier-faint">
      first known appearance {genealogy.firstKnown} —{" "}
      {genealogy.originDescription}
      {genealogy.originSourceId ? (
        <>
          {" "}
          <Link
            href={`/sources/${genealogy.originSourceId}/`}
            className="text-copper hover:underline"
          >
            {genealogy.originSourceId}
          </Link>
        </>
      ) : null}
    </p>
  );
}

export function generateStaticParams() {
  return paramsOrPlaceholder(
    "id",
    loadAllCases().flatMap((loaded) => liveClaims(loaded).map((c) => c.id)),
  );
}

export function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  return params.then(({ id }) => ({ title: `Claim ${id}` }));
}

function DossierStrip({
  view,
  cv,
  children,
}: {
  view: ClaimView;
  cv: CaseView;
  children?: React.ReactNode;
}) {
  const { claim, treatment } = view;
  const record = cv.loaded.record;
  return (
    <section className="bg-dossier text-dossier-text">
      <div className="mx-auto max-w-5xl px-5 py-10">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-dossier-faint">
          <Link href={`/cases/${record.slug}/`} className="text-copper hover:underline">
            {record.title}
          </Link>{" "}
          · claim {claim.id} · {rungLabels[claim.rung]} rung ·{" "}
          {record.themes[claim.theme]}
        </p>
        <h1 className="font-serif text-2xl sm:text-[2rem] leading-snug tracking-tight mt-4 max-w-3xl">
          {claim.statement}
        </h1>
        {treatment ? (
          <p className="font-serif italic text-dossier-faint mt-3 max-w-3xl text-lg">
            {treatment.plainLanguage}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {children}
          <ProvenanceBadge
            state={claim.reviewState}
            detail={`${claim.origin.extractedBy} · run ${claim.origin.runId} · ${claim.origin.date}`}
          />
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-dossier-faint">
            origin: {claim.origin.ref}
          </span>
        </div>
        {claim.genealogy ? <GenealogyLine genealogy={claim.genealogy} /> : null}
      </div>
    </section>
  );
}

/**
 * A claim the current edition does not feature renders honestly sparse:
 * the statement, its anchor, and provenance — plus an explicit account of
 * what is missing. No pretending a backlog record is an assessed claim.
 */
function UnfeaturedClaimView({ view, cv }: { view: ClaimView; cv: CaseView }) {
  const { claim } = view;
  const missing = [
    "plain-language gloss",
    "credibility assessment",
    "diagnosticity assessment",
    "strongest objection",
    "what would change our mind",
  ];
  const evidence = cv.loaded.evidence.filter((e) => e.claimIds.includes(claim.id));
  return (
    <div>
      <DossierStrip view={view} cv={cv}>
        <span className="inline-flex items-center rounded-xs border border-ochre/50 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ochre">
          Not featured in the current edition
        </span>
      </DossierStrip>

      <div className="mx-auto max-w-5xl px-5 py-10 space-y-8">
        {claim.sourceAnchor ? (
          <section className="border border-line bg-paper p-5">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-faint">
              source anchor
            </h2>
            <p className="mt-2.5 text-[14.5px] leading-relaxed text-ink-soft">
              {claim.sourceAnchor.locator}
            </p>
            {claim.sourceAnchor.quote ? (
              <blockquote className="mt-3 border-l-2 border-copper pl-4 font-serif italic text-[15px] text-ink-soft">
                “{claim.sourceAnchor.quote}”
              </blockquote>
            ) : null}
            {claim.independenceGroup ? (
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                independence group: {claim.independenceGroup} — related
                extractions in this group are not independent evidence
              </p>
            ) : null}
          </section>
        ) : null}

        {evidence.length > 0 ? (
          <section>
            <h2 className="font-serif text-2xl tracking-tight">Evidence</h2>
            <div className="mt-4 grid lg:grid-cols-2 gap-4">
              {evidence.map((e) => (
                <EvidenceCard
                  key={e.id}
                  evidence={e}
                  source={cv.loaded.sources.find((s) => s.id === e.sourceId)!}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section className="border border-line bg-paper-deep/50 p-5">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-copper">
            an honest empty state
          </h2>
          <p className="mt-2.5 text-[14.5px] leading-relaxed text-ink-soft max-w-3xl">
            This claim is in the ledger but not in the current edition&apos;s
            featured set. Nothing here has been assessed — that absence is
            information, not an oversight.
          </p>
          <p className="mt-3 text-[14px] leading-relaxed text-ink-soft max-w-3xl">
            Still missing: {missing.join(", ")}. A claim gains them when an
            edition features it and the edition&apos;s adopted assessment
            supplies the full treatment — a decision the panel reviews, not a
            field anyone flips.
          </p>
        </section>
      </div>
    </div>
  );
}

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const found = findClaimView(loadAllCases(), id);
  if (!found) notFound();
  const { view, caseView: cv } = found;
  if (!view.featured || !view.treatment || !view.verdict) {
    return <UnfeaturedClaimView view={view} cv={cv} />;
  }
  const { claim, treatment, verdict } = view;
  const loaded = cv.loaded;
  const claims = liveClaims(loaded);
  const claimById = new Map(claims.map((c) => [c.id, c]));
  const sourceById = new Map(loaded.sources.map((s) => [s.id, s]));

  const evidence = loaded.evidence.filter((e) => e.claimIds.includes(id));
  const byDirection = (d: EvidenceDirection) =>
    evidence.filter((e) => e.direction === d);
  const children = claims.filter((c) => c.parentClaimIds.includes(id));
  const assessmentHistory = loaded.assessmentRuns
    .map((run) => ({
      run,
      entry: run.claimAssessments.find((ca) => ca.claimId === id),
    }))
    .filter((x) => x.entry);
  const research = loaded.research.filter((r) => r.claimIds.includes(id));
  const plates = loaded.images.filter(
    (img) => img.role === "plate" && img.claimIds.includes(id),
  );

  const relatedList = (label: string, ids: string[]) =>
    ids.length > 0 ? (
      <div>
        <h3 className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
          {label}
        </h3>
        <ul className="mt-1.5 space-y-1.5">
          {ids.map((cid) => {
            const c = claimById.get(cid);
            return (
              <li key={cid}>
                <Link
                  href={`/claims/${cid}/`}
                  className="text-[13px] text-ink-soft hover:text-copper"
                >
                  <span className="font-mono text-[10px] tracking-[0.12em] text-copper">
                    {cid}
                  </span>{" "}
                  {c?.statement}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    ) : null;

  return (
    <div>
      <DossierStrip view={view} cv={cv} />

      <div className="mx-auto max-w-5xl px-5 py-10">
        {/* The two axes, side by side */}
        <section className="grid sm:grid-cols-2 gap-px bg-line border border-line">
          <div className="bg-paper p-5">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-faint">
              credibility — is the claim itself true?
            </h2>
            <div className="mt-2.5">
              <AssessmentBadge state={verdict} size="lg" />
            </div>
            {claim.claimType && claimTypeCaptions[claim.claimType] ? (
              <p className="mt-2 font-mono text-[10px] tracking-[0.06em] text-copper">
                ⚠ {claimTypeCaptions[claim.claimType]}
              </p>
            ) : null}
            {assessmentStateCaptions[verdict] ? (
              <p className="mt-2 font-mono text-[10px] tracking-[0.06em] text-copper">
                ⚠ {assessmentStateCaptions[verdict]}
              </p>
            ) : null}
            <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">
              <LinkedRecordText text={view.reasoning ?? ""} />
            </p>
          </div>
          <div className="bg-paper p-5">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-faint">
              diagnosticity — how much does it decide the thesis?
            </h2>
            <p className="mt-2.5 font-mono text-[13px] uppercase tracking-[0.14em] text-copper">
              {treatment.diagnosticity}
            </p>
            <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">
              <LinkedRecordText text={treatment.diagnosticitySummary} />
            </p>
          </div>
        </section>

        {/* Plates linked to this claim */}
        {plates.length > 0 ? (
          <section className="mt-10 grid sm:grid-cols-2 gap-5">
            {plates.map((img) => (
              <Plate key={img.id} image={img} />
            ))}
          </section>
        ) : null}

        {/* Evidence, symmetric */}
        <section className="mt-10">
          <h2 className="font-serif text-2xl tracking-tight">Evidence</h2>
          {evidence.length === 0 ? (
            <p className="mt-3 text-[14px] text-faint italic font-serif">
              No evidence records attached yet — that absence is information
              too.
            </p>
          ) : (
            <div className="mt-4 space-y-6">
              {(
                ["supports", "undermines", "qualifies", "context"] as const
              ).map((d) =>
                byDirection(d).length > 0 ? (
                  <div key={d}>
                    <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-faint mb-3">
                      {directionLabels[d]} ({byDirection(d).length})
                    </h3>
                    <div className="grid lg:grid-cols-2 gap-4">
                      {byDirection(d).map((e) => (
                        <EvidenceCard
                          key={e.id}
                          evidence={e}
                          source={sourceById.get(e.sourceId)!}
                        />
                      ))}
                    </div>
                  </div>
                ) : null,
              )}
            </div>
          )}
        </section>

        {/* Objection + what would change our mind */}
        <section className="mt-10 grid sm:grid-cols-2 gap-4">
          <div className="border border-line bg-paper-deep/50 p-5">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-terracotta">
              strongest unresolved objection
            </h2>
            <p className="mt-2.5 text-[14.5px] leading-relaxed text-ink-soft">
              <LinkedRecordText text={treatment.strongestObjection} />
            </p>
          </div>
          <div className="border border-line bg-paper-deep/50 p-5">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-verdigris">
              what would change our mind
            </h2>
            <ul className="mt-2.5 list-disc pl-4 space-y-1.5 text-[14.5px] leading-relaxed text-ink-soft">
              {treatment.whatWouldChangeOurMind.map((w, i) => (
                <li key={i}>
                  <LinkedRecordText text={w} />
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Relations */}
        <section className="mt-10 grid sm:grid-cols-3 gap-6">
          {relatedList("parent claims", claim.parentClaimIds)}
          {relatedList("depends on", claim.dependsOnClaimIds)}
          {relatedList(
            "child claims",
            children.map((c) => c.id),
          )}
        </section>

        {/* Research that would move this claim */}
        {research.length > 0 ? (
          <section className="mt-10">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-faint">
              research that would move this claim
            </h2>
            <ul className="mt-2.5 space-y-1.5">
              {research.map((r) => (
                <li key={r.id} className="text-[14px] text-ink-soft">
                  <Link
                    href={`/cases/${loaded.record.slug}/#research`}
                    className="hover:text-copper"
                  >
                    <span className="font-mono text-[10px] tracking-[0.12em] text-copper">
                      {r.id}
                    </span>{" "}
                    {r.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Assessment history (overlay records) */}
        {assessmentHistory.length > 0 ? (
          <section className="mt-10">
            <h2 className="font-serif text-2xl tracking-tight">
              Assessment history
            </h2>
            <p className="mt-1 text-[13px] text-faint">
              Append-only AI overlay records; the canon claim file is never
              mutated.
            </p>
            <div className="mt-4 space-y-3">
              {assessmentHistory.map(({ run, entry }) => (
                <div key={run.runId} className="border border-line bg-paper p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <AssessmentBadge state={entry!.verdict} />
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                      confidence: {entry!.confidence} · {run.model} · run{" "}
                      {run.runId} ·{" "}
                      {run.humanReviewed ? "human-reviewed" : "unreviewed draft"}
                    </span>
                  </div>
                  <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
                    <LinkedRecordText text={entry!.reasoning} />
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
