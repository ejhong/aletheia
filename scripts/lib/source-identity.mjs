/** Source identity for intake. Identity is not a judgment about an observation. */

/** Strip punctuation around a citation without cutting balanced DOI suffixes. */
function citationEnd(value) {
  let out = value.replace(/[.,;]+$/, "");
  for (const [open, close] of [
    ["(", ")"],
    ["[", "]"],
  ]) {
    while (
      out.endsWith(close) &&
      out.split(close).length > out.split(open).length
    )
      out = out.slice(0, -1).replace(/[.,;]+$/, "");
  }
  return out;
}

export function extractDoi(value) {
  if (!value) return null;
  const text = String(value);
  // Decode URL escaping only for a DOI resolver URL, not arbitrary source text.
  let candidate = text;
  if (/^https?:\/\/(?:dx\.)?doi\.org\//i.test(text)) {
    try {
      candidate = decodeURIComponent(new URL(text).pathname.slice(1));
    } catch {
      return null;
    }
  }
  const match = candidate.match(/\b10\.\d{4,9}\/[^\s"'<>]+/i);
  return match ? citationEnd(match[0]).toLowerCase() : null;
}

export function extractArxivId(value) {
  if (!value) return null;
  const match = String(value).match(
    /(?:\barxiv(?:\.org)?[:\s/]*(?:abs\/|pdf\/)?|^)(\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?(?:\.pdf)?(?=$|[\s?#)\],;])/i,
  );
  return match?.[1]?.toLowerCase() ?? null;
}

/** Keep path case, query parameters, and fragments: they may identify different material. */
export function normalizeUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function extractIdentifiers(source) {
  const fields = [source.doi, source.arxivId, source.identifier, source.url];
  return {
    doi: fields.map(extractDoi).find(Boolean) ?? null,
    arxiv: fields.map(extractArxivId).find(Boolean) ?? null,
    urlNorm: normalizeUrl(source.url),
  };
}

/** Match the supplied DOI, arXiv ID, and URL; a preprint and DOI can share a record. */
export function sourceKeys(source) {
  const { doi, arxiv, urlNorm } = extractIdentifiers(source);
  return [
    doi && `doi:${doi}`,
    arxiv && `arxiv:${arxiv}`,
    urlNorm && `url:${urlNorm}`,
  ].filter(Boolean);
}

export function exactSourceMatch(candidate, sources) {
  const keys = sourceKeys(candidate);
  for (const source of sources) {
    const other = new Set(sourceKeys(source));
    const key = keys.find((value) => other.has(value));
    if (key)
      return {
        source,
        key,
        via: key.startsWith("arxiv:") ? "arxiv id" : key.split(":")[0],
      };
  }
  return null;
}

/** Historical watch title keys: retained for cursor compatibility, never proof of identity. */
export function normalizeTitle(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function watchItemKeys(item) {
  const title = normalizeTitle(item.title);
  return [
    ...sourceKeys(item),
    ...(title.length > 12 ? [`title:${title}`] : []),
  ];
}
