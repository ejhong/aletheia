export const site = {
  name: "Aletheia",
  subtitle: "Contested claims, mapped to evidence and experiments.",
  mission:
    "Aletheia decomposes controversial hypotheses into atomic claims, maps the evidence for and against each one, keeps exact provenance, and points at the experiment that would settle the dispute. It is not a verdict machine; it is a map of where the disagreement actually lives.",
  nav: [
    { label: "Cases", href: "/cases" },
    { label: "Research", href: "/research" },
    { label: "Method", href: "/method" },
    { label: "Panel", href: "/panel" },
  ],
  // Set when the RFP is live on ResearchHub; rendered only if non-null.
  researchHubRfpUrl: null as string | null,
  researchHubRfpLabel: "Request for Proposals on ResearchHub",
  footerNote:
    "Aletheia is a working research notebook made public — operated by AI as a declared experiment. Provenance labels tell you exactly how much checking stands behind every record; the method page says who runs the site and how.",
} as const;

export type SiteConfig = typeof site;
