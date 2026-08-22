import type { Metadata } from "next";
import Link from "next/link";
import { CuratedResourceCard } from "@/src/components/CuratedResourceCard";
import { ResourceGroupSection } from "@/src/components/ResourceGroupSection";
import { loadAllCases } from "@/src/domain/load";
import { resourceGroups } from "@/src/domain/resources";

export const metadata: Metadata = { title: "Resources" };

export default function ResourcesPage() {
  const cases = loadAllCases();

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <h1 className="font-serif text-4xl tracking-tight">Resources</h1>
      <p className="mt-3 text-ink-soft max-w-2xl">
        The site as a reading guide: every source record behind every case,
        grouped for reading and linked out where a public copy exists. Labels
        are honest about verification, and critical literature is shelved
        with the same seriousness as supporting work.
      </p>

      <nav aria-label="Cases on this page" className="mt-6">
        <ul className="flex flex-wrap gap-x-6 gap-y-2">
          {cases.map((c) => (
            <li key={c.record.id}>
              <a
                href={`#case-${c.record.slug}`}
                className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft hover:text-copper"
              >
                {c.record.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-6 space-y-16">
        {cases.map((loaded) => {
          const groups = resourceGroups(loaded);
          return (
            <section
              key={loaded.record.id}
              id={`case-${loaded.record.slug}`}
              className="border-t border-line pt-8 scroll-mt-16"
              aria-labelledby={`case-heading-${loaded.record.slug}`}
            >
              <p className="font-mono text-[10px] tracking-[0.16em] text-copper">
                {loaded.record.id}
              </p>
              <h2
                id={`case-heading-${loaded.record.slug}`}
                className="font-serif text-3xl tracking-tight mt-1"
              >
                <Link
                  href={`/cases/${loaded.record.slug}/`}
                  className="hover:text-copper"
                >
                  {loaded.record.title}
                </Link>
              </h2>
              <p className="mt-1 font-serif italic text-ink-soft max-w-2xl">
                {loaded.record.subtitle}
              </p>
              <p className="mt-2">
                <Link
                  href={`/cases/${loaded.record.slug}/resources/`}
                  className="font-mono text-[11px] uppercase tracking-[0.14em] text-copper underline underline-offset-4"
                >
                  full reading guide →
                </Link>
              </p>

              {loaded.curatedResources.length > 0 ? (
                <ul className="mt-6 grid sm:grid-cols-2 gap-3">
                  {loaded.curatedResources.map((item) => (
                    <CuratedResourceCard key={item.url} item={item} />
                  ))}
                </ul>
              ) : null}

              <div className="mt-8 space-y-10">
                {groups.map((group) => (
                  <ResourceGroupSection
                    key={group.key}
                    group={group}
                    idPrefix={`resources-${loaded.record.slug}`}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
