/**
 * Prose references and their discipline — three mechanical rules the first
 * Orch OR sitting (2026-09-11) showed the pipeline lacked:
 *
 *  1. An id written in a record's prose must name a record that exists.
 *     The drafter had numbered its own proposals ORCH-C101… and cited them
 *     in research summaries; the draft verb keyed the claims from the next
 *     free id and verify dropped the rejected ones, so five summaries named
 *     records that never existed. The loader could not see it: it checks
 *     structured fields, not prose. Now it does, for records from
 *     PROSE_REFS_REQUIRED_FROM on (earlier content carries a known backlog,
 *     listed in docs/DECISIONS.md).
 *  2. A claim statement is one proposition; a falsification clause ("; it
 *     would be false if …") is a second, independently truth-evaluable one
 *     (§3.2). The verifier rejected some and waved others through; the
 *     panel parked the rest.
 *  3. A record split from another keeps the page its own quote is on, not
 *     the parent's whole locator.
 */

/** A ledger id with the case's prefix: PREFIX-C001, PREFIX-E012, PREFIX-R003. */
export const LEDGER_ID = /\b([A-Z]{2,6})-([CER])(\d{3})\b/g;

/** Records dated on or after this day may not cite, in prose, an id that does not exist. */
export const PROSE_REFS_REQUIRED_FROM = "2026-09-12";

/** The ids written in a text that carry the given case prefix. */
export function ledgerIdRefs(text: string | undefined | null, prefix: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const m of text.matchAll(LEDGER_ID)) if (m[1] === prefix) out.push(m[0]);
  return out;
}

export interface ProseRef {
  record: string;
  field: string;
  id: string;
}

type Dated = { id: string; origin?: { date?: string } };
type ClaimLike = Dated & { statement: string };
type EvidenceLike = Dated & { title: string; sourceStatement: string; editorInference?: string; limitations?: string[] };
type ResearchLike = Dated & { title: string; summary: string; informationGain?: string };

/** The prose fields of each record kind, in the order a reader meets them. */
export function proseFields(kind: "claim", r: ClaimLike): [string, string | undefined][];
export function proseFields(kind: "evidence", r: EvidenceLike): [string, string | undefined][];
export function proseFields(kind: "research", r: ResearchLike): [string, string | undefined][];
export function proseFields(kind: "claim" | "evidence" | "research", r: ClaimLike | EvidenceLike | ResearchLike): [string, string | undefined][] {
  if (kind === "claim") return [["statement", (r as ClaimLike).statement]];
  if (kind === "evidence") {
    const e = r as EvidenceLike;
    return [["title", e.title], ["sourceStatement", e.sourceStatement], ["editorInference", e.editorInference], ...(e.limitations ?? []).map((l, i): [string, string] => [`limitations[${i}]`, l])];
  }
  const x = r as ResearchLike;
  return [["title", x.title], ["summary", x.summary], ["informationGain", x.informationGain]];
}

/**
 * Every id a case's records name in prose that names no record of the case.
 * `since` limits the check to records whose origin date is on or after it;
 * absent, every record is checked.
 */
export function danglingProseRefs(
  c: { claims: ClaimLike[]; evidence: EvidenceLike[]; research: ResearchLike[] },
  since?: string,
): ProseRef[] {
  const ids = new Set<string>([...c.claims, ...c.evidence, ...c.research].map((r) => r.id));
  const prefix = [...ids][0]?.split("-")[0];
  if (!prefix) return [];
  const out: ProseRef[] = [];
  const check = (kind: "claim" | "evidence" | "research", r: ClaimLike | EvidenceLike | ResearchLike) => {
    if (since && (r.origin?.date ?? "") < since) return;
    const fields = kind === "claim" ? proseFields(kind, r as ClaimLike) : kind === "evidence" ? proseFields(kind, r as EvidenceLike) : proseFields(kind, r as ResearchLike);
    for (const [field, text] of fields) {
      for (const id of new Set(ledgerIdRefs(text, prefix))) if (!ids.has(id)) out.push({ record: r.id, field, id });
    }
  };
  for (const r of c.claims) check("claim", r);
  for (const r of c.evidence) check("evidence", r);
  for (const r of c.research) check("research", r);
  return out;
}

/**
 * The falsification clause a statement carries, if any — "; it would be
 * false if …", "and would be false if …", "falsifiable by …" — the pattern
 * that bundles a second truth-condition into one claim (§3.2). Null when the
 * statement is one proposition.
 */
export function compoundClause(statement: string): string | null {
  const m = statement.match(/[;,]?\s*(?:and\s+|it\s+)?(?:would|will)\s+be\s+(?:false|refuted|falsified)\s+if\b[^]*$|[;,]?\s*(?:and\s+)?(?:is\s+)?falsifiable\s+(?:by|if)\b[^]*$/i);
  return m ? m[0].trim() : null;
}

/** The page a quote sits on in text paged `[p. N]` (src/pipeline/fetch.ts), or null when the quote or the markers are absent. */
export function pageOfQuote(text: string, quote: string | undefined): number | null {
  if (!quote) return null;
  const at = text.indexOf(quote);
  if (at < 0) return null;
  const before = text.slice(0, at);
  const m = [...before.matchAll(/\[p\. (\d+)\]/g)].at(-1);
  return m ? Number(m[1]) : null;
}

/**
 * A parent's locator narrowed to one page: every `[p. N]` group (and a
 * section label in parentheses after it) is replaced by the one page, and
 * the rest — the descriptor of the document — is kept. "[p. 1] (Sec. I) and
 * [p. 4] (Sec. V), arXiv PDF 2111.04604v2" → "[p. 1], arXiv PDF 2111.04604v2".
 */
export function narrowLocator(parent: string, page: number): string {
  const rest = parent
    .replace(/\[p\. \d+\](\s*\([^)]*\))?/g, "")
    .replace(/\b(and|&)\b/g, "")
    .replace(/[,;\s]+/g, " ")
    .trim();
  return rest ? `[p. ${page}], ${rest}` : `[p. ${page}]`;
}
