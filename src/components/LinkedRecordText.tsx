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
 * Renders prose that may cite Aletheia record ids as links to the matching
 * case, claim, source, evidence anchor, or research anchor.
 */
export function LinkedRecordText({
  text,
  registry,
  className,
}: {
  text: string;
  registry?: Map<string, RecordLinkTarget>;
  className?: string;
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
          <Link key={i} href={target.href} className={linkClass}>
            {segment.id}
          </Link>
        );
      })}
    </span>
  );
}
