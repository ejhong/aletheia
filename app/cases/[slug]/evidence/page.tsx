import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DirectionTag } from "@/src/components/DirectionTag";
import { EvidenceCard } from "@/src/components/EvidenceCard";
import { LinkedRecordText } from "@/src/components/LinkedRecordText";
import { ProvenanceBadge } from "@/src/components/ProvenanceBadge";
import { groupEvidenceByDirection } from "@/src/domain/evidence";
import { evidenceTombstones, liveEvidence, loadAllCases } from "@/src/domain/load";
import { paramsOrPlaceholder } from "@/src/domain/staticExport";
import { directionLabels } from "@/src/domain/schema";

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
    return {
      title: loaded ? `Evidence · ${loaded.record.title}` : "Not found",
    };
  });
}

const sectionNote: Record<string, string> = {
  supports: "Records that favor a rung of the featured hypothesis.",
  undermines: "Records that count against a rung — shown with the same structure and seriousness.",
  qualifies: "Records that narrow, complicate, or bound what another record can carry.",
  context: "Background that informs the case without pushing either way.",
};

/**
 * The full evidence ledger for one case: every record, grouped by
 * direction in canonical order, strongest first. The case page shows only
 * highlights; this page is the complete, symmetric accounting.
 */
export default async function EvidenceLedgerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const found = loadAllCases().find((c) => c.record.slug === slug);
  if (!found) notFound();
  const loaded = found;
  const groups = groupEvidenceByDirection(liveEvidence(loaded));
  const tombstones = evidenceTombstones(loaded);
  const sourceById = new Map(loaded.sources.map((s) => [s.id, s]));
  /** The refusal, as the record carries it: the last limitation that says so, else the last limitation. */
  const refusal = (limitations: string[]) => [...limitations].reverse().find((l) => /^Refused\b/.test(l)) ?? limitations.at(-1) ?? "";

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint">
        <Link href={`/cases/${slug}/`} className="text-copper hover:underline">
          {loaded.record.title}
        </Link>{" "}
        · evidence ledger
      </p>
      <h1 className="font-serif text-4xl tracking-tight mt-3">Evidence</h1>
      <p className="mt-3 text-ink-soft max-w-2xl">
        All {liveEvidence(loaded).length} evidence records in this case&apos;s
        ledger. Every record carries an explicit direction, keeps what the
        source states separate from what we infer, and links its source and
        the claims it bears on. Supporting and undermining evidence get the
        same structure and the same seriousness.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {groups.map((g) => (
          <a
            key={g.direction}
            href={`#${g.direction}`}
            className="border border-line bg-paper px-3 py-1.5 hover:border-copper/60"
          >
            <DirectionTag direction={g.direction} />
            <span className="ml-2 font-mono text-[11px] text-faint">
              {g.records.length}
            </span>
          </a>
        ))}
      </div>

      {groups.map((g) => (
        <section
          key={g.direction}
          id={g.direction}
          className="mt-12 scroll-mt-24"
        >
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="font-serif text-2xl tracking-tight">
              {directionLabels[g.direction]}
            </h2>
            <span className="font-mono text-[11px] tracking-[0.14em] text-faint">
              {g.records.length} record{g.records.length === 1 ? "" : "s"} ·
              strongest first
            </span>
          </div>
          <p className="mt-1.5 text-[13.5px] text-ink-soft max-w-2xl">
            {sectionNote[g.direction]}
          </p>
          <div className="grid lg:grid-cols-2 gap-4 mt-5">
            {g.records.map((e) => (
              <EvidenceCard
                key={e.id}
                evidence={e}
                source={sourceById.get(e.sourceId)!}
                showClaims
              />
            ))}
          </div>
        </section>
      ))}

      {tombstones.length > 0 ? (
        <section className="mt-12" id="refused">
          <details className="border border-line bg-paper-deep/40">
            <summary className="cursor-pointer list-none p-4">
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint">
                refused evidence ({tombstones.length}) — kept as tombstones with
                the reason; they carry no weight and are counted nowhere
              </span>
            </summary>
            <div className="px-4 pb-4 space-y-3">
              {tombstones.map((e) => (
                <div
                  key={e.id}
                  id={`evidence-${e.id}`}
                  className="scroll-mt-28 border border-line p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] tracking-[0.14em] text-faint">
                      {e.id}
                    </span>
                    <ProvenanceBadge state={e.reviewState} />
                    <span className="font-mono text-[10px] tracking-[0.14em] text-faint">
                      was {e.direction} → {e.claimIds.join(", ")}
                    </span>
                  </div>
                  <p className="mt-2 text-[14px] text-faint line-through decoration-faint/50">
                    {e.title}
                  </p>
                  <p className="mt-1 text-[13px] text-faint">
                    <LinkedRecordText text={e.sourceStatement} />
                  </p>
                  <p className="mt-2 text-[13px] text-ink-soft">
                    <LinkedRecordText text={refusal(e.limitations)} />
                  </p>
                </div>
              ))}
            </div>
          </details>
        </section>
      ) : null}
    </div>
  );
}
