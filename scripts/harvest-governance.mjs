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
import { parseLegacyArbiterComment, parseReviewNoteTitle } from "../src/lib/harvest-parse.mjs";

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
    ...(data.cost ? { cost: data.cost } : {}),
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

// Review notes: the lone objections a change merged over, each an issue the operator answers (AGENTS.md §3.15,
// amendment of 2026-09-09). Mirrored into governance/review-notes/<n>.yaml at their current state — an open note is
// the queue, a closed one the answer — so the operations page can show them without asking GitHub at build time.
const NOTES_DIR = path.join(ROOT, "governance", "review-notes");
let notes = [];
try {
  notes = JSON.parse(gh("api", `repos/${repo}/issues?labels=review-note&state=all&per_page=100`)).filter((i) => !i.pull_request);
} catch (err) {
  console.error(`review notes not harvested: ${String(err).split("\n")[0]}`);
}
let noted = 0;
for (const issue of notes) {
  const parsed = parseReviewNoteTitle(issue.title);
  const record = {
    number: issue.number,
    title: issue.title,
    url: issue.html_url,
    state: issue.state === "closed" ? "closed" : "open",
    pr: parsed?.pr ?? null,
    seat: parsed?.seat ?? null,
    rules: parsed?.rules ?? [],
    paradigm: parsed?.paradigm ?? null,
    createdAt: (issue.created_at ?? "").slice(0, 10),
    closedAt: issue.closed_at ? issue.closed_at.slice(0, 10) : null,
    harvestedAt: today,
  };
  const file = path.join(NOTES_DIR, `${issue.number}.yaml`);
  const text =
    "# Harvested review note — the issue's state at harvest; closing the issue is the answer.\n" +
    "# See scripts/harvest-governance.mjs and docs/MAINTENANCE.md, \"Review notes\".\n" +
    stringifyYaml(record);
  if (dryRun) {
    console.error(`(dry run) would write ${path.relative(ROOT, file)} (${record.state})`);
  } else {
    fs.mkdirSync(NOTES_DIR, { recursive: true });
    const before = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
    // Unchanged notes are left alone, so a sitting's PR carries only what moved.
    if (before !== null && before.replace(/harvestedAt: .*/, "") === text.replace(/harvestedAt: .*/, "")) continue;
    fs.writeFileSync(file, text);
  }
  noted++;
}
console.error(`harvested ${noted} review note(s) (of ${notes.length})`);

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
  // Anti-file-drawer backstop: a pre-registered study whose collection has
  // been pending for more than 30 days is listed until it publishes or is
  // superseded — a frozen protocol must not quietly age out.
  const staleCutoff = new Date(Date.now() - 30 * 86400000)
    .toISOString()
    .slice(0, 10);
  const pendingStudies = [];
  const casesDir = path.join(ROOT, "content", "cases");
  for (const dir of fs.existsSync(casesDir) ? fs.readdirSync(casesDir) : []) {
    const sdir = path.join(casesDir, dir, "studies");
    if (!fs.existsSync(sdir)) continue;
    for (const f of fs.readdirSync(sdir).filter((f) => f.endsWith(".yaml"))) {
      const s = parse(fs.readFileSync(path.join(sdir, f), "utf8"));
      if ((s.rows ?? []).length === 0 && s.criteria?.frozenOn <= staleCutoff)
        pendingStudies.push(
          `- **${s.id}** (${dir}) — pre-registered ${s.criteria.frozenOn}, collection still pending`,
        );
    }
  }
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
    ...(pendingStudies.length
      ? ["", "## Pre-registered studies pending more than 30 days", "", ...pendingStudies]
      : []),
    "",
    "Standings, dissents, and every seat's reasoning: see /panel on the site.",
  ].join("\n");
  fs.writeFileSync(path.join(ROOT, "weekly-digest.md"), digest);
  console.error("wrote weekly-digest.md");
}
