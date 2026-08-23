import type { LoadedCase } from "./schema";

export type RecordLinkTarget = {
  kind: "case" | "claim" | "source" | "evidence" | "research";
  href: string;
};

export type RecordRefSegment =
  | { kind: "text"; value: string }
  | { kind: "record"; id: string };

/** Matches Aletheia record ids cited in prose (order: longest prefixes first). */
const RECORD_REF =
  /\b(SRC-[A-Z0-9-]+|[A-Z]+-C\d{3}|[A-Z]+-E\d{3}|[A-Z]+-R\d{3}|[A-Z]+-\d{3})\b/g;

/** Split prose into plain text and record-id tokens for linkification. */
export function splitRecordRefs(text: string): RecordRefSegment[] {
  const segments: RecordRefSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(RECORD_REF)) {
    const index = match.index ?? 0;
    if (index > last) {
      segments.push({ kind: "text", value: text.slice(last, index) });
    }
    segments.push({ kind: "record", id: match[1] });
    last = index + match[0].length;
  }
  if (last < text.length) {
    segments.push({ kind: "text", value: text.slice(last) });
  }
  return segments.length > 0 ? segments : [{ kind: "text", value: text }];
}

/** Map record ids to routes the static site actually serves. */
export function buildRecordLinkRegistry(
  cases: LoadedCase[],
): Map<string, RecordLinkTarget> {
  const registry = new Map<string, RecordLinkTarget>();

  for (const loaded of cases) {
    const slug = loaded.record.slug;
    registry.set(loaded.record.id, {
      kind: "case",
      href: `/cases/${slug}/`,
    });

    for (const claim of loaded.claims) {
      if (claim.reviewState === "rejected") continue;
      registry.set(claim.id, { kind: "claim", href: `/claims/${claim.id}/` });
    }
    for (const source of loaded.sources) {
      registry.set(source.id, {
        kind: "source",
        href: `/sources/${source.id}/`,
      });
    }
    for (const evidence of loaded.evidence) {
      registry.set(evidence.id, {
        kind: "evidence",
        href: `/cases/${slug}/#evidence-${evidence.id}`,
      });
    }
    for (const research of loaded.research) {
      registry.set(research.id, {
        kind: "research",
        href: `/cases/${slug}/#research-${research.id}`,
      });
    }
  }

  return registry;
}
