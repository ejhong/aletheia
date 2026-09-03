import { lastContentUpdate } from "./load";
import type { LoadedCase } from "./schema";
import { site } from "../config/site";

/**
 * The per-case machine-readable export (docs/AUTOMATION.md, "the
 * researcher surface"): the case's entire ledger — claims, evidence,
 * sources, research agenda, studies, assessment runs, change history,
 * conjectures — as one JSON document with stable ids, so a researcher
 * can pull the whole graph into their own tools instead of scraping
 * pages. Served statically at /cases/<slug>/export.json.
 *
 * Deliberately the LEDGER, not the presentation: the overview article,
 * images, and narrative inputs are how the site tells the story; the
 * export is the records the story must answer to. Nothing is
 * reshaped — every list is the loader's Zod-validated output verbatim,
 * so the export can never drift from what the site itself builds from.
 */

export const EXPORT_SCHEMA = "aletheia-case-export/1";

export function exportCase(loaded: LoadedCase) {
  return {
    schema: EXPORT_SCHEMA,
    meta: {
      site: site.name,
      caseUrl: site.url ? `${site.url}/cases/${loaded.record.slug}/` : null,
      repository: site.repoUrl,
      lastContentUpdate: lastContentUpdate(loaded),
      notes: [
        "This site is operated by AI as a declared experiment; see the method page.",
        "Assessment runs are AI drafts unless humanReviewed is true; 'check' runs are independent blind judges, never the displayed narrative.",
        "Source verification labels (verified / ai_verified / unverified) state exactly how much checking stands behind each citation.",
        "Evidence records separate sourceStatement (what the source states) from editorInference (what we infer).",
        "This export is the ledger, not the presentation: the overview article and imagery live on the case page.",
      ],
    },
    case: loaded.record,
    claims: loaded.claims,
    evidence: loaded.evidence,
    sources: loaded.sources,
    research: loaded.research,
    studies: loaded.studies,
    assessmentRuns: loaded.assessmentRuns,
    history: loaded.history,
    conjectures: loaded.conjectures,
    curatedResources: loaded.curatedResources,
  };
}

/** The site-level export index: every case, with its export URL path. */
export function exportIndex(cases: LoadedCase[]) {
  return {
    schema: "aletheia-export-index/1",
    site: site.name,
    repository: site.repoUrl,
    cases: cases.map((c) => ({
      slug: c.record.slug,
      title: c.record.title,
      status: c.record.status,
      lastContentUpdate: lastContentUpdate(c),
      export: `/cases/${c.record.slug}/export.json`,
    })),
  };
}
