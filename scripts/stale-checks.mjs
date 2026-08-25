#!/usr/bin/env node
/**
 * Print the case directories whose cross-model checks are stale — content
 * moved after the newest check, or no checks exist — one per line, for the
 * content-response workflow to re-panel. Mirrors the staleness rule in
 * src/domain/load.ts (newest non-housekeeping history date vs newest
 * check-run date), in plain Node so CI needs no TS runtime.
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
  const newestCheck = (fs.existsSync(adir) ? fs.readdirSync(adir) : [])
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => parse(fs.readFileSync(path.join(adir, f), "utf8")))
    .filter((r) => r?.role === "check")
    .map((r) => String(r.date))
    .sort()
    .at(-1);
  if (!newestCheck || (newestContent && newestContent > newestCheck)) console.log(dir);
}
