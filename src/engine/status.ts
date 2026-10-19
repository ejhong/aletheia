import fs from "node:fs";
import path from "node:path";
import { capsFor, loadBudget } from "../domain/budget.ts";
import { adoptedAssessment, caseQuestion, currentEdition } from "../domain/editions.ts";
import { loadReviewRecords, type ReviewRecord } from "../domain/governance.ts";
import { latestByKey } from "../domain/intake.ts";
import { liveClaims, liveEvidence, loadAllCases } from "../domain/load.ts";
import { readRuns } from "../domain/runs.ts";
import { researchStatus, type LoadedCase } from "../domain/schema.ts";
import { readSpend, spentOn } from "../domain/spend.ts";
import { checksStale, crossModelSummary, ratification } from "../domain/standing.ts";

/**
 * Where everything stands, for the operator's planning and for the founder:
 * each case's standing and freshness, what the reviewers last asked of it,
 * what waits in its inbox, and the money left. Derived from the files; the
 * operator reads it at the start of a session to choose what most needs doing
 * (operator/charter.md), and `site status` prints it.
 */

export interface CaseStatus {
  slug: string;
  dir: string;
  title: string;
  question: string;
  standing: string;
  /** Days since the current edition. */
  editionAgeDays: number;
  editionDate: string;
  /** Days since the last session or pipeline run that worked on the case; null when none has. */
  lastWorkedDays: number | null;
  checksStale: boolean;
  claims: number;
  evidence: number;
  provisional: number;
  sources: number;
  openResearch: number;
  /** Claims the panel splits on: where the seats part, which is where the next research begins. */
  splitClaims: string[];
  inbox: number;
  /** The reviewers' notes from the latest review of a change to this case. */
  notes: { pr: number; seat: string; note: string }[];
}

export interface BudgetState {
  phase: string;
  today: string;
  spentToday: number;
  spentMonth: number;
  perDay: number;
  perMonth: number;
  perSession: number;
  /** What one session may spend now: the session cap, or what the day and the month leave, whichever is least. */
  sessionCap: number;
}

const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

function inboxCount(dir: string, root: string): number {
  const inbox = path.join(root, "inbox", dir);
  if (!fs.existsSync(inbox)) return 0;
  let n = 0;
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      if (e.isDirectory()) {
        if (e.name !== "processed") walk(path.join(d, e.name));
      } else if (e.name !== "README.md") n++;
    }
  };
  walk(inbox);
  return n;
}

export function caseStatus(c: LoadedCase, opts: { today: string; reviews: ReviewRecord[]; root: string }): CaseStatus {
  const edition = currentEdition(c);
  const standing = ratification(c);
  const adopted = adoptedAssessment(c);
  const lastRun = readRuns(opts.root)
    .filter((r) => r.case === c.record.slug || r.case === c.dir)
    .at(-1);
  const review = opts.reviews.find((r) => r.cases.includes(c.dir));
  const lastRound = review?.rounds.at(-1);
  const summary = adopted ? crossModelSummary(c) : null;
  return {
    slug: c.record.slug,
    dir: c.dir,
    title: c.record.title,
    question: caseQuestion(c),
    standing: standing ? `${standing.status}${standing.panel ? ` (${standing.agreeing} of ${standing.panel})` : ""}` : "no judgment yet",
    editionAgeDays: days(edition.date, opts.today),
    editionDate: edition.date,
    lastWorkedDays: lastRun ? days(lastRun.date, opts.today) : null,
    checksStale: adopted ? checksStale(c) : false,
    claims: liveClaims(c).length,
    evidence: liveEvidence(c).filter((e) => e.reviewState !== "provisional").length,
    provisional: c.evidence.filter((e) => e.reviewState === "provisional").length + c.claims.filter((k) => k.reviewState === "provisional").length,
    sources: c.sources.length,
    openResearch: c.research.filter((r) => researchStatus(r) === "open").length,
    splitClaims: summary?.splitClaimIds ?? [],
    inbox: inboxCount(c.dir, opts.root),
    notes: (lastRound?.seats ?? []).flatMap((s) => (s.notes ?? []).map((note) => ({ pr: review!.pr, seat: s.label, note }))),
  };
}

export function budgetState(root = process.cwd(), today = new Date().toISOString().slice(0, 10)): BudgetState {
  const budget = loadBudget(root);
  const caps = capsFor(budget, today);
  const rows = readSpend(root);
  const spentToday = spentOn(rows, today).usd;
  const spentMonth = spentOn(rows, today.slice(0, 7)).usd;
  const perSession = budget.usd.perSession;
  const sessionCap = Math.max(0, Math.min(perSession, caps.perDay - spentToday, caps.perMonth - spentMonth));
  return { phase: caps.phase, today, spentToday, spentMonth, perDay: caps.perDay, perMonth: caps.perMonth, perSession, sessionCap: Number(sessionCap.toFixed(2)) };
}

export function siteStatus(root = process.cwd(), today = new Date().toISOString().slice(0, 10)) {
  const reviews = loadReviewRecords(root);
  return {
    budget: budgetState(root, today),
    cases: loadAllCases().map((c) => caseStatus(c, { today, reviews, root })),
    // Dispositions declined most recently, so the operator does not propose again what was set aside without saying what changed.
    declined: loadAllCases().map((c) => ({ dir: c.dir, declined: [...latestByKey(c.dispositions).values()].filter((d) => d.disposition !== "in").length })),
  };
}

/** The status as the operator and the founder read it: one block per case, most in need of work first. */
export function formatStatus(s: ReturnType<typeof siteStatus>): string {
  const b = s.budget;
  const lines = [
    `Budget (${b.phase}): $${b.spentToday.toFixed(2)} of $${b.perDay} today, $${b.spentMonth.toFixed(2)} of $${b.perMonth} this month; a session may spend $${b.sessionCap.toFixed(2)} now.`,
    "",
  ];
  const order = [...s.cases].sort((a, b2) => (b2.lastWorkedDays ?? 999) - (a.lastWorkedDays ?? 999));
  for (const c of order) {
    lines.push(`${c.slug} — ${c.title}`);
    lines.push(`  question: ${c.question}`);
    lines.push(`  standing: ${c.standing}${c.checksStale ? "; the panel has not judged the ledger as it stands" : ""}; edition ${c.editionDate} (${c.editionAgeDays} days); last worked ${c.lastWorkedDays === null ? "never" : `${c.lastWorkedDays} days ago`}`);
    lines.push(`  ledger: ${c.claims} claims, ${c.evidence} evidence (${c.provisional} provisional), ${c.sources} sources, ${c.openResearch} open research items${c.inbox ? `; INBOX: ${c.inbox} item(s) waiting` : ""}`);
    if (c.splitClaims.length) lines.push(`  the panel splits on: ${c.splitClaims.join(", ")}`);
    for (const n of c.notes.slice(0, 6)) lines.push(`  note (#${n.pr}, ${n.seat}): ${n.note}`);
    lines.push("");
  }
  return lines.join("\n");
}
