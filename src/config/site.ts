export const site = {
  name: "Aletheia",
  subtitle: "Contested claims, mapped to evidence and experiments.",
  mission:
    "Aletheia decomposes controversial hypotheses into atomic claims, maps the evidence for and against each one, keeps exact provenance, and points at the experiment that would settle the dispute. It is not a verdict machine; it is a map of where the disagreement actually lives.",
  nav: [
    { label: "Cases", href: "/cases" },
    { label: "Resources", href: "/resources" },
    { label: "Method", href: "/method" },
  ],
  // Set when the RFP is live on ResearchHub; rendered only if non-null.
  researchHubRfpUrl: null as string | null,
  researchHubRfpLabel: "Request for Proposals on ResearchHub",
  footerNote:
    "Aletheia is a working research notebook made public. Provenance labels tell you exactly how much checking stands behind every record.",
} as const;

export type SiteConfig = typeof site;
