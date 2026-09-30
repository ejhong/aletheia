import { parseArticle } from "@/src/domain/article";

/**
 * The article's sections, as a line of links above it: a reader can see
 * where a long telling goes before starting, and come back to a part of it.
 * Shown only when there are enough sections to need one.
 */
export function ArticleOutline({ markdown }: { markdown: string }) {
  const headings = parseArticle(markdown).filter(
    (b): b is Extract<ReturnType<typeof parseArticle>[number], { kind: "heading" }> => b.kind === "heading" && b.level === 2,
  );
  if (headings.length < 3) return null;
  return (
    <nav aria-label="In this article" className="mb-8 border-y border-line py-3">
      <ol className="flex flex-wrap gap-x-6 gap-y-1.5">
        {headings.map((h, i) => (
          <li key={h.id} className="text-[13.5px] leading-snug">
            <a href={`#${h.id}`} className="text-ink-soft hover:text-copper">
              <span className="font-mono text-[10px] text-faint mr-1.5">{String(i + 1).padStart(2, "0")}</span>
              {h.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
