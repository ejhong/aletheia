import type { MetadataRoute } from "next";
import { site } from "@/src/config/site";
import { loadArbiterRecords } from "@/src/domain/governance";
import { lastContentUpdate } from "@/src/domain/history";
import { liveClaims, loadAllCases } from "@/src/domain/load";

// The site is a static export: the sitemap is written once, at build time.
export const dynamic = "force-static";

/**
 * Every page a reader can land on, for search engines: a public map is only
 * public if it can be found. Cases carry the date of their last content
 * change; the other pages follow the case they belong to.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  if (!site.url) return [];
  const at = (path: string) => `${site.url}${path}`;
  const cases = loadAllCases();
  const newest = cases.map(lastContentUpdate).sort().at(-1);
  const pages: MetadataRoute.Sitemap = [
    { url: at("/"), lastModified: newest, priority: 1 },
    { url: at("/cases/"), lastModified: newest, priority: 0.8 },
    { url: at("/method/"), priority: 0.6 },
    { url: at("/operations/"), lastModified: newest, priority: 0.5 },
    { url: at("/operations/gate/"), priority: 0.3 },
  ];
  for (const c of cases) {
    const slug = c.record.slug;
    const updated = lastContentUpdate(c);
    pages.push({ url: at(`/cases/${slug}/`), lastModified: updated, priority: 0.9 });
    for (const sub of ["claims", "evidence", "resources", "record", ...(c.studies.length ? ["studies"] : [])]) {
      pages.push({ url: at(`/cases/${slug}/${sub}/`), lastModified: updated, priority: 0.5 });
    }
    for (const s of c.studies) pages.push({ url: at(`/cases/${slug}/studies/${s.id.toLowerCase()}/`), lastModified: updated, priority: 0.5 });
    for (const claim of liveClaims(c)) pages.push({ url: at(`/claims/${claim.id}/`), lastModified: updated, priority: 0.6 });
    for (const s of c.sources) pages.push({ url: at(`/sources/${s.id}/`), lastModified: updated, priority: 0.4 });
  }
  for (const r of loadArbiterRecords()) pages.push({ url: at(`/operations/gate/${r.pr}/`), lastModified: r.outcomeAt, priority: 0.2 });
  return pages;
}
