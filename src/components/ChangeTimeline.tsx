import type { ChangeLogEntry } from "@/src/domain/schema";

export function ChangeTimeline({ entries }: { entries: ChangeLogEntry[] }) {
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <ol className="relative border-l border-line pl-6 space-y-7">
      {sorted.map((entry, i) => (
        <li key={i} className="relative">
          <span
            aria-hidden
            className="absolute -left-[29px] top-1.5 size-2.5 rounded-full border border-copper bg-paper"
          />
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <time className="font-mono text-[11px] tracking-[0.14em] text-copper">
              {entry.date}
            </time>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
              {entry.actor}
              {entry.aiAssisted ? " · AI-assisted" : ""}
            </span>
          </div>
          <p className="mt-1.5 text-[14px] leading-relaxed text-ink">
            {entry.change}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-faint italic font-serif">
            Why: {entry.reason}
          </p>
        </li>
      ))}
    </ol>
  );
}
