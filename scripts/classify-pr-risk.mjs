#!/usr/bin/env node
/**
 * Classify a change set as "low-risk" or "needs-approval" for the tiered
 * merge policy (docs/MAINTENANCE.md). Conservative by construction: anything
 * not explicitly allowed is needs-approval — the classifier fails closed.
 *
 * Usage:
 *   node scripts/classify-pr-risk.mjs <base-ref>     # diff base...HEAD
 *
 * Prints a report and the final line "low-risk" or "needs-approval".
 * Exit code is always 0 unless the diff itself cannot be computed; callers
 * read the classification from the last stdout line.
 *
 * Low-risk (auto-mergeable when CI is green) — reversible-by-runId changes
 * that never touch featured content:
 *   - proposals/**                                  (never published)
 *   - inbox/**                                      (drops + processed moves)
 *   - content/cases/<case>/assessments/*.yaml       (NEW files only —
 *     append-only overlay convention; modifying an existing overlay is
 *     needs-approval)
 *   - content/cases/<case>/claims-catalog.yaml      (append-only diffs only)
 *   - content/cases/<case>/sources.yaml             (append-only diffs only)
 *
 * Everything else — featured claims, overview/article text, case records,
 * history, src/, app/, docs/, scripts/, workflows — is needs-approval.
 */
import { execFileSync } from "node:child_process";

const base = process.argv[2];
if (!base) {
  console.error("usage: node scripts/classify-pr-risk.mjs <base-ref>");
  process.exit(1);
}

const git = (...a) => execFileSync("git", a, { encoding: "utf8" });

const nameStatus = git("diff", "--name-status", `${base}...HEAD`)
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [status, ...rest] = line.split("\t");
    return { status: status[0], file: rest[rest.length - 1] };
  });

if (nameStatus.length === 0) {
  console.log("empty diff");
  console.log("low-risk");
  process.exit(0);
}

/** Is the diff for this file purely additive (no removed/modified lines)? */
function appendOnly(file) {
  const diff = git("diff", "--unified=0", `${base}...HEAD`, "--", file);
  const removals = diff
    .split("\n")
    .filter((l) => l.startsWith("-") && !l.startsWith("---"));
  return removals.length === 0;
}

const reasons = [];
let lowRisk = true;

for (const { status, file } of nameStatus) {
  if (file.startsWith("proposals/") || file.startsWith("inbox/")) {
    continue; // always low-risk: never published
  }
  if (/^content\/cases\/[^/]+\/assessments\/[^/]+\.yaml$/.test(file)) {
    if (status === "A") continue; // new append-only overlay
    lowRisk = false;
    reasons.push(`${file}: existing assessment overlay ${status === "D" ? "deleted" : "modified"} — overlays are append-only`);
    continue;
  }
  if (
    /^content\/cases\/[^/]+\/(claims-catalog|sources)\.yaml$/.test(file) &&
    status !== "D"
  ) {
    if (appendOnly(file)) continue;
    lowRisk = false;
    reasons.push(`${file}: diff is not append-only (existing records changed or removed)`);
    continue;
  }
  lowRisk = false;
  reasons.push(`${file}: outside the low-risk allowlist`);
}

if (lowRisk) {
  console.log(
    `all ${nameStatus.length} changed file(s) are reversible-by-runId and touch no featured content`,
  );
  console.log("low-risk");
} else {
  console.log("needs-approval because:");
  for (const r of reasons) console.log(`  - ${r}`);
  console.log("needs-approval");
}
