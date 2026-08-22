import type { Metadata } from "next";
import Link from "next/link";
import { ClaimCard } from "@/src/components/ClaimCard";
import { ProvenanceBadge } from "@/src/components/ProvenanceBadge";
import { getCaseBySlug, liveClaims, loadAllCases } from "@/src/domain/load";

export function generateStaticParams() {
  return loadAllCases().map((c) => ({ slug: c.record.slug }));
}

export function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  return params.then(({ slug }) => ({
    title: `Claims · ${getCaseBySlug(slug).record.title}`,
  }));
}

export default async function ClaimsExplorerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const loaded = getCaseBySlug(slug);
  const claims = liveClaims(loaded);
  const tombstones = loaded.claims.filter((c) => c.reviewState === "rejected");

  const themes = Object.entries(loaded.record.themes).filter(([key]) =>
    claims.some((c) => c.theme === key),
  );
  const headliners = claims.filter((c) => c.importance === "headline");

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint">
        <Link href={`/cases/${slug}/`} className="text-copper hover:underline">
          {loaded.record.title}
        </Link>{" "}
        · claim explorer
      </p>
      <h1 className="font-serif text-4xl tracking-tight mt-3">Claims</h1>
      <p className="mt-3 text-ink-soft max-w-2xl">
        {claims.length} live claims, grouped by theme, headline claims first.
        Every claim shows its provenance — most of this case is AI-extracted
        and awaiting human review, and the interface says so.
      </p>

      <section className="mt-8">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-copper mb-3">
          headline claims
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {headliners.map((c) => (
            <ClaimCard key={c.id} claim={c} />
          ))}
        </div>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-faint">
          by theme
        </h2>
        {themes.map(([key, label]) => {
          const themeClaims = claims.filter((c) => c.theme === key);
          return (
            <details
              key={key}
              className="group border border-line bg-paper"
              open={themeClaims.some((c) => c.importance === "headline")}
            >
              <summary className="cursor-pointer list-none p-4 flex items-baseline justify-between gap-3">
                <span className="font-serif text-xl">{label}</span>
                <span className="font-mono text-[11px] tracking-[0.14em] text-faint">
                  {themeClaims.length}{" "}
                  <span className="inline-block transition-transform group-open:rotate-90">
                    ▸
                  </span>
                </span>
              </summary>
              <div className="px-4 pb-4 grid sm:grid-cols-2 gap-3">
                {themeClaims.map((c) => (
                  <ClaimCard key={c.id} claim={c} />
                ))}
              </div>
            </details>
          );
        })}
      </section>

      {tombstones.length > 0 ? (
        <section className="mt-10">
          <details className="border border-line bg-paper-deep/40">
            <summary className="cursor-pointer list-none p-4">
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint">
                rejected claims ({tombstones.length}) — kept as tombstones so
                extraction re-runs don&apos;t re-propose them
              </span>
            </summary>
            <div className="px-4 pb-4 space-y-3">
              {tombstones.map((c) => (
                <div key={c.id} className="border border-line p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] tracking-[0.14em] text-faint">
                      {c.id}
                    </span>
                    <ProvenanceBadge state={c.reviewState} />
                  </div>
                  <p className="mt-2 text-[14px] text-faint line-through decoration-faint/50">
                    {c.statement}
                  </p>
                  <p className="mt-2 text-[13px] text-ink-soft">
                    {c.rejectionReason}
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
