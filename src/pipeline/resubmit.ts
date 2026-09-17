import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { latestByKey, type Disposition, type Proposal } from "../domain/intake.ts";
import { sourceKeys, textKey } from "../domain/keys.ts";
import { findCase } from "../domain/load.ts";
import { readProposal } from "../domain/runs.ts";
import type { Claim, Evidence, LoadedCase, Source } from "../domain/schema.ts";
import { loadProtocol } from "./protocols.ts";
import { appendDispositions, closeRun, newRunId, openRun, runDir, writeProposal, writeWorkingFile, type RunOutcome } from "./store.ts";
import { nextClaimId, nextEvidenceId, runVerify, type VerifyOptions } from "./verify.ts";

/**
 * Re-submission of records that verification blocked (2026-09-17). A proposal record whose text could not be
 * read is `blocked` in dispositions.yaml — the route to the text and the proposal it came from on the row — and
 * never entered the ledger. When the text may be readable again (the retriever fixed, the archive serving, the
 * cadence come round) the record is proposed once more, under a fresh id against the ledger as it stands, with
 * the drafter's own stamps and its lineage on the origin, and read by the ordinary verify verb: the same second
 * reader, the same checks, the same rows. Nothing here judges. This module finds what was blocked, re-keys it,
 * hands it to verify, and then settles the legacy rows so one key carries a record's whole story.
 */

/** The transformation's own version (protocols/resubmit-v1.md): a proposal so stamped was written by code, not a model. */
export const RESUBMIT_PROTOCOL = loadProtocol("resubmit").version;

export type Kind = "source" | "evidence" | "claim";
type AnyRecord = Source | Evidence | Claim;
const SETTLED = new Set(["in", "duplicate", "irrelevant", "failed", "provisional"]);
const runIdOf = (ref: string) => ref.replace(/^proposals\//, "");

/**
 * Every key a record may be filed under. Verify and the drafter key an evidence record by its title and statement
 * and a source by its identifier; before 2026-09-17 a refused evidence row took the title alone and a refused source
 * row the title. All forms are consulted, so a legacy row settles a record and a settled record is never re-submitted.
 */
export function keysOf(kind: Kind, r: AnyRecord): string[] {
  const keys: (string | null)[] =
    kind === "source" ? [...sourceKeys(r as Source), textKey((r as Source).title)]
    : kind === "claim" ? [textKey((r as Claim).statement)]
    : [textKey(`${(r as Evidence).title} ${(r as Evidence).sourceStatement}`), textKey((r as Evidence).title)];
  return [...new Set(keys.filter((k): k is string => Boolean(k)))];
}

export interface Resubmittable { kind: Kind; record: AnyRecord; row: Disposition }
export interface ResubmissionPlan { batches: Map<string, Resubmittable[]>; notes: string[] }

/**
 * What is blocked at verification and can be proposed again: the latest-per-key `blocked` rows that name a proposal
 * still holding the record, grouped by proposal. A record any of whose keys is settled — admitted, a duplicate,
 * irrelevant, refused, provisional — is not re-submitted; a drafter's blocked lead, which no proposal holds as a
 * record, is not either (that is the draft path's work).
 */
export function planResubmission(loaded: Pick<LoadedCase, "dispositions">, read: (ref: string) => Proposal | null): ResubmissionPlan {
  const latest = latestByKey(loaded.dispositions);
  const refs = new Set([...latest.values()].filter((r) => r.disposition === "blocked" && r.proposal).map((r) => r.proposal!));
  const batches = new Map<string, Resubmittable[]>();
  const notes: string[] = [];
  for (const ref of [...refs].sort()) {
    const proposal = read(ref);
    if (!proposal) {
      notes.push(`${ref}: blocked rows name it but it is not on disk; nothing to re-submit`);
      continue;
    }
    const items: Resubmittable[] = [];
    const consider = (kind: Kind, records: AnyRecord[]) => {
      for (const record of records) {
        const rows = keysOf(kind, record).map((k) => latest.get(k)).filter((r): r is Disposition => Boolean(r));
        if (!rows.length || rows.some((r) => SETTLED.has(r.disposition))) continue;
        const row = rows.find((r) => r.disposition === "blocked" && r.proposal === ref);
        if (row) items.push({ kind, record, row });
      }
    };
    consider("source", proposal.adds.sources);
    consider("claim", proposal.adds.claims);
    consider("evidence", proposal.adds.evidence);
    if (items.length) batches.set(ref, items);
  }
  return { batches, notes };
}

export interface Built {
  proposal: Proposal;
  renamed: { kind: Kind; from: string; to: string }[];
  skipped: { kind: Kind; id: string; key: string; observed: string; reason: string }[];
}

/**
 * The re-submission proposal: the blocked records under fresh ids against the ledger as it stands, their references
 * remapped — a claim of the old proposal that entered since is cited by its ledger id, one that was refused is
 * dropped, a record whose source never entered is skipped — the drafter's stamps kept and the lineage on each origin.
 */
export function buildResubmission(loaded: LoadedCase, ref: string, from: Proposal, items: Resubmittable[], stamp: { runId: string; date: string }): Built {
  const latest = latestByKey(loaded.dispositions);
  const ledgerIds = new Set([...loaded.sources, ...loaded.claims, ...loaded.evidence].map((r) => r.id));
  const proposalIds = new Set([...from.adds.sources, ...from.adds.claims, ...from.adds.evidence].map((r) => r.id));
  // Where each record of the old proposal went: admitted under a ledger id, or nowhere.
  const entered = new Map<string, string>();
  const enteredAs = (kind: Kind, r: AnyRecord) => {
    for (const k of keysOf(kind, r)) {
      const row = latest.get(k);
      if (row && (row.disposition === "in" || row.disposition === "duplicate") && row.as) return row.as;
    }
    return null;
  };
  for (const s of from.adds.sources) { const as = enteredAs("source", s); if (as) entered.set(s.id, as); }
  for (const c of from.adds.claims) { const as = enteredAs("claim", c); if (as) entered.set(c.id, as); }
  const renamed: Built["renamed"] = [];
  const skipped: Built["skipped"] = [];
  const skip = (kind: Kind, r: AnyRecord, reason: string) =>
    skipped.push({ kind, id: r.id, key: keysOf(kind, r)[0] ?? "", observed: "statement" in r ? r.statement : r.title, reason });
  const lineage = (r: Evidence | Claim, row: Disposition) => ({ ...r.origin, ref: `${r.origin.ref}; re-submitted from ${ref} (was ${r.id}; blocked ${row.date}: ${(row.reason ?? "").replace(/\s+/g, " ").slice(0, 160)})` });

  const sources: Source[] = [];
  for (const it of items.filter((i) => i.kind === "source")) {
    const s = it.record as Source;
    if (ledgerIds.has(s.id) || entered.has(s.id)) { skip("source", s, `the ledger already holds it as ${entered.get(s.id) ?? s.id}`); continue; }
    sources.push(s);
  }
  const sourceKnown = (id: string) => ledgerIds.has(id) || sources.some((s) => s.id === id) || entered.has(id);
  const sourceIdFor = (id: string) => entered.get(id) ?? id;

  // Claims first: their fresh ids are what the evidence cites.
  const taken: string[] = [];
  const newId = new Map<string, string>();
  const claimItems = items.filter((i) => i.kind === "claim" && (() => {
    const c = i.record as Claim;
    if (c.sourceAnchor?.sourceId && !sourceKnown(c.sourceAnchor.sourceId)) { skip("claim", c, `its anchor's source ${c.sourceAnchor.sourceId} never entered`); return false; }
    return true;
  })());
  for (const it of claimItems) {
    const id = nextClaimId(loaded, taken);
    taken.push(id);
    newId.set(it.record.id, id);
    renamed.push({ kind: "claim", from: it.record.id, to: id });
  }
  // A reference: to a record re-submitted here (its fresh id), to one that entered since (its ledger id), to a ledger
  // record the drafter cited by id, or to nothing — an old proposal id that was refused or skipped is dropped.
  const mapIds = (ids: string[] | undefined) =>
    ids?.map((x) => newId.get(x) ?? entered.get(x) ?? (!proposalIds.has(x) && ledgerIds.has(x) ? x : null)).filter((x): x is string => Boolean(x));
  const claims: Claim[] = claimItems.map((it) => {
    const c = it.record as Claim;
    return {
      ...c,
      id: newId.get(c.id)!,
      ...(c.sourceAnchor ? { sourceAnchor: { ...c.sourceAnchor, ...(c.sourceAnchor.sourceId ? { sourceId: sourceIdFor(c.sourceAnchor.sourceId) } : {}) } } : {}),
      parentClaimIds: mapIds(c.parentClaimIds) ?? [],
      dependsOnClaimIds: mapIds(c.dependsOnClaimIds) ?? [],
      ...(c.alternativeToClaimIds ? { alternativeToClaimIds: mapIds(c.alternativeToClaimIds) } : {}),
      ...(c.contradictsClaimIds ? { contradictsClaimIds: mapIds(c.contradictsClaimIds) } : {}),
      origin: lineage(c, it.row),
    };
  });
  const evidence: Evidence[] = [];
  for (const it of items.filter((i) => i.kind === "evidence")) {
    const e = it.record as Evidence;
    if (!sourceKnown(e.sourceId)) { skip("evidence", e, `its source ${e.sourceId} never entered`); continue; }
    const claimIds = mapIds(e.claimIds) ?? [];
    if (!claimIds.length) { skip("evidence", e, `none of the claims it cited (${e.claimIds.join(", ")}) entered or is re-submitted`); continue; }
    const id = nextEvidenceId(loaded, taken);
    taken.push(id);
    renamed.push({ kind: "evidence", from: e.id, to: id });
    evidence.push({ ...e, id, sourceId: sourceIdFor(e.sourceId), claimIds, origin: lineage(e, it.row) });
  }
  const n = sources.length + claims.length + evidence.length;
  const reasons = [...new Set(items.map((i) => (i.row.reason ?? "").replace(/\s+/g, " ").slice(0, 120)))];
  const proposal: Proposal = {
    runId: stamp.runId,
    date: stamp.date,
    case: loaded.record.slug,
    producer: "reverify",
    // Written by code, under its own protocol: no model drafted this proposal. The drafter of each record — model, run,
    // date — is on that record's origin, with the lineage appended (review note #349).
    model: null,
    promptVersion: RESUBMIT_PROTOCOL,
    basis: { ledgerHash: loaded.ledgerHash },
    rationale: `Re-submission of ${n} record(s) that verification blocked in ${ref} — ${reasons.join(" | ") || "no reason recorded"} — proposed again under fresh ids against the ledger as it stands by the reverify run ${stamp.runId}, a deterministic transformation (${RESUBMIT_PROTOCOL}) and not a model's work; the drafter of each record, with its run and date, is on the record's origin, the lineage appended. The texts are fetched again and the records read as newly proposed.`,
    adds: { sources, evidence, claims, research: [], images: [] },
    corrections: [],
    dispositions: [],
    report: `${from.report ?? from.runId} (re-submission ${stamp.runId} of records blocked at verification)`,
  };
  return { proposal, renamed, skipped };
}

export interface ResubmitRun {
  runId: string;
  from: string;
  verifyRunId?: string;
  records: number;
  skipped: number;
  admitted: number;
  rejected: number;
  outcome: RunOutcome["outcome"];
  reason?: string;
}
export interface ResubmitOutcome { runs: ResubmitRun[]; admitted: number; notes: string[] }
export interface ResubmitOptions {
  root?: string;
  dryRun?: boolean;
  now?: () => Date;
  deps?: VerifyOptions["deps"] & { verify?: typeof runVerify };
}

/**
 * Re-submit every blocked record of a case, one reverify run per proposal it came from: the run writes the
 * re-submission proposal under its own id and hands it to verify; verify's rows and history are the record of what
 * happened; the run's account names the verify run and its counts. Legacy-keyed rows are then settled (below).
 */
export async function resubmitBlocked(caseSlug: string, opts: ResubmitOptions = {}): Promise<ResubmitOutcome> {
  const root = opts.root ?? process.cwd();
  const now = opts.now ?? (() => new Date());
  const verify = opts.deps?.verify ?? runVerify;
  const read = (ref: string) => readProposal(runIdOf(ref), root);
  const out: ResubmitOutcome = { runs: [], admitted: 0, notes: [] };
  const plan = planResubmission(findCase(caseSlug, opts.deps?.cases?.()), read);
  out.notes.push(...plan.notes);
  for (const [ref, items] of plan.batches) {
    // Fresh each time: an earlier batch may have moved the ledger, and the proposal's basis must be the ledger verify sees.
    const loaded = findCase(caseSlug, opts.deps?.cases?.());
    const from = read(ref)!;
    // A run id names a second; the provisional pass may have opened one this very second, so the clock moves on until the id is free.
    let at = now();
    while (fs.existsSync(runDir(newRunId("reverify", loaded.record.slug, at), root))) at = new Date(at.getTime() + 1000);
    const run = openRun("reverify", loaded.record.slug, { model: null, promptVersion: RESUBMIT_PROTOCOL }, { now: at, root });
    const built = buildResubmission(loaded, ref, from, items, { runId: run.runId, date: run.date });
    const n = built.proposal.adds.sources.length + built.proposal.adds.claims.length + built.proposal.adds.evidence.length;
    const account = [
      `# Re-submission — ${run.runId}`,
      ``,
      `${loaded.record.slug}: ${items.length} record(s) blocked at verification in ${ref}; ${n} re-submitted, ${built.skipped.length} skipped; ledger ${loaded.ledgerHash.slice(0, 12)}.`,
      ``,
      `## Re-submitted (old id → fresh id)`,
      ...built.renamed.map((r) => `- ${r.kind} ${r.from} → ${r.to}`),
      ...built.proposal.adds.sources.map((s) => `- source ${s.id} (its own id)`),
      ``,
      `## Skipped`,
      ...built.skipped.map((s) => `- ${s.kind} ${s.id} — ${s.reason}`),
      ``,
    ].join("\n");
    const base = { runId: run.runId, from: ref, records: n, skipped: built.skipped.length, admitted: 0, rejected: 0 };
    if (!n) {
      const r = closeRun(run, "rested", { reason: `nothing to re-submit from ${ref}: ${built.skipped.length} record(s) skipped (${built.skipped.map((s) => s.reason).slice(0, 3).join("; ")})` });
      if (!opts.dryRun) settleSkipped(loaded.dir, ref, built, run, root);
      out.runs.push({ ...base, outcome: r.outcome, reason: r.reason });
      continue;
    }
    if (opts.dryRun) {
      const r = closeRun(run, "dry-run", { reason: `would re-submit ${n} record(s) from ${ref} (${built.skipped.length} skipped); nothing written` });
      out.runs.push({ ...base, outcome: r.outcome, reason: r.reason });
      continue;
    }
    writeProposal(built.proposal, root);
    writeWorkingFile(run.runId, "resubmission.md", account, root);
    const v = await verify(run.runId, { root, deps: opts.deps });
    const admitted = v.accepted ? v.accepted.sources + v.accepted.evidence + v.accepted.claims : 0;
    const rejected = v.rejected ?? 0;
    const settled = v.outcome === "completed" ? settleLegacyKeys(loaded.dir, ref, items, built, v.runId, run, root) : 0;
    if (v.outcome === "completed") settleSkipped(loaded.dir, ref, built, run, root);
    const r = closeRun(run, v.outcome === "completed" ? "completed" : "failed", {
      reason: `re-submitted ${n} record(s) from ${ref} as verify ${v.runId}: admitted ${admitted}, rejected ${rejected}${settled ? `; ${settled} legacy row(s) settled` : ""}${v.reason ? ` — verify: ${v.reason}` : ""}`,
      wrote: v.wrote,
    });
    out.runs.push({ ...base, verifyRunId: v.runId, admitted, rejected, outcome: r.outcome, reason: r.reason });
    out.admitted += admitted;
  }
  return out;
}

function readRows(caseDir: string, root: string): Disposition[] {
  const f = path.join(root, "content", "cases", caseDir, "dispositions.yaml");
  if (!fs.existsSync(f)) return [];
  return (parseYaml(fs.readFileSync(f, "utf8")) as Disposition[] | null) ?? [];
}

/**
 * A legacy row — a blocked row keyed by the title alone, from before verify keyed refusals as it keys admissions — is
 * settled with a row under its own key mirroring what verify wrote under the record's key, so the two never disagree.
 */
export function settleLegacyKeys(caseDir: string, ref: string, items: Resubmittable[], built: Built, verifyRunId: string, run: { runId: string; date: string }, root: string): number {
  const written = readRows(caseDir, root).filter((r) => r.by === verifyRunId);
  const rows: Disposition[] = [];
  for (const it of items) {
    const canonical = keysOf(it.kind, it.record)[0];
    if (!canonical || it.row.key === canonical) continue;
    const mine = written.find((r) => r.key === canonical);
    if (!mine) continue;
    rows.push({
      key: it.row.key,
      kind: it.kind,
      disposition: mine.disposition,
      ...(mine.as ? { as: mine.as } : {}),
      reason: `settled with the row under ${canonical} (re-submitted in ${run.runId}, read in ${verifyRunId})${mine.reason ? `: ${mine.reason}` : ""}`,
      ...(mine.route ? { route: mine.route } : {}),
      observed: it.row.observed,
      by: run.runId,
      date: run.date,
      proposal: ref,
    });
  }
  if (rows.length) appendDispositions(caseDir, rows, root);
  return rows.length;
}

/** A record that cannot be re-submitted — its source never entered, every claim it cited was refused — is refused under its own key, so it is not planned again every pass. */
function settleSkipped(caseDir: string, ref: string, built: Built, run: { runId: string; date: string }, root: string): void {
  const rows: Disposition[] = built.skipped
    .filter((s) => s.key)
    .map((s) => ({ key: s.key, kind: s.kind, disposition: "failed" as const, reason: `not re-submitted (${run.runId}): ${s.reason}`, observed: s.observed, by: run.runId, date: run.date, proposal: ref }));
  if (rows.length) appendDispositions(caseDir, rows, root);
}
