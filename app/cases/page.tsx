import type { Metadata } from "next";
import { pageMeta } from "@/src/config/meta";
import { CaseGrid } from "@/src/components/CaseGrid";
import { loadAllCases } from "@/src/domain/load";

export const metadata: Metadata = pageMeta({
  title: "Cases",
  description: "Every case maps one contested hypothesis: an article to read, a claim ladder to audit, evidence with provenance, and the experiments that would settle it.",
  path: "/cases/",
});

export default function CasesPage() {
  const cases = loadAllCases();
  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <h1 className="font-serif text-4xl tracking-tight">Cases</h1>
      <p className="mt-3 text-ink-soft max-w-2xl">
        Each case maps one contested hypothesis: an overview you can read, a
        claim ladder you can audit, evidence with provenance, and the
        experiments that would settle it.
      </p>
      {cases.length === 0 ? (
        <div className="border border-line px-6 py-10 max-w-2xl mt-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-copper">
            no cases published yet
          </p>
          <p className="mt-3 text-[14.5px] leading-relaxed text-ink-soft">
            The first case dossiers are in preparation and will appear here
            when their claims, evidence, and sources meet the site&apos;s
            provenance standards.
          </p>
        </div>
      ) : null}
      <div className="mt-8">
        <CaseGrid cases={cases} />
      </div>
    </div>
  );
}
