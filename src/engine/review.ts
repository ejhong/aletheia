import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { assessmentLabels, type AssessmentRun, type AssessmentState, type Edition } from "../domain/schema.ts";
import { MODELS } from "../lib/models.mjs";
import { callVendorDetailed, VENDORS } from "../lib/vendors.mjs";
import { loadProtocol, renderProtocol } from "./protocols.ts";
import { changedRecords } from "./quotecheck.ts";
import { loadTariffs, priceOf } from "./spend.ts";

/**
 * The review (AGENTS.md §3.15, founder amendment 2026-10-19). Every change is
 * read by the reviewers — the panel's seats from vendors other than the
 * operator's (config/models.yaml, `review.seats`) — each answering three
 * questions: does it leave the site better, no better, or worse for a reader
 * seeking the truth; would publishing it cause a harm that publication itself
 * causes; what would improve it (protocols/review-v1.md). The outcome is the
 * constitution's rule, applied here and nowhere else:
 *
 *  - publish: at least three reviewers answered, a majority judge it better,
 *    at most one judges it worse, and no harm is flagged;
 *  - hold: a reviewer flagged a harm — the change waits for the operator's
 *    answer, and the next round flags it again or not;
 *  - revise: not judged better — the notes say why; the operator may revise;
 *  - undecided: fewer than three reviewers answered — asked again later.
 *
 * An edit to AGENTS.md is held mechanically, without asking anyone: the
 * founder alone amends it, and merges it by hand. Notes never block. The
 * gate is not under the spending caps (it judges every change put to it);
 * its cost rides in its verdict, and the harvest writes it to the ledger.
 */

export const HARM_KINDS = ["fabrication", "misattribution", "confidential", "living_person", "draft_as_ratified", "constitution", "weakens_checks"] as const;

export const ReviewReplySchema = z.object({
  verdict: z.enum(["better", "no_better", "worse"]),
  harm: z.object({ kind: z.enum(HARM_KINDS), where: z.string().min(1), why: z.string().min(1) }).nullable(),
  notes: z.array(z.string().min(1)).max(3).default([]),
  summary: z.string().min(1),
});
export type ReviewReply = z.infer<typeof ReviewReplySchema>;

export interface SeatReview {
  seat: string;
  label: string;
  model: string;
  reply: ReviewReply | null;
  /** Why the seat has no reply: a failed call, or a reply that did not read as the contract. */
  failure?: string;
  cost?: { inputTokens: number; outputTokens: number; usd: number | null };
}

export type Outcome = "publish" | "hold" | "revise" | "undecided";

export interface Tally {
  outcome: Outcome;
  reason: string;
  answered: number;
  better: number;
  noBetter: number;
  worse: number;
  harms: { seat: string; kind: string; where: string; why: string }[];
}

export const MIN_REVIEWERS = 3;

/** The constitution's rule, over the seats' replies. Pure. */
export function tally(seats: Pick<SeatReview, "seat" | "label" | "reply">[], mechanical: { kind: string; where: string; why: string }[] = []): Tally {
  const replies = seats.filter((s) => s.reply);
  const n = (v: ReviewReply["verdict"]) => replies.filter((s) => s.reply!.verdict === v).length;
  const better = n("better");
  const worse = n("worse");
  const noBetter = n("no_better");
  const harms = [
    ...mechanical.map((h) => ({ seat: "the mechanical check", ...h })),
    ...replies.filter((s) => s.reply!.harm).map((s) => ({ seat: s.label, ...s.reply!.harm! })),
  ];
  const base = { answered: replies.length, better, noBetter, worse, harms };
  if (harms.length) return { ...base, outcome: "hold", reason: `held for ${harms.length === 1 ? "a harm" : `${harms.length} harms`} until answered: ${harms.map((h) => `${h.kind} (${h.seat})`).join("; ")}` };
  if (replies.length < MIN_REVIEWERS) return { ...base, outcome: "undecided", reason: `only ${replies.length} reviewer(s) answered; ${MIN_REVIEWERS} are needed` };
  if (better * 2 > replies.length && worse <= 1) return { ...base, outcome: "publish", reason: `${better} of ${replies.length} reviewers judge it better${worse ? `, ${worse} worse` : ""}; no harm flagged` };
  return { ...base, outcome: "revise", reason: `not judged better: ${better} better, ${noBetter} no better, ${worse} worse of ${replies.length}` };
}

/** A reviewer's reply as the contract wants it: JSON, possibly fenced or with prose around it. */
export function parseReviewReply(text: string): { reply: ReviewReply | null; problem?: string } {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return { reply: null, problem: "no JSON object in the reply" };
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    return { reply: null, problem: `the reply is not JSON: ${(e as Error).message}` };
  }
  const parsed = ReviewReplySchema.safeParse(raw);
  if (!parsed.success) return { reply: null, problem: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  return { reply: parsed.data };
}

// ------------------------------------------------------------------ packet

const git = (root: string, ...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 256 * 1024 * 1024 });
const atRef = (root: string, ref: string, file: string): string | null => {
  try {
    return git(root, "show", `${ref}:${file}`);
  } catch {
    return null;
  }
};
const clipText = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n)}\n[… ${(s.length - n).toLocaleString("en-US")} characters cut here to keep the packet readable]`);
const yamlList = (text: string | null): { id: string }[] => {
  const v = text ? parseYaml(text) : null;
  return Array.isArray(v) ? v : [];
};
const verdictWord = (s: AssessmentState | undefined) => (s ? assessmentLabels[s] : "—");

export interface ChangedFile {
  status: string;
  file: string;
}

export function changedFiles(root: string, base: string): ChangedFile[] {
  return git(root, "diff", "--name-status", `${base}...HEAD`)
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [status, ...rest] = line.split("\t");
      return { status: status[0], file: rest[rest.length - 1] };
    });
}

/** What a reader will see differently, case by case: the telling before and after, the verdicts that moved, the records added or changed. */
function caseSection(root: string, base: string, dir: string, files: ChangedFile[]): string {
  const rel = (f: string) => `content/cases/${dir}/${f}`;
  const out: string[] = [];
  const caseYaml = parseYaml(fs.readFileSync(path.join(root, rel("case.yaml")), "utf8")) as { title: string; subtitle: string };
  out.push(`## Case: ${caseYaml.title} (content/cases/${dir})`);
  const added = (prefix: string) => files.filter((f) => f.status === "A" && f.file.startsWith(rel(prefix)));
  const newEditions = added("editions/").map((f) => parseYaml(fs.readFileSync(path.join(root, f.file), "utf8")) as Edition);
  const newAssessments = added("assessments/").map((f) => parseYaml(fs.readFileSync(path.join(root, f.file), "utf8")) as AssessmentRun);
  const assessmentById = (runId: string, ref: string | null): AssessmentRun | null => {
    const f = rel(`assessments/${runId}.yaml`);
    const text = ref ? atRef(root, ref, f) : fs.existsSync(path.join(root, f)) ? fs.readFileSync(path.join(root, f), "utf8") : null;
    return text ? (parseYaml(text) as AssessmentRun) : null;
  };
  for (const ed of newEditions) {
    const prev = ed.previous ? (parseYaml(atRef(root, base, rel(`editions/${ed.previous}.yaml`)) ?? "null") as Edition | null) : null;
    out.push(`### New edition ${ed.runId} (replacing ${ed.previous ?? "nothing"})`);
    out.push(`Question: ${ed.question ?? "(unchanged)"}\nAccounts: ${(ed.accounts ?? []).map((a) => `\n- ${a}`).join("") || "(unchanged)"}\nFeatured claims: ${ed.featuredClaimIds.join(", ")}`);
    out.push(`Operator's rationale:\n${clipText(ed.rationale, 6000)}`);
    const now = ed.assessment ? assessmentById(ed.assessment.runId, null) : null;
    const was = prev?.assessment ? assessmentById(prev.assessment.runId, base) : null;
    if (now && was && now.runId !== was.runId) {
      const before = new Map(was.claimAssessments.map((c) => [c.claimId, c.verdict]));
      const moves = now.claimAssessments.filter((c) => before.get(c.claimId) !== c.verdict).map((c) => `- ${c.claimId}: ${verdictWord(before.get(c.claimId))} → ${verdictWord(c.verdict)} — ${c.reasoning}`);
      out.push(`Case verdict: ${verdictWord(was.caseAssessment.verdict)} → ${verdictWord(now.caseAssessment.verdict)}\nClaim verdicts that moved:\n${moves.join("\n") || "(none)"}`);
      out.push(`New synthesis:\n${now.caseAssessment.synthesis}\n\nSteelman the judgment does not answer:\n${now.caseAssessment.steelman ?? "(none)"}`);
    } else if (now) {
      out.push(`Judgment: re-adopts ${now.runId} (case verdict ${verdictWord(now.caseAssessment.verdict)}).`);
    }
    out.push(`THE ARTICLE AS READERS WILL SEE IT:\n\n${clipText(ed.article, 30000)}`);
    if (prev) out.push(`THE ARTICLE READERS SEE NOW (for comparison):\n\n${clipText(prev.article, 30000)}`);
  }
  for (const a of newAssessments.filter((a) => a.role === "check")) {
    out.push(`### Blind check ${a.runId} (${a.model}): case verdict ${verdictWord(a.caseAssessment.verdict)}`);
  }
  for (const [name, label] of [["claims.yaml", "Claims"], ["evidence.yaml", "Evidence"], ["sources.yaml", "Sources"], ["research.yaml", "Research agenda"]] as const) {
    if (!files.some((f) => f.file === rel(name))) continue;
    const before = yamlList(atRef(root, base, rel(name)));
    const after = yamlList(fs.existsSync(path.join(root, rel(name))) ? fs.readFileSync(path.join(root, rel(name)), "utf8") : null);
    const changed = changedRecords(before, after);
    if (!changed.length) continue;
    const isNew = new Set(changed.filter((r) => !before.some((b) => b.id === r.id)).map((r) => r.id));
    out.push(`### ${label}: ${changed.length} record(s) added or changed`);
    out.push(clipText(changed.map((r) => `${isNew.has(r.id) ? "NEW" : "CHANGED"} ${r.id}\n${JSON.stringify(r, null, 1)}`).join("\n\n"), 60000));
  }
  return out.join("\n\n");
}

export interface PacketInput {
  root: string;
  base: string;
  title: string;
  body: string;
  /** Earlier review rounds on this change, as their machine records hold them. */
  previous?: { commit: string; outcome: string; seats: { label: string; verdict?: string; harm?: unknown; notes?: string[] }[] }[];
}

export const PACKET_LIMIT = 320_000;

export function reviewPacket(input: PacketInput): { packet: string; files: ChangedFile[]; constitutionEdited: boolean } {
  const { root, base } = input;
  const files = changedFiles(root, base);
  const parts: string[] = [`# The change: ${input.title}\n\n${clipText(input.body, 8000)}`];
  parts.push(`Files changed (${files.length}):\n${files.map((f) => `${f.status} ${f.file}`).join("\n")}`);
  const logs = files.filter((f) => f.status !== "D" && /^runs\/[^/]+\/log\.md$/.test(f.file));
  for (const l of logs) parts.push(`# The operator's notes for this change (${l.file})\n\n${clipText(fs.readFileSync(path.join(root, l.file), "utf8"), 20000)}`);
  const dirs = [...new Set(files.map((f) => /^content\/cases\/([^/]+)\//.exec(f.file)?.[1]).filter((d): d is string => Boolean(d) && fs.existsSync(path.join(root, "content", "cases", d!, "case.yaml"))))];
  for (const dir of dirs) parts.push(caseSection(root, base, dir, files));
  const other = files.filter((f) => !f.file.startsWith("content/cases/") && !f.file.startsWith("runs/") && !f.file.startsWith("governance/spend/") && !f.file.startsWith("proposals/"));
  if (other.length) {
    const diff = git(root, "diff", `${base}...HEAD`, "--", ...other.map((f) => f.file));
    parts.push(`# Changes to code, configuration and documents\n\n${clipText(diff, 120000)}`);
  }
  if (input.previous?.length) {
    parts.push(
      `# Earlier review rounds on this change\n\n${input.previous
        .map((r, i) => `Round ${i + 1} (commit ${r.commit.slice(0, 10)}): ${r.outcome}\n${r.seats.map((s) => `- ${s.label}: ${s.verdict ?? "no answer"}${s.harm ? `; harm flagged: ${JSON.stringify(s.harm)}` : ""}${s.notes?.length ? `; notes: ${s.notes.join(" | ")}` : ""}`).join("\n")}`)
        .join("\n\n")}`,
    );
  }
  let packet = parts.join("\n\n---\n\n");
  if (packet.length > PACKET_LIMIT) packet = clipText(packet, PACKET_LIMIT);
  return { packet, files, constitutionEdited: files.some((f) => f.file === "AGENTS.md") };
}

// ------------------------------------------------------------------ the review

export interface ReviewResult {
  commit: string;
  date: string;
  protocol: string;
  tally: Tally;
  seats: SeatReview[];
}

export type SeatCall = (seat: string, prompt: { system: string; user: string; maxTokens: number }) => Promise<{ text: string; usage: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number }; model: string }>;

export async function runReview(input: PacketInput & { siteName: string; today?: string; call?: SeatCall }): Promise<ReviewResult> {
  const { root, base } = input;
  const commit = git(root, "rev-parse", "HEAD").trim();
  const date = input.today ?? new Date().toISOString().slice(0, 10);
  const protocol = loadProtocol("review");
  const { packet, constitutionEdited } = reviewPacket(input);
  const seats: SeatReview[] = [];
  const mechanical = constitutionEdited ? [{ kind: "constitution", where: "AGENTS.md", why: "the change edits the constitution, which the founder alone amends; it merges only by the founder's hand" }] : [];
  if (constitutionEdited) return { commit, date, protocol: protocol.version, tally: tally([], mechanical), seats };
  const system = renderProtocol(protocol, {
    site: input.siteName,
    today: date,
    promptVersion: protocol.version,
    constitution: atRef(root, base, "AGENTS.md") ?? "(none)",
    siteRules: atRef(root, base, "config/site-rules.md") ?? "(this site has no rules beyond the constitution)",
  });
  const call: SeatCall = input.call ?? ((seat, prompt) => callVendorDetailed(seat, { ...prompt, timeoutMs: 900_000 }));
  const tariffs = loadTariffs(root);
  await Promise.all(
    MODELS.review.seats.map(async (seat: string) => {
      const cfg = VENDORS[seat];
      const entry: SeatReview = { seat, label: cfg.label, model: cfg.model, reply: null };
      seats.push(entry);
      if (!input.call && !cfg.key()) {
        entry.failure = "no API key";
        return;
      }
      try {
        let answer = await call(seat, { system, user: packet, maxTokens: 16000 });
        let usage = answer.usage;
        let parsed = parseReviewReply(answer.text);
        if (!parsed.reply) {
          // One repair round: the contract failure goes back with the reply.
          answer = await call(seat, { system, user: `${packet}\n\n---\n\nYOUR PREVIOUS REPLY did not read as the contract (${parsed.problem}). Return the JSON object only.\n\n${answer.text.slice(0, 4000)}`, maxTokens: 16000 });
          usage = { inputTokens: usage.inputTokens + answer.usage.inputTokens, outputTokens: usage.outputTokens + answer.usage.outputTokens };
          parsed = parseReviewReply(answer.text);
        }
        entry.cost = { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, usd: priceOf(answer.model, usage, tariffs) };
        if (parsed.reply) entry.reply = parsed.reply;
        else entry.failure = parsed.problem;
      } catch (e) {
        entry.failure = String((e as Error).message ?? e).slice(0, 300);
      }
    }),
  );
  seats.sort((a, b) => MODELS.review.seats.indexOf(a.seat) - MODELS.review.seats.indexOf(b.seat));
  return { commit, date, protocol: protocol.version, tally: tally(seats, mechanical), seats };
}

// ------------------------------------------------------------------ the record

export const REVIEW_MARKER = "<!-- site-review -->";
const BLOB = /<!-- site-review-data (\{[\s\S]*?\}) -->/;

export interface ReviewBlob {
  commit: string;
  date: string;
  protocol: string;
  outcome: Outcome;
  reason: string;
  seats: { seat: string; label: string; model: string; verdict?: string; harm?: ReviewReply["harm"]; notes?: string[]; summary?: string; failure?: string; cost?: SeatReview["cost"] }[];
}

export function reviewBlob(r: ReviewResult): ReviewBlob {
  return {
    commit: r.commit,
    date: r.date,
    protocol: r.protocol,
    outcome: r.tally.outcome,
    reason: r.tally.reason,
    seats: r.seats.map((s) => ({ seat: s.seat, label: s.label, model: s.model, ...(s.reply ? { verdict: s.reply.verdict, harm: s.reply.harm, notes: s.reply.notes, summary: s.reply.summary } : {}), ...(s.failure ? { failure: s.failure } : {}), ...(s.cost ? { cost: s.cost } : {}) })),
  };
}

export function blobFromComment(body: string): ReviewBlob | null {
  const m = BLOB.exec(body);
  if (!m) return null;
  try {
    return JSON.parse(m[1].replace(/--\\u003e/g, "-->")) as ReviewBlob;
  } catch {
    return null;
  }
}

const OUTCOME_WORDS: Record<Outcome, string> = {
  publish: "✅ Better — publishes",
  hold: "⏸ Held — a harm to answer",
  revise: "✏️ Not judged better — revise",
  undecided: "… Undecided — too few reviewers answered",
};

/** The PR comment: a plain table, each reviewer's summary and notes, and the machine record. */
export function reviewComment(r: ReviewResult): string {
  const t = r.tally;
  const rows = r.seats.map((s) => `| ${s.label} | ${s.reply ? s.reply.verdict.replace("_", " ") : `— (${s.failure ?? "no answer"})`} | ${s.reply?.harm ? `**${s.reply.harm.kind}**: ${s.reply.harm.where}` : "none"} |`);
  const details = r.seats
    .filter((s) => s.reply)
    .map((s) => `<details><summary><b>${s.label}</b> — ${s.reply!.verdict.replace("_", " ")}</summary>\n\n${s.reply!.summary}\n\n${s.reply!.harm ? `**Harm (${s.reply!.harm.kind})** at ${s.reply!.harm.where}: ${s.reply!.harm.why}\n\n` : ""}${s.reply!.notes.length ? `Notes for the next pass:\n${s.reply!.notes.map((n) => `- ${n}`).join("\n")}` : "No notes."}\n</details>`);
  const cost = r.seats.reduce((n, s) => n + (s.cost?.usd ?? 0), 0);
  const blob = JSON.stringify(reviewBlob(r)).replace(/-->/g, "--\\u003e");
  return [
    REVIEW_MARKER,
    `## Review — ${OUTCOME_WORDS[t.outcome]}`,
    ``,
    `**${t.reason}.** (${r.protocol}, commit ${r.commit.slice(0, 10)}, AGENTS.md §3.15)`,
    ``,
    `| Reviewer | Verdict | Harm |`,
    `|---|---|---|`,
    ...rows,
    ``,
    ...details,
    ``,
    `<sub>Reviewers are models from vendors other than the operator's. Notes never block; the operator works on them in its next session. Cost of this review: $${cost.toFixed(2)}.</sub>`,
    ``,
    `<!-- site-review-data ${blob} -->`,
  ].join("\n");
}
