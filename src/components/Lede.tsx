import type { ReactNode } from "react";
import { LinkedRecordText } from "./LinkedRecordText";
import { lede } from "@/src/domain/text";

/**
 * A long passage, opened by its first sentences with the rest one gesture
 * away — a disclosure, no script. Nothing is cut: the whole text is in the
 * page. Used where a judgment's prose ran to several hundred words in a
 * place meant to be read at a glance (the dossier header, the judgment).
 */
export function Lede({
  text,
  max = 320,
  more = "read the rest",
  className = "",
  quiet = false,
  dark = false,
  children,
}: {
  text: string;
  /** About how many characters open the passage; the first sentence is always whole. */
  max?: number;
  /** The disclosure's label, in lower case. */
  more?: string;
  /** Classes for the prose paragraphs. */
  className?: string;
  /** Record ids in the prose are rendered quietly (see LinkedRecordText). */
  quiet?: boolean;
  /** On the dossier register. */
  dark?: boolean;
  /** Further material that belongs with the rest of the passage, shown inside the disclosure after it. */
  children?: ReactNode;
}) {
  const { lede: first, rest } = lede(text, max);
  return (
    <div>
      <p className={className}>
        <LinkedRecordText text={first} quiet={quiet} />
      </p>
      {rest || children ? (
        <details className="group mt-2">
          <summary
            className={`inline-block cursor-pointer list-none font-mono text-[10px] uppercase tracking-[0.14em] [&::-webkit-details-marker]:hidden ${
              dark ? "text-copper hover:text-dossier-text" : "text-copper hover:text-ink"
            }`}
          >
            <span className="group-open:hidden">▸ {more}</span>
            <span className="hidden group-open:inline">▾ less</span>
          </summary>
          {rest ? (
            <p className={`mt-2 whitespace-pre-line ${className}`}>
              <LinkedRecordText text={rest} quiet={quiet} />
            </p>
          ) : null}
          {children}
        </details>
      ) : null}
    </div>
  );
}
