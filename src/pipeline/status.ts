import { saturation } from "../domain/intake.ts";
import { currentEdition, loadAllCases } from "../domain/load.ts";
import type { LoadedCase } from "../domain/schema.ts";
import { caseView } from "../domain/view.ts";
import { spendByCase } from "./spend.ts";
import { readRuns } from "./store.ts";

/**
 * `aletheia status`: the derived state of each case — standing, edition,
 * counts, saturation, spend — computed from files that already exist.
 * Nothing here is stored; this is what the case-level AI-operation view
 * (build step 6) will render.
 */

export interface CaseStatus {
  slug: string;
  dir: string;
  standing: string;
  edition: string;
  editionDate: string;
  featured: number;
  catalog: number;
  sources: number;
  evidence: number;
  dispositions: number;
  declined: number;
  lastIn: string | null;
  consecutiveEmpty: number;
  producerRuns: number;
  lastRun: string | null;
  spendUsd: number | null;
  spendCalls: number;
}

export function caseStatus(loaded: LoadedCase): CaseStatus {
  const view = caseView(loaded);
  const runs = readRuns();
  const sat = saturation(runs, loaded.dispositions, loaded.record.slug);
  const spend = spendByCase()[loaded.record.slug];
  const lastRun = runs.filter((r) => r.case === loaded.record.slug).at(-1);
  const ed = currentEdition(loaded);
  return {
    slug: loaded.record.slug,
    dir: loaded.dir,
    standing: view.standing?.status ?? "no assessment",
    edition: ed.runId,
    editionDate: ed.date,
    featured: view.featured.length,
    catalog: view.catalog.length,
    sources: loaded.sources.length,
    evidence: loaded.evidence.length,
    dispositions: loaded.dispositions.length,
    declined: loaded.dispositions.filter((d) => d.disposition !== "in").length,
    lastIn: sat.lastIn,
    consecutiveEmpty: sat.consecutiveEmpty,
    producerRuns: sat.producerRuns,
    lastRun: lastRun ? `${lastRun.runId} (${lastRun.outcome})` : null,
    spendUsd: spend?.usd ?? null,
    spendCalls: spend?.calls ?? 0,
  };
}

export function allStatus(slug?: string): CaseStatus[] {
  return loadAllCases()
    .filter((c) => !slug || c.record.slug === slug || c.dir === slug)
    .map(caseStatus);
}

export function renderStatusTable(rows: CaseStatus[]): string {
  const pad = (s: unknown, n: number) => String(s ?? "").padEnd(n);
  const head =
    pad("case", 22) + pad("standing", 12) + pad("edition", 32) + pad("feat", 5) + pad("cat", 4) +
    pad("src", 4) + pad("disp", 5) + pad("last in", 11) + pad("empty", 6) + pad("calls", 6) + "usd";
  const lines = rows.map(
    (r) =>
      pad(r.slug, 22) + pad(r.standing, 12) + pad(r.edition, 32) + pad(r.featured, 5) + pad(r.catalog, 4) +
      pad(r.sources, 4) + pad(r.dispositions, 5) + pad(r.lastIn ?? "—", 11) + pad(r.consecutiveEmpty, 6) +
      pad(r.spendCalls, 6) + (r.spendUsd === null ? "—" : r.spendUsd.toFixed(2)),
  );
  return [head, ...lines].join("\n");
}
