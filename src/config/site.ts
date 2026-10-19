import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

/**
 * The site's identity, from config/site.yaml: its name, its words about
 * itself, its address, and the notice its rules ask every case page to carry.
 * The engine is the same for every site that runs it; this file is how a
 * site is its own.
 */
const SiteSchema = z.object({
  name: z.string().min(1),
  subtitle: z.string().min(1),
  /** What the site calls itself in the masthead and its links ("evidence atlas", "evidence map"). */
  kind: z.string().min(1),
  /** The home page's headline. */
  headline: z.string().min(1),
  mission: z.string().min(1),
  nav: z.array(z.object({ label: z.string().min(1), href: z.string().startsWith("/") })).min(1),
  url: z.string().url().nullable(),
  ogImage: z.string().startsWith("/"),
  repoUrl: z.string().url(),
  researchHubRfpUrl: z.string().url().nullable(),
  researchHubRfpLabel: z.string(),
  footerNote: z.string().min(1),
  caseNotice: z.object({ title: z.string().min(1), text: z.string().min(1) }).nullable(),
  /**
   * The day this site took up the engine's rules, when it came to the engine with content of its own: a dated rule
   * (a steelman on every assessment, an anchor on every claim) binds from its own date or this one, whichever is
   * later, so a site's records from before it ran the engine are judged by the rules they were written under.
   */
  engineSince: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /**
   * Names the rendered site must never contain, in any casing — checked over content/, src/, app/ and public/ by
   * `node scripts/site.ts check-names` in CI. A site running the engine under another name keeps the engine's own
   * name off its pages this way (its constitution may require it).
   */
  forbiddenNames: z.array(z.string().min(3)).default([]),
});

export type SiteConfig = z.infer<typeof SiteSchema>;

export const site: SiteConfig = SiteSchema.parse(parseYaml(fs.readFileSync(path.join(process.cwd(), "config", "site.yaml"), "utf8")));
