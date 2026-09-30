import type { Metadata } from "next";
import { pageMeta } from "@/src/config/meta";
import Link from "next/link";
import { GateRow } from "@/src/components/GateRow";
import { voteSummary } from "@/src/domain/gate";
import { loadArbiterRecords } from "@/src/domain/governance";

export const metadata: Metadata = pageMeta({
  title: "The gate · every verdict",
  description: "Every change the constitutional panel has judged: the verdict, each seat's vote, and its reasoning in full.",
  path: "/operations/gate/",
});

/**
 * Every verdict the panel has given on a change, newest first, one line
 * each; a verdict's page has every seat's reasoning in full. The operations
 * page used to print all of them whole — two hundred and twenty verdicts,
 * five megabytes — and now shows the latest and links here.
 */
export default function GateArchivePage() {
  const verdicts = loadArbiterRecords();
  return (
    <div className="mx-auto max-w-6xl px-5 py-14">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
        <Link href="/operations/#gate" className="text-copper hover:underline">operations</Link> · the gate
      </p>
      <h1 className="font-serif text-4xl tracking-tight mt-3">Every verdict</h1>
      <p className="mt-3 text-ink-soft max-w-2xl">
        {verdicts.length} changes judged by the constitutional panel before they could merge, newest
        first. Open one for every seat&apos;s vote, the rules it cited, and its reasoning in full,
        verbatim from the record.
      </p>
      <ul className="mt-8 border border-line bg-paper">
        {verdicts.map((r) => (
          <GateRow key={r.pr} record={r} summary={voteSummary(r)} />
        ))}
      </ul>
    </div>
  );
}
