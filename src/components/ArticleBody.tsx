import Link from "next/link";
import { parseArticle, type Block, type Inline } from "@/src/domain/article";
import { AssessmentBadge } from "./AssessmentBadge";
import { Plate } from "./Plate";
import { ProvenanceBadge } from "./ProvenanceBadge";
import type { Claim, ImageRecord } from "@/src/domain/schema";

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

function claimIdsIn(inlines: Inline[]): string[] {
  return inlines
    .filter((i): i is Extract<Inline, { kind: "claimRef" }> => i.kind === "claimRef")
    .map((i) => i.claimId);
}

function MarginNote({ claim }: { claim: Claim }) {
  return (
    <Link
      href={`/claims/${claim.id}/`}
      className="block border border-line bg-paper-deep/60 p-2.5 hover:border-copper/60"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] tracking-[0.14em] text-copper">
          {claim.id}
        </span>
        <ProvenanceBadge state={claim.reviewState} />
      </div>
      <p className="mt-1 text-[12px] leading-snug text-ink-soft line-clamp-4">
        {claim.statement}
      </p>
      <div className="mt-1.5">
        <AssessmentBadge state={claim.credibility} />
      </div>
    </Link>
  );
}

/**
 * The annotated article. Claim-marked sentences link to the exact claim;
 * on wide screens each paragraph's claims appear as margin notes beside it,
 * on small screens as a disclosure beneath it. Server-rendered, zero JS.
 */
export function ArticleBody({
  markdown,
  claims,
  images = [],
}: {
  markdown: string;
  claims: Claim[];
  images?: ImageRecord[];
}) {
  const blocks: Block[] = parseArticle(markdown);
  const claimById = new Map(claims.map((c) => [c.id, c]));
  const imageById = new Map(images.map((img) => [img.id, img]));

  return (
    <div className="article-prose space-y-6">
      {blocks.map((block, i) => {
        if (block.kind === "plate") {
          const image = imageById.get(block.imageId);
          if (!image) throw new Error(`unknown plate ${block.imageId}`);
          return (
            <div key={i} className="xl:grid xl:grid-cols-[minmax(0,1fr)_270px] xl:gap-10">
              <Plate image={image} />
            </div>
          );
        }
        if (block.kind === "heading") {
          const Tag = block.level === 2 ? "h2" : "h3";
          return (
            <div key={i} className="xl:grid xl:grid-cols-[minmax(0,1fr)_270px] xl:gap-10">
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
            <div key={i} className="xl:grid xl:grid-cols-[minmax(0,1fr)_270px] xl:gap-10">
              <hr className="border-line" />
            </div>
          );
        }
        if (block.kind === "blockquote") {
          return (
            <div key={i} className="xl:grid xl:grid-cols-[minmax(0,1fr)_270px] xl:gap-10">
              <blockquote className="border-l-2 border-copper pl-5 font-serif italic text-xl text-ink-soft">
                {block.inlines.map(renderInline)}
              </blockquote>
            </div>
          );
        }
        if (block.kind === "list") {
          return (
            <div key={i} className="xl:grid xl:grid-cols-[minmax(0,1fr)_270px] xl:gap-10">
              <ul className="list-disc pl-6 space-y-2 font-serif text-[1.1rem] leading-relaxed">
                {block.items.map((item, j) => (
                  <li key={j}>{item.map(renderInline)}</li>
                ))}
              </ul>
            </div>
          );
        }
        // paragraph
        const ids = claimIdsIn(block.inlines);
        const refClaims = ids
          .map((id) => claimById.get(id))
          .filter((c): c is Claim => Boolean(c));
        return (
          <div
            key={i}
            className="xl:grid xl:grid-cols-[minmax(0,1fr)_270px] xl:gap-10"
          >
            <p>{block.inlines.map(renderInline)}</p>
            {refClaims.length > 0 ? (
              <>
                <aside className="hidden xl:flex flex-col gap-2 pt-1.5">
                  {refClaims.map((c) => (
                    <MarginNote key={c.id} claim={c} />
                  ))}
                </aside>
                <details className="xl:hidden mt-2 group">
                  <summary className="cursor-pointer list-none font-mono text-[11px] uppercase tracking-[0.16em] text-copper">
                    <span className="group-open:hidden">
                      ▸ claims behind this paragraph ({refClaims.length})
                    </span>
                    <span className="hidden group-open:inline">
                      ▾ claims behind this paragraph
                    </span>
                  </summary>
                  <div className="mt-2 flex flex-col gap-2">
                    {refClaims.map((c) => (
                      <MarginNote key={c.id} claim={c} />
                    ))}
                  </div>
                </details>
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
