import fs from "node:fs";
import path from "node:path";
import type { Disposition, Proposal } from "../domain/intake.ts";
import { sourceKeys, textKey } from "../domain/keys.ts";
import { findCase, loadCase } from "../domain/load.ts";
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

/**
 * Which records go back through the reader, and why. The provisional pass selects records admitted unread; an answer
 * (src/pipeline/answer.ts) selects the records a panel seat objected to, and tells the reader the objection.
 */
export interface Settlement {
  verb: "reverify" | "answer";
  originals: { sources: Source[]; evidence: Evidence[]; claims: Claim[] };
  /** One line for the run's proposal and history: what is being settled. */
  what: string;
  /** Appended to the reader's context for every record: an objection, in the seat's words, marked as data. */
  context?: string;
  /** The history entry's reason. */
  why: string;
  actor: string;
}

const provisionalSettlement = (loaded: LoadedCase): Settlement => {
  const originals = {
    sources: loaded.sources.filter((s) => s.provisional),
    evidence: loaded.evidence.filter((e) => e.reviewState === "provisional"),
    claims: loaded.claims.filter((c) => c.reviewState === "provisional"),
  };
  const total = originals.sources.length + originals.evidence.length + originals.claims.length;
  return {
    verb: "reverify",
    originals,
    what: `Re-verification of ${total} provisional record(s): the texts are read again and the records settled.`,
    why: "The texts behind records admitted unread were read again by the second reader under the verify protocol; what held was promoted with the reader's stamps, what failed was refused with its reason, what still could not be read stays provisional with the attempt on the record.",
    actor: `aletheia reverify (${READER.model} second reader)`,
  };
};

async function reverifyProvisional(caseSlug: string, opts: ReverifyOptions = {}): Promise<ReverifyOutcome> {
  const loaded = findCase(caseSlug, opts.deps?.cases?.());
  return settleRecords(caseSlug, provisionalSettlement(loaded), opts);
}

/**
 * The originals go back through the reader as if newly proposed, against the ledger without them; the verdicts are
 * applied in place — promoted with the reader's stamps, split parts appended, refusals tombstoned, links to refused
 * claims dropped — and every row, count and history line is derived from what was written.
 */
/** A refusal's "split into A, B" names only the parts that were appended; the rest are counted, not named. */
export function splitNoteFor(reason: string, appended: Set<string>): string {
  return reason.replace(/split into ((?:[A-Z][A-Z0-9]*-[CE]\d{3})(?:, [A-Z][A-Z0-9]*-[CE]\d{3})*)/, (_, list: string) => {
    const ids = list.split(", ");
    const kept = ids.filter((id) => appended.has(id));
    const gone = ids.length - kept.length;
    return `split into ${kept.length ? kept.join(", ") : "nothing that survived"}${gone ? ` (${gone} further part(s) not appended: every claim cited was refused)` : ""}`;
  });
}

export async function settleRecords(caseSlug: string, settlement: Settlement, opts: ReverifyOptions = {}): Promise<ReverifyOutcome> {
  const root = opts.root ?? process.cwd();
  const now = opts.now ?? (() => new Date());
  const loaded = findCase(caseSlug, opts.deps?.cases?.());
  const { originals } = settlement;
  const total = originals.sources.length + originals.evidence.length + originals.claims.length;
  const run = openRun(settlement.verb, loaded.record.slug, { model: READER.model, promptVersion: loadProtocol("verify").version }, { now: now(), root });
  const empty = { promoted: 0, appended: 0, refused: 0, unread: 0 };
  if (!total) return { ...closeRun(run, "rested", { reason: settlement.verb === "answer" ? "no records to settle" : "no provisional records" }), ...empty };
  const { runId, date } = run;
  // Every ledger file of the case as it stood before the writes: a failure restores them all, so a run that fails
  // leaves the tree as it found it (2026-09-20: a settlement threw half-way and left a refusal note naming a part it
  // had not appended; the case would not load).
  let restore: (() => string[]) | null = null;
  try {
    const out = new Set([...originals.sources, ...originals.evidence, ...originals.claims].map((r) => r.id));
    const loadedMinus: LoadedCase = {
      ...loaded,
      sources: loaded.sources.filter((s) => !out.has(s.id)),
      evidence: loaded.evidence.filter((e) => !out.has(e.id)),
      claims: loaded.claims.filter((c) => !out.has(c.id)),
    };
    const proposal: Proposal = {
      runId,
      date,
      case: loaded.record.slug,
      producer: settlement.verb,
      model: null,
      promptVersion: null,
      basis: { ledgerHash: loaded.ledgerHash },
      rationale: settlement.what,
      adds: {
        sources: originals.sources.map((s) => ({ ...stripProvisional(s), verification: s.provisional ? ("unverified" as const) : s.verification })),
        evidence: originals.evidence.map((e) => ({ ...stripProvisional(e), reviewState: e.reviewState === "provisional" ? ("ai_extracted" as const) : e.reviewState })),
        claims: originals.claims.map((c) => ({ ...stripProvisional(c), reviewState: c.reviewState === "provisional" ? ("ai_extracted" as const) : c.reviewState })),
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
    const verdicts = await judgeProposal(proposal, loadedMinus, texts, resolved, judge, run.meter, { model: READER.model, date }, split, { model: MODELS.house.model, runId }, settlement.context ? { extraContext: settlement.context } : {});
    const plan = planReverify(verdicts, originals);
    const tag = settlement.verb === "answer" ? "answer" : "re-verify";
    // A claim the reader split: its parts, by the origin they carry.
    const partsOf = new Map<string, string[]>();
    for (const a of plan.appended) {
      const m = /^split of ([A-Z][A-Z0-9]*-[CE]\d{3})/.exec(String((a.record as { origin?: { ref?: string } }).origin?.ref ?? ""));
      if (m) partsOf.set(m[1], [...(partsOf.get(m[1]) ?? []), a.id]);
    }
    // A claim found compound is replaced by its parts, each anchored in the text by the splitter and judged on that
    // anchor (split-v4), or refused with nothing in its place when no part can be anchored and read — §3.2 is
    // categorical, and a claim no part of which the text supports does not stand (review notes #384, #386).
    const refusedClaims = new Set(plan.refuse.filter((r) => r.kind === "claim").map((r) => r.id));
    const counts = { promoted: plan.promote.length, appended: plan.appended.length, refused: plan.refuse.length, unread: plan.unread.length };
    const notes = [...verdicts.notes, ...plan.notes];
    const report = [
      `# ${settlement.verb === "answer" ? "Answer" : "Re-verification"} — ${runId}`,
      ``,
      `${loaded.record.slug}: ${total} record(s) re-read (${settlement.what}); ledger ${loaded.ledgerHash.slice(0, 12)}.${settlement.context ? `\n\nThe reader was told: ${settlement.context}` : ""}`,
      ``,
      `## Promoted`, ...plan.promote.map((p) => `- ${p.kind} ${p.id}`), ``,
      ...(plan.appended.length ? [`## Appended (parts the reader split off)`, ...plan.appended.map((p) => `- ${p.kind} ${p.id}`), ``] : []),
      `## Refused`, ...plan.refuse.map((r) => `- ${r.kind} ${r.id} — ${r.reason}`), ``,
      `## Still unread`, ...plan.unread.map((u) => `- ${u.kind} ${u.id} — ${u.reason}`), ``,
      `## Retrieval`, ...[...texts.entries()].map(([k, f]) => `- ${k} — ${f.ok ? `retrieved${f.via ? ` (${f.via})` : ""}` : `not retrieved: ${f.reason}`}`), ``,
      ...(notes.length ? [`## Notes`, ...notes.map((n) => `- ${n}`), ``] : []),
    ].join("\n");
    writeWorkingFile(runId, "verification.md", report, root);
    const summary = `${tag}: promoted ${counts.promoted}, appended ${counts.appended}, refused ${counts.refused}, still unread ${counts.unread}`;
    if (opts.dryRun) return { ...closeRun(run, "dry-run", { reason: `would ${summary}; nothing written` }), ...counts };

    const caseRoot = path.join(root, "content", "cases", loaded.dir);
    const snapshot = new Map(fs.readdirSync(caseRoot).filter((f) => f.endsWith(".yaml")).map((f) => [f, fs.readFileSync(path.join(caseRoot, f), "utf8")] as const));
    restore = () => {
      // Only a file that changed is written back, and a file that will not take the write is named, not thrown on.
      const notRestored: string[] = [];
      for (const [f, text] of snapshot) {
        const p = path.join(caseRoot, f);
        try {
          if (fs.readFileSync(p, "utf8") !== text) fs.writeFileSync(p, text);
        } catch (err) {
          notRestored.push(`${f}: ${(err as Error).message}`);
        }
      }
      return notRestored;
    };
    // Materialize. Every row, count and history line below is derived from what was actually written (review note
    // #326): a record that could not be promoted or appended after all is settled as unread, once, and only once.
    const caseDir = loaded.dir;
    const file = (f: LedgerFile) => path.join(root, "content", "cases", caseDir, f);
    // A reference to a refused claim goes to the parts it was split into, or away when there are none.
    const relive = (ids: string[]) => [...new Set(ids.flatMap((id) => (refusedClaims.has(id) ? (partsOf.get(id) ?? []) : [id])))];
    const relinkNote = (ids: string[]) => {
      const toParts = ids.filter((id) => refusedClaims.has(id) && partsOf.get(id)?.length);
      return toParts.length ? `Relinked at ${tag === "answer" ? "the answer's re-reading" : "re-verification"} ${date} (${runId}): ${toParts.map((id) => `${id} was split into ${partsOf.get(id)!.join(", ")}`).join("; ")}; this record now cites the parts, and which of them it bears on is for a later reading` : null;
    };
    // A record that cites the parts of a split claim carries the link unread: provisional, no weight, until a pass
    // reads it against each part (§3.5; review note #384).
    const relinkedProvisional = (reason: string) => ({ since: date, exists: "admitted read; relinked at the split of a claim it cited", reason, route: "re-read the record against each part it now cites (the re-verify pass does this)", by: runId });
    const dropRefused = <T extends AnyRecord>(r: T): T => {
      if ("claimIds" in r) {
        const note = relinkNote(r.claimIds);
        const e = r as unknown as Evidence;
        return note ? ({ ...r, claimIds: relive(r.claimIds), limitations: [...e.limitations, note], reviewState: "provisional", provisional: relinkedProvisional(note) } as T) : { ...r, claimIds: relive(r.claimIds) };
      }
      if ("parentClaimIds" in r) {
        const live = (ids: string[] | undefined) => (ids ? relive(ids) : ids);
        return { ...r, parentClaimIds: live(r.parentClaimIds) ?? [], dependsOnClaimIds: live(r.dependsOnClaimIds) ?? [], ...(r.alternativeToClaimIds ? { alternativeToClaimIds: live(r.alternativeToClaimIds) } : {}), ...(r.contradictsClaimIds ? { contradictsClaimIds: live(r.contradictsClaimIds) } : {}) };
      }
      return r;
    };
    const done = { promoted: [] as ReverifyPlan["promote"], appended: [] as ReverifyPlan["appended"], refused: [] as ReverifyPlan["refuse"], unread: [...plan.unread] };
    const relinked: string[] = [];
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
    // A refusal that names the parts it split into names only the parts that were appended (2026-09-20: a part
    // dropped for its claims left the parent's note pointing at a record that did not exist).
    const appendedIds = new Set(done.appended.map((a) => a.id));
    for (const r of plan.refuse) {
      r.reason = splitNoteFor(r.reason, appendedIds);
      const f = file(fileOf(r.id));
      if (r.kind === "claim") {
        // From the state the record is in — provisional for the re-verification pass, ai_extracted or human_reviewed for
        // a record an answer re-read (review note #371: the literal "provisional" would have thrown on a live record).
        const k = originals.claims.find((x) => x.id === r.id)!;
        setField(f, r.id, "reviewState", k.reviewState, "rejected");
        setField(f, r.id, "rejectionReason", null, `Refused at ${tag === "answer" ? "the answer's re-reading" : "re-verification"} ${date} (${runId}): ${r.reason}`);
      } else if (r.kind === "evidence") {
        const e = originals.evidence.find((x) => x.id === r.id)!;
        setField(f, r.id, "reviewState", e.reviewState, "rejected");
        setField(f, r.id, "limitations", e.limitations, [...e.limitations, `Refused at ${tag === "answer" ? "the answer's re-reading" : "re-verification"} ${date} (${runId}): ${r.reason}`]);
      } else {
        // A source is not refused here: it stays provisional until the records that cite it are settled.
        done.unread.push({ kind: r.kind, id: r.id, reason: r.reason });
        continue;
      }
      wrote.add(`content/cases/${caseDir}/${fileOf(r.id)}`);
      done.refused.push(r);
    }
    if (refusedClaims.size) {
      // Records settled this pass — promoted, appended or refused — are not touched again (2026-09-20: a record the
      // reader had refused was refused a second time for its claim, and the second write threw on the first's state).
      const touched = new Set([...done.promoted, ...done.appended, ...done.refused].map((p) => p.id));
      for (const e of loaded.evidence) {
        if (touched.has(e.id) || e.reviewState === "rejected" || !e.claimIds.some((id) => refusedClaims.has(id))) continue;
        const kept = relive(e.claimIds);
        const f = file("evidence.yaml");
        if (kept.length) {
          setField(f, e.id, "claimIds", e.claimIds, kept);
          const note = relinkNote(e.claimIds);
          if (note) {
            // The record cited a claim now split: it cites the parts, all of them, provisional and weightless until a
            // pass reads which of them it bears on — the alternative was to lose the record with the claim.
            setField(f, e.id, "limitations", e.limitations, [...e.limitations, note]);
            if (e.reviewState !== "provisional") setField(f, e.id, "reviewState", e.reviewState, "provisional");
            setField(f, e.id, "provisional", e.provisional ?? null, relinkedProvisional(note));
            relinked.push(e.id);
            notes.push(`${e.id}: ${note}`);
          }
        } else {
          setField(f, e.id, "reviewState", e.reviewState, "rejected");
          setField(f, e.id, "limitations", e.limitations, [...e.limitations, `Refused at ${tag === "answer" ? "the answer's re-reading" : "re-verification"} ${date} (${runId}): every claim it cited was refused`]);
          notes.push(`${e.id}: every claim it cited was refused; refused with them`);
        }
        wrote.add(`content/cases/${caseDir}/evidence.yaml`);
      }
      // Research items and images that cite a refused claim cite its parts, or nothing (§3.2 — the agenda and the
      // plates are live records; a link to a tombstone would keep the case from loading).
      for (const r of loaded.research) {
        if (!r.claimIds?.some((id) => refusedClaims.has(id))) continue;
        setField(file("research.yaml"), r.id, "claimIds", r.claimIds, relive(r.claimIds));
        wrote.add(`content/cases/${caseDir}/research.yaml`);
      }
      for (const im of loaded.images) {
        if (!im.claimIds?.some((id) => refusedClaims.has(id))) continue;
        setField(file("images.yaml"), im.id, "claimIds", im.claimIds, relive(im.claimIds));
        wrote.add(`content/cases/${caseDir}/images.yaml`);
      }
      for (const c of loaded.claims) {
        if (touched.has(c.id) || refusedClaims.has(c.id)) continue;
        const f = file("claims.yaml");
        for (const field of ["parentClaimIds", "dependsOnClaimIds", "alternativeToClaimIds", "contradictsClaimIds"] as const) {
          const ids = c[field];
          if (ids && ids.some((id) => refusedClaims.has(id))) {
            setField(f, c.id, field, ids, relive(ids));
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
    for (const r of done.refused) { const o = originalOf(r.id); if (!o) continue; const key = keyOf(r.kind, o); if (key) rows.push({ key, kind: r.kind, disposition: "failed", reason: `refused at ${tag === "answer" ? "the answer's re-reading" : "re-verification"}: ${r.reason}`, observed: observedOf(o), by: runId, date, proposal: `proposals/${runId}` }); }
    const seenUnread = new Set<string>();
    // An answer leaves a record it could not re-read as it stands: the record was admitted read, and a text that will not
    // come today is no verdict on it; the attempt is in the run's account. Only the provisional pass writes an unread row.
    for (const u of done.unread) { if (seenUnread.has(u.id)) continue; seenUnread.add(u.id); if (settlement.verb === "answer") continue; const o = originalOf(u.id); if (!o) continue; const key = keyOf(u.kind, o); const route = (o as { provisional?: { route: string } }).provisional?.route; if (key) rows.push({ key, kind: u.kind, disposition: "provisional", as: u.id, reason: `still unread on ${date}: ${u.reason}`, observed: observedOf(o), by: runId, date, proposal: `proposals/${runId}`, ...(route ? { route } : {}) }); }
    if (rows.length) appendDispositions(caseDir, rows, root);
    const finalCounts = { promoted: done.promoted.length, appended: done.appended.length, refused: done.refused.length, unread: seenUnread.size };
    const finalSummary = `${tag}: promoted ${finalCounts.promoted}, appended ${finalCounts.appended}, refused ${finalCounts.refused}, still unread ${finalCounts.unread}`;
    if (finalSummary !== summary) {
      writeWorkingFile(runId, "verification.md", report + `\n## What was written\n- ${finalSummary} (the plan above forecast: ${summary})\n`, root);
    }
    appendHistory(
      caseDir,
      {
        date,
        change: `${settlement.what} (${runId}): ${finalSummary}.${relinked.length ? ` Relinked to the parts of a split claim, provisional until read against them: ${relinked.join(", ")}.` : ""}${done.promoted.length ? ` Promoted: ${done.promoted.map((p) => p.id).join(", ")}.` : ""}${done.appended.length ? ` Appended: ${done.appended.map((p) => p.id).join(", ")}.` : ""}${done.refused.length ? ` Refused: ${done.refused.map((r) => `${r.id} (${r.reason})`).join("; ")}.` : ""}`,
        reason: settlement.why,
        actor: settlement.actor,
        aiAssisted: true,
        kind: "content",
      },
      root,
    );
    // The case must load as written; a run whose writes it will not load fails, and they are rolled back.
    if (!opts.deps?.cases && path.resolve(root) === process.cwd()) loadCase(loaded.dir);
    return { ...closeRun(run, "completed", { reason: finalSummary, wrote: [...wrote] }), ...finalCounts };
  } catch (e) {
    const notRestored = restore ? restore() : null;
    const rolledBack = notRestored === null ? "" : notRestored.length ? `; the ledger writes of this run were rolled back except ${notRestored.join("; ")}` : "; the ledger writes of this run were rolled back";
    return { ...closeRun(run, "failed", { reason: `${(e as Error).message}${rolledBack}` }), ...empty };
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
