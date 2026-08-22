import type { Metadata } from "next";
import Link from "next/link";
import { EvidenceCard } from "@/src/components/EvidenceCard";
import { VerificationBadge } from "@/src/components/VerificationBadge";
import { loadAllCases } from "@/src/domain/load";
import type { LoadedCase, Source } from "@/src/domain/schema";

function allSources(): { source: Source; loaded: LoadedCase }[] {
  return loadAllCases().flatMap((loaded) =>
    loaded.sources.map((source) => ({ source, loaded })),
  );
}

export function generateStaticParams() {
  return allSources().map(({ source }) => ({ id: source.id }));
}

export function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  return params.then(({ id }) => ({ title: `Source ${id}` }));
}

export default async function SourcePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const entry = allSources().find(({ source }) => source.id === id);
  if (!entry) throw new Error(`unknown source ${id}`);
  const { source, loaded } = entry;
  const connected = loaded.evidence.filter((e) => e.sourceId === id);

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint">
        <Link
          href={`/cases/${loaded.record.slug}/`}
          className="text-copper hover:underline"
        >
          {loaded.record.title}
        </Link>{" "}
        · source record · {source.sourceType}
      </p>
      <h1 className="font-serif text-3xl tracking-tight mt-3 max-w-3xl leading-snug">
        {source.title}
      </h1>
      <p className="mt-2 text-ink-soft">
        {[...source.authors, source.organization].filter(Boolean).join("; ")}
        {source.year ? ` · ${source.year}` : ""}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <VerificationBadge state={source.verification} />
        <span className="font-mono text-[10px] tracking-[0.14em] text-faint">
          {source.id}
        </span>
      </div>

      <dl className="mt-6 space-y-4 max-w-3xl">
        {source.identifier ? (
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
              identifier / locator
            </dt>
            <dd className="mt-0.5 text-[14px] text-ink-soft">
              {source.identifier}
            </dd>
          </div>
        ) : null}
        {source.url ? (
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
              url
            </dt>
            <dd className="mt-0.5 text-[14px]">
              <a
                href={source.url}
                className="text-copper underline underline-offset-2 break-all"
              >
                {source.url}
              </a>
            </dd>
          </div>
        ) : null}
        {source.verificationNote ? (
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
              verification note
            </dt>
            <dd className="mt-0.5 text-[14px] text-ink-soft">
              {source.verificationNote}
            </dd>
          </div>
        ) : null}
        {source.reliabilityNotes.length > 0 ? (
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
              reliability notes
            </dt>
            <dd className="mt-0.5">
              <ul className="list-disc pl-4 space-y-1 text-[14px] text-ink-soft">
                {source.reliabilityNotes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
      </dl>

      <section className="mt-10">
        <h2 className="font-serif text-2xl tracking-tight">
          Evidence drawn from this source
        </h2>
        <div className="grid lg:grid-cols-2 gap-4 mt-4">
          {connected.map((e) => (
            <EvidenceCard key={e.id} evidence={e} source={source} showClaims />
          ))}
        </div>
      </section>
    </div>
  );
}
