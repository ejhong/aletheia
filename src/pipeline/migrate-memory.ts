import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { Disposition } from "../domain/intake.ts";
import { loadAllCases } from "../domain/load.ts";
import { appendDispositions } from "./store.ts";

/**
 * One-time migration of the three legacy memories into dispositions
 * (docs/AUTOMATION.md, "Memory records decisions in context"):
 *
 *  - proposals/watch/archive-ledger.yaml — triage archived items, with
 *    reasons → `irrelevant` rows, key and reason as recorded, `by` the
 *    triage run.
 *  - proposals/promotions-ledger.yaml — promotion outcomes → `in` rows
 *    (as: the source id) and `duplicate` rows (as: the record matched).
 *    Duplicate rows carried no case; the case is found by which ledger
 *    holds the matched source.
 *
 * NOT migrated, and said so: the watch seen-list in
 * proposals/watch/state.yaml. Those are items surfaced without a recorded
 * decision; inventing a disposition for them would be inventing a
 * judgment. The list stays with the watch cursor until the watch becomes
 * an adapter (build step 5) and is retired with it.
 *
 * The two migrated ledgers are deleted; their rows now live where every
 * other decision lives. Idempotent: absent files are skipped.
 */

type Raw = Record<string, unknown>;

export function migrateMemory({ dryRun = false, root = process.cwd() } = {}): string[] {
  const report: string[] = [];
  const cases = loadAllCases();
  const byDir = new Map(cases.map((c) => [c.dir, c]));
  const caseOfRecord = (id: string) =>
    cases.find((c) => c.sources.some((s) => s.id === id) || c.claims.some((k) => k.id === id) || c.evidence.some((e) => e.id === id));

  const perCase = new Map<string, Disposition[]>();
  const add = (dir: string, row: Disposition) => {
    if (!perCase.has(dir)) perCase.set(dir, []);
    perCase.get(dir)!.push(row);
  };

  const archive = path.join(root, "proposals", "watch", "archive-ledger.yaml");
  if (fs.existsSync(archive)) {
    const items = ((parseYaml(fs.readFileSync(archive, "utf8")) as Raw)?.items ?? []) as Raw[];
    for (const it of items) {
      const dir = String(it.case);
      if (!byDir.has(dir)) {
        report.push(`archive: unknown case ${dir} for ${it.key} — skipped`);
        continue;
      }
      add(dir, {
        key: String(it.key),
        kind: "source",
        disposition: "irrelevant",
        reason: String(it.reason),
        observed: String(it.title ?? it.url ?? it.key),
        by: String(it.triageRun ?? "triage (legacy)"),
        date: String(it.date),
      });
    }
    report.push(`archive-ledger: ${items.length} rows → irrelevant`);
  } else report.push("archive-ledger: absent (already migrated)");

  const promotions = path.join(root, "proposals", "promotions-ledger.yaml");
  if (fs.existsSync(promotions)) {
    const items = (parseYaml(fs.readFileSync(promotions, "utf8")) ?? []) as Raw[];
    for (const it of items) {
      const url = String(it.url);
      const key = urlKeyForLegacy(url);
      if (it.disposition === "promoted") {
        const dir = cases.find((c) => c.record.slug === it.case || c.dir === it.case)?.dir;
        if (!dir) {
          report.push(`promotions: unknown case ${it.case} for ${url} — skipped`);
          continue;
        }
        add(dir, {
          key,
          kind: "source",
          disposition: "in",
          as: String(it.as),
          observed: url,
          by: String(it.runId),
          date: String(it.date),
        });
      } else if (it.disposition === "duplicate") {
        const home = caseOfRecord(String(it.of));
        if (!home) {
          report.push(`promotions: cannot locate record ${it.of} for duplicate ${url} — skipped`);
          continue;
        }
        add(home.dir, {
          key,
          kind: "source",
          disposition: "duplicate",
          as: String(it.of),
          reason: `same work as ${it.of} (matched via ${it.via})`,
          observed: url,
          by: String(it.runId),
          date: String(it.date),
        });
      }
    }
    report.push(`promotions-ledger: ${items.length} rows → in / duplicate`);
  } else report.push("promotions-ledger: absent (already migrated)");

  for (const [dir, rows] of perCase) {
    report.push(`${dir}: +${rows.length} dispositions${dryRun ? " (dry run)" : ""}`);
    if (!dryRun) appendDispositions(dir, rows, root);
  }
  if (!dryRun) {
    for (const f of [archive, promotions]) if (fs.existsSync(f)) fs.rmSync(f);
  }
  report.push(
    "watch seen-list (proposals/watch/state.yaml): kept — surfaced items without a recorded decision; retired with the watch (step 5)",
  );
  return report;
}

/** arXiv abs URLs become arxiv: keys; anything else a canonical url: key. */
function urlKeyForLegacy(url: string): string {
  const m = url.match(/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5})/);
  if (m) return `arxiv:${m[1]}`;
  return `url:${url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "")}`;
}
