import { createHash } from "node:crypto";
import { plainArticle } from "../domain/article.ts";
import { caseQuestion } from "../domain/editions.ts";
import { proseWords } from "../domain/readerBudget.ts";
import { assessmentLabels, type AssessmentRun, type Edition, type EditionComparison, type LoadedCase, type SeatPreference } from "../domain/schema.ts";
import { articleWords } from "../domain/text.ts";
import { parseJsonReply } from "../lib/llm.mjs";
import { loadProtocol, renderProtocol } from "./protocols.ts";
import type { Meter } from "./spend.ts";
import { assertSeatsWithinBudget, callSeat, seatAvailable, VENDORS, type Reply } from "./transport.ts";

/**
 * The comparison (protocols/compare-v1.md): a candidate edition read beside
 * the incumbent by each seat of the panel, as a reader, and the tally that
 * follows. The design named this on 2026-09-08 — "the candidate replaces
 * [the incumbent] only on clear preference" — and the edition verb wrote
 * every candidate over its incumbent without it; this is that step.
 *
 * What a seat reads is what a reader meets: the question, the verdicts, the
 * header's three answers and the article, its markers rendered as the page
 * renders them. Not the ledger, and not the assessment's per-claim
 * reasoning — a reader choosing between two pages does not have them
 * either, and the verdicts have their own blind panel (the check verb).
 */

/** One telling of a case, as a reader meets it. */
export interface Telling {
  question: string;
  verdict: string;
  components: { label: string; state: string }[];
  whatIsClaimed: string | null;
  whereDisagreementLives: string | null;
  whatWouldSettleIt: string | null;
  article: string;
  /** Written from the ledger as it stands, or before it last changed. */
  current: boolean;
}

/** An edition and the assessment it adopts, as a telling. `question` falls back to the case's standing question. */
export function tellingOf(loaded: LoadedCase, edition: Pick<Edition, "question" | "article">, assessment: AssessmentRun | null, current: boolean): Telling {
  const ca = assessment?.caseAssessment;
  return {
    question: edition.question ?? caseQuestion(loaded),
    verdict: ca ? assessmentLabels[ca.verdict] : "(no assessment yet)",
    components: (ca?.components ?? []).map((c) => ({ label: c.label, state: assessmentLabels[c.state] })),
    whatIsClaimed: ca?.whatIsClaimed ?? null,
    whereDisagreementLives: ca?.whereDisagreementLives ?? null,
    whatWouldSettleIt: ca?.whatWouldSettleIt ?? null,
    article: edition.article,
    current,
  };
}

/**
 * The article as the page shows it to a reader: a claim span is its words, a plate is a picture, headings stay. Read
 * with the page's own patterns (src/domain/article.ts), so a seat is never shown something the page would not show.
 */
export const readerText = plainArticle;

function renderTelling(label: "A" | "B", t: Telling): string {
  const header = proseWords(t.whatIsClaimed) + proseWords(t.whereDisagreementLives) + proseWords(t.whatWouldSettleIt);
  return [
    `=== TELLING ${label} ===`,
    `WRITTEN FROM: ${t.current ? "the evidence as it stands today" : "the evidence as it stood before it last changed"}`,
    `LENGTH: the article is ${articleWords(t.article).toLocaleString("en-US")} words; the three header answers together are ${header.toLocaleString("en-US")} words`,
    `QUESTION: ${t.question}`,
    `CASE VERDICT: ${t.verdict}`,
    t.components.length ? `BY COMPONENT:\n${t.components.map((c) => `- ${c.state}: ${c.label}`).join("\n")}` : "BY COMPONENT: (none given)",
    `WHAT IS CLAIMED:\n${t.whatIsClaimed ?? "(not given)"}`,
    `WHERE THE DISAGREEMENT LIVES:\n${t.whereDisagreementLives ?? "(not given)"}`,
    `WHAT WOULD SETTLE IT:\n${t.whatWouldSettleIt ?? "(not given)"}`,
    `THE ARTICLE:\n${readerText(t.article)}`,
    `=== END OF TELLING ${label} ===`,
  ].join("\n\n");
}

/** What one seat is sent: the two tellings, the candidate as A or as B. */
export function comparisonPacket(candidate: Telling, incumbent: Telling, candidateAs: "A" | "B"): string {
  const [a, b] = candidateAs === "A" ? [candidate, incumbent] : [incumbent, candidate];
  return `${renderTelling("A", a)}\n\n${renderTelling("B", b)}`;
}

/**
 * Which letter the candidate carries for each seat: drawn from the run and the seats, so it is fixed for the record,
 * and balanced within the run — the seats are put in an order the run's id decides and take A and B alternately, so
 * the candidate is read first by half of them, to within one. A panel that favoured whatever it read first (or
 * second) would then split three to two, which is no preference: position alone can never make a telling preferred.
 */
export function candidateLetters(runId: string, seats: string[]): Record<string, "A" | "B"> {
  const key = (s: string) => createHash("sha256").update(`${runId}:${s}`).digest("hex");
  const first = createHash("sha256").update(runId).digest()[0] % 2 === 0 ? "A" : "B";
  const other = first === "A" ? "B" : "A";
  return Object.fromEntries([...seats].sort((a, b) => key(a).localeCompare(key(b))).map((s, i) => [s, i % 2 === 0 ? first : other]));
}

/** The seats a candidate needs on its side, and the most the other side may have, to be preferred. */
export const PREFERENCE_MIN = 3;
export const PREFERENCE_MAX_AGAINST = 1;

/**
 * The panel's preference. A telling is preferred when at least PREFERENCE_MIN seats choose it and at most
 * PREFERENCE_MAX_AGAINST choose the other — a majority of the five that the other side has all but conceded.
 * Fewer than PREFERENCE_MIN answers decide nothing: `undecided` is a comparison that could not be made, not a
 * finding that the tellings are equal.
 */
export function tallyPreference(seats: Pick<SeatPreference, "prefers">[]): Pick<EditionComparison, "outcome" | "candidate" | "incumbent" | "neither"> {
  const count = (p: SeatPreference["prefers"]) => seats.filter((s) => s.prefers === p).length;
  const candidate = count("candidate");
  const incumbent = count("incumbent");
  const neither = count("neither");
  const outcome =
    seats.length < PREFERENCE_MIN
      ? "undecided"
      : candidate >= PREFERENCE_MIN && incumbent <= PREFERENCE_MAX_AGAINST
        ? "candidate-preferred"
        : incumbent >= PREFERENCE_MIN && candidate <= PREFERENCE_MAX_AGAINST
          ? "incumbent-preferred"
          : "no-clear-preference";
  return { outcome, candidate, incumbent, neither };
}

/** One seat's reply, read fail-closed: anything but a well-formed choice is a seat that did not answer. */
export function readPreference(text: string, candidateAs: "A" | "B"): Pick<SeatPreference, "prefers" | "margin" | "reasons" | "notes"> {
  const raw = parseJsonReply(text) as { prefers?: unknown; margin?: unknown; reasons?: unknown; notes?: unknown };
  if (raw === null || typeof raw !== "object") throw new Error("the reply is not a JSON object");
  if (raw.prefers !== "A" && raw.prefers !== "B" && raw.prefers !== "neither") throw new Error(`unknown preference ${JSON.stringify(raw.prefers)}`);
  if (typeof raw.reasons !== "string" || raw.reasons.trim().length < 20) throw new Error("missing or trivial reasons");
  const prefers = raw.prefers === "neither" ? "neither" : raw.prefers === candidateAs ? "candidate" : "incumbent";
  const margin = prefers === "neither" ? null : raw.margin === "clear" || raw.margin === "slight" ? raw.margin : null;
  const notes = Array.isArray(raw.notes) ? raw.notes.filter((n): n is string => typeof n === "string" && n.trim().length > 0).map((n) => n.trim()).slice(0, 3) : [];
  return { prefers, margin, reasons: raw.reasons.trim(), notes };
}

export type SeatCaller = (seat: string, prompt: { system: string; user: string; maxTokens?: number; timeoutMs?: number }, meter: Meter) => Promise<Reply>;

export interface CompareOptions {
  /** Seats to ask; default: every roster seat with a key. */
  seats?: string[];
  deps?: { call?: SeatCaller };
}

/**
 * Ask every seat, tally, and return the record. A seat that fails — no key, a transport error, a reply that is not
 * a choice — is named in `failed` and counts for neither side. Throws BudgetExceeded before any seat is asked when
 * the comparison would pass a cap (the caller ends the run as failed, with the reason).
 */
export async function compareTellings(
  loaded: LoadedCase,
  candidate: Telling,
  incumbent: Telling,
  ctx: { runId: string; against: string; meter: Meter },
  opts: CompareOptions = {},
): Promise<EditionComparison> {
  const protocol = loadProtocol("compare");
  const system = renderProtocol(protocol, { title: loaded.record.title });
  const roster = opts.seats ?? Object.keys(VENDORS);
  const asked = roster.filter((s) => opts.deps?.call || seatAvailable(s));
  const failed: string[] = roster.filter((s) => !asked.includes(s)).map((s) => `${s}: no key`);
  const letters = candidateLetters(ctx.runId, asked);
  const prompts = asked.map((seat) => ({ seat, candidateAs: letters[seat], prompt: { system, user: "", maxTokens: 4000, timeoutMs: 1_800_000 } }));
  for (const p of prompts) p.prompt.user = comparisonPacket(candidate, incumbent, p.candidateAs);
  // No seat to ask: the comparison cannot be made, and nothing is budgeted or sent.
  if (prompts.length === 0) return { against: ctx.against, protocol: protocol.version, ...tallyPreference([]), failed, seats: [] };
  if (!opts.deps?.call) assertSeatsWithinBudget(prompts.map((p) => ({ seat: p.seat, prompt: p.prompt })), ctx.meter);
  const call = opts.deps?.call ?? callSeat;
  const results = await Promise.allSettled(
    prompts.map(async ({ seat, candidateAs, prompt }): Promise<SeatPreference> => {
      const reply = await call(seat, prompt, ctx.meter);
      return { seat: VENDORS[seat]?.label ?? seat, model: reply.model, candidateShownAs: candidateAs, ...readPreference(reply.text, candidateAs) };
    }),
  );
  const seats: SeatPreference[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") seats.push(r.value);
    else failed.push(`${prompts[i].seat}: ${String((r.reason as Error)?.message ?? r.reason).slice(0, 200)}`);
  });
  return { against: ctx.against, protocol: protocol.version, ...tallyPreference(seats), ...(failed.length ? { failed } : {}), seats };
}

/** The comparison in a sentence, for a run's notes and an edition's rationale. */
export function comparisonSentence(c: EditionComparison): string {
  const votes = `${c.candidate} for the candidate, ${c.incumbent} for the incumbent, ${c.neither} for neither${c.failed?.length ? `, ${c.failed.length} seat(s) not answering` : ""}`;
  const word =
    c.outcome === "candidate-preferred"
      ? "the panel's seats, reading both as a reader would, preferred the candidate"
      : c.outcome === "incumbent-preferred"
        ? "the panel's seats, reading both as a reader would, preferred the incumbent"
        : c.outcome === "no-clear-preference"
          ? "the panel's seats, reading both as a reader would, had no clear preference"
          : "too few of the panel's seats answered for the comparison to be made";
  return `${word} (${votes}; ${c.protocol}, against ${c.against})`;
}
