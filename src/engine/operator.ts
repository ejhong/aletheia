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
 * and no change is argued forever. A change whose latest commit has gone
 * unreviewed for STALL_HOURS is reopened, so that its review runs again (a
 * review that never started — GitHub's brownouts of 2026-11-09 and 11-16 —
 * once left changes waiting for good). Otherwise the session is new work, and
 * the operator chooses it (operator/charter.md), told what of its own still
 * waits so it does not open a second change on the same work.
 */

export const OPERATOR_BRANCH = /^operator\//;
/** Rounds a change may have before it is withdrawn: the first review and two answers. */
export const MAX_ROUNDS = 3;
/** Hours a change's latest commit may go unreviewed before its review is started again; a review takes minutes. */
export const STALL_HOURS = 12;

export interface OpenChange {
  number: number;
  title: string;
  branch: string;
  head: string;
  draft: boolean;
  /** The later of its head commit's time and its last activity (a reopen, a comment): the stall clock's start. */
  since: string;
  rounds: ReviewBlob[];
}

export interface Waiting {
  number: number;
  title: string;
  why: string;
}

export type Plan =
  | { mode: "answer"; change: OpenChange; withdraw: OpenChange[]; restart: OpenChange[] }
  | { mode: "new"; withdraw: OpenChange[]; restart: OpenChange[]; waiting: Waiting[] };

/** The session's mode, from the operator's open changes and their review rounds. Pure. */
export function planSession(changes: OpenChange[], now: number = Date.now()): Plan {
  const mine = changes.filter((c) => OPERATOR_BRANCH.test(c.branch) && !c.draft).sort((a, b) => a.number - b.number);
  const withdraw: OpenChange[] = [];
  const restart: OpenChange[] = [];
  const waiting: Waiting[] = [];
  const wait = (c: OpenChange, why: string) => waiting.push({ number: c.number, title: c.title, why });
  let answer: OpenChange | null = null;
  for (const c of mine) {
    const last = c.rounds.at(-1);
    if (!last || last.commit !== c.head) {
      const stalled = now - Date.parse(c.since) > STALL_HOURS * 3_600_000;
      if (stalled) restart.push(c);
      wait(c, stalled ? `its latest commit went ${STALL_HOURS} hours without a review; reopened so the review runs again` : last ? "its latest commit is not yet reviewed" : "not yet reviewed");
    } else if (last.outcome === "publish") wait(c, "judged better; merging");
    else if (last.outcome === "undecided") wait(c, "too few reviewers answered; the review is to be run again");
    else if (c.rounds.length >= MAX_ROUNDS) withdraw.push(c);
    else if (!answer) answer = c;
  }
  return answer ? { mode: "answer", change: answer, withdraw, restart } : { mode: "new", withdraw, restart, waiting };
}

/** What the session is told of its own changes still waiting, so that it does not open a second change on their work. */
export function waitingForOperator(waiting: Waiting[]): string {
  if (!waiting.length) return "";
  return [
    "Your changes still open, each waiting on the review or the merge — their work is in hand, so do not open a second change on the same case's same claims:",
    ...waiting.map((w) => `- #${w.number} "${w.title}": ${w.why}.`),
  ].join("\n");
}

/** What answers a quote check's failure, said to the operator beside the failures (operator/charter.md, "Answering a review"). */
const QUOTE_ANSWERS = [
  "Each failure is answered in the records, never by a reply:",
  "- the passage copied exactly from the text the check reads (`node scripts/site.ts read <the record's URL> --fresh --find \"words\"`);",
  "- or the source pointed at the text the passage was quoted from (its URL, when a DOI's page shows only the abstract);",
  "- or a Wayback capture of the source's own URL named as its `archivedUrl` (`node scripts/site.ts archive <url>`), which the check reads when the live page is unreadable or lacks the passage;",
  "- or the record entered as `provisional`, with the route to its text.",
  "Run `node scripts/site.ts check-quotes --fresh` before you finish: it reads every source again, as the review's machine will.",
].join("\n");

/** The review rounds of a change, as the operator reads them when it answers. */
export function roundsForOperator(c: OpenChange): string {
  return c.rounds
    .map((r, i) => {
      if (r.checks?.length) return `### Round ${i + 1} (commit ${r.commit.slice(0, 10)}, ${r.date}): ${r.outcome} — ${r.reason}\n\n${r.checks.map((x) => `- ${x}`).join("\n")}\n\n${QUOTE_ANSWERS}`;
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
  const prs = gh(["pr", "list", "--state", "open", "--limit", "100", "--json", "number,title,headRefName,headRefOid,isDraft,updatedAt"]) as {
    number: number;
    title: string;
    headRefName: string;
    headRefOid: string;
    isDraft: boolean;
    updatedAt: string;
  }[];
  return prs.map((p) => {
    const comments = gh(["api", `repos/{owner}/{repo}/issues/${p.number}/comments`, "--paginate", "--jq", "[.[] | {author: .user.login, body: .body}]"]) as { author: string; body: string }[];
    const rounds = comments.filter((c) => c.author === REVIEW_LOGIN).map((c) => blobFromComment(c.body)).filter((b): b is ReviewBlob => b !== null);
    const committed = gh(["api", `repos/{owner}/{repo}/commits/${p.headRefOid}`, "--jq", "{date: .commit.committer.date}"]) as { date: string };
    const since = [p.updatedAt, committed.date].sort().at(-1)!;
    return { number: p.number, title: p.title, branch: p.headRefName, head: p.headRefOid, draft: p.isDraft, since, rounds };
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
