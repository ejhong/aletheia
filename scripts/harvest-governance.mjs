#!/usr/bin/env node
/**
 * Harvest arbiter verdicts into the repository (Stage 4 tail).
 *
 * Arbiter reports live as PR comments, which a static site cannot see.
 * This script copies each settled PR's verdict — the machine blob the
 * arbiter embeds in its sticky comment — into governance/arbiter/pr-<n>.yaml
 * so the /panel page can display governance, not just assessments.
 *
 * Usage: node scripts/harvest-governance.mjs [--digest] [--dry-run]
 *
 * - Only SETTLED PRs are harvested (merged or closed): a verdict on an open
 *   PR may still change on the next push, and append-only records must not
 *   need correcting.
 * - Idempotent by file presence: pr-<n>.yaml exists → skipped forever.
 * - Fail-closed: a comment whose blob does not parse or validate is
 *   reported and skipped, never written half-right.
 * - --digest additionally writes weekly-digest.md — the founder's observer
 *   summary (what merged, what parked, what the panel said) for the
 *   maintain workflow to post as an issue.
 *
 * Requires `gh` authenticated with repo read access.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { parseLegacyArbiterComment } from "./lib/harvest-parse.mjs";

const dryRun = process.argv.includes("--dry-run");
const wantDigest = process.argv.includes("--digest");
const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "governance", "arbiter");
const MARKER = "<!-- aletheia-arbiter -->";
const DATA_RE = /<!-- aletheia-arbiter-data (\{[\s\S]*?\}) -->/;

const gh = (...args) =>
  execFileSync("gh", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });

const repo = gh("repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner").trim();
const today = new Date().toISOString().slice(0, 10);

const prs = JSON.parse(
  gh(
    "api",
    `repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=50`,
  ),
);

fs.mkdirSync(OUT_DIR, { recursive: true });
const harvested = [];
const skipped = [];

for (const pr of prs) {
  const file = path.join(OUT_DIR, `pr-${pr.number}.yaml`);
  if (fs.existsSync(file)) continue; // append-only; already harvested
  const comments = JSON.parse(
    gh("api", `repos/${repo}/issues/${pr.number}/comments?per_page=100`),
  );
  const sticky = comments.find((c) => c.body?.startsWith(MARKER));
  if (!sticky) continue; // pre-arbiter PR, or low-risk (never judged)
  const m = sticky.body.match(DATA_RE);
  let data = null;
  if (m) {
    try {
      data = JSON.parse(m[1]);
    } catch (err) {
      skipped.push(`#${pr.number}: machine blob unparsable (${err.message}) — not harvested`);
      continue;
    }
  } else {
    // Pre-blob arbiter version: reconstruct from the markdown itself.
    data = parseLegacyArbiterComment(sticky.body);
    if (!data) {
      skipped.push(`#${pr.number}: no machine blob and legacy parse failed — not harvested`);
      continue;
    }
  }
  const record = {
    pr: pr.number,
    title: pr.title,
    url: pr.html_url,
    verdict: data.verdict,
    reason: data.reason,
    outcome: pr.merged_at ? "merged" : "closed",
    outcomeAt: (pr.merged_at ?? pr.closed_at ?? "").slice(0, 10),
    judgedAgainst: data.judgedAgainst,
    promptVersion: data.promptVersion,
    seats: data.seats,
    harvestedAt: today,
  };
  if (dryRun) {
    console.error(`(dry run) would write ${path.relative(ROOT, file)} (${record.verdict}/${record.outcome})`);
  } else {
    fs.writeFileSync(
      file,
      "# Harvested arbiter verdict — verbatim machine record of the public PR\n" +
        "# comment; append-only. See scripts/harvest-governance.mjs.\n" +
        stringifyYaml(record),
    );
  }
  harvested.push(record);
}

for (const s of skipped) console.error(`skip: ${s}`);
console.error(`harvested ${harvested.length} verdict(s)`);

if (wantDigest) {
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const all = fs
    .readdirSync(OUT_DIR)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => fs.readFileSync(path.join(OUT_DIR, f), "utf8"));
  // Recent settled PRs, from the records themselves (parse minimally).
  const { parse } = await import("yaml");
  const recent = all
    .map((t) => parse(t))
    .filter((r) => r.outcomeAt >= weekAgo)
    .sort((a, b) => b.outcomeAt.localeCompare(a.outcomeAt));
  const open = JSON.parse(
    gh("api", `repos/${repo}/pulls?state=open&per_page=50`),
  );
  const digest = [
    `# Aletheia weekly digest — ${today}`,
    "",
    "The observer's summary (docs/MAINTENANCE.md). Nothing here needs action;",
    "the kill switch is `git revert`, and the constitution is yours to amend.",
    "",
    `## Settled this week (${recent.length})`,
    "",
    ...(recent.length
      ? recent.map(
          (r) =>
            `- **#${r.pr}** ${r.title} — panel said **${r.verdict.toUpperCase()}**, PR was **${r.outcome}** (${r.outcomeAt})${r.verdict === "park" && r.outcome === "merged" ? " ⚠️ merged against a parked verdict" : ""}`,
        )
      : ["- nothing settled this week"]),
    "",
    `## Open right now (${open.length})`,
    "",
    ...(open.length
      ? open.map((p) => `- #${p.number} ${p.title}`)
      : ["- none"]),
    "",
    "Standings, dissents, and every seat's reasoning: see /panel on the site.",
  ].join("\n");
  fs.writeFileSync(path.join(ROOT, "weekly-digest.md"), digest);
  console.error("wrote weekly-digest.md");
}
