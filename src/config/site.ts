export const site = {
  name: "Aletheia",
  subtitle: "Contested claims, mapped to evidence and experiments.",
  mission:
    "Aletheia decomposes controversial hypotheses into atomic claims, maps the evidence for and against each one, keeps exact provenance, and points at the experiment that would settle the dispute. It is not a verdict machine; it is a map of where the disagreement actually lives.",
  nav: [
    { label: "Cases", href: "/cases" },
    { label: "Method", href: "/method" },
    { label: "Panel", href: "/panel" },
    { label: "Proposals", href: "/proposals" },
  ],
  /**
   * Canonical public origin (no trailing slash), used as Next's
   * metadataBase so link previews (iMessage, Slack, social cards)
   * resolve the og-card image to an absolute URL. Set null if the
   * deployment URL is unknown; previews then fall back to crawler
   * heuristics.
   */
  url: "https://ejhong.github.io/aletheia" as string | null,
  /**
   * The social-card image served to link-preview crawlers (og:image /
   * twitter:card). A 1200×630 crop of house cover art, at
   * public/images/og-card.png.
   */
  ogImage: "/images/og-card.png",
  /** Public repository — the ledger every page derives from. */
  repoUrl: "https://github.com/ejhong/aletheia",
  // Set when the RFP is live on ResearchHub; rendered only if non-null.
  researchHubRfpUrl: null as string | null,
  researchHubRfpLabel: "Request for Proposals on ResearchHub",
  footerNote:
    "Aletheia is a working research notebook made public — operated by AI as a declared experiment. Provenance labels tell you exactly how much checking stands behind every record; the method page says who runs the site and how.",
} as const;

export type SiteConfig = typeof site;
