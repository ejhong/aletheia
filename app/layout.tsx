import { loadOperation } from "@/src/domain/governance";
import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter, Newsreader, Space_Grotesk } from "next/font/google";
import Link from "next/link";
import { assetPath } from "@/src/config/assets";
import { site } from "@/src/config/site";
import "./globals.css";

/*
 * The engine's typefaces, each offered as a CSS variable; a site's theme
 * (config/theme.css) chooses which of them its display, body and mono faces
 * are. A face the theme does not use is never downloaded, so none is
 * preloaded: the browser fetches what the page's CSS asks for.
 */
const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  preload: false,
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  preload: false,
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  preload: false,
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  preload: false,
});

export const metadata: Metadata = {
  // metadataBase makes the og-card path absolute in the rendered tags —
  // link-preview crawlers (iMessage, Slack, social cards) require
  // absolute image URLs. Without site.url we omit it and let crawler
  // heuristics do what they can.
  ...(site.url ? { metadataBase: new URL(site.url) } : {}),
  title: { default: `${site.name} — ${site.subtitle}`, template: `%s · ${site.name}` },
  description: site.mission,
  openGraph: {
    siteName: site.name,
    title: site.name,
    description: site.subtitle,
    type: "website",
    images: [site.ogImage],
  },
  twitter: {
    card: "summary_large_image",
    title: site.name,
    description: site.subtitle,
    images: [site.ogImage],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const operation = loadOperation();
  return (
    <html lang="en" className={`${newsreader.variable} ${spaceGrotesk.variable} ${inter.variable} ${plexMono.variable}`}>
      <body className="min-h-screen flex flex-col">
        {/* The feed of the days a case's verdicts moved (app/feed.xml), announced on every page; a page's own metadata cannot drop it. */}
        <link rel="alternate" type="application/atom+xml" title={`${site.name}: where the assessments moved`} href={assetPath("/feed.xml")} />
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-30 focus:bg-paper focus:px-3 focus:py-2 focus:font-mono focus:text-[12px] focus:uppercase focus:tracking-[0.14em] focus:text-copper focus:outline focus:outline-1 focus:outline-copper">
          Skip to the content
        </a>
        <header className="sticky top-0 z-20 border-b border-line bg-paper">
          <div className="mx-auto max-w-6xl px-5 py-4 flex items-baseline justify-between gap-6">
            <Link href="/" className="group flex items-baseline gap-3">
              <span className="font-serif text-2xl tracking-tight">
                {site.name}
              </span>
              <span className="hidden sm:inline font-mono text-[11px] uppercase tracking-[0.18em] text-faint group-hover:text-copper">
                {site.kind}
              </span>
            </Link>
            <nav className="flex items-baseline gap-6">
              {site.nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="font-mono text-[12px] uppercase tracking-[0.16em] text-ink-soft hover:text-copper"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main id="main" className="flex-1">{children}</main>
        <footer className="border-t border-line mt-20">
          <div className="mx-auto max-w-6xl px-5 py-10 flex flex-col sm:flex-row justify-between gap-6">
            <div>
              <p className="font-serif text-lg">{site.name}</p>
              <p className="text-sm text-ink-soft mt-1 max-w-md">
                {site.footerNote}
              </p>
              <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">
                <Link href="/method/#errors" className="hover:text-copper">Report an error</Link>
                <a href={assetPath("/feed.xml")} className="hover:text-copper">Feed</a>
                <a href={site.repoUrl} className="hover:text-copper">The repository</a>
              </p>
            </div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint self-end">
              <Link href="/operations" className="hover:text-copper underline underline-offset-4 decoration-line">
                AI-operated
              </Link>{" "}
              · content versioned in git · provenance on every record
              {operation.state === "paused" ? (
                <>
                  {" "}
                  · <span title={operation.reason}>automation paused by the {operation.by} since {operation.since}</span>
                </>
              ) : null}
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
