#!/usr/bin/env node
// Re-judge the PRs parked on the weekly content-merge budget once the window has room.
//
// The arbiter judges a PR only when it is pushed or reopened, so a PR parked on the budget
// alone — every seat content, every check green — would wait for a hand (2026-09-16: #303
// and #305 sat like that until the founder merged them). On a schedule: count the window;
// for each budget-parked open PR, oldest first, while there is room, re-run its last arbiter
// workflow run — the same judgment on the same commit, against today's window. The kill
// switch (governance/operation.yaml) holds here as everywhere.
//
//   node scripts/rejudge-parked.mjs [origin/main]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { parse } from "yaml";
import { CONTENT_MERGES_PER_WEEK, parkedOnBudget, pickForRejudge } from "../src/lib/arbiter-core.mjs";
import { mergeLanesOnBase } from "./gate-window.mjs";

const gh = (...args) => execFileSync("gh", args, { encoding: "utf8" });

const state = parse(fs.readFileSync("governance/operation.yaml", "utf8")).state;
if (state !== "live") {
  console.log(`governance/operation.yaml says ${state}; nothing re-judged`);
  process.exit(0);
}
const base = process.argv[2] ?? "origin/main";
const lanes = mergeLanesOnBase(base);
const room = CONTENT_MERGES_PER_WEEK - lanes.autonomous.length;
console.log(`window: ${lanes.autonomous.length}/${CONTENT_MERGES_PER_WEEK} autonomous content merges (${lanes.supervised.length} supervised excluded); room for ${Math.max(room, 0)}`);
if (room <= 0) process.exit(0);

const open = JSON.parse(gh("pr", "list", "--state", "open", "--json", "number,headRefName"));
const parked = [];
for (const pr of open) {
  const bodies = JSON.parse(gh("api", `repos/{owner}/{repo}/issues/${pr.number}/comments`, "--jq", 'map(select(.body | startswith("<!-- aletheia-arbiter -->"))) | map(.body)'));
  const latest = bodies.at(-1);
  if (latest && parkedOnBudget(latest)) parked.push(pr);
}
if (!parked.length) {
  console.log("no open PR is parked on the budget");
  process.exit(0);
}
for (const pr of pickForRejudge(parked, room)) {
  const runs = JSON.parse(gh("run", "list", "--workflow", "arbiter.yml", "--branch", pr.headRefName, "--limit", "1", "--json", "databaseId"));
  const id = runs[0]?.databaseId;
  if (!id) {
    console.log(`#${pr.number}: parked on the budget, but no arbiter run found to re-run`);
    continue;
  }
  gh("run", "rerun", String(id));
  console.log(`#${pr.number}: parked on the budget; arbiter run ${id} re-run against today's window`);
}
