#!/usr/bin/env node
/**
 * Print the case directories whose cross-model checks are stale — content
 * moved after the newest check, no checks exist, or the displayed draft is
 * a reconsideration that no fresh blind check has judged yet — one per
 * line, for the content-response workflow to re-panel. Mirrors the
 * staleness rules in src/domain/load.ts (ratification), in plain Node so
 * CI needs no TS runtime.
 */
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

const CASES = path.join(process.cwd(), "content", "cases");
for (const dir of fs.readdirSync(CASES)) {
  const caseDir = path.join(CASES, dir);
  if (!fs.existsSync(path.join(caseDir, "case.yaml"))) continue;
  const histFile = path.join(caseDir, "history.yaml");
  const newestContent = (fs.existsSync(histFile) ? parse(fs.readFileSync(histFile, "utf8")) ?? [] : [])
    .filter((h) => h.kind !== "housekeeping")
    .map((h) => String(h.date))
    .sort()
    .at(-1);
  const adir = path.join(caseDir, "assessments");
  const runs = (fs.existsSync(adir) ? fs.readdirSync(adir) : [])
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => parse(fs.readFileSync(path.join(adir, f), "utf8")))
    .filter((r) => r != null);
  const checks = runs.filter((r) => r.role === "check");
  const newestCheck = checks
    .map((r) => String(r.date))
    .sort()
    .at(-1);
  // The displayed draft (latest non-check run, date order as in load.ts).
  const draft = runs
    .filter((r) => r.role !== "check")
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .at(-1);
  // A reconsideration draft was written with the panel's dissents in hand;
  // the checks it engaged cannot ratify it (load.ts ratification), so the
  // case needs a re-panel until a fresh blind check exists. Stamped drafts
  // name the engaged runIds; pre-stamp overlays fall back to date order.
  const isReconsideration =
    draft &&
    (draft.reconciles !== undefined ||
      /reconsider/i.test(String(draft.promptVersion)));
  const awaitingFreshCheck =
    isReconsideration &&
    !checks.some((r) =>
      draft.reconciles !== undefined
        ? !draft.reconciles.includes(r.runId)
        : String(r.date) > String(draft.date),
    );
  if (
    !newestCheck ||
    (newestContent && newestContent > newestCheck) ||
    awaitingFreshCheck
  )
    console.log(dir);
}
