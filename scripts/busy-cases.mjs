#!/usr/bin/env node
/**
 * Cases with a sitting still open: the branch of every open pull request,
 * read for the cases its run records name. Prints
 * `slug=branch,slug=branch` for `aletheia next --busy`, or nothing. The
 * chain workflow runs it before choosing (2026-09-11: a parked sitting's
 * work is not on main, and the scheduler would have paid for the same
 * research pass again the next week).
 *
 * Any open pull request may hold a sitting, whatever its branch is called.
 * Until 2026-09-30 only `chain/*` branches were read, which are the
 * workflow's own; a sitting the operator ran by hand sat on a branch of
 * another name, and when the gate parked one (#452, a blind check of Cast,
 * Not Carved) the scheduler's next choice was the same check again. Without
 * `gh` the pull requests cannot be listed, and the unmerged `chain/*`
 * branches are read as before.
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
// git thinks of its commits. With `gh`, the open pull requests' own branches are what is read, of any name (a fork's
// branch is not on this remote and is left out). Without `gh` (or a token) every unmerged, recent chain/* branch
// counts — the safe side.
try {
  const open = JSON.parse(execFileSync("gh", ["pr", "list", "--state", "open", "--json", "headRefName", "--limit", "100"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }))
    .map((p) => `origin/${p.headRefName}`);
  branches = [...new Set(open)].filter((ref) => {
    try {
      git("rev-parse", "--verify", "--quiet", ref);
      return true;
    } catch {
      return false;
    }
  });
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
