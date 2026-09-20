import { latestByKey, type Disposition } from "./intake.ts";

/**
 * Leads: works a producer named and could not open. A report lists them under "Named, not opened"; the drafter
 * files each as a `blocked` disposition with the route to the primary; an inbox intake files the works a supplied
 * text names that no index resolved. They never entered the ledger and no verb re-opened them until the leads pass
 * (src/pipeline/leads.ts, 2026-09-20: 153 such rows across the cases, 69 on one). This module says which rows are
 * leads, so the scheduler and the verb agree.
 */

/** A row written by a producer — the drafter, an intake, a report — rather than by verification. */
export const PRODUCER_RUN = /-(draft|inbox|report|leads)-/;

/**
 * The leads a pass opens are works — source-kind rows. A drafter's blocked evidence or claim row (a text it could not
 * read for a record it wanted to write) is a lead to the same work, but settling it type-correctly needs an admitted
 * record of its own kind, not the source that entered (review note #368); that is the next increment, and until then
 * those rows are left to the drafter that wrote them.
 */
export const LEAD_KINDS = new Set<Disposition["kind"]>(["source"]);

/** Is this latest-per-key row a lead a producer could not open? Rows blocked at verification belong to re-submission instead. */
export function isProducerBlocked(row: Disposition): boolean {
  return row.disposition === "blocked" && PRODUCER_RUN.test(row.by) && LEAD_KINDS.has(row.kind);
}

/** The case's open leads, oldest first (the date they were blocked, then the key), each the latest row under its key. */
export function blockedLeads(c: { dispositions: Disposition[] }): Disposition[] {
  return [...latestByKey(c.dispositions).values()]
    .filter(isProducerBlocked)
    .sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
}

/** How many leads a case must hold before a pass is worth a sitting's choice. */
export const LEADS_MIN = 3;
