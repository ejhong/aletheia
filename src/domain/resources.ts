import type {
  EvidenceDirection,
  LoadedCase,
  Source,
} from "./schema";

/**
 * Reading-guide derivation: turn a case's source records into grouped,
 * link-outable resource entries. Pure functions over loaded data — nothing
 * here invents a resource; every entry is a Source that already exists in
 * sources.yaml, carried with its honest verification label.
 */

/** Extract a DOI from free text (identifier fields, URLs). */
export function extractDoi(text: string | undefined): string | null {
  if (!text) return null;
  const m = text.match(/\b10\.\d{4,9}\/[^\s"'<>]+/);
  if (!m) return null;
  // Identifiers often end the sentence with the DOI; strip trailing
  // punctuation that is not part of the DOI itself.
  return m[0].replace(/[.,;)\]]+$/, "");
}

/** Extract a modern arXiv id (e.g. 2408.01234, optionally versioned). */
export function extractArxivId(text: string | undefined): string | null {
  if (!text) return null;
  const m = text.match(/\barxiv(?:\.org)?[:\s/]*(?:abs\/|pdf\/)?(\d{4}\.\d{4,5})(?:v\d+)?/i);
  return m ? m[1] : null;
}

export interface ResourceEntry {
  source: Source;
  /** Best outbound link: explicit URL first, else a resolvable DOI. */
  href: string | null;
  doi: string | null;
  /** How this source is used as evidence in the case. */
  directionCounts: Partial<Record<EvidenceDirection, number>>;
  evidenceCount: number;
}

export type ResourceGroupKey =
  | "literature"
  | "critiques"
  | "books"
  | "datasets"
  | "web";

export interface ResourceGroup {
  key: ResourceGroupKey;
  label: string;
  description: string;
  entries: ResourceEntry[];
}

const groupMeta: Record<ResourceGroupKey, { label: string; description: string }> = {
  literature: {
    label: "Primary literature",
    description:
      "Papers, preprints, and reports the case draws on — the records to read before trusting any summary, ours included.",
  },
  critiques: {
    label: "Critiques & counter-analyses",
    description:
      "Sources whose evidence in this case predominantly undermines the featured hypothesis. Read these with the same seriousness as the supporting work.",
  },
  books: {
    label: "Books & primary texts",
    description: "Book-length treatments, including proponent primary texts.",
  },
  datasets: {
    label: "Datasets, archives & records",
    description: "Datasets, artifact records, and archival material.",
  },
  web: {
    label: "Web & commentary",
    description:
      "Webpages, press, and commentary — useful for orientation, weak as evidence.",
  },
};

const groupOrder: ResourceGroupKey[] = [
  "literature",
  "critiques",
  "books",
  "datasets",
  "web",
];

function typeGroup(source: Source): ResourceGroupKey {
  switch (source.sourceType) {
    case "paper":
    case "preprint":
    case "report":
      return "literature";
    case "book":
      return "books";
    case "dataset":
    case "artifact_record":
    case "archive":
      return "datasets";
    case "webpage":
    case "other":
      return "web";
  }
}

function toEntry(source: Source, loaded: LoadedCase): ResourceEntry {
  const connected = loaded.evidence.filter((e) => e.sourceId === source.id);
  const directionCounts: Partial<Record<EvidenceDirection, number>> = {};
  for (const e of connected) {
    directionCounts[e.direction] = (directionCounts[e.direction] ?? 0) + 1;
  }
  const doi = extractDoi(source.identifier) ?? extractDoi(source.url);
  return {
    source,
    doi,
    href: source.url ?? (doi ? `https://doi.org/${doi}` : null),
    directionCounts,
    evidenceCount: connected.length,
  };
}

/**
 * Is this source predominantly critical of the featured hypothesis, judged
 * by the direction of the evidence records drawn from it?
 */
function isCritique(entry: ResourceEntry): boolean {
  return (
    (entry.directionCounts.undermines ?? 0) >
    (entry.directionCounts.supports ?? 0)
  );
}

/**
 * Group every source of a case into ordered reading-guide sections. Each
 * source appears exactly once: critique-role sources first go to the
 * critiques group, the rest are grouped by source type. Empty groups are
 * omitted. Entries are sorted newest-first (undated entries last).
 */
export function resourceGroups(loaded: LoadedCase): ResourceGroup[] {
  const buckets = new Map<ResourceGroupKey, ResourceEntry[]>();
  for (const source of loaded.sources) {
    const entry = toEntry(source, loaded);
    const key = isCritique(entry) ? "critiques" : typeGroup(source);
    const bucket = buckets.get(key) ?? [];
    bucket.push(entry);
    buckets.set(key, bucket);
  }
  const byYearDesc = (a: ResourceEntry, b: ResourceEntry) =>
    (b.source.year ?? "").localeCompare(a.source.year ?? "");
  return groupOrder
    .filter((key) => (buckets.get(key)?.length ?? 0) > 0)
    .map((key) => ({
      key,
      ...groupMeta[key],
      entries: buckets.get(key)!.sort(byYearDesc),
    }));
}
