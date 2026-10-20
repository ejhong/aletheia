import { execFileSync } from "node:child_process";
import { parse as parseYaml } from "yaml";
import { blobFromComment, isFounderFile, type ReviewBlob } from "./review.ts";
import { REVIEW_LOGIN } from "./harvest.ts";

/**
 * What a session is for, decided before the operator starts (the workflow's
 * step, .github/workflows/operator.yml). The operator's own changes come
 * first: one the reviewers held or sent back is answered before any new
 * work, and one answered twice without publishing is withdrawn — closed with
 * a comment, its attempt on the record — so that nothing waits on a person
 * and no change is argued forever. Otherwise the session is new work, and
 * the operator chooses it (operator/charter.md).
 */

export const OPERATOR_BRANCH = /^operator\//;
/** Rounds a change may have before it is withdrawn: the first review and two answers. */
export const MAX_ROUNDS = 3;

export interface OpenChange {
  number: number;
  title: string;
  branch: string;
  head: string;
  draft: boolean;
  rounds: ReviewBlob[];
}

export type Plan =
  | { mode: "answer"; change: OpenChange; withdraw: OpenChange[] }
  | { mode: "new"; withdraw: OpenChange[]; waiting: { number: number; why: string }[] };

/** The session's mode, from the operator's open changes and their review rounds. Pure. */
export function planSession(changes: OpenChange[]): Plan {
  const mine = changes.filter((c) => OPERATOR_BRANCH.test(c.branch) && !c.draft).sort((a, b) => a.number - b.number);
  const withdraw: OpenChange[] = [];
  const waiting: { number: number; why: string }[] = [];
  let answer: OpenChange | null = null;
  for (const c of mine) {
    const last = c.rounds.at(-1);
    if (!last) waiting.push({ number: c.number, why: "not yet reviewed" });
    else if (last.commit !== c.head) waiting.push({ number: c.number, why: "its latest commit is not yet reviewed" });
    else if (last.outcome === "publish") waiting.push({ number: c.number, why: "judged better; merging" });
    else if (last.outcome === "undecided") waiting.push({ number: c.number, why: "too few reviewers answered; the review is to be run again" });
    else if (c.rounds.length >= MAX_ROUNDS) withdraw.push(c);
    else if (!answer) answer = c;
  }
  return answer ? { mode: "answer", change: answer, withdraw } : { mode: "new", withdraw, waiting };
}

/** The review rounds of a change, as the operator reads them when it answers. */
export function roundsForOperator(c: OpenChange): string {
  return c.rounds
    .map((r, i) => {
      const seats = r.seats
        .map((s) => {
          if (!s.verdict) return `- ${s.label}: no answer (${s.failure ?? "no reply"})`;
          const harm = s.harm ? `\n  HARM (${s.harm.kind}) at ${s.harm.where}: ${s.harm.why}` : "";
          const notes = s.notes?.length ? `\n  notes:\n${s.notes.map((n) => `  - ${n}`).join("\n")}` : "";
          return `- ${s.label}: ${s.verdict.replace("_", " ")} — ${s.summary ?? ""}${harm}${notes}`;
        })
        .join("\n");
      return `### Round ${i + 1} (commit ${r.commit.slice(0, 10)}, ${r.date}): ${r.outcome} — ${r.reason}\n\n${seats}`;
    })
    .join("\n\n");
}

// ------------------------------------------------------------------ GitHub

const gh = (args: string[]) => JSON.parse(execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));

/** The repository's open changes with their review rounds, from GitHub. */
export function openChanges(): OpenChange[] {
  const prs = gh(["pr", "list", "--state", "open", "--limit", "100", "--json", "number,title,headRefName,headRefOid,isDraft"]) as {
    number: number;
    title: string;
    headRefName: string;
    headRefOid: string;
    isDraft: boolean;
  }[];
  return prs.map((p) => {
    const comments = gh(["api", `repos/{owner}/{repo}/issues/${p.number}/comments`, "--paginate", "--jq", "[.[] | {author: .user.login, body: .body}]"]) as { author: string; body: string }[];
    const rounds = comments.filter((c) => c.author === REVIEW_LOGIN).map((c) => blobFromComment(c.body)).filter((b): b is ReviewBlob => b !== null);
    return { number: p.number, title: p.title, branch: p.headRefName, head: p.headRefOid, draft: p.isDraft, rounds };
  });
}

/**
 * What a session's work may not contain, checked by main's code on a fresh machine before anything of it is
 * published (the workflow's publish job): the session's tree is the operator's to write, so everything in it is
 * data, and these are the files only the founder or the engine writes —
 *
 *  - the founder's files (FOUNDER_FILES: the constitution, the kill switch, the configuration, the workflows);
 *  - the money and the reviews (`governance/spend/`, `governance/reviews/`), which the workflow writes from what the
 *    session and the vendors report;
 *  - a blind check: the panel's, written by the workflow's panel from main's code, never by the session;
 *  - a record that says a human reviewed it, which no AI record may say;
 *  - an edit to or a removal of an assessment or an edition, which are append-only;
 *  - another session's run record, or the session's own run record or trace digest (`runs/<runId>/run.yaml`,
 *    `trace.yaml`), which the workflow writes from what Claude Code reports.
 *
 * A session whose work holds any of these publishes nothing: the guard says what, and the work waits for the founder.
 * Pure over the changed files and a reader of their new contents.
 */
export function guardSession(files: { status: string; file: string }[], read: (file: string) => string | null, run: string): string[] {
  const problems: string[] = [];
  for (const { status, file } of files) {
    if (isFounderFile(file)) problems.push(`${file}: a founder's file; the operator may not change it`);
    else if (/^governance\/(spend|reviews)\//.test(file)) problems.push(`${file}: written by the workflow from what the session and the vendors report, not by the session`);
    else if (/^(runs|proposals)\/([^/]+)\//.test(file) && !file.startsWith(`runs/${run}/`)) problems.push(`${file}: another run's record`);
    else if (file === `runs/${run}/run.yaml` || file === `runs/${run}/trace.yaml`) problems.push(`${file}: written by the workflow from what Claude Code reports, not by the session`);
    else if (/^content\/cases\/[^/]+\/(assessments|editions)\/[^/]+\.yaml$/.test(file)) {
      if (status !== "A") problems.push(`${file}: assessments and editions are append-only; a session adds them and never edits or removes one`);
      else {
        const record = (parseYaml(read(file) ?? "null") ?? {}) as { role?: string; humanReviewed?: boolean };
        if (record.role === "check") problems.push(`${file}: a blind check is the panel's, written by the workflow from main's code`);
        if (record.humanReviewed === true) problems.push(`${file}: says a human reviewed it; no AI record may`);
      }
    }
  }
  return problems;
}
