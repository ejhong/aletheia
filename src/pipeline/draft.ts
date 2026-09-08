import fs from "node:fs";
import path from "node:path";
import { coverageDiff, type Candidate } from "../domain/coverage.ts";
import {
  DispositionSchema,
  ProposalSchema,
  type Disposition,
  type Proposal,
} from "../domain/intake.ts";
import { sha256Hex } from "../domain/hash.ts";
import { canonicalUrl, sourceKeys, textKey } from "../domain/keys.ts";
import { findCase } from "../domain/load.ts";
import {
  ClaimSchema,
  EvidenceSchema,
  ResearchOpportunitySchema,
  SourceSchema,
  type LoadedCase,
} from "../domain/schema.ts";
import { doiFromUrl, doisInText, retrieve, type FetchedSource, type RetrievalTarget } from "./fetch.ts";
import { MODELS } from "../../scripts/lib/models.mjs";
import { anthropicJson, type Meter } from "./models.ts";
import { buildPacket } from "./packet.ts";
import { loadProtocol, renderProtocol } from "./protocols.ts";
import { closeRun, openRun, readRuns, runDir, writeProposal, writeWorkingFile, type RunOutcome } from "./store.ts";

/**
 * `aletheia draft <reportRunId>` — propose (docs/AUTOMATION.md, "The verbs").
 *
 * The drafter receives the packet, the report, and the RETRIEVED TEXT of
 * every source the report cites, and returns candidate records in a loose
 * JSON shape. This module then does the mechanical part: assigns ids,
 * stamps provenance, validates every record with the ledger's own schema
 * (a record that fails is a `failed` disposition, not a partial add), runs
 * the coverage diff (a source the ledger carries is a `duplicate` and its
 * evidence is re-pointed at the existing record), fills mechanical keys on
 * the drafter's dispositions, and writes one proposal envelope.
 *
 * The drafter never writes a quote it was not shown: the verify verb
 * checks every quoted span against the same text, mechanically, before any
 * record enters.
 */

/** The drafter is the house model (config/models.yaml); the run records the model that served. */
export const DRAFTER = MODELS.house;

/** Structured-output schema for the drafter (no length or numeric constraints — the API forbids them). */
export const DRAFT_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["rationale", "sources", "evidence", "claims", "research", "corrections", "dispositions", "edition"],
  properties: {
    rationale: { type: "string" },
    sources: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["provisionalId", "url", "title", "authors", "year", "sourceType", "identifier", "verification", "reliabilityNotes"],
        properties: {
          provisionalId: { type: "string" },
          url: { type: ["string", "null"] },
          title: { type: "string" },
          authors: { type: "array", items: { type: "string" } },
          year: { type: ["string", "null"] },
          sourceType: { type: "string", enum: ["paper", "preprint", "book", "report", "webpage", "archive", "dataset", "artifact_record", "other"] },
          identifier: { type: ["string", "null"] },
          verification: { type: "string", enum: ["ai_verified", "unverified"] },
          reliabilityNotes: { type: "array", items: { type: "string" } },
        },
      },
    },
    evidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["provisionalId", "title", "claimRefs", "sourceRef", "direction", "strength", "sourceStatement", "editorInference", "exactLocator", "limitations"],
        properties: {
          provisionalId: { type: "string" },
          title: { type: "string" },
          claimRefs: { type: "array", items: { type: "string" } },
          sourceRef: { type: "string" },
          direction: { type: "string", enum: ["supports", "undermines", "qualifies", "context"] },
          strength: { type: "string", enum: ["decisive", "strong", "moderate", "weak"] },
          sourceStatement: { type: "string" },
          editorInference: { type: ["string", "null"] },
          exactLocator: { type: ["string", "null"] },
          limitations: { type: "array", items: { type: "string" } },
        },
      },
    },
    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["provisionalId", "statement", "theme", "rung", "claimType", "sourceAnchor", "parentClaimRefs", "dependsOnClaimRefs"],
        properties: {
          provisionalId: { type: "string" },
          statement: { type: "string" },
          theme: { type: "string" },
          rung: { type: "string", enum: ["observation", "mechanism", "attribution"] },
          // A nullable enum must be written as a choice: the vendor rejects `enum` on a `["string", "null"]` type.
          claimType: {
            anyOf: [
              { type: "string", enum: ["observation", "measurement", "historical", "causal", "mechanistic", "statistical", "interpretive", "methodological", "existence", "theory_description", "mathematical"] },
              { type: "null" },
            ],
          },
          sourceAnchor: {
            type: ["object", "null"],
            additionalProperties: false,
            required: ["sourceRef", "locator", "quote"],
            properties: { sourceRef: { type: "string" }, locator: { type: "string" }, quote: { type: "string" } },
          },
          parentClaimRefs: { type: "array", items: { type: "string" } },
          dependsOnClaimRefs: { type: "array", items: { type: "string" } },
        },
      },
    },
    research: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["provisionalId", "title", "summary", "claimRefs", "track", "effortTier", "informationGain"],
        properties: {
          provisionalId: { type: "string" },
          title: { type: "string" },
          summary: { type: "string" },
          claimRefs: { type: "array", items: { type: "string" } },
          track: { type: "string", enum: ["publication_prize", "small_grant", "either"] },
          effortTier: { type: "string", enum: ["desk", "field", "lab"] },
          informationGain: { type: "string" },
        },
      },
    },
    corrections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["record", "field", "from", "to", "reason"],
        properties: {
          record: { type: "string" },
          field: { type: "string" },
          from: { type: "string" },
          to: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
    dispositions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "disposition", "as", "reason", "reopenIf", "observed", "url", "route"],
        properties: {
          kind: { type: "string", enum: ["source", "evidence", "claim", "research", "study", "image", "edition"] },
          disposition: { type: "string", enum: ["duplicate", "irrelevant", "blocked", "failed", "excluded"] },
          as: { type: ["string", "null"] },
          reason: { type: "string" },
          reopenIf: { type: ["string", "null"] },
          observed: { type: "string" },
          url: { type: ["string", "null"] },
          route: { type: ["string", "null"] },
        },
      },
    },
    edition: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["rationale", "featuredClaimIds", "cruxOrder", "article"],
      properties: {
        rationale: { type: "string" },
        featuredClaimIds: { type: "array", items: { type: "string" } },
        cruxOrder: { type: "array", items: { type: "string" } },
        article: { type: "string" },
      },
    },
  },
};

export interface DraftReply {
  rationale: string;
  sources: {
    provisionalId: string;
    url: string | null;
    title: string;
    authors: string[];
    year: string | null;
    sourceType: string;
    identifier: string | null;
    verification: "ai_verified" | "unverified";
    reliabilityNotes: string[];
  }[];
  evidence: {
    provisionalId: string;
    title: string;
    claimRefs: string[];
    sourceRef: string;
    direction: string;
    strength: string;
    sourceStatement: string;
    editorInference: string | null;
    exactLocator: string | null;
    limitations: string[];
  }[];
  claims: {
    provisionalId: string;
    statement: string;
    theme: string;
    rung: string;
    claimType: string | null;
    sourceAnchor: { sourceRef: string; locator: string; quote: string } | null;
    parentClaimRefs: string[];
    dependsOnClaimRefs: string[];
  }[];
  research: {
    provisionalId: string;
    title: string;
    summary: string;
    claimRefs: string[];
    track: string;
    effortTier: string;
    informationGain: string;
  }[];
  corrections: { record: string; field: string; from: string; to: string; reason: string }[];
  dispositions: {
    kind: Disposition["kind"];
    disposition: Exclude<Disposition["disposition"], "in">;
    as: string | null;
    reason: string;
    reopenIf: string | null;
    observed: string;
    url: string | null;
    route: string | null;
  }[];
  edition: { rationale: string; featuredClaimIds: string[]; cruxOrder: string[]; article: string } | null;
}

/** Every http(s) URL in a report, canonicalised and deduplicated, tracking parameters dropped. */
/** Every work the report points at: its URLs, plus DOIs written bare that no URL already carries. */
export function retrievalTargets(markdown: string, cap = 20): RetrievalTarget[] {
  const urls = urlsInReport(markdown, cap);
  const covered = new Set(urls.map((u) => doiFromUrl(u)?.toLowerCase()).filter(Boolean));
  const targets: RetrievalTarget[] = urls.map((url) => ({ url, doi: doiFromUrl(url) }));
  for (const doi of doisInText(markdown)) {
    if (covered.has(doi) || targets.length >= cap) continue;
    covered.add(doi);
    targets.push({ url: `https://doi.org/${doi}`, doi });
  }
  return targets;
}

export function urlsInReport(markdown: string, cap = 20): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of markdown.matchAll(/https?:\/\/[^\s)\]>"'`]+/g)) {
    const raw = m[0].replace(/[.,;:!?]+$/, "");
    const key = canonicalUrl(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(raw);
    if (out.length >= cap) break;
  }
  return out;
}

export interface AssembleContext {
  loaded: LoadedCase;
  reportRunId: string;
  runId: string;
  model: string;
  promptVersion: string;
  date: string;
  /** Sources the drafter was shown, by URL, so failures can say what was retrievable. */
  fetched: FetchedSource[];
}

export interface Assembled {
  proposal: Proposal;
  novelty: string;
}

const pad3 = (n: number) => String(n).padStart(3, "0");

function nextNumbers(loaded: LoadedCase) {
  const prefix = loaded.record.id.split("-")[0];
  const max = (ids: string[], re: RegExp) =>
    ids.reduce((m, id) => {
      const k = id.match(re)?.[1];
      return k ? Math.max(m, Number(k)) : m;
    }, 0);
  return {
    prefix,
    claim: max(loaded.claims.map((c) => c.id), /-C(\d+)$/) + 1,
    evidence: max(loaded.evidence.map((e) => e.id), /-E(\d+)$/) + 1,
    research: max(loaded.research.map((r) => r.id), /-R(\d+)$/) + 1,
  };
}

function sourceIdFor(s: DraftReply["sources"][number], taken: Set<string>): string {
  // "Surname, Initials" → Surname; "Initials Surname" → Surname; no author → first two title words.
  const author = s.authors[0];
  const stem = author
    ? author.includes(",")
      ? author.split(",")[0].trim()
      : author.trim().split(/\s+/).at(-1) ?? "SOURCE"
    : s.title.split(/\s+/).slice(0, 2).join("");
  const base = `SRC-${stem.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 18) || "SOURCE"}-${s.year ?? "ND"}`;
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}${String.fromCharCode(63 + n)}`; // B, C, …
  taken.add(id);
  return id;
}

/** Pure: a drafter reply plus context → a validated proposal and a novelty report. Never throws on a bad record; it dispositions it. */
export function assembleProposal(reply: DraftReply, ctx: AssembleContext): Assembled {
  const { loaded, runId, date } = ctx;
  const nums = nextNumbers(loaded);
  const origin = { ref: `report ${ctx.reportRunId}`, extractedBy: ctx.model, runId, date };
  const dispositions: Disposition[] = [];
  const notes: string[] = [];
  const idOf = new Map<string, string>(); // provisional → real
  const knownIds = new Set([
    ...loaded.claims.map((c) => c.id),
    ...loaded.evidence.map((e) => e.id),
    ...loaded.sources.map((s) => s.id),
    ...loaded.research.map((r) => r.id),
  ]);
  const resolve = (ref: string) => idOf.get(ref) ?? (knownIds.has(ref) ? ref : null);
  const fetchedByUrl = new Map(ctx.fetched.map((f) => [canonicalUrl(f.url), f]));
  const fetchedByDoi = new Map(ctx.fetched.flatMap((f) => (doiFromUrl(f.url) ? [[doiFromUrl(f.url)!.toLowerCase(), f] as const] : [])));
  /** The retrieved text for a proposed source: by its URL, or by the DOI its URL or identifier carries. */
  const shownFor = (s: { url?: string | null; identifier?: string | null }): FetchedSource | undefined => {
    const byUrl = s.url ? fetchedByUrl.get(canonicalUrl(s.url)) : undefined;
    if (byUrl) return byUrl;
    const doi = (s.url ? doiFromUrl(s.url) : null) ?? (s.identifier ? doisInText(s.identifier)[0] : null);
    return doi ? fetchedByDoi.get(doi.toLowerCase()) : undefined;
  };

  const decline = (kind: Disposition["kind"], observed: string, reason: string, key: string | null, extra: Partial<Disposition> = {}) => {
    if (!key) {
      notes.push(`no mechanical key for ${kind} "${observed.slice(0, 80)}" — ${reason}`);
      return;
    }
    dispositions.push({ key, kind, disposition: "failed", reason, observed, by: runId, date, ...extra });
  };

  // ---- sources: duplicates first, then ids and validation -----------------
  const sources = [];
  const takenSourceIds = new Set(loaded.sources.map((s) => s.id));
  for (const s of reply.sources) {
    const candidate: Candidate = { kind: "source", title: s.title, url: s.url, identifier: s.identifier };
    const diff = coverageDiff([candidate], loaded);
    if (diff.seen.length) {
      const hit = diff.seen[0];
      const as = hit.record ?? hit.disposition?.as;
      if (as) {
        idOf.set(s.provisionalId, as);
        dispositions.push({
          key: hit.key,
          kind: "source",
          disposition: "duplicate",
          as,
          reason: `already in the ledger as ${as} (matched by ${hit.key.split(":")[0]}); new observations from it may still enter`,
          observed: s.title,
          by: runId,
          date,
        });
        continue;
      }
      // `blocked` is a pending state, not a verdict: its reopen condition is
      // the text being obtained. When this pass has the text, the source goes
      // forward as new (the first pass with retrieval, 2026-09-08, had
      // re-blocked Nemoy 1939 and Sessa et al. on the strength of the previous
      // day's row and lost seven evidence records with them).
      const prior = hit.disposition!;
      const nowShown = shownFor(s);
      if (!(prior.disposition === "blocked" && nowShown?.ok)) {
        dispositions.push({
          key: hit.key,
          kind: "source",
          disposition: prior.disposition,
          as: prior.as,
          reason: `previously ${prior.disposition} on ${prior.date}: ${prior.reason ?? ""}`.trim(),
          observed: s.title,
          by: runId,
          date,
        });
        continue;
      }
      notes.push(`${s.title.slice(0, 80)}: previously blocked on ${prior.date}; its text was retrieved this pass, so it goes forward`);
    }
    const shown = shownFor(s);
    const id = sourceIdFor(s, takenSourceIds);
    const record = {
      id,
      title: s.title,
      authors: s.authors,
      year: s.year ?? undefined,
      sourceType: s.sourceType,
      identifier: s.identifier ?? undefined,
      url: s.url ?? undefined,
      verification: shown?.ok ? "ai_verified" : "unverified",
      verificationNote: shown?.ok
        ? `text retrieved and shown to the drafter on ${date} (run ${runId}); passages checked by the verify verb`
        : `not retrievable when drafted (${shown?.reason ?? "no URL"}); nothing may lean on it until it is read`,
      reliabilityNotes: s.reliabilityNotes,
    };
    const parsed = SourceSchema.safeParse(record);
    if (!parsed.success) {
      decline("source", s.title, `schema: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`, sourceKeys(s)[0] ?? null);
      continue;
    }
    idOf.set(s.provisionalId, id);
    knownIds.add(id);
    sources.push(parsed.data);
    if (diff.probable.length) notes.push(`probable duplicate: ${id} "${s.title}" ~ ${diff.probable[0].matches.map((m) => `${m.id} ${m.score}`).join(", ")}`);
  }

  // ---- claims --------------------------------------------------------------
  const claims = [];
  for (const c of reply.claims) {
    const diff = coverageDiff([{ kind: "claim", statement: c.statement }], loaded);
    if (diff.seen.length) {
      const hit = diff.seen[0];
      const as = hit.record ?? hit.disposition?.as ?? null;
      if (as) idOf.set(c.provisionalId, as);
      dispositions.push({
        key: hit.key,
        kind: "claim",
        disposition: as ? "duplicate" : hit.disposition!.disposition,
        ...(as ? { as } : {}),
        reason: as ? `already in the ledger as ${as}` : `previously ${hit.disposition!.disposition}: ${hit.disposition!.reason ?? ""}`,
        observed: c.statement,
        by: runId,
        date,
      });
      continue;
    }
    const id = `${nums.prefix}-C${pad3(nums.claim++)}`;
    const anchorSource = c.sourceAnchor ? resolve(c.sourceAnchor.sourceRef) : null;
    const record = {
      id,
      statement: c.statement,
      theme: c.theme,
      rung: c.rung,
      claimType: c.claimType ?? undefined,
      sourceAnchor: c.sourceAnchor
        ? { locator: c.sourceAnchor.locator, quote: c.sourceAnchor.quote, ...(anchorSource ? { sourceId: anchorSource } : {}) }
        : undefined,
      parentClaimIds: c.parentClaimRefs.map(resolve).filter((x): x is string => Boolean(x)),
      dependsOnClaimIds: c.dependsOnClaimRefs.map(resolve).filter((x): x is string => Boolean(x)),
      reviewState: "ai_extracted",
      origin,
    };
    const parsed = ClaimSchema.safeParse(record);
    if (!parsed.success) {
      decline("claim", c.statement, `schema: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`, textKey(c.statement));
      continue;
    }
    if (!(c.theme in loaded.record.themes)) {
      decline("claim", c.statement, `unknown theme "${c.theme}" — the case's themes are ${Object.keys(loaded.record.themes).join(", ")}`, textKey(c.statement));
      continue;
    }
    idOf.set(c.provisionalId, id);
    knownIds.add(id);
    claims.push(parsed.data);
    if (diff.probable.length) notes.push(`probable duplicate: ${id} ~ ${diff.probable[0].matches.map((m) => `${m.id} ${m.score}`).join(", ")}`);
  }

  // ---- evidence ------------------------------------------------------------
  const evidence = [];
  for (const e of reply.evidence) {
    const sourceId = resolve(e.sourceRef);
    const claimIds = e.claimRefs.map(resolve).filter((x): x is string => Boolean(x));
    const key = textKey(`${e.title} ${e.sourceStatement}`);
    if (!sourceId) {
      decline("evidence", e.title, `its source "${e.sourceRef}" was not added (see its disposition) and is not in the ledger`, key);
      continue;
    }
    if (claimIds.length === 0) {
      decline("evidence", e.title, `none of its claims (${e.claimRefs.join(", ") || "none named"}) resolve to a record`, key);
      continue;
    }
    const record = {
      id: `${nums.prefix}-E${pad3(nums.evidence++)}`,
      title: e.title,
      claimIds,
      sourceId,
      direction: e.direction,
      strength: e.strength,
      sourceStatement: e.sourceStatement,
      editorInference: e.editorInference ?? undefined,
      exactLocator: e.exactLocator ?? undefined,
      limitations: e.limitations,
      reviewState: "ai_extracted",
      origin,
    };
    const parsed = EvidenceSchema.safeParse(record);
    if (!parsed.success) {
      nums.evidence--;
      decline("evidence", e.title, `schema: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`, key);
      continue;
    }
    idOf.set(e.provisionalId, record.id);
    evidence.push(parsed.data);
  }

  // ---- research ------------------------------------------------------------
  const research = [];
  for (const r of reply.research) {
    const diff = coverageDiff([{ kind: "research", title: r.title }], loaded);
    if (diff.seen.length) {
      const hit = diff.seen[0];
      dispositions.push({
        key: hit.key,
        kind: "research",
        disposition: hit.record ? "duplicate" : hit.disposition!.disposition,
        ...(hit.record ? { as: hit.record } : hit.disposition?.as ? { as: hit.disposition.as } : {}),
        reason: hit.record ? `already in the ledger as ${hit.record}` : `previously ${hit.disposition!.disposition}: ${hit.disposition!.reason ?? ""}`,
        observed: r.title,
        by: runId,
        date,
      });
      continue;
    }
    const claimIds = r.claimRefs.map(resolve).filter((x): x is string => Boolean(x));
    const record = {
      id: `${nums.prefix}-R${pad3(nums.research++)}`,
      title: r.title,
      summary: r.summary,
      claimIds,
      track: r.track,
      effortTier: r.effortTier,
      informationGain: r.informationGain,
      origin,
    };
    const parsed = ResearchOpportunitySchema.safeParse(record);
    if (!parsed.success) {
      nums.research--;
      decline("research", r.title, `schema: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`, textKey(r.title));
      continue;
    }
    research.push(parsed.data);
    if (diff.probable.length) notes.push(`probable duplicate: ${record.id} "${r.title}" ~ ${diff.probable[0].matches.map((m) => `${m.id} ${m.score}`).join(", ")}`);
  }

  // ---- the drafter's own dispositions, keyed mechanically ----------------
  for (const d of reply.dispositions) {
    const key = d.url ? sourceKeys({ url: d.url, title: d.observed })[0] : textKey(d.observed);
    if (!key) {
      notes.push(`disposition without a mechanical key skipped: ${d.kind} "${d.observed.slice(0, 80)}"`);
      continue;
    }
    const row = DispositionSchema.safeParse({
      key,
      kind: d.kind,
      disposition: d.disposition,
      as: d.as ?? undefined,
      reason: d.reason,
      reopenIf: d.reopenIf ?? undefined,
      observed: d.observed,
      by: runId,
      date,
      route: d.route ?? undefined,
    });
    if (row.success) dispositions.push(row.data);
    else notes.push(`disposition rejected: ${row.error.issues.map((i) => i.message).join("; ")}`);
  }

  const proposal = ProposalSchema.parse({
    runId,
    date,
    case: loaded.record.slug,
    producer: "draft",
    model: ctx.model,
    promptVersion: ctx.promptVersion,
    basis: { ledgerHash: loaded.ledgerHash },
    rationale: reply.rationale,
    adds: { sources, evidence, claims, research, images: [] },
    corrections: reply.corrections.map((c) => ({ ...c })),
    ...(reply.edition ? { edition: { ...reply.edition, cruxOrder: reply.edition.cruxOrder } } : {}),
    dispositions,
    report: `proposals/${ctx.reportRunId}/report.md`,
  });

  const novelty = [
    `# Novelty — ${runId}`,
    ``,
    `From report ${ctx.reportRunId} for ${loaded.record.slug} (ledger ${loaded.ledgerHash.slice(0, 12)}).`,
    ``,
    `- proposed: ${sources.length} sources, ${evidence.length} evidence records, ${claims.length} claims, ${research.length} research items${reply.edition ? ", 1 edition candidate" : ""}`,
    `- dispositions: ${dispositions.filter((d) => d.disposition === "duplicate").length} duplicate, ${dispositions.filter((d) => d.disposition === "failed").length} failed, ${dispositions.filter((d) => !["duplicate", "failed"].includes(d.disposition)).length} other`,
    `- sources shown to the drafter: ${ctx.fetched.filter((f) => f.ok).length} retrieved, ${ctx.fetched.filter((f) => !f.ok).length} not retrievable`,
    ``,
    ...(notes.length ? ["## Notes for the reviewer", "", ...notes.map((n) => `- ${n}`), ""] : []),
    "## Not retrievable",
    "",
    ...ctx.fetched.filter((f) => !f.ok).map((f) => `- ${f.url} — ${f.reason}`),
    "",
  ].join("\n");

  return { proposal, novelty };
}

export type Drafter = (system: string, user: string, meter: Meter) => Promise<{ data: DraftReply; model: string; strict?: boolean }>;

export const defaultDrafter: Drafter = async (system, user, meter) => {
  const r = await anthropicJson<DraftReply>({ ...DRAFTER, system, user, schema: DRAFT_SCHEMA, maxTokens: 32000 }, meter);
  return { data: r.data, model: r.model, strict: r.strict };
};

export interface DraftOptions {
  dryRun?: boolean;
  root?: string;
  deps?: { draft?: Drafter; fetch?: typeof retrieve; now?: () => Date; cases?: () => LoadedCase[] };
}

export interface DraftOutcome extends RunOutcome {
  proposalDir?: string;
}

export async function runDraft(reportRunId: string, opts: DraftOptions = {}): Promise<DraftOutcome> {
  const root = opts.root ?? process.cwd();
  const now = opts.deps?.now ?? (() => new Date());
  const reportRun = readRuns(root).find((r) => r.runId === reportRunId);
  if (!reportRun || reportRun.verb !== "report" || reportRun.outcome !== "completed") {
    throw new Error(`${reportRunId} is not a completed report run`);
  }
  const reportFile = path.join(runDir(reportRunId, root), "report.md");
  const report = fs.readFileSync(reportFile, "utf8");
  const loaded = findCase(reportRun.case, opts.deps?.cases?.());
  const protocol = loadProtocol("draft");
  const system = renderProtocol(protocol, {});
  const run = openRun("draft", loaded.record.slug, { model: DRAFTER.model, promptVersion: protocol.version }, { now: now(), root });
  const { runId, date } = run;

  const fetcher = opts.deps?.fetch ?? retrieve;
  const fetched: FetchedSource[] = [];
  for (const target of retrievalTargets(report)) fetched.push(await fetcher(target, {}));
  const packet = buildPacket(loaded);
  const user = JSON.stringify(
    {
      packet,
      report,
      sources: fetched.map((f) => ({ url: f.url, retrieved: f.ok, reason: f.reason ?? null, via: f.via ?? null, pages: f.pages ?? null, text: f.text })),
    },
    null,
    1,
  );
  run.stamp.inputHash = sha256Hex(system + user);

  if (opts.dryRun) {
    writeWorkingFile(runId, "input.json", user, root);
    return closeRun(run, "dry-run", { reason: `input written under proposals/${runId}/ (${user.length} chars; ${fetched.filter((f) => f.ok).length}/${fetched.length} sources retrieved); nothing sent` });
  }
  try {
    const reply = await (opts.deps?.draft ?? defaultDrafter)(system, user, run.meter);
    const { proposal, novelty } = assembleProposal(reply.data, {
      loaded,
      reportRunId,
      runId,
      model: reply.model,
      promptVersion: protocol.version,
      date,
      fetched,
    });
    const dir = writeProposal(proposal, root);
    writeWorkingFile(runId, "novelty.md", novelty, root);
    writeWorkingFile(runId, "reply.json", JSON.stringify(reply.data, null, 1), root);
    return { ...closeRun(run, "completed", { model: reply.model, reason: reply.strict === false ? "schema sent as instructions (too large for strict output)" : undefined }), proposalDir: dir };
  } catch (e) {
    return closeRun(run, "failed", { reason: (e as Error).message });
  }
}
