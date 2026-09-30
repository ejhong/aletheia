import type { Metadata } from "next";
import { site } from "./site";

/**
 * A page's own title, description, address and share preview. Set together
 * because they fail together: a page that gives only a title is previewed,
 * wherever its link is pasted, under the site's name and the site's card
 * (every case page was, until 2026-09-30). Paths are site-relative; Next
 * resolves them against `metadataBase` (app/layout.tsx).
 */
export function pageMeta(p: {
  title: string;
  description: string;
  /** The page's canonical path, with its trailing slash. */
  path: string;
  /** The preview image; the site's card when the page has none of its own. */
  image?: { url: string; alt: string } | null;
  article?: boolean;
}): Metadata {
  const image = p.image ?? { url: site.ogImage, alt: `${site.name} — ${site.subtitle}` };
  return {
    title: p.title,
    description: p.description,
    alternates: { canonical: p.path },
    openGraph: {
      type: p.article ? "article" : "website",
      siteName: site.name,
      title: p.title,
      description: p.description,
      url: p.path,
      images: [image],
    },
    twitter: { card: "summary_large_image", title: p.title, description: p.description, images: [image.url] },
  };
}
