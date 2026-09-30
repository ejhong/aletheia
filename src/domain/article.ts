/**
 * Constrained markdown for overview articles. Deliberately small so we can
 * hand-render it with full control over the claim-note system — no markdown
 * dependency. Supported: ## / ### headings, paragraphs, > blockquotes,
 * --- rules, - lists, **bold**, *italic*, [text](url) links, and the claim
 * reference span: [text]{claim=GEO-C001}.
 */

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "em"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "link"; text: string; href: string }
  | { kind: "claimRef"; text: string; claimId: string };

export type Block =
  | { kind: "heading"; level: 2 | 3; text: string; id: string }
  | { kind: "paragraph"; inlines: Inline[] }
  | { kind: "blockquote"; inlines: Inline[] }
  | { kind: "list"; items: Inline[][] }
  | { kind: "rule" }
  | { kind: "plate"; imageId: string };

const PLATE_BLOCK = /^\{plate:(IMG-[A-Z0-9-]+)\}$/;
/**
 * A plate marker that opens a paragraph — "{plate:ID} The text…" — seats the plate before the paragraph. Two
 * migrated editions of 2026-09-08 wrote their plates so; read only as a block, the marker was printed as text on the
 * page and the plate was never shown (found 2026-09-30).
 */
const PLATE_LEAD = /^\{plate:(IMG-[A-Z0-9-]+)\}[ \t]+(?=\S)/;
/** A plate marker where a plate can be seated: at the start of a line, alone or followed by a paragraph's text. */
const PLATE_SEATED = /^\{plate:(IMG-[A-Z0-9-]+)\}(?=$|[ \t])/gm;

const CLAIM_REF = /\[([^\]]+)\]\{claim=([A-Z]+-C\d{3})\}/;
const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/;
const STRONG = /\*\*([^*]+)\*\*/;
const EM = /\*([^*]+)\*/;

type MatchKind = "claimRef" | "link" | "strong" | "em";

export function parseInlines(text: string): Inline[] {
  const out: Inline[] = [];
  let rest = text;
  while (rest.length > 0) {
    const candidates: { m: RegExpExecArray; kind: MatchKind }[] = [];
    for (const [re, kind] of [
      [CLAIM_REF, "claimRef"],
      [LINK, "link"],
      [STRONG, "strong"],
      [EM, "em"],
    ] as [RegExp, MatchKind][]) {
      const m = re.exec(rest);
      if (m) candidates.push({ m, kind });
    }
    if (candidates.length === 0) {
      out.push({ kind: "text", text: rest });
      break;
    }
    candidates.sort((a, b) => a.m.index - b.m.index);
    const first = candidates[0];
    if (first.m.index > 0) {
      out.push({ kind: "text", text: rest.slice(0, first.m.index) });
    }
    if (first.kind === "claimRef") {
      out.push({ kind: "claimRef", text: first.m[1], claimId: first.m[2] });
    } else if (first.kind === "link") {
      out.push({ kind: "link", text: first.m[1], href: first.m[2] });
    } else if (first.kind === "strong") {
      out.push({ kind: "strong", text: first.m[1] });
    } else {
      out.push({ kind: "em", text: first.m[1] });
    }
    rest = rest.slice(first.m.index + first.m[0].length);
  }
  return out;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export function parseArticle(markdown: string): Block[] {
  const blocks: Block[] = [];
  const chunks = markdown
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  for (let chunk of chunks) {
    const lead = PLATE_LEAD.exec(chunk);
    if (lead) {
      blocks.push({ kind: "plate", imageId: lead[1] });
      chunk = chunk.slice(lead[0].length);
    }
    const plateMatch = PLATE_BLOCK.exec(chunk);
    if (plateMatch) {
      blocks.push({ kind: "plate", imageId: plateMatch[1] });
    } else if (chunk === "---") {
      blocks.push({ kind: "rule" });
    } else if (chunk.startsWith("### ")) {
      const text = chunk.slice(4).trim();
      blocks.push({ kind: "heading", level: 3, text, id: slugify(text) });
    } else if (chunk.startsWith("## ")) {
      const text = chunk.slice(3).trim();
      blocks.push({ kind: "heading", level: 2, text, id: slugify(text) });
    } else if (chunk.startsWith("> ")) {
      const text = chunk
        .split("\n")
        .map((l) => l.replace(/^>\s?/, ""))
        .join(" ");
      blocks.push({ kind: "blockquote", inlines: parseInlines(text) });
    } else if (chunk.split("\n").every((l) => l.startsWith("- "))) {
      blocks.push({
        kind: "list",
        items: chunk.split("\n").map((l) => parseInlines(l.slice(2))),
      });
    } else if (chunk.startsWith("#")) {
      throw new Error(
        `Unsupported heading level in article (only ## and ### allowed): "${chunk.slice(0, 40)}..."`,
      );
    } else {
      blocks.push({
        kind: "paragraph",
        inlines: parseInlines(chunk.split("\n").join(" ")),
      });
    }
  }
  return blocks;
}

/** All claim ids referenced by the article, in order of first appearance. */
export function extractClaimRefs(markdown: string): string[] {
  const ids: string[] = [];
  const re = new RegExp(CLAIM_REF.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    if (!ids.includes(m[2])) ids.push(m[2]);
  }
  return ids;
}

/** All plate image ids embedded in the article. */
export function extractPlateRefs(markdown: string): string[] {
  const ids: string[] = [];
  const re = new RegExp(PLATE_SEATED.source, "gm");
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    if (!ids.includes(m[1])) ids.push(m[1]);
  }
  return ids;
}

/**
 * Markers the parser will not read as markers: a claim span with the wrong bracket or a malformed id, a plate marker
 * in the middle of a line. The page prints such a marker as text, and the claim it pointed at loses its link — and a
 * reader of the raw text can take everything up to the next closing brace for the marker (2026-09-30: a candidate
 * closed three claim spans with "]" for "}"; nothing refused it, and the seats comparing it with its incumbent were
 * shown an article with its central section swallowed). One line per fault, with the text around it.
 */
export function markerErrors(markdown: string): string[] {
  const rest = markdown.replace(new RegExp(CLAIM_REF.source, "g"), "$1").replace(new RegExp(PLATE_SEATED.source, "gm"), "");
  const out: string[] = [];
  let last = -Infinity;
  for (const m of rest.matchAll(/\{claim\b|\]\{|\{plate\b|\bclaim=[A-Z]+-C\d+/g)) {
    // One broken marker trips several of these patterns a few characters apart; it is one fault.
    if (m.index - last < 12) continue;
    last = m.index;
    const near = rest.slice(Math.max(0, m.index - 50), m.index + 40).replace(/\s+/g, " ").trim();
    out.push(`malformed marker near "${near}" — a claim span is [words]{claim=CASE-C000} with a closing brace; a plate is {plate:IMG-…} at the start of a line`);
  }
  return out;
}

/** A claim span complete but for its last character: [words]{claim=GEO-C001] — the bracket where the brace belongs. */
const CLAIM_REF_MISCLOSED = /(\[[^\]]+\]\{claim=([A-Z]+-C\d{3}))\]/g;

/**
 * Close the claim spans a drafter closed with "]" for "}". The opening bracket, the words, the brace and a
 * well-formed id are all there and only the last character is wrong, so there is one thing the span can mean; no
 * other malformed marker is touched. Returns the ids of the spans closed, in order, so the caller can say what it
 * did: the edition verb writes them into the rationale and the run's record (2026-09-30: six of eight runs sent a
 * whole candidate back to the drafter for this one character and nothing else, at $0.78 to $1.15 a time).
 */
export function closeClaimSpans(markdown: string): { markdown: string; closed: string[] } {
  const closed: string[] = [];
  const out = markdown.replace(CLAIM_REF_MISCLOSED, (_m, head: string, id: string) => {
    closed.push(id);
    return `${head}}`;
  });
  return { markdown: out, closed };
}

/** The article as the page shows it to a reader, as plain text: a claim span is its words, a plate is a picture, headings stay. */
export function plainArticle(markdown: string): string {
  return markdown
    .replace(new RegExp(CLAIM_REF.source, "g"), "$1")
    .replace(new RegExp(PLATE_SEATED.source, "gm"), "[a plate: a photograph or figure, with its caption]\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
