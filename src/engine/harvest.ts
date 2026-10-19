import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { ReviewRecordSchema, reviewsDir, type ReviewRecord } from "../domain/governance.ts";
import { spendRunFile } from "../domain/spend.ts";
import { blobFromComment, REVIEW_MARKER } from "./review.ts";

/**
 * The harvest: after a change has closed, its review rounds are copied from
 * the pull request's comments into governance/reviews/pr-<n>.yaml — so the
 * site shows how every change was judged, and the operator's next session
 * reads the reviewers' notes from the repository — and what each round cost
 * is written to the spend ledger (the gate is not under the caps; it is on
 * the bill). Only comments the review workflow posted count: a comment
 * anyone could write must not become a reviewer's word.
 */

export const REVIEW_LOGIN = "github-actions[bot]";

export interface PullRequest {
  number: number;
  title: string;
  url: string;
  mergedAt: string | null;
  closedAt: string | null;
}

export interface Gh {
  closedPulls: () => PullRequest[];
  comments: (pr: number) => { author: string; body: string; createdAt: string }[];
  files: (pr: number) => string[];
}

const ghJson = (args: string[]) => JSON.parse(execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));

export const ghCli: Gh = {
  closedPulls: () => ghJson(["pr", "list", "--state", "closed", "--limit", "100", "--json", "number,title,url,mergedAt,closedAt"]),
  comments: (pr) =>
    ghJson(["api", `repos/{owner}/{repo}/issues/${pr}/comments`, "--paginate", "--jq", "[.[] | {author: .user.login, body: .body, createdAt: .created_at}]"]),
  files: (pr) => ghJson(["pr", "view", String(pr), "--json", "files", "--jq", "[.files[].path]"]),
};

/** One closed pull request's review record, or null when the review workflow never judged it. */
export function reviewRecordOf(pr: PullRequest, gh: Gh, harvestedAt: string): ReviewRecord | null {
  const rounds = gh
    .comments(pr.number)
    .filter((c) => c.author === REVIEW_LOGIN && c.body.startsWith(REVIEW_MARKER))
    .map((c) => blobFromComment(c.body))
    .filter((b): b is NonNullable<typeof b> => b !== null);
  if (!rounds.length) return null;
  const cases = [...new Set(gh.files(pr.number).map((f) => /^content\/cases\/([^/]+)\//.exec(f)?.[1]).filter((d): d is string => Boolean(d)))];
  return ReviewRecordSchema.parse({
    pr: pr.number,
    title: pr.title,
    url: pr.url,
    outcome: pr.mergedAt ? "merged" : "closed",
    outcomeAt: pr.mergedAt ?? pr.closedAt ?? harvestedAt,
    cases,
    rounds: rounds.map((r) => ({ commit: r.commit, date: r.date, protocol: r.protocol, outcome: r.outcome, reason: r.reason, seats: r.seats })),
    harvestedAt,
  });
}

/** The spend rows a review record carries: one per reviewer per round that reported its usage. */
export function reviewSpendRows(record: ReviewRecord) {
  return record.rounds.flatMap((round, i) =>
    round.seats
      .filter((s) => s.cost)
      .map((s) => ({
        date: round.date,
        runId: `review-pr-${record.pr}-${i + 1}`,
        verb: "review",
        case: record.cases.length === 1 ? record.cases[0] : "site",
        model: s.model,
        calls: 1,
        inputTokens: s.cost!.inputTokens,
        outputTokens: s.cost!.outputTokens,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        usd: s.cost!.usd,
      })),
  );
}

/** Harvest every closed pull request not yet on record; returns the files written. */
export function harvest(opts: { root?: string; gh?: Gh; now?: Date } = {}): string[] {
  const root = opts.root ?? process.cwd();
  const gh = opts.gh ?? ghCli;
  const at = (opts.now ?? new Date()).toISOString();
  const dir = reviewsDir(root);
  const written: string[] = [];
  for (const pr of gh.closedPulls()) {
    const file = path.join(dir, `pr-${pr.number}.yaml`);
    if (fs.existsSync(file)) continue;
    const record = reviewRecordOf(pr, gh, at);
    if (!record) continue;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, `# Review of #${pr.number}, harvested from its pull request (src/engine/harvest.ts). Append-only.\n` + stringifyYaml(record, { lineWidth: 0 }));
    written.push(path.relative(root, file));
    const rows = reviewSpendRows(record);
    if (rows.length) {
      const spend = spendRunFile(`review-pr-${pr.number}`, root);
      fs.mkdirSync(path.dirname(spend), { recursive: true });
      fs.writeFileSync(spend, `# What the review of #${pr.number} cost, from the reviewers' own usage (src/engine/harvest.ts).\n` + stringifyYaml(rows, { lineWidth: 0 }));
      written.push(path.relative(root, spend));
    }
  }
  return written;
}
