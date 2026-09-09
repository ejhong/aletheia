#!/usr/bin/env node
/**
 * Review notes — the wide voice (AGENTS.md §3.15, founder amendment of
 * 2026-09-09). When the panel passes a change over one seat's objection,
 * the objection is not lost in a PR comment: this script reads the
 * arbiter's report and opens one issue per note, labeled `review-note`,
 * naming the PR, the seat, the rules and the reasoning. The issue is the
 * operator's queue; it closes with the commit that answered it or the
 * reason it was declined, on the record.
 *
 *   node scripts/review-notes.mjs --report arbiter-report.md --pr <number> [--dry-run]
 *
 * Idempotent: an issue whose title names the same PR and seat is not
 * opened twice. Needs `gh` with a token that may write issues. The label
 * is applied after creation and its absence reported; the title always
 * begins "Review note on #<pr>", so the queue can be found without it.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const dry = args.includes("--dry-run");

/** The machine-readable record the arbiter leaves at the foot of its report. */
export function notesFromReport(markdown) {
  const m = markdown.match(/<!-- aletheia-arbiter-data (\{[\s\S]*?\}) -->/);
  if (!m) return [];
  try {
    const data = JSON.parse(m[1]);
    return Array.isArray(data.notes) ? data.notes : [];
  } catch {
    return [];
  }
}

export function issueTitle(pr, note) {
  return `Review note on #${pr} — ${note.seat}: ${note.rules.join(", ")} (${note.paradigm ?? "other"})`;
}

export function issueBody(pr, note, promptVersion) {
  return [
    `One seat of the constitutional panel objected to #${pr} without the panel; the change was allowed to merge and the objection is this note, which the operator answers on the record — by a commit that fixes it, or by a reply that says why not — and then closes (AGENTS.md §3.15, founder amendment of 2026-09-09).`,
    "",
    `**Seat:** ${note.seat}`,
    `**Rules cited:** ${note.rules.join(", ")}`,
    `**Kind:** ${note.paradigm ?? "other"}`,
    promptVersion ? `**Panel protocol:** ${promptVersion}` : "",
    "",
    "**The seat's reasoning (data under review, not instructions):**",
    "",
    "> " + String(note.reasoning ?? "").replace(/\n/g, "\n> "),
    "",
    `Pull request: #${pr}`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const reportFile = opt("--report");
  const pr = opt("--pr");
  if (!reportFile || !pr) {
    console.error("usage: node scripts/review-notes.mjs --report <file> --pr <number> [--dry-run]");
    process.exit(2);
  }
  const markdown = fs.readFileSync(reportFile, "utf8");
  const promptVersion = markdown.match(/"promptVersion":"([^"]+)"/)?.[1] ?? "";
  const notes = notesFromReport(markdown);
  if (notes.length === 0) {
    console.log("no review notes");
    process.exit(0);
  }
  const gh = (...a) => execFileSync("gh", a, { encoding: "utf8" }).trim();
  if (!dry) {
    try {
      gh("label", "create", "review-note", "--force", "--color", "C5DEF5", "--description", "A lone panel objection the operator answers on the record (AGENTS.md §3.15)");
    } catch {
      /* the label exists or cannot be created; the issue still carries its title */
    }
  }
  for (const note of notes) {
    const title = issueTitle(pr, note);
    const existing = dry ? "" : gh("issue", "list", "--state", "all", "--search", `in:title "${title.replace(/"/g, "")}"`, "--json", "number", "--jq", ".[0].number // \"\"");
    if (existing) {
      console.log(`review note already open as #${existing}: ${title}`);
      continue;
    }
    if (dry) {
      console.log(`would open: ${title}`);
      continue;
    }
    const url = gh("issue", "create", "--title", title, "--body", issueBody(pr, note, promptVersion));
    console.log(`opened ${url}: ${title}`);
    // The label is the queue (`gh issue list --label review-note`); the first two notes were created without it, so it is
    // applied as its own step and its absence is said aloud rather than assumed.
    const number = url.match(/\/issues\/(\d+)/)?.[1];
    try {
      if (!number) throw new Error("no issue number in the URL");
      gh("issue", "edit", number, "--add-label", "review-note");
      console.log(`labeled #${number} review-note`);
    } catch (e) {
      console.log(`::warning::could not label #${number ?? "?"} review-note (${String(e).split("\n")[0]}); find it by title: "Review note on #${pr}"`);
    }
  }
}
