import Link from "next/link";
import { VerificationBadge } from "./VerificationBadge";
import type { ResourceGroup } from "@/src/domain/resources";
import { directionLabels, type EvidenceDirection } from "@/src/domain/schema";

const directionClasses: Record<EvidenceDirection, string> = {
  supports: "text-verdigris",
  undermines: "text-terracotta",
  qualifies: "text-ochre",
  context: "text-slate-mist",
};

const directionGlyphs: Record<EvidenceDirection, string> = {
  supports: "▲",
  undermines: "▼",
  qualifies: "◆",
  context: "○",
};

const directionOrder: EvidenceDirection[] = [
  "supports",
  "undermines",
  "qualifies",
  "context",
];

function hostname(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return "link";
  }
}

/**
 * One derived reading-guide group: source records of a case, grouped and
 * presented with their honest verification labels and their evidential role
 * in the case (how many records support / undermine / qualify).
 */
export function ResourceGroupSection({
  group,
  idPrefix = "resources",
}: {
  group: ResourceGroup;
  /** Keeps heading ids unique when several cases render on one page. */
  idPrefix?: string;
}) {
  return (
    <section aria-labelledby={`${idPrefix}-${group.key}`}>
      <h3
        id={`${idPrefix}-${group.key}`}
        className="font-serif text-2xl tracking-tight"
      >
        {group.label}
        <span className="ml-3 font-mono text-[11px] tracking-[0.14em] text-faint align-middle">
          {group.entries.length}
        </span>
      </h3>
      <p className="mt-1 text-[13.5px] text-ink-soft max-w-2xl">
        {group.description}
      </p>
      <ul className="mt-4 space-y-3">
        {group.entries.map(({ source, href, directionCounts }) => (
          <li key={source.id} className="border border-line bg-paper p-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-[10px] tracking-[0.14em] text-faint">
                {source.id}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
                {source.sourceType}
                {source.year ? ` · ${source.year}` : ""}
              </span>
            </div>
            <h4 className="font-serif text-lg leading-snug mt-1.5">
              <Link
                href={`/sources/${source.id}/`}
                className="hover:text-copper"
              >
                {source.title}
              </Link>
            </h4>
            {source.authors.length > 0 || source.organization ? (
              <p className="mt-1 text-[13.5px] text-ink-soft">
                {[...source.authors, source.organization]
                  .filter(Boolean)
                  .join("; ")}
              </p>
            ) : null}
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
              <VerificationBadge state={source.verification} />
              {directionOrder
                .filter((d) => (directionCounts[d] ?? 0) > 0)
                .map((d) => (
                  <span
                    key={d}
                    className={`inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] ${directionClasses[d]}`}
                    title={`${directionCounts[d]} evidence record(s) with direction "${directionLabels[d]}"`}
                  >
                    <span aria-hidden>{directionGlyphs[d]}</span>
                    {directionLabels[d]} ×{directionCounts[d]}
                  </span>
                ))}
              {href ? (
                <a
                  href={href}
                  className="font-mono text-[11px] tracking-[0.12em] text-copper underline underline-offset-2"
                  rel="noopener"
                >
                  {hostname(href)} ↗
                </a>
              ) : (
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                  no public link on record
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
