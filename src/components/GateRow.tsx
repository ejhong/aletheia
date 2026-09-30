import Link from "next/link";
import type { ArbiterRecord } from "@/src/domain/schema";

/** One verdict of the panel as a line: the outcome, the change, how the seats voted; the whole verdict is a page away. */
export function GateRow({ record, summary }: { record: ArbiterRecord; summary: string }) {
  const parked = record.verdict === "park";
  return (
    <li className="border-b border-line/60 last:border-b-0">
      <Link href={`/operations/gate/${record.pr}/`} className="group flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 hover:bg-paper-deep/40">
        <span className="font-mono text-[10.5px] tracking-[0.06em] text-faint w-[6.5rem] shrink-0">{record.outcomeAt}</span>
        <span className={`w-[4.25rem] shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] ${parked ? "text-terracotta" : "text-verdigris"}`}>
          {parked ? "parked" : "passed"}
        </span>
        <span className="min-w-0 basis-72 grow text-[13.5px] leading-snug text-ink-soft group-hover:text-ink">
          <span className="font-mono text-[11px] text-faint mr-2">#{record.pr}</span>
          {record.title}
        </span>
        <span className="font-mono text-[10.5px] tracking-[0.04em] text-faint">{summary}</span>
      </Link>
    </li>
  );
}
