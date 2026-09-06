import Link from "next/link";
import { parseArticle, type Block, type Inline } from "@/src/domain/article";
import { Plate } from "./Plate";
import type { ImageRecord } from "@/src/domain/schema";

function renderInline(inline: Inline, key: number) {
  switch (inline.kind) {
    case "text":
      return <span key={key}>{inline.text}</span>;
    case "em":
      return <em key={key}>{inline.text}</em>;
    case "strong":
      return <strong key={key}>{inline.text}</strong>;
    case "link":
      return (
        <a
          key={key}
          href={inline.href}
          className="underline decoration-copper/50 underline-offset-2 hover:decoration-copper"
        >
          {inline.text}
        </a>
      );
    case "claimRef":
      return (
        <Link
          key={key}
          href={`/claims/${inline.claimId}/`}
          data-claim-id={inline.claimId}
          className="underline decoration-dotted decoration-copper underline-offset-4 hover:bg-copper/10"
        >
          {inline.text}
          <sup className="font-mono text-[9px] text-copper ml-0.5 tracking-tight">
            {inline.claimId.split("-")[1]}
          </sup>
        </Link>
      );
  }
}

/**
 * The annotated article. Claim-marked sentences link to the exact claim;
 * ArticleReader enhances these links with an on-demand claim sheet.
 * The full text and all links remain available without JavaScript.
 */
export function ArticleBody({
  markdown,
  images = [],
}: {
  markdown: string;
  images?: ImageRecord[];
}) {
  const blocks: Block[] = parseArticle(markdown);
  const imageById = new Map(images.map((img) => [img.id, img]));

  return (
    <div className="article-prose mx-auto max-w-[46rem] space-y-6">
      {blocks.map((block, i) => {
        if (block.kind === "plate") {
          const image = imageById.get(block.imageId);
          if (!image) throw new Error(`unknown plate ${block.imageId}`);
          return (
            <div key={i} className="article-block">
              <Plate image={image} />
            </div>
          );
        }
        if (block.kind === "heading") {
          const Tag = block.level === 2 ? "h2" : "h3";
          return (
            <div key={i} className="article-block">
              <Tag
                id={block.id}
                className={`font-serif tracking-tight ${
                  block.level === 2 ? "text-3xl pt-6" : "text-2xl pt-3"
                }`}
              >
                {block.text}
              </Tag>
            </div>
          );
        }
        if (block.kind === "rule") {
          return (
            <div key={i} className="article-block">
              <hr className="border-line" />
            </div>
          );
        }
        if (block.kind === "blockquote") {
          return (
            <div key={i} className="article-block">
              <blockquote className="border-l-2 border-copper pl-5 font-serif italic text-xl text-ink-soft">
                {block.inlines.map(renderInline)}
              </blockquote>
            </div>
          );
        }
        if (block.kind === "list") {
          return (
            <div key={i} className="article-block">
              <ul className="list-disc pl-6 space-y-2 font-serif text-[1.1rem] leading-relaxed">
                {block.items.map((item, j) => (
                  <li key={j}>{item.map(renderInline)}</li>
                ))}
              </ul>
            </div>
          );
        }
        return (
          <div key={i} className="article-block">
            <p>{block.inlines.map(renderInline)}</p>
          </div>
        );
      })}
    </div>
  );
}
