import Link from "next/link";
import { Fragment } from "react";
import { loadAllCases } from "@/src/domain/load";
import {
  buildRecordLinkRegistry,
  splitRecordRefs,
  type RecordLinkTarget,
} from "@/src/domain/recordLinks";

let defaultRegistry: Map<string, RecordLinkTarget> | undefined;

function recordRegistry(): Map<string, RecordLinkTarget> {
  defaultRegistry ??= buildRecordLinkRegistry(loadAllCases());
  return defaultRegistry;
}

const linkClass =
  "font-mono text-[0.92em] tracking-[0.04em] text-copper underline decoration-copper/40 underline-offset-2 hover:decoration-copper";

/**
 * The quiet register: in a judgment's prose an id is a footnote, not the
 * sentence. It stays a link to its record and stops shouting.
 */
const quietClass =
  "font-mono text-[0.8em] tracking-[0.02em] text-faint underline decoration-transparent underline-offset-2 hover:text-copper hover:decoration-copper/50";

/**
 * Renders prose that may cite Aletheia record ids as links to the matching
 * case, claim, source, evidence anchor, or research anchor.
 */
export function LinkedRecordText({
  text,
  registry,
  className,
  quiet = false,
}: {
  text: string;
  registry?: Map<string, RecordLinkTarget>;
  className?: string;
  /** Render record ids small and faint — for long prose where they are references, not content. */
  quiet?: boolean;
}) {
  const map = registry ?? recordRegistry();
  const segments = splitRecordRefs(text);

  return (
    <span className={className}>
      {segments.map((segment, i) => {
        if (segment.kind === "text") {
          return <Fragment key={i}>{segment.value}</Fragment>;
        }
        const target = map.get(segment.id);
        if (!target) {
          return <Fragment key={i}>{segment.id}</Fragment>;
        }
        return (
          <Link key={i} href={target.href} className={quiet ? quietClass : linkClass}>
            {segment.id}
          </Link>
        );
      })}
    </span>
  );
}
