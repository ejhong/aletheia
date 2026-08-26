import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CuratedResourceCard } from "@/src/components/CuratedResourceCard";
import { ResourceGroupSection } from "@/src/components/ResourceGroupSection";
import { loadAllCases } from "@/src/domain/load";
import { paramsOrPlaceholder } from "@/src/domain/staticExport";
import { resourceGroups } from "@/src/domain/resources";

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
      title: loaded ? `Resources · ${loaded.record.title}` : "Not found",
    };
  });
}

export default async function CaseResourcesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const found = loadAllCases().find((c) => c.record.slug === slug);
  if (!found) notFound();
  const loaded = found;
  const groups = resourceGroups(loaded);
  const curated = loaded.curatedResources;

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint">
        <Link href={`/cases/${slug}/`} className="text-copper hover:underline">
          {loaded.record.title}
        </Link>{" "}
        · reading guide
      </p>
      <h1 className="font-serif text-4xl tracking-tight mt-3">Resources</h1>
      <p className="mt-3 text-ink-soft max-w-2xl">
        Everything below is derived from this case&apos;s own source records —
        {" "}{loaded.sources.length} of them — plus a small curated shelf of
        learning materials. Verification labels say exactly how much checking
        stands behind each record; nothing here is a recommendation to
        believe, only to read.
      </p>

      {curated.length > 0 ? (
        <section className="mt-10" aria-labelledby="resources-start-here">
          <h2
            id="resources-start-here"
            className="font-serif text-2xl tracking-tight"
          >
            Start here
          </h2>
          <p className="mt-1 text-[13.5px] text-ink-soft max-w-2xl">
            Hand-picked orientation material — not evidence, and not part of
            the case record.
          </p>
          <ul className="mt-4 grid sm:grid-cols-2 gap-3">
            {curated.map((item) => (
              <CuratedResourceCard key={item.url} item={item} />
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-10 space-y-10">
        {groups.map((group) => (
          <ResourceGroupSection key={group.key} group={group} />
        ))}
      </div>

      <p className="mt-12 border-t border-line pt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-faint max-w-2xl">
        grouping is derived: a source lands under “critiques” when its
        evidence records in this case predominantly undermine the featured
        hypothesis · every entry links to its full provenance record
      </p>
    </div>
  );
}
