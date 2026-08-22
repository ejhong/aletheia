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

  for (const chunk of chunks) {
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
  const re = /^\{plate:(IMG-[A-Z0-9-]+)\}$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    if (!ids.includes(m[1])) ids.push(m[1]);
  }
  return ids;
}
