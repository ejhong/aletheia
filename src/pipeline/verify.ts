import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { Disposition, Proposal } from "../domain/intake.ts";
import { canonicalJson, sha256Hex } from "../domain/hash.ts";
import { sameTitle, sourceKeys, textKey } from "../domain/keys.ts";
import { claimAnchorErrors, findCase, sourceAdmissionErrors } from "../domain/load.ts";
import type { Claim, Evidence, LoadedCase, ResearchOpportunity, Source } from "../domain/schema.ts";
import { verifyCitations } from "../../scripts/lib/citation-check.mjs";
import { archiveUrl, type Archived } from "./archive.ts";
import { retrieve, type FetchedSource } from "./fetch.ts";
import { isoDate } from "../../scripts/lib/overlay-ids.mjs";
import { appendHistory, appendRecords, applyCorrections, ledgerFileFor, type Correction } from "./ledger-write.ts";
import { MODELS } from "../../scripts/lib/models.mjs";
import { anthropicJson, type Meter } from "./models.ts";
import { loadProtocol, renderProtocol } from "./protocols.ts";
import { unverifiedQuotes } from "./quotes.ts";
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
  required: ["quoteInContext", "statementSupported", "locatorSupported", "directionRight", "independenceNoted", "relevant", "atomic", "reason"],
  properties: {
    quoteInContext: { type: "boolean" },
    statementSupported: { type: "boolean" },
    locatorSupported: { type: "boolean" },
    directionRight: { type: "boolean" },
    independenceNoted: { type: "boolean" },
    relevant: { type: "boolean" },
    atomic: { type: "boolean" },
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
  reason: string;
}

export const SPLIT_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["parts"],
  properties: { parts: { type: "array", items: { type: "string" } } },
};

/** Split a compound claim into the propositions its anchor states (protocol split-v1). */
export type Splitter = (statement: string, anchorText: string, meter: Meter) => Promise<string[]>;

export const defaultSplitter: Splitter = async (statement, anchorText, meter) => {
  const protocol = loadProtocol("split");
  const r = await anthropicJson<{ parts: string[] }>(
    { ...MODELS.house, system: renderProtocol(protocol, {}), user: JSON.stringify({ statement, anchorText }, null, 1), schema: SPLIT_SCHEMA, maxTokens: 4000, effort: "low", timeoutMs: 240_000 },
    meter,
  );
  return r.data.parts.map((p) => p.trim()).filter((p) => p.length > 10);
};

/**
 * Judgments and splits remembered beside the proposal (`judgments.yaml`),
 * keyed by what was asked (record, context, source text, reader), so a
 * verification cut short — by a budget cap, a torn socket — resumes without
 * asking the same question twice (2026-09-09: $12 of judge calls were lost
 * when the month's cap stopped a run mid-way). What was judged is also part
 * of the record.
 */
export function rememberedJudge(judge: Judge, file: string, readerModel: string): Judge {
  const memory: Record<string, VerifyReply> = fs.existsSync(file) ? ((parseYaml(fs.readFileSync(file, "utf8")) as Record<string, VerifyReply>) ?? {}) : {};
  return async (record, sourceText, context, meter) => {
    const key = sha256Hex(canonicalJson({ record, context, sourceText, readerModel }));
    if (memory[key]) return memory[key];
    const reply = await judge(record, sourceText, context, meter);
    memory[key] = reply;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, stringifyYaml(memory, { lineWidth: 0 }));
    return reply;
  };
}

export function rememberedSplitter(split: Splitter, file: string, model: string): Splitter {
  const memory: Record<string, string[]> = fs.existsSync(file) ? ((parseYaml(fs.readFileSync(file, "utf8")) as Record<string, string[]>) ?? {}) : {};
  return async (statement, anchorText, meter) => {
    const key = sha256Hex(canonicalJson({ statement, anchorText, model }));
    if (memory[key]) return memory[key];
    const parts = await split(statement, anchorText, meter);
    memory[key] = parts;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, stringifyYaml(memory, { lineWidth: 0 }));
    return parts;
  };
}

/** The next free claim id in the case's scheme, given the ledger and everything proposed so far. */
export function nextClaimId(loaded: LoadedCase, taken: Iterable<string>): string {
  const ids = [...loaded.claims.map((c) => c.id), ...taken];
  const prefix = ids.find((id) => /-C\d+$/.test(id))?.replace(/\d+$/, "") ?? `${loaded.record.id.split("-")[0]}-C`;
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
      user: JSON.stringify({ record, context, sourceText }, null, 1),
      schema: VERIFY_SCHEMA,
      maxTokens: 4000,
      effort: "medium",
      timeoutMs: 240_000, // a four-thousand-token reply; a stall past four minutes is a stall
    },
    meter,
  );
  return r.data;
};

export type Resolver = (citations: { kind: string; id: string }[]) => Promise<{ kind: string; id: string; status: string; note: string }[]>;

export interface Verdicts {
  accepted: { sources: Source[]; evidence: Evidence[]; claims: Claim[]; research: ResearchOpportunity[] };
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
  const manifest = parseYaml(fs.readFileSync(manifestFile, "utf8")) as { items?: { ledgerSource?: string | null; document?: string | null; name?: string; sha256?: string; title?: string }[] };
  for (const it of manifest.items ?? []) {
    if (!it.document) continue;
    // The source the intake identified, else a source (the ledger's or this proposal's) whose title is the document's.
    const src = sources.find((s) => it.ledgerSource && s.id === it.ledgerSource) ?? (it.title ? sources.find((s) => sameTitle(it.title!, s.title)) : undefined);
    const file = path.join(root, "proposals", runDirOf, it.document);
    if (!src || !fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    out.set(textKeyOf(src), { url: textKeyOf(src), ok: true, status: null, contentType: "text/plain", text, via: `supplied document ${it.name} (sha256 ${(it.sha256 ?? "").slice(0, 12)}), ${it.ledgerSource ? `identified at intake as ${src.id}` : `matched by title to ${src.id}`}` });
  }
  return out;
}

/** Why a correction cannot apply as the ledger stands (null when it can): unknown record, no such file, or the field has moved since. */
export function correctionBlocker(loaded: LoadedCase, c: Correction): string | null {
  if (!ledgerFileFor(c.record)) return `no ledger file for record id ${c.record}`;
  const rec = [...loaded.sources, ...loaded.claims, ...loaded.evidence, ...loaded.research].find((r) => r.id === c.record) as Record<string, unknown> | undefined;
  if (!rec) return `record ${c.record} is not in the ledger`;
  if (JSON.stringify(rec[c.field]) !== JSON.stringify(c.from)) return `the field no longer reads what the proposal saw`;
  return null;
}

/** A resolver note that carries a Retraction Watch finding (scripts/lib/citation-check.mjs). */
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
  reader: { model: string; date: string } = { model: READER.model, date: isoDate() },
  split: Splitter = defaultSplitter,
  /** Who wrote the parts of a split claim, and in which run — their `origin` (§3.14, §3.15). */
  splitter: { model: string; runId: string } = { model: MODELS.house.model, runId: "unrecorded" },
): Promise<Verdicts> {
  const rejected: Verdicts["rejected"] = [];
  const notes: string[] = [];
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

  // Evidence: source ok, text retrievable, quotes verbatim, second reader agrees.
  const okEvidence: Evidence[] = [];
  for (const e of proposal.adds.evidence) {
    if (!sourceById.has(e.sourceId)) {
      reject(e.id, "evidence", e.title, `its source ${e.sourceId} was rejected`);
      continue;
    }
    const fetched = textFor(e.sourceId);
    if (!fetched?.ok || !fetched.text) {
      reject(e.id, "evidence", e.title, `source text not retrievable: ${fetched?.reason ?? "no URL on the source record"}`, true, `obtain the text of ${e.sourceId} (${sourceById.get(e.sourceId)?.url ?? "no url"}) and re-run verify`);
      continue;
    }
    const bad = unverifiedQuotes(e.sourceStatement, fetched.text);
    if (bad.length) {
      reject(e.id, "evidence", e.title, `quoted span not found verbatim in the source: ${bad.map((q) => `"${q.slice(0, 70)}"`).join("; ")}`);
      continue;
    }
    const claims = e.claimIds.map((id) => loaded.claims.find((c) => c.id === id) ?? proposal.adds.claims.find((c) => c.id === id)).filter(Boolean);
    const context = `Case question: ${loaded.record.subtitle}. Claims this record bears on: ${claims.map((c) => `${c!.id}: ${c!.statement}`).join(" | ")}`;
    const verdict = await judge({ ...e, editorInference: undefined }, fetched.text, context, meter);
    const flags = Object.entries(verdict).filter(([k, v]) => k !== "reason" && v === false).map(([k]) => k);
    // Mechanical and factual failures gate. A dispute about the direction
    // label is a judgment against a judgment: the record enters with the
    // reader's dissent written on it, both stamped, for the editor and the
    // panel to weigh (verify protocol v2).
    const gating = flags.filter((f) => f !== "directionRight");
    if (gating.length) {
      reject(e.id, "evidence", e.title, `second reader rejected (${gating.join(", ")}): ${verdict.reason}`);
      continue;
    }
    if (flags.includes("directionRight")) {
      notes.push(`${e.id}: admitted with the second reader's dissent on direction`);
      okEvidence.push({ ...e, limitations: [...e.limitations, `Second reader (${reader.model}, ${reader.date}) disputes the stated direction: ${verdict.reason}`] });
      continue;
    }
    okEvidence.push(e);
  }

  // Claims: an anchor's quote must be verbatim and read right; otherwise an accepted evidence record must cite the claim.
  const okClaims: Claim[] = [];
  const citedBy = new Set(okEvidence.flatMap((e) => e.claimIds));
  for (const c of proposal.adds.claims) {
    if (c.sourceAnchor?.quote) {
      const sid = c.sourceAnchor.sourceId;
      const fetched = sid ? textFor(sid) : undefined;
      if (!fetched?.ok || !fetched.text) {
        if (!citedBy.has(c.id)) {
          reject(c.id, "claim", c.statement, `anchor source not retrievable (${fetched?.reason ?? "no source id on the anchor"}) and no accepted evidence cites the claim`, true, `obtain the anchor's text and re-run verify`);
          continue;
        }
      } else if (unverifiedQuotes(`"${c.sourceAnchor.quote}"`, fetched.text).length) {
        reject(c.id, "claim", c.statement, `anchor quote not found verbatim in ${sid}`);
        continue;
      } else {
        const anchorContext = `Case question: ${loaded.record.subtitle}. Does the anchored passage support the proposition as stated?`;
        const verdict = await judge({ statement: c.statement, anchor: c.sourceAnchor }, fetched.text, anchorContext, meter);
        const flags = Object.entries(verdict).filter(([k, v]) => k !== "reason" && v === false && k !== "independenceNoted" && k !== "directionRight" && k !== "atomic").map(([k]) => k);
        if (flags.length) {
          reject(c.id, "claim", c.statement, `second reader rejected the anchor (${flags.join(", ")}): ${verdict.reason}`);
          continue;
        }
        if (verdict.atomic === false) {
          // One split round (§3.2): the drafter divides the statement; each part is judged on the same anchor.
          const parts = await split(c.statement, fetched.text, meter);
          const admitted: Claim[] = [];
          for (const part of parts) {
            const id = nextClaimId(loaded, [...proposal.adds.claims.map((k) => k.id), ...okClaims.map((k) => k.id), ...admitted.map((k) => k.id)]);
            // The part's wording is the splitter's, not the drafter's: its origin says so.
            // A part keeps the compound's place in the ladder (its parents) and its anchor; the compound's
            // dependencies, alternatives and contradictions are the compound's, not each part's, and are
            // not carried over (§3.2) — said aloud below so a later pass can propose them per part.
            const candidate: Claim = { ...c, id, statement: part, dependsOnClaimIds: [], alternativeToClaimIds: [], contradictsClaimIds: [], origin: { ref: `split of ${c.id} (${c.origin.ref})`, extractedBy: splitter.model, runId: splitter.runId, date: reader.date } };
            const v2 = await judge({ statement: part, anchor: c.sourceAnchor }, fetched.text, anchorContext, meter);
            const bad = Object.entries(v2).filter(([k, v]) => k !== "reason" && v === false && k !== "independenceNoted" && k !== "directionRight").map(([k]) => k);
            if (bad.length) {
              notes.push(`${c.id} part "${part.slice(0, 60)}" refused (${bad.join(", ")}): ${v2.reason}`);
              continue;
            }
            admitted.push(candidate);
          }
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
    } else if (!citedBy.has(c.id)) {
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
        if (v.directionRight === false) dissents.push(`Second reader (${reader.model}, ${reader.date}) disputes the stated direction toward ${pid}: ${v.reason}`);
        kept.push(pid);
      }
    }
    okEvidence[i] = { ...e, claimIds: [...new Set(kept)], limitations: dissents.length ? [...e.limitations, ...dissents] : e.limitations };
  }
  // Claims whose parents or dependencies were rejected (or never existed) keep the claim and lose the link, said aloud.
  const liveClaimIds = new Set([...loaded.claims.filter((c) => c.reviewState !== "rejected").map((c) => c.id), ...okClaims.map((c) => c.id)]);
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

  // Research: structurally sound and pointing at live claims.
  const research: ResearchOpportunity[] = [];
  for (const r of proposal.adds.research) {
    const kept = r.claimIds.filter((id) => liveClaimIds.has(id));
    if (kept.length === 0) {
      reject(r.id, "research", r.title, "none of the claims it would move survived");
      continue;
    }
    research.push({ ...r, claimIds: kept });
  }

  // Sources: admitted only if something accepted cites them.
  const cited = new Set([...evidence.map((e) => e.sourceId), ...okClaims.map((c) => c.sourceAnchor?.sourceId).filter(Boolean)]);
  const sources: Source[] = [];
  for (const s of okSources.values()) {
    if (cited.has(s.id) || s.background) sources.push(s);
    else reject(s.id, "source", s.title, "nothing accepted cites it (§3.6: sources are not evidence by themselves)");
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
  ];
  for (const err of errors) notes.push(`prospective ledger: ${err}`);

  return { accepted: { sources, evidence, claims: okClaims, research }, rejected, notes };
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
    cases?: () => LoadedCase[];
  };
}

export interface VerifyOutcome extends RunOutcome {
  accepted?: { sources: number; evidence: number; claims: number; research: number };
  rejected?: number;
}

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
    const verdicts = await judgeProposal(proposal, loaded, texts, resolved, judge, meter, { model: READER.model, date }, split, { model: MODELS.house.model, runId });
    // Durable locators: every admitted source with a URL gets its Wayback snapshot on the record.
    const archive = opts.deps?.archive ?? archiveUrl;
    for (const [i, s] of verdicts.accepted.sources.entries()) {
      if (!s.url) continue;
      const a = await archive(s.url);
      verdicts.notes.push(`${s.id}: ${a.note}`);
      if (a.archivedUrl) verdicts.accepted.sources[i] = { ...s, archivedUrl: a.archivedUrl };
    }
    const { accepted, rejected, notes } = verdicts;

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
      `## Rejected`,
      ...rejected.map((r) => `- ${r.kind} ${r.id} (${r.disposition}) — ${r.reason}${r.route ? ` — route: ${r.route}` : ""}`),
      ``,
      ...(proposal.corrections.length
        ? [
            `## Corrections`,
            ...proposal.corrections.map((c) => {
              const why = correctionBlocker(loaded, c);
              return `- ${c.record}.${c.field}: "${String(c.from).slice(0, 120)}" → "${String(c.to).slice(0, 120)}" — ${c.reason}${why ? ` — NOT applied: ${why}` : opts.dryRun ? " — would apply" : " — applied"}`;
            }),
            ``,
          ]
        : []),
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
    const counts = { sources: accepted.sources.length, evidence: accepted.evidence.length, claims: accepted.claims.length, research: accepted.research.length };
    if (opts.dryRun) {
      return { ...closeRun(run, "dry-run", { reason: `would write ${JSON.stringify(counts)}; ${rejected.length} rejected` }), accepted: counts, rejected: rejected.length };
    }

    // Materialize.
    const corrected = applyCorrections(loaded.dir, proposal.corrections, {
      date,
      actor: `aletheia verify (${READER.model} second reader; drafter ${proposal.model ?? "unknown"}; proposal ${proposalRunId}, verification ${runId})`,
      proposalRef: `proposals/${proposalRunId}`,
      root,
    });
    for (const s of corrected.skipped) notes.push(`correction to ${s.correction.record}.${s.correction.field} not applied: ${s.reason}`);
    appendRecords(loaded.dir, "sources.yaml", accepted.sources, root);
    appendRecords(loaded.dir, "claims.yaml", accepted.claims, root);
    appendRecords(loaded.dir, "evidence.yaml", accepted.evidence, root);
    appendRecords(loaded.dir, "research.yaml", accepted.research, root);
    const rows: Disposition[] = [];
    const inRow = (kind: Disposition["kind"], key: string | null, id: string, observed: string) => {
      if (key) rows.push({ key, kind, disposition: "in", as: id, observed, by: runId, date, proposal: `proposals/${proposalRunId}` });
    };
    for (const s of accepted.sources) inRow("source", sourceKeys(s)[0] ?? null, s.id, s.title);
    for (const c of accepted.claims) inRow("claim", textKey(c.statement), c.id, c.statement);
    for (const e of accepted.evidence) inRow("evidence", textKey(`${e.title} ${e.sourceStatement}`), e.id, e.title);
    for (const r of accepted.research) inRow("research", textKey(r.title), r.id, r.title);
    for (const r of rejected) {
      const key = r.kind === "source" ? sourceKeys({ title: r.observed })[0] ?? textKey(r.observed) : textKey(r.observed);
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
        change: `Intake from report ${proposal.report ?? proposal.runId}: ${counts.sources} source(s), ${counts.evidence} evidence record(s), ${counts.claims} claim(s), ${counts.research} research item(s) verified and added (proposal ${proposalRunId}, verification ${runId}); ${rejected.length} candidate(s) rejected with reasons in dispositions.yaml.${corrected.skipped.length ? ` ${corrected.skipped.length} correction(s) NOT applied — see proposals/${runId}/verification.md.` : ""}`,
        reason: proposal.rationale,
        actor: `aletheia verify (${READER.model} second reader; drafter ${proposal.model ?? "unknown"})`,
        aiAssisted: true,
        kind: "content",
      },
      root,
    );
    return {
      ...closeRun(run, "completed", { reason: `wrote ${JSON.stringify(counts)}; ${rejected.length} rejected${corrected.applied.length ? `; ${corrected.applied.length} correction(s) applied` : ""}${corrected.skipped.length ? `; ${corrected.skipped.length} correction(s) not applied (see verification.md)` : ""}` }),
      accepted: counts,
      rejected: rejected.length,
    };
  } catch (e) {
    return closeRun(run, "failed", { reason: (e as Error).message });
  }
}

