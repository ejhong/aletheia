#!/usr/bin/env node
/**
 * Cases with a sitting still open: every unmerged `chain/*` branch on the
 * remote, read for the cases its run records name. Prints
 * `slug=chain/branch,slug=chain/branch` for `aletheia next --busy`, or
 * nothing. The chain workflow runs it before choosing (2026-09-11: a
 * parked sitting's work is not on main, and the scheduler would have paid
 * for the same research pass again the next week).
 *
 * Needs the remote branches fetched (actions/checkout with fetch-depth 0
 * fetches refs/heads/*; locally, `git fetch origin`).
 */
import { execFileSync } from "node:child_process";

const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
// A branch nobody has touched for two weeks is abandoned, not open: its case is free again.
const STALE_DAYS = 14;

let branches = [];
try {
  branches = git("branch", "-r", "--no-merged", "origin/main", "--list", "origin/chain/*")
    .split("\n")
    .map((b) => b.trim().replace(/^\*?\s*/, ""))
    .filter(Boolean);
} catch {
  process.exit(0); // no remote, no branches: nothing is busy
}
// An open sitting is one with an open pull request; a branch whose PR was closed or merged is not busy, whatever
// git thinks of its commits. Without `gh` (or a token) every unmerged, recent branch counts — the safe side.
try {
  const open = JSON.parse(execFileSync("gh", ["pr", "list", "--state", "open", "--json", "headRefName", "--limit", "100"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }))
    .map((p) => p.headRefName);
  branches = branches.filter((ref) => open.includes(ref.replace(/^origin\//, "")));
} catch {
  // gh unavailable: keep the git view
}
const busy = new Map();
for (const ref of branches) {
  try {
    const tip = Number(git("log", "-1", "--format=%ct", ref)) * 1000;
    if (Date.now() - tip > STALE_DAYS * 86400000) continue;
  } catch {
    continue;
  }
  let files = [];
  try {
    files = git("ls-tree", "-r", "--name-only", ref, "--", "proposals").split("\n").filter((f) => /^proposals\/[^/]+\/run\.yaml$/.test(f));
  } catch {
    continue;
  }
  for (const f of files) {
    // A squash merge leaves the branch "unmerged" in git's eyes: the test is whether main already holds this run record.
    try {
      git("cat-file", "-e", `origin/main:${f}`);
      continue; // on main already — that sitting landed
    } catch {
      // not on main: the sitting is still open
    }
    let text = "";
    try {
      text = git("show", `${ref}:${f}`);
    } catch {
      continue;
    }
    const m = text.match(/^case:\s*(.+)$/m);
    if (m) {
      const slug = m[1].trim().replace(/^["']|["']$/g, "");
      if (slug && slug !== "null" && !busy.has(slug)) busy.set(slug, ref.replace(/^origin\//, ""));
    }
  }
}
process.stdout.write([...busy].map(([slug, ref]) => `${slug}=${ref}`).join(","));
