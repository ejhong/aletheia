/**
 * The gate's record in a reader's terms: how each seat of the panel has
 * voted on the changes put to it, and one line for a verdict. Derived from
 * the harvested arbiter records (governance/arbiter/); nothing is stored.
 *
 * The tally exists because a panel is only as independent as its seats are
 * different (AGENTS.md §3.15): if one seat does all the objecting, the page
 * should be the first to say so.
 */
import { seatKey } from "../lib/seat-key.mjs";
import type { ArbiterRecord } from "./schema.ts";

export interface SeatTally {
  /** The seat's key across model upgrades (src/lib/seat-key.mjs): the API vendor. */
  key: string;
  /** The label of the model holding the seat in the newest record. */
  label: string;
  /** Every label the seat has carried, newest first. */
  labels: string[];
  complies: number;
  unsure: number;
  violates: number;
  /** Changes on which this seat alone voted "violates". */
  alone: number;
  judged: number;
}

/** A record's votes in one phrase: "5 comply", or "4 comply · 1 violates (GPT-5.6 Sol (OpenAI))". */
export function voteSummary(record: Pick<ArbiterRecord, "seats">): string {
  const of = (vote: string) => record.seats.filter((s) => s.vote === vote);
  const parts: string[] = [];
  const c = of("complies").length;
  if (c) parts.push(`${c} ${c === 1 ? "complies" : "comply"}`);
  for (const vote of ["violates", "unsure"] as const) {
    const seats = of(vote);
    if (!seats.length) continue;
    const names = seats.length <= 2 ? ` (${seats.map((s) => s.seat).join(", ")})` : "";
    parts.push(`${seats.length} ${vote === "violates" ? (seats.length === 1 ? "violates" : "violate") : "unsure"}${names}`);
  }
  return parts.join(" · ");
}

/** Each seat's votes across the records, in the order the seats first appear in the newest record. */
export function seatTallies(records: ArbiterRecord[]): SeatTally[] {
  const newestFirst = [...records].sort((a, b) => b.outcomeAt.localeCompare(a.outcomeAt) || b.pr - a.pr);
  const tallies = new Map<string, SeatTally>();
  for (const r of newestFirst) {
    const objectors = r.seats.filter((s) => s.vote === "violates");
    for (const s of r.seats) {
      const key = seatKey(s.seat);
      const t = tallies.get(key) ?? { key, label: s.seat, labels: [], complies: 0, unsure: 0, violates: 0, alone: 0, judged: 0 };
      if (!t.labels.includes(s.seat)) t.labels.push(s.seat);
      t[s.vote]++;
      t.judged++;
      if (s.vote === "violates" && objectors.length === 1) t.alone++;
      tallies.set(key, t);
    }
  }
  return [...tallies.values()];
}

/** Changes every seat rejected. By rule the panel rejects any edit to the constitution, which is the founder's alone to make. */
export function unanimousRejections(records: ArbiterRecord[]): ArbiterRecord[] {
  return records.filter((r) => r.seats.length > 1 && r.seats.every((s) => s.vote === "violates"));
}
