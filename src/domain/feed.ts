/**
 * The site's feed, as Atom: one entry for each day a case's verdicts moved
 * (src/domain/moves.ts), newest first. A reader who follows a controversy
 * is told when the site changes its mind about it, and about nothing else.
 * Pure: a function of the cases, so the feed is tested like any derivation.
 */
import { dailyMoves } from "./moves.ts";
import { assessmentLabels, type LoadedCase } from "./schema.ts";

type FeedCase = Pick<LoadedCase, "editions" | "assessmentRuns" | "claims"> & { record: { title: string; slug: string } };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Days shown in the feed; a reader's feed is for what is recent, the case pages keep the whole history. */
export const FEED_ENTRIES = 40;

export function feedXml(cases: FeedCase[], opts: { siteUrl: string; siteName: string; subtitle: string }): string {
  const entries = cases
    .flatMap((c) => dailyMoves(c).map((d) => ({ ...d, slug: c.record.slug, title: c.record.title })))
    .sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug))
    .slice(0, FEED_ENTRIES);
  const updated = `${entries[0]?.date ?? "1970-01-01"}T00:00:00Z`;
  const entry = (e: (typeof entries)[number]) => {
    const url = `${opts.siteUrl}/cases/${e.slug}/`;
    const lines = e.moves.map(
      (m) => `${m.claimId ? m.subject.replace(/[.\s]+$/, "") : "The case verdict"}: ${assessmentLabels[m.from]} → ${assessmentLabels[m.to]}`,
    );
    return [
      "  <entry>",
      `    <id>${esc(`${url}#moved-${e.date}`)}</id>`,
      `    <title>${esc(`${e.title}: ${e.moves.length} verdict${e.moves.length === 1 ? "" : "s"} moved`)}</title>`,
      `    <link href="${esc(`${url}#history`)}"/>`,
      `    <updated>${e.date}T00:00:00Z</updated>`,
      `    <summary>${esc(lines.join(" · "))}</summary>`,
      "  </entry>",
    ].join("\n");
  };
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <id>${esc(`${opts.siteUrl}/`)}</id>`,
    `  <title>${esc(`${opts.siteName}: where the assessments moved`)}</title>`,
    `  <subtitle>${esc(opts.subtitle)}</subtitle>`,
    `  <link href="${esc(`${opts.siteUrl}/`)}"/>`,
    `  <link rel="self" href="${esc(`${opts.siteUrl}/feed.xml`)}"/>`,
    `  <updated>${updated}</updated>`,
    `  <author><name>${esc(opts.siteName)} (operated by AI)</name></author>`,
    ...entries.map(entry),
    "</feed>",
    "",
  ].join("\n");
}
