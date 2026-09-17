import path from "node:path";
import type { Disposition, Proposal } from "../domain/intake.ts";
import { sourceKeys, textKey } from "../domain/keys.ts";
import { findCase } from "../domain/load.ts";
import type { Claim, Evidence, LoadedCase, Source } from "../domain/schema.ts";
import { verifyCitations } from "../lib/citation-check.mjs";
import { MODELS } from "../lib/models.mjs";
import { retrieve, type FetchedSource } from "./fetch.ts";
import { appendHistory, appendRecords, ledgerFileFor, replaceRecord, setField, type LedgerFile } from "./ledger-write.ts";
import { loadProtocol } from "./protocols.ts";
import { appendDispositions, closeRun, openRun, runDir, writeWorkingFile, type RunOutcome } from "./store.ts";
import { READER, defaultJudge, defaultSplitter, judgeProposal, rememberedJudge, rememberedSplitter, textKeyOf, type Judge, type Resolver, type Splitter, type Verdicts, type VerifyOptions } from "./verify.ts";
import { resubmitBlocked, type ResubmitRun } from "./resubmit.ts";

/**
 * `aletheia reverify <case>` — read the texts behind a case's provisional records (ProvisionalSchema: admitted
 * before their text could be read, carrying no weight) and settle them: a record whose text now reads and holds
 * is promoted in place, with the reader's stamps; a record whose text reads and fails is refused — a tombstone
 * with its reason, links to it dropped; a record whose text still cannot be read stays provisional, and the
 * attempt is on the record. The same second reader, the same checks, the same protocol as verify: this verb
 * only decides what to do with the verdicts. The scheduler runs it on a cadence that doubles after each pass
 * that promotes nothing (src/domain/schedule.ts, rule 1b).
 */

type Kind = "source" | "evidence" | "claim";
type AnyRecord = Source | Evidence | Claim;

export interface ReverifyPlan {
  /** Accepted under the id it entered with: written over the provisional record. */
  promote: { kind: Kind; id: string; file: LedgerFile; record: AnyRecord }[];
  /** Accepted under a new id (a split part): appended. */
  appended: { kind: Kind; id: string; file: LedgerFile; record: AnyRecord }[];
  /** The text read and the record failed: a tombstone with the reason. */
  refuse: { kind: Kind; id: string; reason: string }[];
  /** Still unread, or the source no longer answers: stays provisional. */
  unread: { kind: Kind; id: string; reason: string }[];
  notes: string[];
}

const fileOf = (id: string): LedgerFile => {
  const f = ledgerFileFor(id);
  if (!f) throw new Error(`no ledger file for ${id}`);
  return f;
};

/** From the reader's verdicts on the re-submitted records, what happens to each original. Pure. */
export function planReverify(verdicts: Verdicts, originals: { sources: Source[]; evidence: Evidence[]; claims: Claim[] }): ReverifyPlan {
  const plan: ReverifyPlan = { promote: [], appended: [], refuse: [], unread: [], notes: [] };
  const orig = new Map<string, Kind>();
  for (const s of originals.sources) orig.set(s.id, "source");
  for (const e of originals.evidence) orig.set(e.id, "evidence");
  for (const c of originals.claims) orig.set(c.id, "claim");
  const settled = new Set<string>();
  const accepted = (kind: Kind, records: AnyRecord[]) => {
    for (const r of records) {
      const entry = { kind, id: r.id, file: fileOf(r.id), record: r };
      if (orig.has(r.id)) plan.promote.push(entry);
      else plan.appended.push(entry);
      settled.add(r.id);
    }
  };
  accepted("source", verdicts.accepted.sources);
  accepted("evidence", verdicts.accepted.evidence);
  accepted("claim", verdicts.accepted.claims);
  const stillUnread = (kind: Kind, records: (AnyRecord & { provisional?: { reason: string } })[]) => {
    for (const r of records) {
      if (!orig.has(r.id)) continue;
      plan.unread.push({ kind, id: r.id, reason: r.provisional?.reason ?? "text not read" });
      settled.add(r.id);
    }
  };
  stillUnread("source", verdicts.provisional.sources);
  stillUnread("evidence", verdicts.provisional.evidence);
  stillUnread("claim", verdicts.provisional.claims);
  for (const r of verdicts.rejected) {
    const kind = orig.get(r.id);
    if (!kind) {
      plan.notes.push(`${r.kind} ${r.id} (${r.disposition}) — ${r.reason}`);
      continue;
    }
    if (settled.has(r.id)) continue;
    settled.add(r.id);
    if (kind === "source" && /nothing accepted cites it/.test(r.reason)) plan.unread.push({ kind, id: r.id, reason: "nothing that cites it was promoted this pass" });
    else if (r.disposition === "blocked") plan.unread.push({ kind, id: r.id, reason: r.reason });
    else plan.refuse.push({ kind, id: r.id, reason: r.reason });
  }
  for (const [id, kind] of orig) if (!settled.has(id)) plan.unread.push({ kind, id, reason: "not judged this pass" });
  return plan;
}

export interface ReverifyOptions {
  dryRun?: boolean;
  root?: string;
  now?: () => Date;
  deps?: { fetch?: typeof retrieve; judge?: Judge; resolve?: Resolver; split?: Splitter; cases?: () => LoadedCase[] };
}
export interface ReverifyOutcome extends RunOutcome {
  promoted: number;
  appended: number;
  refused: number;
  unread: number;
  /** Records blocked at verification, proposed again and read by verify (src/pipeline/resubmit.ts): one run per proposal they came from. */
  resubmitted?: ResubmitRun[];
  /** How many of those verify admitted this pass. */
  admitted?: number;
}

const stripProvisional = <T extends { provisional?: unknown }>(r: T): Omit<T, "provisional"> => {
  const { provisional: _p, ...rest } = r;
  void _p;
  return rest;
};

async function reverifyProvisional(caseSlug: string, opts: ReverifyOptions = {}): Promise<ReverifyOutcome> {
  const root = opts.root ?? process.cwd();
  const now = opts.now ?? (() => new Date());
  const loaded = findCase(caseSlug, opts.deps?.cases?.());
  const originals = {
    sources: loaded.sources.filter((s) => s.provisional),
    evidence: loaded.evidence.filter((e) => e.reviewState === "provisional"),
    claims: loaded.claims.filter((c) => c.reviewState === "provisional"),
  };
  const total = originals.sources.length + originals.evidence.length + originals.claims.length;
  const run = openRun("reverify", loaded.record.slug, { model: READER.model, promptVersion: loadProtocol("verify").version }, { now: now(), root });
  const empty = { promoted: 0, appended: 0, refused: 0, unread: 0 };
  if (!total) return { ...closeRun(run, "rested", { reason: "no provisional records" }), ...empty };
  const { runId, date } = run;
  try {
    // The originals go back through the reader as if newly proposed, against the ledger without them.
    const loadedMinus: LoadedCase = {
      ...loaded,
      sources: loaded.sources.filter((s) => !s.provisional),
      evidence: loaded.evidence.filter((e) => e.reviewState !== "provisional"),
      claims: loaded.claims.filter((c) => c.reviewState !== "provisional"),
    };
    const proposal: Proposal = {
      runId,
      date,
      case: loaded.record.slug,
      producer: "reverify",
      model: null,
      promptVersion: null,
      basis: { ledgerHash: loaded.ledgerHash },
      rationale: `Re-verification of ${total} provisional record(s): the texts are read again and the records settled.`,
      adds: {
        sources: originals.sources.map((s) => ({ ...stripProvisional(s), verification: "unverified" as const })),
        evidence: originals.evidence.map((e) => ({ ...stripProvisional(e), reviewState: "ai_extracted" as const })),
        claims: originals.claims.map((c) => ({ ...stripProvisional(c), reviewState: "ai_extracted" as const })),
        research: [],
        images: [],
      },
      corrections: [],
      dispositions: [],
    };
    // Texts: every source a provisional record rests on, fetched afresh.
    const wanted = new Map<string, Source>();
    for (const s of proposal.adds.sources) wanted.set(s.id, s);
    const sourceOf = (id: string) => proposal.adds.sources.find((s) => s.id === id) ?? loaded.sources.find((s) => s.id === id);
    for (const e of proposal.adds.evidence) { const s = sourceOf(e.sourceId); if (s) wanted.set(s.id, s); }
    for (const c of proposal.adds.claims) { const s = c.sourceAnchor?.sourceId ? sourceOf(c.sourceAnchor.sourceId) : undefined; if (s) wanted.set(s.id, s); }
    const fetcher = opts.deps?.fetch ?? retrieve;
    const texts = new Map<string, FetchedSource>();
    for (const s of wanted.values()) {
      const key = textKeyOf(s);
      const doi = sourceKeys(s).find((k) => k.startsWith("doi:"))?.slice(4) ?? null;
      texts.set(key, s.url || doi ? await fetcher({ url: s.url, doi }, {}) : { url: key, ok: false, status: null, contentType: null, text: null, reason: "the source record carries no URL and no DOI" });
    }
    const identifiers = proposal.adds.sources.flatMap((s) => sourceKeys(s).filter((k) => /^(doi|arxiv|isbn|pmid):/.test(k)).map((k) => ({ kind: k.slice(0, k.indexOf(":")), id: k.slice(k.indexOf(":") + 1) })));
    const resolvedList = identifiers.length ? await (opts.deps?.resolve ?? (verifyCitations as Resolver))(identifiers) : [];
    const resolved = new Map(resolvedList.map((r) => [`${r.kind}:${r.id}`, { status: r.status, note: r.note }]));
    const dir = runDir(runId, root);
    const judge = rememberedJudge(opts.deps?.judge ?? defaultJudge, path.join(dir, "judgments.yaml"), READER.model);
    const split = rememberedSplitter(opts.deps?.split ?? defaultSplitter, path.join(dir, "splits.yaml"), MODELS.house.model);
    const verdicts = await judgeProposal(proposal, loadedMinus, texts, resolved, judge, run.meter, { model: READER.model, date }, split, { model: MODELS.house.model, runId });
    const plan = planReverify(verdicts, originals);
    const refusedClaims = new Set(plan.refuse.filter((r) => r.kind === "claim").map((r) => r.id));
    const counts = { promoted: plan.promote.length, appended: plan.appended.length, refused: plan.refuse.length, unread: plan.unread.length };
    const notes = [...verdicts.notes, ...plan.notes];
    const report = [
      `# Re-verification — ${runId}`,
      ``,
      `${loaded.record.slug}: ${total} provisional record(s) re-read; ledger ${loaded.ledgerHash.slice(0, 12)}.`,
      ``,
      `## Promoted`, ...plan.promote.map((p) => `- ${p.kind} ${p.id}`), ``,
      ...(plan.appended.length ? [`## Appended (parts the reader split off)`, ...plan.appended.map((p) => `- ${p.kind} ${p.id}`), ``] : []),
      `## Refused`, ...plan.refuse.map((r) => `- ${r.kind} ${r.id} — ${r.reason}`), ``,
      `## Still unread`, ...plan.unread.map((u) => `- ${u.kind} ${u.id} — ${u.reason}`), ``,
      `## Retrieval`, ...[...texts.entries()].map(([k, f]) => `- ${k} — ${f.ok ? `retrieved${f.via ? ` (${f.via})` : ""}` : `not retrieved: ${f.reason}`}`), ``,
      ...(notes.length ? [`## Notes`, ...notes.map((n) => `- ${n}`), ``] : []),
    ].join("\n");
    writeWorkingFile(runId, "verification.md", report, root);
    const summary = `re-verify: promoted ${counts.promoted}, appended ${counts.appended}, refused ${counts.refused}, still unread ${counts.unread}`;
    if (opts.dryRun) return { ...closeRun(run, "dry-run", { reason: `would ${summary}; nothing written` }), ...counts };

    // Materialize. Every row, count and history line below is derived from what was actually written (review note
    // #326): a record that could not be promoted or appended after all is settled as unread, once, and only once.
    const caseDir = loaded.dir;
    const file = (f: LedgerFile) => path.join(root, "content", "cases", caseDir, f);
    const dropRefused = <T extends AnyRecord>(r: T): T => {
      if ("claimIds" in r) return { ...r, claimIds: r.claimIds.filter((id) => !refusedClaims.has(id)) };
      if ("parentClaimIds" in r) {
        const live = (ids: string[] | undefined) => ids?.filter((id) => !refusedClaims.has(id));
        return { ...r, parentClaimIds: live(r.parentClaimIds) ?? [], dependsOnClaimIds: live(r.dependsOnClaimIds) ?? [], ...(r.alternativeToClaimIds ? { alternativeToClaimIds: live(r.alternativeToClaimIds) } : {}), ...(r.contradictsClaimIds ? { contradictsClaimIds: live(r.contradictsClaimIds) } : {}) };
      }
      return r;
    };
    const done = { promoted: [] as ReverifyPlan["promote"], appended: [] as ReverifyPlan["appended"], refused: [] as ReverifyPlan["refuse"], unread: [...plan.unread] };
    const wrote = new Set<string>();
    const byFile = new Map<LedgerFile, AnyRecord[]>();
    for (const a of plan.appended) {
      const rec = dropRefused(a.record);
      if ("claimIds" in rec && !rec.claimIds.length) { done.unread.push({ kind: a.kind, id: a.id, reason: "a split part whose claims were all refused; not appended" }); continue; }
      byFile.set(a.file, [...(byFile.get(a.file) ?? []), rec]);
      done.appended.push({ ...a, record: rec });
    }
    for (const [f, recs] of byFile) { appendRecords(caseDir, f, recs, root); wrote.add(`content/cases/${caseDir}/${f}`); }
    for (const p of plan.promote) {
      const rec = dropRefused(p.record);
      if ("claimIds" in rec && !rec.claimIds.length) { done.unread.push({ kind: p.kind, id: p.id, reason: "its claims were all refused this pass; left provisional" }); continue; }
      replaceRecord(file(p.file), p.id, rec as unknown as Record<string, unknown>);
      wrote.add(`content/cases/${caseDir}/${p.file}`);
      done.promoted.push({ ...p, record: rec });
    }
    for (const r of plan.refuse) {
      const f = file(fileOf(r.id));
      if (r.kind === "claim") {
        setField(f, r.id, "reviewState", "provisional", "rejected");
        setField(f, r.id, "rejectionReason", null, `Refused at re-verification ${date} (${runId}): ${r.reason}`);
      } else if (r.kind === "evidence") {
        const e = originals.evidence.find((x) => x.id === r.id)!;
        setField(f, r.id, "reviewState", "provisional", "rejected");
        setField(f, r.id, "limitations", e.limitations, [...e.limitations, `Refused at re-verification ${date} (${runId}): ${r.reason}`]);
      } else {
        // A source is not refused here: it stays provisional until the records that cite it are settled.
        done.unread.push({ kind: r.kind, id: r.id, reason: r.reason });
        continue;
      }
      wrote.add(`content/cases/${caseDir}/${fileOf(r.id)}`);
      done.refused.push(r);
    }
    if (refusedClaims.size) {
      const touched = new Set([...done.promoted, ...done.appended].map((p) => p.id));
      for (const e of loaded.evidence) {
        if (touched.has(e.id) || e.reviewState === "rejected" || !e.claimIds.some((id) => refusedClaims.has(id))) continue;
        const kept = e.claimIds.filter((id) => !refusedClaims.has(id));
        const f = file("evidence.yaml");
        if (kept.length) setField(f, e.id, "claimIds", e.claimIds, kept);
        else {
          setField(f, e.id, "reviewState", e.reviewState, "rejected");
          setField(f, e.id, "limitations", e.limitations, [...e.limitations, `Refused at re-verification ${date} (${runId}): every claim it cited was refused`]);
          notes.push(`${e.id}: every claim it cited was refused; refused with them`);
        }
        wrote.add(`content/cases/${caseDir}/evidence.yaml`);
      }
      for (const c of loaded.claims) {
        if (touched.has(c.id) || refusedClaims.has(c.id)) continue;
        const f = file("claims.yaml");
        for (const field of ["parentClaimIds", "dependsOnClaimIds", "alternativeToClaimIds", "contradictsClaimIds"] as const) {
          const ids = c[field];
          if (ids && ids.some((id) => refusedClaims.has(id))) {
            setField(f, c.id, field, ids, ids.filter((id) => !refusedClaims.has(id)));
            wrote.add(`content/cases/${caseDir}/claims.yaml`);
          }
        }
      }
    }
    // One disposition per original, from what happened to it.
    const rows: Disposition[] = [];
    const observedOf = (r: AnyRecord) => ("statement" in r ? r.statement : r.title);
    const keyOf = (kind: Kind, r: AnyRecord) => (kind === "source" ? (sourceKeys(r as Source)[0] ?? textKey((r as Source).title)) : kind === "claim" ? textKey((r as Claim).statement) : textKey(`${(r as Evidence).title} ${(r as Evidence).sourceStatement}`));
    const originalOf = (id: string): AnyRecord | undefined => [...originals.sources, ...originals.evidence, ...originals.claims].find((r) => r.id === id);
    for (const p of [...done.promoted, ...done.appended]) { const key = keyOf(p.kind, p.record); if (key) rows.push({ key, kind: p.kind, disposition: "in", as: p.id, observed: observedOf(p.record), by: runId, date, proposal: `proposals/${runId}` }); }
    for (const r of done.refused) { const o = originalOf(r.id); if (!o) continue; const key = keyOf(r.kind, o); if (key) rows.push({ key, kind: r.kind, disposition: "failed", reason: `refused at re-verification: ${r.reason}`, observed: observedOf(o), by: runId, date, proposal: `proposals/${runId}` }); }
    const seenUnread = new Set<string>();
    for (const u of done.unread) { if (seenUnread.has(u.id)) continue; seenUnread.add(u.id); const o = originalOf(u.id); if (!o) continue; const key = keyOf(u.kind, o); const route = (o as { provisional?: { route: string } }).provisional?.route; if (key) rows.push({ key, kind: u.kind, disposition: "provisional", as: u.id, reason: `still unread on ${date}: ${u.reason}`, observed: observedOf(o), by: runId, date, proposal: `proposals/${runId}`, ...(route ? { route } : {}) }); }
    if (rows.length) appendDispositions(caseDir, rows, root);
    const finalCounts = { promoted: done.promoted.length, appended: done.appended.length, refused: done.refused.length, unread: seenUnread.size };
    const finalSummary = `re-verify: promoted ${finalCounts.promoted}, appended ${finalCounts.appended}, refused ${finalCounts.refused}, still unread ${finalCounts.unread}`;
    if (finalSummary !== summary) {
      writeWorkingFile(runId, "verification.md", report + `\n## What was written\n- ${finalSummary} (the plan above forecast: ${summary})\n`, root);
    }
    appendHistory(
      caseDir,
      {
        date,
        change: `Re-verification of ${total} provisional record(s) (${runId}): ${finalSummary}.${done.promoted.length ? ` Promoted: ${done.promoted.map((p) => p.id).join(", ")}.` : ""}${done.appended.length ? ` Appended: ${done.appended.map((p) => p.id).join(", ")}.` : ""}${done.refused.length ? ` Refused: ${done.refused.map((r) => `${r.id} (${r.reason})`).join("; ")}.` : ""}`,
        reason: "The texts behind records admitted unread were read again by the second reader under the verify protocol; what held was promoted with the reader's stamps, what failed was refused with its reason, what still could not be read stays provisional with the attempt on the record.",
        actor: `aletheia reverify (${READER.model} second reader)`,
        aiAssisted: true,
        kind: "content",
      },
      root,
    );
    return { ...closeRun(run, "completed", { reason: finalSummary, wrote: [...wrote] }), ...finalCounts };
  } catch (e) {
    return { ...closeRun(run, "failed", { reason: (e as Error).message }), ...empty };
  }
}


/**
 * The verb: the provisional records are read again (above), then the records verification blocked — never entered,
 * their proposal still holding them — are proposed again under fresh ids and read by the ordinary verify verb, one
 * run per proposal (2026-09-17, the 51 Amazon rows blocked when the archive did not serve). The outcome carries
 * both: `promoted` from the first, `admitted` from the second; either moving the ledger is what the scheduler and
 * the sitting act on.
 */
export async function runReverify(caseSlug: string, opts: ReverifyOptions = {}): Promise<ReverifyOutcome> {
  const first = await reverifyProvisional(caseSlug, opts);
  if (first.outcome === "failed") return first;
  const sub = await resubmitBlocked(caseSlug, { root: opts.root, dryRun: opts.dryRun, now: opts.now, deps: opts.deps as VerifyOptions["deps"] });
  if (!sub.runs.length && !sub.notes.length) return first;
  const moved = sub.runs.some((r) => r.outcome === "completed");
  const outcome = first.outcome === "rested" && moved ? "completed" : first.outcome === "rested" && sub.runs.some((r) => r.outcome === "dry-run") ? "dry-run" : first.outcome;
  const reason = [first.reason, ...sub.runs.map((r) => r.reason), ...sub.notes].filter(Boolean).join("; ");
  return { ...first, outcome, reason, resubmitted: sub.runs, admitted: sub.admitted };
}
