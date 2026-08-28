#!/usr/bin/env node
/**
 * Pre-flight citation check — run BEFORE opening a content PR.
 *
 *   node scripts/preflight-citations.mjs [base-ref]   # default: origin/main
 *
 * Runs the arbiter's own mechanical citation verification
 * (scripts/lib/citation-check.mjs) over the content lines your branch
 * adds relative to the base ref, and prints exactly what the panel's
 * seats will be shown — resolved Crossref/arXiv titles beside each
 * identifier — so identifier/title mismatches die at your desk instead
 * of parking the PR.
 *
 * Why this exists: a content PR was parked when three panel seats caught
 * a source record whose title had been written from memory of the
 * paper's subject instead of from the page (aletheia PR #113). The
 * mechanical check that caught it only ran inside the arbiter, on the
 * open PR. This is the same check, runnable locally.
 *
 * Reading the output:
 *   - RESOLVES (Crossref: "…") — compare that title, word by word,
 *     against your source record's title. Titles come from the page,
 *     never from memory (docs/CHAT_BRIEFS.md).
 *   - FAILS — either fix the identifier, or make sure the source
 *     record's verificationNote already names the block (bot-wall,
 *     paywall) and the workaround copy actually read (Wayback,
 *     repository PDF). An unexplained FAILS is what a seat will read as
 *     possible fabrication.
 *   - UNCHECKED — tooling limits; the seats judge these on the record's
 *     own verification notes.
 *
 * Exit code: 1 if any citation FAILS (a reminder to explain or fix each
 * one — the arbiter itself never gates on this), else 0.
 */
import { execFileSync } from "node:child_process";
import {
  extractCitations,
  verifyCitations,
  formatVerificationSection,
  verificationSummary,
} from "./lib/citation-check.mjs";

const baseRef = process.argv[2] ?? "origin/main";

let mergeBase;
try {
  mergeBase = execFileSync("git", ["merge-base", baseRef, "HEAD"], {
    encoding: "utf8",
  }).trim();
} catch {
  console.error(`Cannot find merge-base with "${baseRef}" — fetch it first (git fetch origin main).`);
  process.exit(2);
}

const rawDiff = execFileSync(
  "git",
  ["diff", `${mergeBase}...HEAD`, "--", "content"],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);

const citations = extractCitations(rawDiff);
if (citations.length === 0) {
  console.log("No citation identifiers in the content lines this branch adds.");
  process.exit(0);
}

console.log(`Checking ${citations.length} citation identifier(s) against live registries…\n`);
const results = await verifyCitations(citations);
console.log(formatVerificationSection(results));
console.log(`\n${verificationSummary(results)}`);

const fails = results.filter((r) => r.status === "fails");
if (fails.length > 0) {
  console.log(
    `\n${fails.length} FAILS: each must be either fixed or already explained ` +
      "by its source record's verificationNote (named block + named workaround copy). " +
      "For every RESOLVES, compare the registry title against your record's title.",
  );
  process.exit(1);
}
