#!/usr/bin/env node
/**
 * The last step of the Chain workflow when the job failed: say so in an
 * issue (docs/MAINTENANCE.md, "When something looks wrong"). One issue is
 * open at a time — a failure while one is open is a comment on it, so a loop
 * that fails every week does not bury its own notice. Opened with the
 * workflow's own token: GitHub sends no notification for what a person's
 * own token does.
 *
 * Reads the step outcomes from the environment (TOKEN_STEP, CHAIN_STEP,
 * PR_STEP, RUN_URL) and the founder's login from config/founder.yaml. Never
 * fails the job further: a notice that cannot be posted is a warning.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { parse as parseYaml } from "yaml";
import { FAILED_SITTING_TITLE, failedSittingNotice } from "../src/lib/failed-sitting.mjs";

const gh = (...args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

try {
  const founder = parseYaml(fs.readFileSync("config/founder.yaml", "utf8"));
  let branch = null;
  try {
    // The PR step names its branch chain/<date>-<run id>; if it was pushed, the notice can name it.
    const refs = execFileSync("git", ["ls-remote", "--heads", "origin", `chain/*-${process.env.GITHUB_RUN_ID}`], { encoding: "utf8" });
    branch = refs.split("\n").map((l) => l.split("\t")[1]).filter(Boolean).map((r) => r.replace("refs/heads/", ""))[0] ?? null;
  } catch {
    // no remote view: the notice says no branch was found
  }
  const { title, body } = failedSittingNotice({
    runUrl: process.env.RUN_URL ?? "(run URL not given)",
    date: new Date().toISOString().slice(0, 10),
    steps: { token: process.env.TOKEN_STEP || undefined, chain: process.env.CHAIN_STEP || undefined, pr: process.env.PR_STEP || undefined },
    branch,
    founderLogin: founder?.githubLogin ?? null,
  });
  const open = JSON.parse(gh("issue", "list", "--state", "open", "--search", `"${FAILED_SITTING_TITLE}" in:title`, "--json", "number,title"))
    .filter((i) => i.title.startsWith(FAILED_SITTING_TITLE));
  if (open.length) {
    gh("issue", "comment", String(open[0].number), "--body", `It failed again.\n\n${body}`);
    console.log(`commented on #${open[0].number}`);
  } else {
    console.log(gh("issue", "create", "--title", title, "--body", body));
  }
} catch (e) {
  console.log(`::warning::the failed sitting could not be reported in an issue: ${e.message}`);
}
