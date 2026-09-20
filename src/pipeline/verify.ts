import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { Disposition, Proposal } from "../domain/intake.ts";
import { canonicalJson, sha256Hex } from "../domain/hash.ts";
import { sameTitle, sourceKeys, textKey } from "../domain/keys.ts";
import { caseAccounts, caseQuestion } from "../domain/editions.ts";
import { claimAnchorErrors, findCase, sourceAdmissionErrors } from "../domain/load.ts";
import type { Claim, Evidence, EvidenceDirection, LoadedCase, ReaderAct, ResearchOpportunity, Source } from "../domain/schema.ts";
import { verifyCitations } from "../lib/citation-check.mjs";
import { archiveUrl, type Archived } from "./archive.ts";
import { leadsOf, settleLeads } from "./leads.ts";
import { retrieve, type FetchedSource } from "./fetch.ts";
import { isoDate } from "../lib/overlay-ids.mjs";
import { appendHistory, appendRecords, applyCorrections, ledgerFileFor, type Correction } from "./ledger-write.ts";
import { MODELS } from "../lib/models.mjs";
import { anthropicJson, type Meter } from "./models.ts";
import { loadProtocol, renderProtocol } from "./protocols.ts";
import { quotedSpans, unverifiedQuotes } from "./quotes.ts";
import { narrowLocator, pageOfQuote, scrubUnadmitted } from "../domain/proseRefs.ts";
import { appendDispositions, closeRun, openRun, readProposal, writeWorkingFile, type RunOutcome } from "./store.ts";

/**
 * `aletheia verify <proposalRunId>` — verify (docs/AUTOMATION.md, "The verbs").
 *
 * Mechanical first: every proposed source identifier is resolved; every
 * source is fetched again; every quoted span in an evidence record or claim
 * anchor is matched verbatim against the retrieved text. What fails there
 * is `failed` or `blocked` without a model. Then the adversarial reading:
 * a different model, given the retrieved text and NOT the drafter's
 * rationale, tries to reject each reading that passed. Finally the
 * accepted records are checked as a prospective ledger (anchors, admission,
 * dangling ids) and written — records appended to the case files,
 * dispositions appended, a history entry — leaving the working tree
 * changed for the PR the panel judges.
 */

/** The second reader (config/models.yaml): a different model from the drafter. */
export const READER = MODELS.reader;

export const VERIFY_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["quoteInContext", "statementSupported", "locatorSupported", "directionRight", "independenceNoted", "relevant", "atomic", "ofTheCompound", "direction", "bearsOn", "bearing", "reason"],
  properties: {
    quoteInContext: { type: "boolean" },
    statementSupported: { type: "boolean" },
    locatorSupported: { type: "boolean" },
    directionRight: { type: "boolean" },
    independenceNoted: { type: "boolean" },
    relevant: { type: "boolean" },
    atomic: { type: "boolean" },
    /** v7: for a part of a split, whether it is one of the propositions the compound bundled; null when the record is not a part. */
    ofTheCompound: { anyOf: [{ type: "boolean" }, { type: "null" }] },
    /** v5: the direction the reader finds right when `directionRight` is false; null otherwise. */
    direction: { anyOf: [{ type: "string", enum: ["supports", "undermines", "qualifies", "context"] }, { type: "null" }] },
    /** v5: the claims, among those the record names, the passage bears on — when it does not bear on all of them; null otherwise. */
    bearsOn: { anyOf: [{ type: "array", items: { type: "string" } }, { type: "null" }] },
    /** v6: per named claim, the direction the passage bears with toward it (null: does not bear on it); null when the record's stated direction is right for every claim it names. */
    bearing: {
      anyOf: [
        { type: "array", items: { type: "object", additionalProperties: false, required: ["claimId", "direction"], properties: { claimId: { type: "string" }, direction: { anyOf: [{ type: "string", enum: ["supports", "undermines", "qualifies", "context"] }, { type: "null" }] } } } },
        { type: "null" },
      ],
    },
    reason: { type: "string" },
  },
};

export interface VerifyReply {
  quoteInContext: boolean;
  statementSupported: boolean;
  locatorSupported: boolean;
  directionRight: boolean;
  independenceNoted: boolean;
  relevant: boolean;
  /** One proposition with one truth condition (§3.2); a compound claim is split, not admitted. Absent means true. */
  atomic?: boolean;
  /**
   * v7: for a part of a split, whether it states one of the propositions the compound bundled; a part that states
   * something the compound did not is refused (2026-09-20: a split drifted to a neighbouring sentence and a
   * duplicate of another claim, every other check passed, and the recorded lineage was false). Null or absent when
   * the record is not a part.
   */
  ofTheCompound?: boolean | null;
  /**
   * v5: when `directionRight` is false, the direction the reader finds right; verify writes it on the
   * admitted record. Absent or null with a false `directionRight` is the v2 dissent, written as a note.
   */
  direction?: EvidenceDirection | null;
  /**
   * v5: when the record names claims the passage does not bear on, the ids it does bear on; verify keeps
   * those links and drops the rest. An empty list refuses the record. Absent or null: every link stands.
   */
  bearsOn?: string[] | null;
  /**
   * v6: per named claim, the direction the passage bears with toward it, or null where it does not bear on
   * that claim. A record whose claims bear in different directions is split by direction at intake — one
   * record per direction, the same quote — since a record carries one direction (2026-09-10: a reader
   * that could name only one direction for two claims set the wrong one on the claim that survived).
   */
  bearing?: { claimId: string; direction: EvidenceDirection | null }[] | null;
  /** Set when the answer was remembered from an earlier run rather than asked now. */
  remembered?: { runId: string; date: string };
  reason: string;
}

const DIRECTIONS = new Set<string>(["supports", "undermines", "qualifies", "context"]);

/**
 * What the second reader's verdict does to an evidence record it admits (protocol v5): a direction it
 * finds wrong becomes the one it names, and claims the passage does not bear on leave the record's
 * links — each written on the record as the reader's act, stamped. A verdict that disputes the
 * direction without naming one is written as a dissent, as v2 did. Null when the reader finds the
 * passage bears on none of the claims the record names: that record is not admitted.
 */
/** Who changed the record and under what: the reader's model, the verify run, the protocol, the date. */
export interface ReaderStamp {
  model: string;
  runId: string;
  promptVersion: string;
  date: string;
}

const stampText = (s: ReaderStamp) => `${s.model}, ${s.date}, run ${s.runId}, ${s.promptVersion}`;

export function applyReader(e: Evidence, verdict: VerifyReply, stamp: ReaderStamp, nextId: () => string = () => e.id): { records: Evidence[]; notes: string[] } | null {
  let record = e;
  const notes: string[] = [];
  const act = (field: ReaderAct["field"], from: ReaderAct["from"], to: ReaderAct["to"]): ReaderAct => ({ field, from, to, ...stamp, reason: verdict.reason });
  // v6: a bearing per claim. Claims the passage does not bear on leave; the rest are grouped by the
  // direction the reader finds, and each group is a record of its own — the first keeps the id.
  if (Array.isArray(verdict.bearing) && verdict.bearing.length) {
    // Fail closed: the bearing must name every claim the record names, once each, and nothing else; a
    // bearing that misses a claim, repeats one, or names a foreign one is not applied — the record is
    // admitted with the reader's dissent written on it, and the fault said aloud (review note #277).
    const ids = verdict.bearing.map((b) => b.claimId);
    const foreign = ids.filter((id) => !e.claimIds.includes(id));
    const missing = e.claimIds.filter((id) => !ids.includes(id));
    const repeated = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (foreign.length || missing.length || repeated.length) {
      const fault = [foreign.length ? `names ${foreign.join(", ")}, which the record does not` : "", missing.length ? `omits ${missing.join(", ")}` : "", repeated.length ? `repeats ${[...new Set(repeated)].join(", ")}` : ""].filter(Boolean).join("; ");
      notes.push(`${e.id}: the second reader's bearing ${fault} — not applied; the record is admitted with the dissent written on it`);
      return { records: [{ ...record, limitations: [...record.limitations, `Second reader (${stampText(stamp)}) disputes the stated direction (its bearing ${fault}, so it was not applied): ${verdict.reason}`] }], notes };
    }
    const found = new Map(verdict.bearing.map((b) => [b.claimId, b.direction]));
    const keep = e.claimIds.filter((id) => found.get(id) !== null);
    if (keep.length === 0) return null;
    const dropped = e.claimIds.filter((id) => !keep.includes(id));
    const groups = new Map<EvidenceDirection, string[]>();
    for (const id of keep) {
      const d = (found.get(id) ?? e.direction) as EvidenceDirection;
      if (!DIRECTIONS.has(d)) continue;
      groups.set(d, [...(groups.get(d) ?? []), id]);
    }
    const records: Evidence[] = [];
    let first = true;
    for (const [d, ids] of groups) {
      const acts: ReaderAct[] = [];
      if (ids.length < e.claimIds.length) acts.push(act("claimIds", e.claimIds, ids));
      if (d !== e.direction) acts.push(act("direction", e.direction, d));
      const lim = [...e.limitations];
      if (dropped.length && first) lim.push(`Second reader (${stampText(stamp)}) found the passage bears on ${keep.join(", ")} and not on ${dropped.join(", ")}; the link${dropped.length > 1 ? "s" : ""} dropped at intake: ${verdict.reason}`);
      if (groups.size > 1) lim.push(`Second reader (${stampText(stamp)}) found the passage bears in different directions on the claims the record named; this record carries "${d}" toward ${ids.join(", ")}, the rest went to ${groups.size - 1 === 1 ? "a record" : "records"} of ${groups.size === 2 ? "its" : "their"} own at intake: ${verdict.reason}`);
      if (d !== e.direction && groups.size === 1) lim.push(`Direction set to "${d}" (from "${e.direction}") by the second reader (${stampText(stamp)}) at intake: ${verdict.reason}`);
      records.push({ ...e, id: first ? e.id : nextId(), ...(first ? {} : { title: `${e.title} — toward ${ids.join(", ")}` }), claimIds: ids, direction: d, limitations: lim, ...(acts.length ? { readerActs: [...(e.readerActs ?? []), ...acts] } : {}) });
      first = false;
    }
    if (records.length === 0) return null;
    if (dropped.length) notes.push(`${e.id}: link${dropped.length > 1 ? "s" : ""} to ${dropped.join(", ")} dropped by the second reader`);
    if (groups.size > 1) notes.push(`${e.id}: split by direction by the second reader into ${records.map((r) => `${r.id} (${r.direction} → ${r.claimIds.join(", ")})`).join("; ")}`);
    else if (records[0].direction !== e.direction) notes.push(`${e.id}: direction set to ${records[0].direction} by the second reader`);
    return { records, notes };
  }
  if (Array.isArray(verdict.bearsOn)) {
    const keep = e.claimIds.filter((id) => verdict.bearsOn!.includes(id));
    if (keep.length === 0) return null;
    if (keep.length < e.claimIds.length) {
      const dropped = e.claimIds.filter((id) => !keep.includes(id));
      record = {
        ...record,
        claimIds: keep,
        limitations: [...record.limitations, `Second reader (${stampText(stamp)}) found the passage bears on ${keep.join(", ")} and not on ${dropped.join(", ")}; the link${dropped.length > 1 ? "s" : ""} dropped at intake: ${verdict.reason}`],
        readerActs: [...(record.readerActs ?? []), act("claimIds", e.claimIds, keep)],
      };
      notes.push(`${e.id}: link${dropped.length > 1 ? "s" : ""} to ${dropped.join(", ")} dropped by the second reader`);
    }
  }
  if (verdict.directionRight === false) {
    const d = verdict.direction;
    if (typeof d === "string" && DIRECTIONS.has(d) && d !== e.direction) {
      record = {
        ...record,
        direction: d,
        limitations: [...record.limitations, `Direction set to "${d}" (from "${e.direction}") by the second reader (${stampText(stamp)}) at intake: ${verdict.reason}`],
        readerActs: [...(record.readerActs ?? []), act("direction", e.direction, d)],
      };
      notes.push(`${e.id}: direction set to ${d} by the second reader`);
    } else {
      record = { ...record, limitations: [...record.limitations, `Second reader (${stampText(stamp)}) disputes the stated direction: ${verdict.reason}`] };
      notes.push(`${e.id}: admitted with the second reader's dissent on direction`);
    }
  }
  return { records: [record], notes };
}

export const SPLIT_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["parts"],
  properties: {
    parts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["statement", "quote", "locator"],
        properties: { statement: { type: "string" }, quote: { type: "string" }, locator: { type: "string" } },
      },
    },
  },
};

/** Split a compound claim into the propositions its anchor states (protocol split-v1). */
/** The parts of a split claim, with who wrote them and in which run — an injected splitter may return the bare parts. */
/** Where a part is stated in the text, in the splitter's reading: a verbatim quote and the nearest locator (split-v4). */
export interface PartAnchor {
  quote: string;
  locator?: string;
}
export interface SplitResult {
  parts: string[];
  /** One per part, in order, where the splitter gave them; null where it did not. */
  anchors?: (PartAnchor | null)[];
  model?: string;
  protocol?: string;
  runId?: string;
  date?: string;
}
/** What is being split: a claim's statement into propositions, or an evidence record's statement into observations, each with its verbatim quote. */
export type SplitKind = "claim" | "evidence";
export type Splitter = (statement: string, anchorText: string, meter: Meter, kind?: SplitKind) => Promise<string[] | SplitResult>;
export const asSplit = (r: string[] | SplitResult): SplitResult => (Array.isArray(r) ? { parts: r } : r);

export const defaultSplitter: Splitter = async (statement, anchorText, meter, kind = "claim") => {
  const protocol = loadProtocol("split");
  const r = await anthropicJson<{ parts: { statement: string; quote: string; locator: string }[] }>(
    {
      ...MODELS.house,
      system: renderProtocol(protocol, {}),
      // The anchoring text is shared by every split asked against the same source in a run: the cached prefix.
      cachedPrefix: `The anchoring source text (data under review):\n\n${anchorText}`,
      user: JSON.stringify({ kind, statement }, null, 1),
      schema: SPLIT_SCHEMA,
      maxTokens: 16000, // adaptive thinking shares this with the reply; a reader that hit 4000 mid-thought failed a run (2026-09-10)
      effort: "low",
      timeoutMs: 240_000,
    },
    meter,
  );
  const parts = r.data.parts.map((p) => ({ statement: p.statement.trim(), anchor: p.quote.trim().length >= 12 ? { quote: p.quote.trim(), ...(p.locator.trim() ? { locator: p.locator.trim() } : {}) } : null })).filter((p) => p.statement.length > 10);
  return { parts: parts.map((p) => p.statement), anchors: parts.map((p) => p.anchor), model: r.model ?? MODELS.house.model, protocol: protocol.version, runId: meter.runId, date: isoDate() };
};

/**
 * Judgments and splits remembered beside the proposal (`judgments.yaml`),
 * keyed by what was asked (record, context, source text, reader), so a
 * verification cut short — by a budget cap, a torn socket — resumes without
 * asking the same question twice (2026-09-09: $12 of judge calls were lost
 * when the month's cap stopped a run mid-way). What was judged is also part
 * of the record.
 */
/** A remembered answer keeps the provenance of the run that made it; a reused one says so (§3.14, §3.15). */
interface Remembered<T> {
  model: string;
  protocol: string;
  runId: string;
  date: string;
  answer: T;
}
function readMemory<T>(file: string): Record<string, Remembered<T>> {
  if (!fs.existsSync(file)) return {};
  const raw = (parseYaml(fs.readFileSync(file, "utf8")) as Record<string, Remembered<T> | unknown>) ?? {};
  // An entry without provenance (the first cache format) is not reused: the question is asked again.
  return Object.fromEntries(Object.entries(raw).filter(([, v]) => v && typeof v === "object" && "answer" in (v as object) && "runId" in (v as object))) as Record<string, Remembered<T>>;
}
function writeMemory<T>(file: string, memory: Record<string, Remembered<T>>): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, stringifyYaml(memory, { lineWidth: 0 }));
}

export function rememberedJudge(judge: Judge, file: string, readerModel: string, protocol = loadProtocol("verify").version): Judge {
  const memory = readMemory<VerifyReply>(file);
  return async (record, sourceText, context, meter) => {
    // The protocol is part of the question: a judgment under an earlier protocol does not answer the current one.
    const key = sha256Hex(canonicalJson({ record, context, sourceText, readerModel, protocol }));
    const had = memory[key];
    if (had) return { ...had.answer, remembered: { runId: had.runId, date: had.date } };
    const reply = await judge(record, sourceText, context, meter);
    memory[key] = { model: readerModel, protocol, runId: meter.runId, date: isoDate(), answer: reply };
    writeMemory(file, memory);
    return reply;
  };
}

export function rememberedSplitter(split: Splitter, file: string, model: string, protocol = loadProtocol("split").version): Splitter {
  // A remembered split is the bare parts (the first format) or the parts with their anchors (split-v4).
  type Remembered = string[] | { parts: string[]; anchors?: (PartAnchor | null)[] };
  const memory = readMemory<Remembered>(file);
  const unpack = (a: Remembered) => (Array.isArray(a) ? { parts: a } : { parts: a.parts, ...(a.anchors ? { anchors: a.anchors } : {}) });
  return async (statement, anchorText, meter, kind = "claim") => {
    const key = sha256Hex(canonicalJson({ statement, anchorText, model, protocol, kind }));
    const had = memory[key];
    if (had) return { ...unpack(had.answer), model: had.model, protocol: had.protocol, runId: had.runId, date: had.date };
    const r = asSplit(await split(statement, anchorText, meter, kind));
    const entry = { model: r.model ?? model, protocol: r.protocol ?? protocol, runId: r.runId ?? meter.runId, date: r.date ?? isoDate(), answer: r.anchors ? { parts: r.parts, anchors: r.anchors } : r.parts };
    memory[key] = entry;
    writeMemory(file, memory);
    return { ...unpack(entry.answer), model: entry.model, protocol: entry.protocol, runId: entry.runId, date: entry.date };
  };
}

/** The next free claim id in the case's scheme, given the ledger and everything proposed so far. */
export function nextClaimId(loaded: LoadedCase, taken: Iterable<string>): string {
  return nextId("C", loaded.claims.map((c) => c.id), loaded, taken);
}
/** The next free evidence id, the same way. */
export function nextEvidenceId(loaded: LoadedCase, taken: Iterable<string>): string {
  return nextId("E", loaded.evidence.map((e) => e.id), loaded, taken);
}
/**
 * An issuer of fresh evidence ids for one record's reading: every id it hands out is taken by the next call, and
 * `taken` is read afresh each time so the record's own id and every record admitted so far are counted. Before
 * 2026-09-17 the split-part path handed the reader a callback that read no list holding the part itself, so a part
 * split by direction got the part's own id — AMZ-E110 twice on #353 — and a three-way split would have collided twice.
 */
export function freshEvidenceIds(loaded: LoadedCase, taken: () => Iterable<string>): () => string {
  const handed: string[] = [];
  return () => {
    const id = nextEvidenceId(loaded, [...taken(), ...handed]);
    handed.push(id);
    return id;
  };
}
/** Ids that occur more than once across a prospective ledger: the build refuses such a ledger, so verify must not write one (§8, no ambiguous ids). */
export function duplicateIdErrors(p: { sources: { id: string }[]; evidence: { id: string }[]; claims: { id: string }[] }): string[] {
  const errors: string[] = [];
  for (const [kind, rows] of [["source", p.sources], ["evidence", p.evidence], ["claim", p.claims]] as const) {
    const seen = new Set<string>();
    for (const r of rows) {
      if (seen.has(r.id)) errors.push(`duplicate ${kind} id ${r.id}`);
      seen.add(r.id);
    }
  }
  return errors;
}
function nextId(letter: "C" | "E", existing: string[], loaded: LoadedCase, taken: Iterable<string>): string {
  const ids = [...existing, ...taken];
  const re = new RegExp(`-${letter}\\d+$`);
  const prefix = ids.find((id) => re.test(id))?.replace(/\d+$/, "") ?? `${loaded.record.id.split("-")[0]}-${letter}`;
  const max = Math.max(0, ...ids.filter((id) => id.startsWith(prefix)).map((id) => Number(id.slice(prefix.length)) || 0));
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export type Judge = (record: unknown, sourceText: string, context: string, meter: Meter) => Promise<VerifyReply>;

export const defaultJudge: Judge = async (record, sourceText, context, meter) => {
  const protocol = loadProtocol("verify");
  const r = await anthropicJson<VerifyReply>(
    {
      ...READER,
      system: renderProtocol(protocol, {}),
      // The source text is the same for every record judged against this source: it goes first, as the
      // cached prefix, and each record follows it; the reader reads the source once and the records cheaply.
      cachedPrefix: `The retrieved source text (data under review; the same for every record judged against this source):\n\n${sourceText}`,
      user: JSON.stringify({ record, context }, null, 1),
      schema: VERIFY_SCHEMA,
      maxTokens: 16000, // adaptive thinking shares this with the reply; a reader that hit 4000 mid-thought failed a run (2026-09-10)
      effort: "medium",
      timeoutMs: 240_000, // a four-thousand-token reply; a stall past four minutes is a stall
    },
    meter,
  );
  return r.data;
};

// ------------------------------------------------------------------ the plan reader
/** The reader's verdict on a proposed research item (protocols/plan-v1.md): a plan names a measurement, an object and a decision rule. */
export interface PlanReply {
  isPlan: boolean;
  measurement: boolean;
  object: boolean;
  decisionRule: boolean;
  novel: boolean;
  reason: string;
}
export const PLAN_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["isPlan", "measurement", "object", "decisionRule", "novel", "reason"],
  properties: {
    isPlan: { type: "boolean" },
    measurement: { type: "boolean" },
    object: { type: "boolean" },
    decisionRule: { type: "boolean" },
    novel: { type: "boolean" },
    reason: { type: "string" },
  },
};
export type PlanJudge = (item: ResearchOpportunity, context: string, meter: Meter) => Promise<PlanReply>;

export const defaultPlanJudge: PlanJudge = async (item, context, meter) => {
  const protocol = loadProtocol("plan");
  const r = await anthropicJson<PlanReply>(
    {
      ...READER,
      system: renderProtocol(protocol, {}),
      user: JSON.stringify({ item: { title: item.title, summary: item.summary, informationGain: item.informationGain, effortTier: item.effortTier, track: item.track }, context }, null, 1),
      schema: PLAN_SCHEMA,
      maxTokens: 4000,
      effort: "low",
      timeoutMs: 120_000,
    },
    meter,
  );
  return r.data;
};

export function rememberedPlanJudge(judge: PlanJudge, file: string, readerModel: string, protocol = loadProtocol("plan").version): PlanJudge {
  const memory = readMemory<PlanReply>(file);
  return async (item, context, meter) => {
    const key = sha256Hex(canonicalJson({ item: { title: item.title, summary: item.summary, informationGain: item.informationGain }, context, readerModel, protocol }));
    const had = memory[key];
    if (had) return had.answer;
    const reply = await judge(item, context, meter);
    memory[key] = { model: readerModel, protocol, runId: meter.runId, date: isoDate(), answer: reply };
    writeMemory(file, memory);
    return reply;
  };
}

export type Resolver = (citations: { kind: string; id: string }[]) => Promise<{ kind: string; id: string; status: string; note: string }[]>;

export interface Verdicts {
  accepted: { sources: Source[]; evidence: Evidence[]; claims: Claim[]; research: ResearchOpportunity[] };
  /** Records admitted before their text could be read (ProvisionalSchema): the source exists, the text does not, yet. */
  provisional: { sources: Source[]; evidence: Evidence[]; claims: Claim[] };
  rejected: { id: string; kind: Disposition["kind"]; observed: string; disposition: "failed" | "blocked"; reason: string; route?: string }[];
  notes: string[];
}

function identifiersOf(s: Source): { kind: string; id: string }[] {
  const out: { kind: string; id: string }[] = [];
  for (const k of sourceKeys(s)) {
    const [kind, id] = [k.slice(0, k.indexOf(":")), k.slice(k.indexOf(":") + 1)];
    if (kind === "doi" || kind === "arxiv") out.push({ kind, id });
  }
  if (out.length === 0 && s.url) out.push({ kind: "url", id: s.url });
  return out;
}

const doiOf = (s: Source): string | null => identifiersOf(s).find((i) => i.kind === "doi")?.id ?? null;
/** The key a source's retrieved text is filed under: its URL, its DOI link, or — for a source with neither — its own id. */
export const textKeyOf = (s: Source): string => s.url ?? (doiOf(s) ? `https://doi.org/${doiOf(s)}` : `source:${s.id}`);

/**
 * Texts the intake supplied for sources it identified (an inbox run's
 * manifest names, per document, the ledger source it is): read from the
 * run's documents/, so a claim anchored to the founder's own essay is
 * checked against the very text the drafter was shown.
 */
export function suppliedTexts(proposal: Proposal, sources: Source[], root = process.cwd()): Map<string, FetchedSource> {
  const out = new Map<string, FetchedSource>();
  const runDirOf = proposal.report?.match(/^proposals\/([^/]+)\//)?.[1];
  if (!runDirOf) return out;
  const manifestFile = path.join(root, "proposals", runDirOf, "manifest.yaml");
  if (!fs.existsSync(manifestFile)) return out;
  const manifest = parseYaml(fs.readFileSync(manifestFile, "utf8")) as { items?: { ledgerSource?: string | null; document?: string | null; name?: string; sha256?: string; title?: string; permission?: string | null }[] };
  for (const it of manifest.items ?? []) {
    if (!it.document) continue;
    // A document the intake recorded no permission for supplies no text at all: nothing anchors to it, nothing
    // quotes it, whether the Source is proposed here or already in the ledger (§3.15). A manifest without the
    // field — written before 2026-09-09 — is a manifest without a recorded permission, and supplies none either;
    // a document taken in then is re-dropped to be quoted again.
    if (!it.permission) continue;
    // The source the intake identified, else a source (the ledger's or this proposal's) whose title is the document's.
    const src = sources.find((s) => it.ledgerSource && s.id === it.ledgerSource) ?? (it.title ? sources.find((s) => sameTitle(it.title!, s.title)) : undefined);
    const file = path.join(root, "proposals", runDirOf, it.document);
    if (!src || !fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    out.set(textKeyOf(src), { url: textKeyOf(src), ok: true, status: null, contentType: "text/plain", text, via: `supplied document ${it.name} (sha256 ${(it.sha256 ?? "").slice(0, 12)}), ${it.ledgerSource ? `identified at intake as ${src.id}` : `matched by title to ${src.id}`}`, ...(it.permission ? { permission: it.permission } : {}) });
  }
  return out;
}

/**
 * The report's Corrections section: one line per correction, ending in what `status` says of it — a forecast from the
 * ledger before the writer runs, the writer's own outcome after. Pure, so the two renderings can be compared.
 */
export function correctionLines(corrections: Correction[], status: (c: Correction) => string): string[] {
  if (!corrections.length) return [];
  return [`## Corrections`, ...corrections.map((c) => `- ${c.record}.${c.field}: "${String(c.from).slice(0, 120)}" → "${String(c.to).slice(0, 120)}" — ${c.reason}${status(c)}`), ``];
}

/**
 * Whether a retrieved text is a stand-in for the cited document — an open-access copy, an arXiv PDF read for
 * an abstract page — rather than the document itself. The fetch layer says so with a typed flag at the two
 * places it chooses a stand-in; the `via` description is for readers and decides nothing here (review notes
 * #315, #318: a predicate on the description would have let a direct document with any note escape failure).
 * A quote not found in a stand-in is unverified, not false — the wording may differ between copies — so the
 * record is blocked with a route to the cited text, not failed (2026-09-16: four claims and an evidence record
 * of the Immortality Key draft were failed against an OpenAlex copy of Łucejko 2018). A miss in the document
 * itself, or in a supplied document, is a miss.
 */
export function substituteCopy(fetched: Pick<FetchedSource, "substitute" | "via"> | undefined): boolean {
  return fetched?.substitute === true;
}

/**
 * What shows a source exists when its text could not be read — the ground on which a record may enter
 * provisionally (founder direction, 2026-09-17): an identifier the resolver confirmed, or a URL that answered
 * (a scanned PDF with no text layer, a paywall served with 200, an unsupported content type). Null when nothing
 * did: a fetch that never connected, a 403, a 404, a 429 prove nothing about the document, and the record stays
 * blocked as before. The fabrication check — identifiers must resolve — is untouched by this.
 */
export function sourceExists(
  source: Source | undefined,
  fetched: Pick<FetchedSource, "status" | "reason" | "pageTitle"> | undefined,
  resolved: Map<string, { status: string; note: string }>,
): string | null {
  // Identity, not reachability (review note on #322): the resolver's metadata or the document's own title must name
  // the record's title. A registered DOI with no metadata, or a URL that merely answered, proves nothing about which
  // document it is.
  const title = source?.title ?? "";
  if (source) {
    const ids = identifiersOf(source).map((i) => ({ ...i, r: resolved.get(`${i.kind}:${i.id}`) }));
    // A failing identifier is a failing citation: nothing enters on it, whatever the URL says (review note #325).
    if (ids.some((i) => i.r?.status === "fails")) return null;
    for (const i of ids) {
      if (i.r?.status === "resolves" && metadataMatches(title, i.r.note)) return `${i.kind} ${i.id} resolves to a record with this title (${i.r.note})`;
    }
    // Identifiers must resolve: a record that carries one enters only through it — never through a page title while
    // its identifier is unchecked or unmatched (review note #329). Only a source with no identifier may enter on its page.
    if (ids.length) return null;
  }
  const status = fetched?.status ?? null;
  if (status !== null && status >= 200 && status < 400 && fetched?.pageTitle && metadataMatches(title, fetched.pageTitle)) {
    return `its URL answered HTTP ${status} with a document titled "${fetched.pageTitle.slice(0, 100)}" (${fetched?.reason ?? "text unreadable"})`;
  }
  return null;
}

/** Whether a title is named in a piece of metadata: the normalised title occurs whole, or at least four of every five of its words do. */
export function metadataMatches(title: string, text: string): boolean {
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const [a, b] = [norm(title), norm(text)];
  if (a.length < 8 || !b) return false;
  if (b.includes(a)) return true;
  const words = a.split(" ").filter((w) => w.length > 2);
  if (words.length < 4) return false;
  const present = words.filter((w) => b.includes(w)).length;
  return present / words.length >= 0.8;
}

/** Why a correction cannot apply as the ledger stands (null when it can): unknown record, no such file, or the field has moved since. */
export function correctionBlocker(loaded: LoadedCase, c: Correction): string | null {
  if (!ledgerFileFor(c.record)) return `no ledger file for record id ${c.record}`;
  // Every file the writer knows (ledgerFileFor): the report of 2026-09-16-verify-immortality-key-033510 called an image
  // correction "NOT applied: not in the ledger" that the same run applied, because this list stopped at four files.
  const rec = [...loaded.sources, ...loaded.claims, ...loaded.evidence, ...loaded.research, ...loaded.images].find((r) => r.id === c.record) as Record<string, unknown> | undefined;
  if (!rec) return `record ${c.record} is not in the ledger`;
  // An absent field and a null `from` are the same reading, as the writer itself takes them (setField):
  // the report of 2026-09-10-verify-ccc-192550 called three URL additions "NOT applied" that the same run applied.
  if (JSON.stringify(rec[c.field] ?? null) !== JSON.stringify(c.from ?? null)) return `the field no longer reads what the proposal saw`;
  return null;
}

/** What the reader is told when it judges a record whose source text could not be retrieved. */
export const TEXT_UNAVAILABLE = "The source text could not be retrieved: judge only what needs no text — whether the record is one observation, whether it bears on the case, whether independence is noted, whether the source statement reads as a statement and not an inference. Report quoteInContext, statementSupported and locatorSupported as false: without the text they are not assessed, and say so in the reason. The verb reads only atomic, relevant and independenceNoted from this reply.";

/** A resolver note that carries a Retraction Watch finding (src/lib/citation-check.mjs). */
const NOTICE = /^(RETRACTED|CORRECTED|WITHDRAWN)\b/;

/**
 * The verification itself, separable from writing: given the proposal, the
 * case, retrieved texts, identifier resolutions, and a judge, decide every
 * record. Pure apart from the injected judge.
 */
export async function judgeProposal(
  proposal: Proposal,
  loaded: LoadedCase,
  texts: Map<string, FetchedSource>,
  resolved: Map<string, { status: string; note: string }>,
  judge: Judge,
  meter: Meter,
  reader: { model: string; date: string; promptVersion?: string } = { model: READER.model, date: isoDate() },
  split: Splitter = defaultSplitter,
  /** Who wrote the parts of a split claim, and in which run — their `origin` (§3.14, §3.15). */
  splitter: { model: string; runId: string } = { model: MODELS.house.model, runId: "unrecorded" },
  /** Gates beyond the mechanical ones: the plan reader for research items (absent in tests that do not exercise it); and, for an answer, the objection the reader is told of (src/pipeline/answer.ts). */
  gates: { judgePlan?: PlanJudge; extraContext?: string; ledgerStatements?: Map<string, string> } = {},
): Promise<Verdicts> {
  const rejected: Verdicts["rejected"] = [];
  const provisional: Verdicts["provisional"] = { sources: [], evidence: [], claims: [] };
  const notes: string[] = [];
  /** Who judged, under which protocol, in which run and when — the run that answered, when the answer was remembered. */
  const promptVersion = reader.promptVersion ?? loadProtocol("verify").version;
  const readerStamp = (v: VerifyReply): ReaderStamp => ({ model: reader.model, promptVersion, runId: v.remembered?.runId ?? meter.runId, date: v.remembered?.date ?? reader.date });
  // Relevance is judged against the question as the current edition states it and the accounts it sets side by
  // side — not the case file's founding subtitle, which refused a founder essay's whole family of propositions
  // as outside a question phrased around one mechanism (2026-09-09).
  const accounts = caseAccounts(loaded);
  const questionContext = `Case question: ${caseQuestion(loaded)}.${accounts.length ? ` The case sets these accounts side by side, and a proposition that bears on any of them bears on the case: ${accounts.map((a, i) => `(${i + 1}) ${a}`).join(" ")}` : ""}${gates.extraContext ? ` ${gates.extraContext}` : ""}`;
  /** Compound claims replaced by their parts, for evidence that cited them. */
  const splitInto = new Map<string, string[]>();
  const reject = (id: string, kind: Disposition["kind"], observed: string, reason: string, blocked = false, route?: string) =>
    rejected.push({ id, kind, observed, disposition: blocked ? "blocked" : "failed", reason, ...(route ? { route } : {}) });

  // Sources: identifiers must resolve.
  const okSources = new Map<string, Source>();
  for (const s of proposal.adds.sources) {
    const ids = identifiersOf(s);
    const failing = ids.filter((i) => resolved.get(`${i.kind}:${i.id}`)?.status === "fails");
    if (failing.length) {
      reject(s.id, "source", s.title, `identifier does not resolve: ${failing.map((f) => `${f.kind} ${f.id} (${resolved.get(`${f.kind}:${f.id}`)?.note})`).join("; ")}`);
      continue;
    }
    // A retraction or correction notice is a fact about the source, recorded on it (§3.11), never a reason to hide it.
    const notices = ids.map((i) => resolved.get(`${i.kind}:${i.id}`)?.note ?? "").filter((n) => NOTICE.test(n));
    okSources.set(s.id, notices.length ? { ...s, reliabilityNotes: [...s.reliabilityNotes, ...notices.map((n) => `${n} — Crossref/Retraction Watch, checked ${reader.date}`)] } : s);
    if (notices.length) notes.push(`${s.id}: ${notices.join("; ")}`);
  }
  const sourceById = new Map<string, Source>([...loaded.sources.map((s) => [s.id, s] as const), ...okSources]);
  const textFor = (sourceId: string): FetchedSource | undefined => {
    const src = sourceById.get(sourceId);
    const key = src ? textKeyOf(src) : undefined;
    return key ? texts.get(key) : undefined;
  };
  // A Source whose text is a supplied document is published only on the permission the intake recorded,
  // and the Source must carry that line (§3.15): the gate at the door travels with the record.
  for (const s of [...okSources.values()]) {
    const fetched = textFor(s.id);
    if (!/^supplied document/.test(fetched?.via ?? "")) continue;
    // The line is the intake's own record, read from its manifest — not the drafter's words. It must be on the Source exactly.
    const expected = fetched?.permission;
    const why = !expected
      ? "the intake recorded no permission on which this document may be published, so no Source may be proposed from it"
      : !s.reliabilityNotes.includes(expected)
        ? `a supplied document's Source must carry, verbatim in reliabilityNotes, the permission line the intake recorded — "${expected.slice(0, 80)}…" — and this record ${s.reliabilityNotes.some((n) => /^Permission on which it is published:/.test(n)) ? "carries a different line" : "carries none"}`
        : null;
    if (!why) continue;
    okSources.delete(s.id);
    sourceById.delete(s.id);
    reject(s.id, "source", s.title, `${why} (AGENTS.md §3.15)`);
  }

  // Evidence: source ok, text retrievable, quotes verbatim, second reader agrees.
  const okEvidence: Evidence[] = [];
  for (const e of proposal.adds.evidence) {
    if (!sourceById.has(e.sourceId)) {
      reject(e.id, "evidence", e.title, `its source ${e.sourceId} was rejected`);
      continue;
    }
    const fetched = textFor(e.sourceId);
    if (!fetched?.ok || !fetched.text) {
      const why = fetched?.reason ?? "no URL on the source record";
      const route = `obtain the text of ${e.sourceId} (${sourceById.get(e.sourceId)?.url ?? "no url"}) and re-run verify`;
      const exists = sourceExists(sourceById.get(e.sourceId), fetched, resolved);
      if (exists) {
        // The source exists and the text does not, yet. The reader still judges what needs no text — one observation,
        // bearing on the case, a statement and not an inference (review notes #325, #327); only textual support and the
        // locator wait. What passes enters provisionally, unread, carrying no weight.
        const claims = e.claimIds.map((id) => loaded.claims.find((c) => c.id === id) ?? proposal.adds.claims.find((c) => c.id === id)).filter(Boolean);
        const blind = await judge({ ...e, editorInference: undefined }, "", `${questionContext} Claims this record bears on: ${claims.map((c) => `${c!.id}: ${c!.statement}`).join(" | ")}. ${TEXT_UNAVAILABLE}`, meter);
        const blindFlags = [blind.atomic === false && "not one observation", blind.relevant === false && "bears on none of the case's accounts", blind.independenceNoted === false && "independence not noted"].filter(Boolean);
        if (blindFlags.length) {
          reject(e.id, "evidence", e.title, `read without its text, the reader refused it (${blindFlags.join("; ")}): ${blind.reason}`);
          continue;
        }
        provisional.evidence.push({ ...e, reviewState: "provisional", provisional: { since: reader.date, exists, reason: why, route, by: meter.runId } });
        notes.push(`${e.id}: admitted provisionally — the source exists (${exists}) but its text could not be read (${why}); the reader judged it without the text: ${blind.reason}`);
      } else {
        reject(e.id, "evidence", e.title, `source text not retrievable: ${why}`, true, route);
      }
      continue;
    }
    const bad = unverifiedQuotes(e.sourceStatement, fetched.text);
    if (bad.length) {
      const quotes = bad.map((q) => `"${q}"`).join("; ");
      if (substituteCopy(fetched)) {
        reject(e.id, "evidence", e.title, `quoted span not found verbatim in the substitute copy read for ${e.sourceId} (${fetched.via}): ${quotes}`, true, `obtain the text of ${e.sourceId} as cited (${sourceById.get(e.sourceId)?.url ?? "no URL on the source record"}) and re-run verify; the quotes were checked only against ${fetched.via}`);
      } else {
        reject(e.id, "evidence", e.title, `quoted span not found verbatim in the text of ${e.sourceId}: ${quotes}`);
      }
      continue;
    }
    const claims = e.claimIds.map((id) => loaded.claims.find((c) => c.id === id) ?? proposal.adds.claims.find((c) => c.id === id)).filter(Boolean);
    const context = `${questionContext} Claims this record bears on: ${claims.map((c) => `${c!.id}: ${c!.statement}`).join(" | ")}`;
    const verdict = await judge({ ...e, editorInference: undefined }, fetched.text, context, meter);
    const flags = Object.entries(verdict).filter(([k, v]) => k !== "reason" && v === false).map(([k]) => k);
    // Mechanical and factual failures gate. A dispute about the direction
    // label is a judgment against a judgment: since protocol v5 the reader
    // names the direction it finds and the claims the passage bears on, and
    // both are written on the admitted record, stamped (v2 wrote the dissent
    // as a note and left the label; the GPT seat on #245 objected, review
    // note #248). A compound statement is split.
    const gating = flags.filter((f) => f !== "directionRight" && f !== "atomic");
    if (gating.length) {
      reject(e.id, "evidence", e.title, `second reader rejected (${gating.join(", ")}): ${verdict.reason}`);
      continue;
    }
    if (verdict.atomic === false) {
      // One split round (§3.5: mixed effects are split): the drafter divides the statement into one
      // observation each, every part keeping a verbatim quote; each part is checked and judged on its own.
      let sp: SplitResult;
      try {
        sp = asSplit(await split(e.sourceStatement, fetched.text, meter, "evidence"));
      } catch (err) {
        // One malformed reply is this record's problem, not the sitting's (2026-09-16: a split reply that was not
        // JSON ended a verify run after 34 good calls, and the sitting with it).
        reject(e.id, "evidence", e.title, `not one observation (${verdict.reason}); the split failed: ${(err as Error).message}`);
        continue;
      }
      const admitted: Evidence[] = [];
      // A part the reader refuses as compound — and for nothing else — is split once more, a second round and no
      // third: the source states each finding on its own, and a first split often keeps two or three together
      // (2026-09-20: the record behind the graded-area claims was refused with every one of four parts still
      // bundling two comparisons, and the case lost it).
      const text = fetched.text; // narrowed above; the closure would not see it
      const judgeParts = async (parts: string[], sp: SplitResult, prefix: string, depth: number): Promise<void> => {
        for (const [n, part] of parts.entries()) {
          const nth = prefix ? `${prefix}.${n + 1}` : `${n + 1}`;
          const label = `${e.id} part "${part.slice(0, 60)}"`;
          if (!quotedSpans(part).length) {
            notes.push(`${label} refused: no verbatim quote of the source`);
            continue;
          }
          const missing = unverifiedQuotes(part, text);
          if (missing.length) {
            notes.push(`${label} refused: quoted span not found verbatim in the text of ${e.sourceId}: ${missing.map((q) => `"${q}"`).join("; ")}`);
            continue;
          }
          const id = nextEvidenceId(loaded, [...proposal.adds.evidence.map((x) => x.id), ...okEvidence.map((x) => x.id), ...admitted.map((x) => x.id)]);
          const candidate: Evidence = { ...e, id, title: `${e.title} — part ${nth}`, sourceStatement: part, origin: { ref: `split of ${e.id} (${e.origin.ref})${depth > 1 ? "; second round" : ""}`, extractedBy: sp.model ?? splitter.model, runId: sp.runId ?? splitter.runId, date: sp.date ?? reader.date } };
          // A part is placed where its own quote is: the splitter's locator for the part when the text carries the
          // quote (split-v4), composed with the compound's document identity and its "(via …)" note — a compound's
          // two-place locator must not pass to a part quoted in one of them (2026-09-20: a part quoting the abstract's
          // figure carried "Abstract (Results) and Results", where the Results assign the figure differently).
          const ownAnchor = sp.anchors?.[n];
          if (ownAnchor?.locator && ownAnchor.quote && !unverifiedQuotes(`"${ownAnchor.quote}"`, text).length && e.exactLocator) {
            const via = e.exactLocator.match(/\s*\(via [^)]*\)\s*$/)?.[0]?.trim() ?? "";
            const identity = e.exactLocator.split(",")[0].trim();
            const placed = `${identity}, ${ownAnchor.locator}${via ? ` ${via}` : ""}`;
            if (placed !== e.exactLocator) {
              candidate.exactLocator = placed;
              // The act is the splitter's, stamped with the splitter's own model, protocol, run and date (review note
              // #399); the second reader then judges locatorSupported on the placed part, and that judgment is its own.
              candidate.readerActs = [...(candidate.readerActs ?? []), { field: "exactLocator", from: e.exactLocator, to: placed, model: sp.model ?? splitter.model, runId: sp.runId ?? splitter.runId, promptVersion: sp.protocol ?? loadProtocol("split").version, date: sp.date ?? reader.date, reason: "the splitter's locator for the part's own quote, composed with the compound's document identity; the second reader judged the placed locator" }];
            }
          }
          // A part keeps the page its own quote is on, not the parent's whole locator (2026-09-11: a part quoting
          // p. 1 alone carried "p. 1 and p. 4", and the panel parked the sitting for it).
          const page = pageOfQuote(text, quotedSpans(part)[0]);
          if (page !== null && e.exactLocator && /\[p\. \d+\]/.test(e.exactLocator)) {
            const narrowed = narrowLocator(e.exactLocator, page);
            if (narrowed !== e.exactLocator) {
              candidate.exactLocator = narrowed;
              candidate.readerActs = [...(candidate.readerActs ?? []), { field: "exactLocator", from: e.exactLocator, to: narrowed, model: "verify (mechanical: the page marker before the part's quote)", runId: meter.runId, promptVersion, date: reader.date, reason: `the part quotes p. ${page} only` }];
            }
          }
          const partContext = `${context} This record is a PART of a compound record that was split — the compound's statement: "${e.sourceStatement}". Say in ofTheCompound whether the part states one of the observations the compound bundled.`;
          const v2 = await judge({ ...candidate, editorInference: undefined }, text, partContext, meter);
          // Fail closed: a part enters only when the reader affirms it is of the compound; a null or missing answer
          // refuses it as a false one does (review note #398).
          if (v2.ofTheCompound !== true) {
            notes.push(`${label} refused: ${v2.ofTheCompound === false ? "not an observation the compound bundled" : "the reader did not affirm it is an observation the compound bundled"} — ${v2.reason}`);
            continue;
          }
          const bad = Object.entries(v2).filter(([k, v]) => k !== "reason" && v === false && k !== "directionRight").map(([k]) => k);
          if (bad.length) {
            if (bad.length === 1 && bad[0] === "atomic" && depth < 2) {
              let again: SplitResult;
              try {
                again = asSplit(await split(part, text, meter, "evidence"));
              } catch (err) {
                notes.push(`${label} refused (atomic): ${v2.reason}; the second split failed: ${(err as Error).message}`);
                continue;
              }
              notes.push(`${label} still not one observation (${v2.reason}); split again into ${again.parts.length} part(s)`);
              await judgeParts(again.parts, again, nth, depth + 1);
              continue;
            }
            notes.push(`${label} refused (${bad.join(", ")}): ${v2.reason}`);
            continue;
          }
          const applied = applyReader(candidate, v2, readerStamp(v2), freshEvidenceIds(loaded, () => [...proposal.adds.evidence.map((x) => x.id), ...okEvidence.map((x) => x.id), ...admitted.map((x) => x.id), candidate.id]));
          if (!applied) {
            notes.push(`${label} refused: the second reader finds it bears on none of the claims it names: ${v2.reason}`);
            continue;
          }
          notes.push(...applied.notes);
          admitted.push(...applied.records);
        }
      };
      await judgeParts(sp.parts, sp, "", 1);
      reject(e.id, "evidence", e.title, `not one observation (${verdict.reason}); split into ${admitted.length ? admitted.map((x) => x.id).join(", ") : "nothing that survived"}`);
      okEvidence.push(...admitted);
      continue;
    }
    // v5: the reader's finding on direction and on which claims the passage bears on is applied, not annotated.
    const applied = applyReader(e, verdict, readerStamp(verdict), freshEvidenceIds(loaded, () => [...proposal.adds.evidence.map((x) => x.id), ...okEvidence.map((x) => x.id)]));
    if (!applied) {
      reject(e.id, "evidence", e.title, `second reader: the passage bears on none of the claims the record names: ${verdict.reason}`);
      continue;
    }
    notes.push(...applied.notes);
    okEvidence.push(...applied.records);
  }

  // Claims: an anchor's quote must be verbatim and read right; otherwise an accepted evidence record must cite the claim.
  const okClaims: Claim[] = [];
  // A claim is anchored by a source anchor or by evidence that cites it: the evidence of this proposal, or — for a
  // claim that is the ledger's own, word for word, read again at a settlement — the ledger's live evidence (2026-09-20:
  // a founding claim anchored by six live records was refused as unanchored when an answer re-read it on its own).
  // A proposed claim that reuses a ledger id with other words is not the claim that evidence was read against, and
  // gets no anchor from it (review note #401).
  const citedBy = new Set(okEvidence.flatMap((e) => e.claimIds));
  const liveCited = new Set(loaded.evidence.filter((e) => e.reviewState !== "rejected").flatMap((e) => e.claimIds));
  // The ledger's wording for a claim: from the ledger as loaded, or — at a settlement, which judges the ledger minus
  // the records it re-reads — from the statements the settlement hands over for them.
  const ledgerClaims = new Map(loaded.claims.filter((k) => k.reviewState !== "rejected").map((k) => [k.id, k.statement]));
  const anchoredByLedger = (k: { id: string; statement: string }) => liveCited.has(k.id) && (ledgerClaims.get(k.id) ?? gates.ledgerStatements?.get(k.id)) === k.statement;
  for (const c of proposal.adds.claims) {
    if (c.sourceAnchor?.quote) {
      const sid = c.sourceAnchor.sourceId;
      const fetched = sid ? textFor(sid) : undefined;
      if (!fetched?.ok || !fetched.text) {
        if (!citedBy.has(c.id) && !anchoredByLedger(c)) {
          const why = fetched?.reason ?? "no source id on the anchor";
          const exists = sid ? sourceExists(sourceById.get(sid), fetched, resolved) : null;
          if (exists) {
            const blind = await judge({ statement: c.statement, anchor: c.sourceAnchor }, "", `${questionContext} ${TEXT_UNAVAILABLE} Is the statement one proposition with a truth condition, and does it bear on the case?`, meter);
            const blindFlags = [blind.atomic === false && "not one proposition", blind.relevant === false && "bears on none of the case's accounts"].filter(Boolean);
            if (blindFlags.length) {
              reject(c.id, "claim", c.statement, `read without its anchor's text, the reader refused it (${blindFlags.join("; ")}): ${blind.reason}`);
              continue;
            }
            provisional.claims.push({ ...c, reviewState: "provisional", provisional: { since: reader.date, exists, reason: why, route: `obtain the text of ${sid} (${sourceById.get(sid!)?.url ?? "no url"}) and re-run verify`, by: meter.runId } });
            notes.push(`${c.id}: admitted provisionally — its anchor's source exists (${exists}) but the text could not be read (${why}); the reader judged it without the text: ${blind.reason}`);
          } else {
            reject(c.id, "claim", c.statement, `anchor source not retrievable (${why}) and no accepted evidence cites the claim`, true, `obtain the anchor's text and re-run verify`);
          }
          continue;
        }
      } else if ([c.sourceAnchor.quote, ...(c.sourceAnchor.also ?? []).map((a) => a.quote)].some((q) => unverifiedQuotes(`"${q}"`, fetched.text ?? "").length)) {
        if (substituteCopy(fetched)) {
          reject(c.id, "claim", c.statement, `anchor quote not found verbatim in the substitute copy read for ${sid} (${fetched.via})`, true, `obtain the text of ${sid} as cited (${sourceById.get(sid!)?.url ?? "no URL on the source record"}) and re-run verify; the anchor was checked only against ${fetched.via}`);
        } else {
          reject(c.id, "claim", c.statement, `anchor quote not found verbatim in ${sid}`);
        }
        continue;
      } else {
        const anchorContext = `${questionContext} Does the anchored passage${c.sourceAnchor.also?.length ? "s, taken together," : ""} support the proposition as stated?`;
        const verdict = await judge({ statement: c.statement, anchor: c.sourceAnchor }, fetched.text, anchorContext, meter);
        const flags = Object.entries(verdict).filter(([k, v]) => k !== "reason" && v === false && k !== "independenceNoted" && k !== "directionRight" && k !== "atomic").map(([k]) => k);
        if (flags.length) {
          reject(c.id, "claim", c.statement, `second reader rejected the anchor (${flags.join(", ")}): ${verdict.reason}`);
          continue;
        }
        if (verdict.atomic === false) {
          // One split round (§3.2): the drafter divides the statement; each part is judged on the same anchor.
          let sp: SplitResult;
          try {
            sp = asSplit(await split(c.statement, fetched.text, meter));
          } catch (err) {
            reject(c.id, "claim", c.statement, `not atomic (${verdict.reason}); the split failed: ${(err as Error).message}`);
            continue;
          }
          const admitted: Claim[] = [];
          // As for evidence: a part refused as compound, and for nothing else, is split once more and no further.
          const text = fetched.text ?? ""; // narrowed above; the closure would not see it
          const parentAnchor = c.sourceAnchor!;
          const judgeParts = async (parts: string[], sp: SplitResult, depth: number): Promise<void> => {
            for (const [n, part] of parts.entries()) {
              const id = nextClaimId(loaded, [...proposal.adds.claims.map((k) => k.id), ...okClaims.map((k) => k.id), ...admitted.map((k) => k.id)]);
              // A part is judged on an anchor that fits it: the splitter's own quote for the part, when the text carries
              // it verbatim (split-v4; 2026-09-20: parts judged on the compound's anchor failed a locator that fit the
              // whole and not each part), else the compound's anchor, said so in the account.
              const own = sp.anchors?.[n];
              const anchored = own?.quote && !unverifiedQuotes(`"${own.quote}"`, text ?? "").length;
              const anchor = anchored ? { ...parentAnchor, quote: own!.quote, locator: own!.locator || parentAnchor.locator, also: undefined } : parentAnchor;
              if (own?.quote && !anchored) notes.push(`${c.id} part "${part.slice(0, 60)}": the splitter's quote is not in the text verbatim ("${own.quote.slice(0, 80)}"); judged on the compound's anchor`);
              // The part's wording is the splitter's, not the drafter's: its origin says so.
              // A part keeps the compound's place in the ladder (its parents); the compound's dependencies,
              // alternatives and contradictions are the compound's, not each part's, and are not carried over
              // (§3.2) — said aloud below so a later pass can propose them per part.
              const candidate: Claim = { ...c, id, statement: part, sourceAnchor: anchor, dependsOnClaimIds: [], alternativeToClaimIds: [], contradictsClaimIds: [], origin: { ref: `split of ${c.id} (${c.origin.ref})${anchored ? "; anchored by the splitter in the same text" : ""}${depth > 1 ? "; second round" : ""}`, extractedBy: sp.model ?? splitter.model, runId: sp.runId ?? splitter.runId, date: sp.date ?? reader.date } };
              const partContext = `${anchorContext} This is a PART of a compound claim that was split — the compound's statement: "${c.statement}". Say in ofTheCompound whether the part states one of the propositions the compound bundled.`;
              const v2 = await judge({ statement: part, anchor }, text, partContext, meter);
              if (v2.ofTheCompound !== true) {
                notes.push(`${c.id} part "${part.slice(0, 60)}" refused: ${v2.ofTheCompound === false ? "not a proposition the compound bundled" : "the reader did not affirm it is a proposition the compound bundled"} — ${v2.reason}`);
                continue;
              }
              const bad = Object.entries(v2).filter(([k, v]) => k !== "reason" && v === false && k !== "independenceNoted" && k !== "directionRight").map(([k]) => k);
              if (bad.length) {
                if (bad.length === 1 && bad[0] === "atomic" && depth < 2) {
                  let again: SplitResult;
                  try {
                    again = asSplit(await split(part, text, meter));
                  } catch (err) {
                    notes.push(`${c.id} part "${part.slice(0, 60)}" refused (atomic): ${v2.reason}; the second split failed: ${(err as Error).message}`);
                    continue;
                  }
                  notes.push(`${c.id} part "${part.slice(0, 60)}" still not one proposition (${v2.reason}); split again into ${again.parts.length} part(s)`);
                  await judgeParts(again.parts, again, depth + 1);
                  continue;
                }
                notes.push(`${c.id} part "${part.slice(0, 60)}" refused (${bad.join(", ")}): ${v2.reason}`);
                continue;
              }
              admitted.push(candidate);
            }
          };
          await judgeParts(sp.parts, sp, 1);
          const relations = [["dependsOn", c.dependsOnClaimIds], ["alternativeTo", c.alternativeToClaimIds], ["contradicts", c.contradictsClaimIds]].filter(([, v]) => (v as string[] | undefined)?.length).map(([k, v]) => `${k} ${(v as string[]).join(", ")}`);
          if (relations.length && admitted.length) notes.push(`${c.id}: its relations (${relations.join("; ")}) were not carried to its parts ${admitted.map((k) => k.id).join(", ")} — each part's relations are its own to propose`);
          reject(c.id, "claim", c.statement, `not atomic (${verdict.reason}); split into ${admitted.length ? admitted.map((k) => k.id).join(", ") : "nothing that survived"}`);
          if (admitted.length) {
            splitInto.set(c.id, admitted.map((k) => k.id));
            okClaims.push(...admitted);
          }
          continue;
        }
      }
    } else if (!citedBy.has(c.id) && !anchoredByLedger(c)) {
      reject(c.id, "claim", c.statement, "no source anchor and no accepted evidence record cites it — every claim must be anchored");
      continue;
    }
    okClaims.push(c);
  }

  // Evidence that cited a compound claim is judged against each part on its
  // own: it cites the parts it bears on, and only those (§3.2 — evidence for
  // one proposition must not silently count for the others).
  for (const [i, e] of okEvidence.entries()) {
    if (!e.claimIds.some((id) => splitInto.has(id))) continue;
    const fetched = textFor(e.sourceId);
    const kept: string[] = [];
    const dissents: string[] = [];
    for (const id of e.claimIds) {
      const parts = splitInto.get(id);
      if (!parts) {
        kept.push(id);
        continue;
      }
      for (const pid of parts) {
        const part = okClaims.find((k) => k.id === pid);
        if (!part || !fetched?.ok || !fetched.text) continue;
        const context = `Case question: ${loaded.record.subtitle}. The compound claim ${id} this record cited was split; judge whether the record bears on this one part — ${pid}: ${part.statement}`;
        const v = await judge({ ...e, claimIds: [pid], editorInference: undefined }, fetched.text, context, meter);
        if (v.relevant === false) {
          notes.push(`${e.id} does not bear on ${pid} (part of ${id}): ${v.reason}`);
          continue;
        }
        if (v.directionRight === false) dissents.push(`Second reader (${stampText(readerStamp(v))}) disputes the stated direction toward ${pid}: ${v.reason}`);
        kept.push(pid);
      }
    }
    okEvidence[i] = { ...e, claimIds: [...new Set(kept)], limitations: dissents.length ? [...e.limitations, ...dissents] : e.limitations };
  }
  // Claims whose parents or dependencies were rejected (or never existed) keep the claim and lose the link, said aloud.
  const liveClaimIds = new Set([...loaded.claims.filter((c) => c.reviewState !== "rejected").map((c) => c.id), ...okClaims.map((c) => c.id), ...provisional.claims.map((c) => c.id)]);
  for (const [i, c] of okClaims.entries()) {
    const dangling = [...c.parentClaimIds, ...c.dependsOnClaimIds, ...(c.alternativeToClaimIds ?? []), ...(c.contradictsClaimIds ?? [])].filter((id) => !liveClaimIds.has(id));
    if (dangling.length) {
      notes.push(`${c.id}: names ${dangling.join(", ")} as parent, dependency, alternative, or contradiction, not a live claim — those links are dropped`);
      const live = (ids: string[]) => ids.filter((id) => liveClaimIds.has(id));
      okClaims[i] = {
        ...c,
        parentClaimIds: live(c.parentClaimIds),
        dependsOnClaimIds: live(c.dependsOnClaimIds),
        ...(c.alternativeToClaimIds ? { alternativeToClaimIds: live(c.alternativeToClaimIds) } : {}),
        ...(c.contradictsClaimIds ? { contradictsClaimIds: live(c.contradictsClaimIds) } : {}),
      };
    }
  }
  // Evidence whose claims were all rejected falls with them.
  const evidence = okEvidence.filter((e) => {
    const kept = e.claimIds.filter((id) => liveClaimIds.has(id));
    if (kept.length === 0) {
      reject(e.id, "evidence", e.title, "every claim it cites was rejected");
      return false;
    }
    if (kept.length < e.claimIds.length) notes.push(`${e.id}: cites rejected claim(s) ${e.claimIds.filter((id) => !liveClaimIds.has(id)).join(", ")} — those references are dropped`);
    e.claimIds = kept;
    return true;
  });

  // Research: structurally sound, pointing at live claims — and, when the gate is on, a plan: a measurement, an
  // object and a decision rule, judged by the reader (protocols/plan-v1.md; 2026-09-17, when a quarter of the agenda
  // carried a decision rule).
  const research: ResearchOpportunity[] = [];
  for (const r of proposal.adds.research) {
    const kept = r.claimIds.filter((id) => liveClaimIds.has(id));
    if (kept.length === 0) {
      reject(r.id, "research", r.title, "none of the claims it would move survived");
      continue;
    }
    if (gates.judgePlan) {
      const named = kept.map((id) => {
        const c = loaded.claims.find((k) => k.id === id) ?? okClaims.find((k) => k.id === id) ?? provisional.claims.find((k) => k.id === id);
        return c ? `${c.id}: ${c.statement}` : id;
      });
      const context = `${questionContext} Claims the item would move: ${named.join(" | ")}. Research items the ledger already holds: ${loaded.research.map((x) => `${x.id} — ${x.title}`).join(" | ") || "none"}.`;
      const v = await gates.judgePlan(r, context, meter);
      if (!v.isPlan) {
        const missing = [!v.measurement && "no measurement", !v.object && "no object", !v.decisionRule && "no decision rule"].filter(Boolean).join(", ");
        reject(r.id, "research", r.title, `not a plan (${missing || "the reader's reasons below"}): ${v.reason}`);
        continue;
      }
      if (!v.novel) notes.push(`${r.id}: the reader finds it the same test as an item the ledger already holds — ${v.reason}`);
    }
    research.push({ ...r, claimIds: kept });
  }

  // A provisional evidence record keeps only claim links that stand — live, accepted, or provisional — and needs one.
  provisional.evidence = provisional.evidence.filter((e) => {
    const kept = e.claimIds.filter((id) => liveClaimIds.has(id));
    if (!kept.length) {
      reject(e.id, "evidence", e.title, "admitted provisionally, then set aside: none of the claims it cites entered", true, e.provisional!.route);
      return false;
    }
    if (kept.length !== e.claimIds.length) notes.push(`${e.id}: provisional; its links to claims that did not enter are dropped`);
    e.claimIds = kept;
    return true;
  });

  // Sources: admitted only if something accepted cites them — or, cited only by provisional records, admitted the
  // same way: unread, labelled, awaiting the text.
  const cited = new Set([...evidence.map((e) => e.sourceId), ...okClaims.map((c) => c.sourceAnchor?.sourceId).filter(Boolean)]);
  const citedProvisionally = new Set([...provisional.evidence.map((e) => e.sourceId), ...provisional.claims.map((c) => c.sourceAnchor?.sourceId).filter(Boolean)]);
  const sources: Source[] = [];
  for (const s of okSources.values()) {
    if (!(cited.has(s.id) || s.background)) {
      if (citedProvisionally.has(s.id)) {
        const fetched = textFor(s.id);
        const exists = sourceExists(s, fetched, resolved) ?? "cited by a record admitted provisionally";
        provisional.sources.push({ ...s, verification: "unverified", provisional: { since: reader.date, exists, reason: fetched?.reason ?? "no URL on the source record", route: `obtain the text of ${s.id} (${s.url ?? "no url"}) and re-run verify`, by: meter.runId } });
        continue;
      }
      reject(s.id, "source", s.title, "nothing accepted cites it (§3.6: sources are not evidence by themselves)");
      continue;
    }
    // The drafter labels a source it could not reach `unverified`; when the verifier reached the text and
    // checked passages in it, the label says so (a seat on #269: a source marked "nothing may lean on it
    // until it is read" with admitted evidence leaning on its retrieved text).
    const fetched = textFor(s.id);
    if (s.verification === "unverified" && fetched?.ok && fetched.text) {
      sources.push({ ...s, verification: "ai_verified", verificationNote: `text retrieved and its quoted passages checked by the verify verb on ${reader.date} (run ${meter.runId})${fetched.via ? `; ${fetched.via}` : ""}. The drafter's note: ${s.verificationNote ?? "none"}` });
      notes.push(`${s.id}: read by the verifier; verification set to ai_verified`);
    } else sources.push(s);
  }

  // Prospective ledger: the same rules the build enforces.
  const prospective = {
    sources: [...loaded.sources, ...sources],
    evidence: [...loaded.evidence, ...evidence],
    claims: [...loaded.claims, ...okClaims],
  };
  const errors = [
    ...sourceAdmissionErrors(prospective.sources, prospective.evidence, prospective.claims),
    ...claimAnchorErrors(prospective.claims, prospective.evidence),
    // Provisional records are appended too: an id may collide with theirs as well.
    ...duplicateIdErrors({ sources: [...prospective.sources, ...provisional.sources], evidence: [...prospective.evidence, ...provisional.evidence], claims: [...prospective.claims, ...provisional.claims] }),
  ];
  for (const err of errors) notes.push(`prospective ledger: ${err}`);

  return { accepted: { sources, evidence, claims: okClaims, research }, provisional, rejected, notes };
}

export interface VerifyOptions {
  dryRun?: boolean;
  root?: string;
  deps?: {
    fetch?: typeof retrieve;
    judge?: Judge;
    split?: Splitter;
    resolve?: Resolver;
    /** Wayback lookup and save for admitted sources; injectable so tests never reach the archive. */
    archive?: (url: string) => Promise<Archived>;
    now?: () => Date;
    cases?: () => LoadedCase[]; judgePlan?: PlanJudge; };
}

export interface VerifyOutcome extends RunOutcome {
  accepted?: { sources: number; evidence: number; claims: number; research: number; provisional?: number };
  rejected?: number;
}

/** Who drafted a proposal's records: the proposal's model — or, for a re-submission written by code, the original proposal's model, run and date as the proposal names them, with where each record carries them (review notes #349, #351). */
const drafterOf = (p: Proposal) =>
  p.resubmission
    ? `${p.resubmission.model ?? "unknown"} in ${p.resubmission.from.replace(/^proposals\//, "")} on ${p.resubmission.date}, re-submitted by ${p.runId} under ${p.promptVersion ?? "resubmit"} (the lineage on each claim's and evidence record's origin and in each source's verification note)`
    : (p.model ?? "unknown");

export async function runVerify(proposalRunId: string, opts: VerifyOptions = {}): Promise<VerifyOutcome> {
  const root = opts.root ?? process.cwd();
  const now = opts.deps?.now ?? (() => new Date());
  const proposal = readProposal(proposalRunId, root);
  if (!proposal) throw new Error(`no proposal under proposals/${proposalRunId}/`);
  const loaded = findCase(proposal.case, opts.deps?.cases?.());
  if (proposal.basis.ledgerHash !== loaded.ledgerHash) {
    throw new Error(`the ledger has changed since ${proposalRunId} was drafted (basis ${proposal.basis.ledgerHash.slice(0, 12)} ≠ current ${loaded.ledgerHash.slice(0, 12)}); re-run draft against the current ledger`);
  }
  const run = openRun("verify", loaded.record.slug, { model: READER.model, promptVersion: loadProtocol("verify").version }, { now: now(), root });
  const { runId, date, meter } = run;

  try {
    // Mechanical: identifiers and texts.
    const sourceIds = proposal.adds.sources.flatMap(identifiersOf);
    const resolvedList = await (opts.deps?.resolve ?? (verifyCitations as Resolver))(sourceIds);
    const resolved = new Map(resolvedList.map((r) => [`${r.kind}:${r.id}`, { status: r.status, note: r.note }]));
    const wanted = new Map<string, Source>();
    for (const s of proposal.adds.sources) wanted.set(s.id, s);
    for (const e of proposal.adds.evidence) {
      const src = loaded.sources.find((s) => s.id === e.sourceId);
      if (src) wanted.set(src.id, src);
    }
    for (const c of proposal.adds.claims) {
      const src = loaded.sources.find((s) => s.id === c.sourceAnchor?.sourceId);
      if (src) wanted.set(src.id, src);
    }
    const fetcher = opts.deps?.fetch ?? retrieve;
    const texts = suppliedTexts(proposal, [...loaded.sources, ...proposal.adds.sources], root);
    for (const s of wanted.values()) {
      const key = textKeyOf(s);
      if (!texts.has(key)) texts.set(key, s.url || doiOf(s) ? await fetcher({ url: s.url, doi: doiOf(s) }, {}) : { url: key, ok: false, status: null, contentType: null, text: null, reason: "the source record has no URL or DOI and no supplied text stands in for it" });
    }

    const proposalDir = path.join(root, "proposals", proposalRunId);
    const judge = rememberedJudge(opts.deps?.judge ?? defaultJudge, path.join(proposalDir, "judgments.yaml"), READER.model);
    const split = rememberedSplitter(opts.deps?.split ?? defaultSplitter, path.join(proposalDir, "splits.yaml"), MODELS.house.model);
    const judgePlan = rememberedPlanJudge(opts.deps?.judgePlan ?? defaultPlanJudge, path.join(proposalDir, "plans.yaml"), READER.model);
    const verdicts = await judgeProposal(proposal, loaded, texts, resolved, judge, meter, { model: READER.model, date }, split, { model: MODELS.house.model, runId }, { judgePlan });
    // Durable locators: every admitted source with a URL gets its Wayback snapshot on the record.
    const archive = opts.deps?.archive ?? archiveUrl;
    for (const [i, s] of verdicts.accepted.sources.entries()) {
      if (!s.url) continue;
      const a = await archive(s.url);
      verdicts.notes.push(`${s.id}: ${a.note}`);
      if (a.archivedUrl) verdicts.accepted.sources[i] = { ...s, archivedUrl: a.archivedUrl };
    }
    for (const [i, s] of verdicts.provisional.sources.entries()) {
      if (!s.url) continue;
      const a = await archive(s.url);
      verdicts.notes.push(`${s.id}: ${a.note}`);
      if (a.archivedUrl) verdicts.provisional.sources[i] = { ...s, archivedUrl: a.archivedUrl };
    }
    const { accepted, provisional, rejected, notes } = verdicts;

    // What the writer is expected to do with each correction, read from the ledger as it stands; once the writer has
    // run, the section is rewritten from what it did (review note #304: a forecast that differs from the outcome
    // leaves two records of one run disagreeing).
    const forecast = correctionLines(proposal.corrections, (c) => {
      const why = correctionBlocker(loaded, c);
      return why ? ` — NOT applied: ${why}` : opts.dryRun ? " — would apply" : " — applied";
    }).join("\n");
    const report = [
      `# Verification — ${runId}`,
      ``,
      `Proposal ${proposalRunId} for ${loaded.record.slug}; ledger ${loaded.ledgerHash.slice(0, 12)}.`,
      ``,
      `## Accepted`,
      ...accepted.sources.map((s) => `- source ${s.id} — ${s.title}`),
      ...accepted.evidence.map((e) => `- evidence ${e.id} — ${e.title} (${e.direction}, ${e.strength}) → ${e.claimIds.join(", ")}`),
      ...accepted.claims.map((c) => `- claim ${c.id} — ${c.statement}`),
      ...accepted.research.map((r) => `- research ${r.id} — ${r.title}`),
      ``,
      ...(provisional.sources.length + provisional.evidence.length + provisional.claims.length
        ? [
            `## Provisional — admitted unread, awaiting the text (no weight until a verify pass reads it)`,
            ...provisional.sources.map((s) => `- source ${s.id} — ${s.title} — exists: ${s.provisional!.exists}; unread: ${s.provisional!.reason} — route: ${s.provisional!.route}`),
            ...provisional.evidence.map((e) => `- evidence ${e.id} — ${e.title} → ${e.claimIds.join(", ")} — unread: ${e.provisional!.reason} — route: ${e.provisional!.route}`),
            ...provisional.claims.map((c) => `- claim ${c.id} — ${c.statement} — unread: ${c.provisional!.reason} — route: ${c.provisional!.route}`),
            ``,
          ]
        : []),
      `## Rejected`,
      ...rejected.map((r) => `- ${r.kind} ${r.id} (${r.disposition}) — ${r.reason}${r.route ? ` — route: ${r.route}` : ""}`),
      ``,
      ...(forecast ? [forecast] : []),
      `## Retrieval`,
      ...[...texts.entries()].map(([key, f]) => `- ${key} — ${f.ok ? `retrieved${f.pages ? `, ${f.pages} pages` : ""}${f.via ? ` (${f.via})` : ""}` : `not retrieved: ${f.reason}`}`),
      ``,
      ...(notes.length ? [`## Notes`, ...notes.map((n) => `- ${n}`), ``] : []),
    ].join("\n");
    writeWorkingFile(runId, "verification.md", report, root);

    if (notes.some((n) => n.startsWith("prospective ledger:"))) {
      const reason = `the prospective ledger fails the build's own rules; see proposals/${runId}/verification.md — nothing written`;
      return { ...closeRun(run, "failed", { reason }), rejected: rejected.length };
    }
    const notPlan = rejected.filter((r) => r.kind === "research" && /^not a plan/.test(r.reason)).length;
    const counts = { sources: accepted.sources.length, evidence: accepted.evidence.length, claims: accepted.claims.length, research: accepted.research.length, provisional: provisional.sources.length + provisional.evidence.length + provisional.claims.length };
    if (opts.dryRun) {
      return { ...closeRun(run, "dry-run", { reason: `would write ${JSON.stringify(counts)}; ${rejected.length} rejected${notPlan ? ` (${notPlan} research item(s) not a plan)` : ""}` }), accepted: counts, rejected: rejected.length };
    }

    // Materialize.
    const corrected = applyCorrections(loaded.dir, proposal.corrections, {
      date,
      actor: `aletheia verify (${READER.model} second reader; drafter ${drafterOf(proposal)}; proposal ${proposalRunId}, verification ${runId})`,
      proposalRef: `proposals/${proposalRunId}`,
      root,
    });
    for (const s of corrected.skipped) notes.push(`correction to ${s.correction.record}.${s.correction.field} not applied: ${s.reason}`);
    const outcome = correctionLines(proposal.corrections, (c) =>
      corrected.applied.includes(c) ? " — applied" : ` — NOT applied: ${corrected.skipped.find((s) => s.correction === c)?.reason ?? "the writer did not apply it"}`,
    ).join("\n");
    if (outcome !== forecast) {
      console.error(`${runId}: the report's Corrections forecast differed from what the writer did; the report now says what the writer did`);
      writeWorkingFile(runId, "verification.md", report.replace(forecast, outcome), root);
    }
    // A record that entered may not name, in prose, a proposal record that did not (the reader's own notes name
    // the proposal claims a passage bears on; a claim rejected later would leave a dangling id — 2026-09-11).
    {
      const admittedIds = new Set([...accepted.sources, ...accepted.claims, ...accepted.evidence, ...accepted.research, ...provisional.sources, ...provisional.claims, ...provisional.evidence].map((r) => r.id));
      const unadmitted = new Map<string, { kind: string; observed: string }>();
      for (const c of proposal.adds.claims) if (!admittedIds.has(c.id) && !loaded.claims.some((k) => k.id === c.id)) unadmitted.set(c.id, { kind: "claim", observed: c.statement });
      for (const e of proposal.adds.evidence) if (!admittedIds.has(e.id) && !loaded.evidence.some((k) => k.id === e.id)) unadmitted.set(e.id, { kind: "evidence record", observed: e.title });
      for (const r of proposal.adds.research) if (!admittedIds.has(r.id) && !loaded.research.some((k) => k.id === r.id)) unadmitted.set(r.id, { kind: "research item", observed: r.title });
      if (unadmitted.size) {
        const scrub = (id: string, field: string, text: string | undefined) => {
          if (!text) return text;
          const out = scrubUnadmitted(text, unadmitted);
          if (out !== text) notes.push(`${id}.${field}: named a proposal record that did not enter; rewritten to say so`);
          return out;
        };
        accepted.claims = accepted.claims.map((c) => ({ ...c, statement: scrub(c.id, "statement", c.statement)! }));
        accepted.evidence = accepted.evidence.map((e) => ({ ...e, title: scrub(e.id, "title", e.title)!, sourceStatement: scrub(e.id, "sourceStatement", e.sourceStatement)!, ...(e.editorInference !== undefined ? { editorInference: scrub(e.id, "editorInference", e.editorInference) } : {}), limitations: e.limitations.map((l, i) => scrub(e.id, `limitations[${i}]`, l)!) }));
        accepted.research = accepted.research.map((r) => ({ ...r, title: scrub(r.id, "title", r.title)!, summary: scrub(r.id, "summary", r.summary)!, ...(r.informationGain !== undefined ? { informationGain: scrub(r.id, "informationGain", r.informationGain) } : {}) }));
        provisional.claims = provisional.claims.map((c) => ({ ...c, statement: scrub(c.id, "statement", c.statement)! }));
        provisional.evidence = provisional.evidence.map((e) => ({ ...e, title: scrub(e.id, "title", e.title)!, sourceStatement: scrub(e.id, "sourceStatement", e.sourceStatement)! }));
      }
    }
    appendRecords(loaded.dir, "sources.yaml", [...accepted.sources, ...provisional.sources], root);
    appendRecords(loaded.dir, "claims.yaml", [...accepted.claims, ...provisional.claims], root);
    appendRecords(loaded.dir, "evidence.yaml", [...accepted.evidence, ...provisional.evidence], root);
    appendRecords(loaded.dir, "research.yaml", accepted.research, root);
    const rows: Disposition[] = [];
    const inRow = (kind: Disposition["kind"], key: string | null, id: string, observed: string) => {
      if (key) rows.push({ key, kind, disposition: "in", as: id, observed, by: runId, date, proposal: `proposals/${proposalRunId}` });
    };
    for (const s of accepted.sources) inRow("source", sourceKeys(s)[0] ?? null, s.id, s.title);
    for (const c of accepted.claims) inRow("claim", textKey(c.statement), c.id, c.statement);
    for (const e of accepted.evidence) inRow("evidence", textKey(`${e.title} ${e.sourceStatement}`), e.id, e.title);
    for (const r of accepted.research) inRow("research", textKey(r.title), r.id, r.title);
    // A lead a leads pass resolved is settled by the source that entered for it, by locator (src/pipeline/leads.ts).
    const fromRun = proposal.report?.match(/^proposals\/([^/]+)\//)?.[1];
    if (fromRun) rows.push(...settleLeads(leadsOf(fromRun, root), accepted.sources, { runId, date, proposal: `proposals/${proposalRunId}`, leadsRunId: fromRun }));
    const provisionalRow = (kind: Disposition["kind"], key: string | null, id: string, observed: string, p: NonNullable<Source["provisional"]>) => {
      if (key) rows.push({ key, kind, disposition: "provisional", as: id, reason: `admitted unread — the source exists (${p.exists}) but its text could not be read (${p.reason})`, route: p.route, observed, by: runId, date, proposal: `proposals/${proposalRunId}` });
    };
    for (const s of provisional.sources) provisionalRow("source", sourceKeys(s)[0] ?? null, s.id, s.title, s.provisional!);
    for (const c of provisional.claims) provisionalRow("claim", textKey(c.statement), c.id, c.statement, c.provisional!);
    for (const e of provisional.evidence) provisionalRow("evidence", textKey(`${e.title} ${e.sourceStatement}`), e.id, e.title, e.provisional!);
    for (const r of rejected) {
      // Keyed as the drafter and the admission key it — title and statement for evidence, the identifier for a
      // source — so a refusal and a later admission of the same record sit under one key (before 2026-09-17 a refused
      // evidence row took the title alone, and its re-submission would have entered under another key).
      const held = r.kind === "evidence" ? proposal.adds.evidence.find((e) => e.id === r.id) : r.kind === "source" ? proposal.adds.sources.find((s) => s.id === r.id) : undefined;
      const key =
        held && r.kind === "evidence" ? textKey(`${(held as Evidence).title} ${(held as Evidence).sourceStatement}`)
        : held && r.kind === "source" ? (sourceKeys(held as Source)[0] ?? textKey(r.observed))
        : r.kind === "source" ? (sourceKeys({ title: r.observed })[0] ?? textKey(r.observed))
        : textKey(r.observed);
      if (key) rows.push({ key, kind: r.kind, disposition: r.disposition, reason: r.reason, observed: r.observed, by: runId, date, proposal: `proposals/${proposalRunId}`, ...(r.route ? { route: r.route } : {}) });
    }
    const known = new Set<string>([
      ...loaded.sources.map((s) => s.id), ...loaded.claims.map((c) => c.id), ...loaded.evidence.map((e) => e.id), ...loaded.research.map((r) => r.id),
      ...accepted.sources.map((s) => s.id), ...accepted.claims.map((c) => c.id), ...accepted.evidence.map((e) => e.id), ...accepted.research.map((r) => r.id),
    ]);
    for (const d of proposal.dispositions) {
      if (d.as && !known.has(d.as)) {
        notes.push(`${d.key}: disposition named ${d.as}, which is not a record; recorded as failed`);
        const { as: _as, ...rest } = d;
        void _as;
        rows.push({ ...rest, disposition: "failed", reason: `Drafter named ${d.as} as the record, which the ledger does not hold. Its reason as written: ${d.reason ?? ""}` });
      } else rows.push(d);
    }
    appendDispositions(loaded.dir, rows, root);
    appendHistory(
      loaded.dir,
      {
        date,
        change: `Intake from report ${proposal.report ?? proposal.runId}: ${counts.sources} source(s), ${counts.evidence} evidence record(s), ${counts.claims} claim(s), ${counts.research} research item(s) verified and added${counts.provisional ? `; ${counts.provisional} record(s) admitted provisionally, unread, awaiting their texts` : ""} (proposal ${proposalRunId}, verification ${runId}); ${rejected.length} candidate(s) rejected with reasons in dispositions.yaml.${corrected.skipped.length ? ` ${corrected.skipped.length} correction(s) NOT applied — see proposals/${runId}/verification.md.` : ""}`,
        // The rationale is the drafter's, written before verification: it argues the proposal, not what
        // entered. Labelled as such, with the admitted set beside it (review note #275).
        reason: `Admitted after verification: ${[...accepted.sources.map((s) => s.id), ...accepted.evidence.map((e) => e.id), ...accepted.claims.map((c) => c.id), ...accepted.research.map((r) => r.id)].join(", ") || "nothing"}${[...provisional.sources, ...provisional.evidence, ...provisional.claims].length ? `; admitted provisionally, unread, awaiting their texts: ${[...provisional.sources, ...provisional.evidence, ...provisional.claims].map((r) => r.id).join(", ")}` : ""}; everything else proposed was refused or blocked with a reason in dispositions.yaml. The drafter's rationale for the proposal, written before verification and describing what it proposed: ${proposal.rationale}`,
        actor: `aletheia verify (${READER.model} second reader; drafter ${drafterOf(proposal)})`,
        aiAssisted: true,
        kind: "content",
      },
      root,
    );
    return {
      ...closeRun(run, "completed", { reason: `wrote ${JSON.stringify(counts)}; ${rejected.length} rejected${notPlan ? ` (${notPlan} research item(s) not a plan)` : ""}${corrected.applied.length ? `; ${corrected.applied.length} correction(s) applied` : ""}${corrected.skipped.length ? `; ${corrected.skipped.length} correction(s) not applied (see verification.md)` : ""}` }),
      accepted: counts,
      rejected: rejected.length,
    };
  } catch (e) {
    return closeRun(run, "failed", { reason: (e as Error).message });
  }
}

