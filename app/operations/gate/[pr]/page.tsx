import type { Metadata } from "next";
import { pageMeta } from "@/src/config/meta";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArbiterVerdictCard } from "@/src/components/ArbiterVerdictCard";
import { loadArbiterRecords } from "@/src/domain/governance";
import { paramsOrPlaceholder } from "@/src/domain/staticExport";
import { clip } from "@/src/domain/text";

export function generateStaticParams() {
  return paramsOrPlaceholder(
    "pr",
    loadArbiterRecords().map((r) => String(r.pr)),
  );
}

export function generateMetadata({
  params,
}: {
  params: Promise<{ pr: string }>;
}): Promise<Metadata> {
  return params.then(({ pr }) => {
    const record = loadArbiterRecords().find((r) => String(r.pr) === pr);
    return record
      ? pageMeta({ title: `The gate · PR #${record.pr}`, description: clip(`The panel's verdict on “${record.title}”: ${record.reason}`, 300), path: `/operations/gate/${record.pr}/` })
      : { title: "Not found" };
  });
}

/** One verdict of the constitutional panel, whole: every seat's vote and its reasoning, open to read. */
export default async function GateVerdictPage({
  params,
}: {
  params: Promise<{ pr: string }>;
}) {
  const { pr } = await params;
  const records = loadArbiterRecords();
  const i = records.findIndex((r) => String(r.pr) === pr);
  if (i < 0) notFound();
  const newer = records[i - 1];
  const older = records[i + 1];
  const step = "font-mono text-[11px] uppercase tracking-[0.14em] text-copper hover:underline underline-offset-4";
  return (
    <div className="mx-auto max-w-4xl px-5 py-14">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
        <Link href="/operations/#gate" className="text-copper hover:underline">operations</Link> ·{" "}
        <Link href="/operations/gate/" className="text-copper hover:underline">the gate</Link> · PR #{records[i].pr}
      </p>
      <div className="mt-6">
        <ArbiterVerdictCard record={records[i]} open />
      </div>
      <p className="mt-6 flex flex-wrap justify-between gap-4">
        {older ? <Link href={`/operations/gate/${older.pr}/`} className={step}>← PR #{older.pr}</Link> : <span />}
        {newer ? <Link href={`/operations/gate/${newer.pr}/`} className={step}>PR #{newer.pr} →</Link> : <span />}
      </p>
    </div>
  );
}
