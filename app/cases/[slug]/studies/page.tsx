import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadAllCases } from "@/src/domain/load";
import { isPendingStudy } from "@/src/domain/studies";
import { paramsOrPlaceholder } from "@/src/domain/staticExport";

/**
 * The case's study shelf: every pre-registered comparison the case has
 * run or committed to run, including pending freezes and superseded
 * tables. Listing superseded studies is deliberate — the correction
 * trail is part of the record, not clutter to hide.
 */

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
      title: loaded ? `Studies · ${loaded.record.title}` : "Not found",
    };
  });
}

const label = "font-mono text-[11px] uppercase tracking-[0.16em] text-faint";

export default async function CaseStudiesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const found = loadAllCases().find((c) => c.record.slug === slug);
  if (!found) notFound();
  const loaded = found;
  const supersededIds = new Set(
    loaded.studies.flatMap((s) => (s.supersedes ? [s.supersedes] : [])),
  );

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <p className={label}>
        <Link href={`/cases/${slug}/`} className="text-copper hover:underline">
          {loaded.record.title}
        </Link>{" "}
        · studies
      </p>
      <h1 className="font-serif text-4xl tracking-tight mt-3">Studies</h1>
      <p className="mt-3 text-ink-soft max-w-2xl">
        Pre-registered comparisons: criteria are frozen and published before
        any data is collected, so the table cannot be tuned to fit an answer.
        A pending study is a promise on the record; a superseded one is a
        correction that stayed visible.
      </p>

      {loaded.studies.length === 0 ? (
        <p className="mt-10 border border-line bg-paper px-5 py-4 max-w-2xl text-[13.5px] text-ink-soft">
          No studies yet. When this case freezes its first study protocol,
          it appears here from the freeze onward.
        </p>
      ) : (
        <ul className="mt-10 space-y-6">
          {loaded.studies.map((study) => {
            const pending = isPendingStudy(study);
            const superseded = supersededIds.has(study.id);
            return (
              <li key={study.id} className="border border-line bg-paper p-5">
                <p className={label}>
                  {study.id}
                  <span className="ml-3 text-copper">
                    {superseded
                      ? "superseded"
                      : pending
                        ? `pre-registered — collection pending`
                        : `${study.rows.length} rows collected`}
                  </span>
                  <span className="ml-3">
                    frozen {study.criteria.frozenOn} · hash{" "}
                    {study.criteria.criteriaHash}
                  </span>
                </p>
                <h2 className="mt-2 font-serif text-2xl tracking-tight">
                  <Link
                    href={`/cases/${slug}/studies/${study.id.toLowerCase()}/`}
                    className="hover:text-copper"
                  >
                    {study.title}
                  </Link>
                </h2>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-soft max-w-3xl">
                  {study.question}
                </p>
                {study.supersedes ? (
                  <p className="mt-2 font-mono text-[11px] tracking-[0.1em] text-faint">
                    supersedes {study.supersedes}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
