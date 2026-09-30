import { site } from "@/src/config/site";
import { loadAllCases } from "@/src/domain/load";
import { feedXml } from "@/src/domain/feed";

export const dynamic = "force-static";

/** The site's feed (Atom): every day a case's verdicts moved, newest first. Written once, at build time. */
export function GET() {
  return new Response(feedXml(loadAllCases(), { siteUrl: site.url ?? "", siteName: site.name, subtitle: site.subtitle }), {
    headers: { "Content-Type": "application/atom+xml; charset=utf-8" },
  });
}
