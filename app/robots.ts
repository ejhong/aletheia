import type { MetadataRoute } from "next";
import { site } from "@/src/config/site";

export const dynamic = "force-static";

/**
 * Everything here is meant to be read. Crawlers look for this file at the
 * root of a host, so it takes effect once the site is served from a domain
 * of its own; under a repository path it is simply not consulted, and the
 * sitemap is reached by its own address.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    ...(site.url ? { sitemap: `${site.url}/sitemap.xml` } : {}),
  };
}
