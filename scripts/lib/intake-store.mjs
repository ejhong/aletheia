/** Immutable decision batches. One authority for intake history, independent of any worker. */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { parse, stringify } from "yaml";
import { z } from "zod";
import { fingerprint } from "./review-state.mjs";
import { advances } from "./bench-core.mjs";
import { resolveCaseDirectory } from "./case-snapshot.mjs";
import { ResearchProposalSchema } from "../../src/domain/researchProposal.ts";
import { EditionProposalSchema } from "../../src/domain/editionProposal.ts";
import { EditionCycleSchema } from "../../src/domain/editionCycle.ts";

export const INTAKE_DIR = "proposals/intake";
const text = z.string().min(1);
const maybeText = text.nullable().default(null);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const AgendaCandidateSchema = z
  .object({
    id: text,
    caseSlug: text,
    runDir: text,
    index: z.number().int().positive(),
    kind: z.enum(["claim", "research-item", "study"]),
    title: text,
    question: text,
    closestExisting: z.string(),
    wouldSettle: z.string(),
    effortTier: text,
  })
  .strict();

const ScoreSchema = z
  .object({
    highs: z.number().int().min(0).max(5),
    advances: z.boolean(),
    concerns: z.array(text),
    seats: z.array(text).max(5),
  })
  .strict();
const ReviewSeatSchema = z
  .object({
    seat: text,
    score: z.enum(["high", "medium", "low"]).nullable(),
    concern: z.string().nullable(),
    reasoning: z.string().nullable(),
  })
  .strict();

const outcomes = {
  "watch-triage": ["import", "shelf", "archive", "failed"],
  promotion: ["promoted", "duplicate", "failed"],
  "agenda-proposal": ["proposed", "empty", "rejected", "duplicate", "failed"],
  "agenda-score": ["scored", "failed"],
  "research-proposal": ["proposed", "rejected", "failed"],
  "research-run": ["completed", "partial", "no_change", "failed", "refused", "budget_exhausted"],
  "edition-proposal": ["proposed", "no_change", "rejected", "failed"],
  "edition-cycle": ["proposed", "retained", "contested", "failed"],
  "source-request": ["queued"],
  "research-adoption": ["prepared", "already_present", "stale", "invalid"],
};
const DecisionSchema = z
  .object({
    case: text.nullable(),
    stage: z.enum(Object.keys(outcomes)),
    decision: text,
    source: z.record(z.string(), z.unknown()).nullable().default(null),
    proposal: AgendaCandidateSchema.nullable().default(null),
    research: ResearchProposalSchema.optional(),
    edition: EditionProposalSchema.optional(),
    editionCycle: EditionCycleSchema.optional(),
    reason: z.string().nullable().default(null),
    date: day.nullable().default(null),
    generatedAt: z.iso.datetime().nullable().default(null),
    runId: maybeText,
    model: maybeText,
    promptVersion: maybeText,
    inputHash: maybeText,
    candidateHash: maybeText,
    ref: maybeText,
    caseBasis: maybeText,
    recordId: maybeText,
    matchMethod: maybeText,
    retryable: z.boolean().default(false),
    score: ScoreSchema.optional(),
    review: z.array(ReviewSeatSchema).max(5).optional(),
    details: z.record(z.string(), z.unknown()).optional(),
    legacy: z
      .object({
        commit: z.string().regex(/^[a-f0-9]{40}$/),
        ref: text,
        record: z.unknown(),
        copies: z
          .array(z.object({ ref: text, record: z.unknown() }).strict())
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((entry, ctx) => {
    const issue = (message) => ctx.addIssue({ code: "custom", message });
    if (!outcomes[entry.stage].includes(entry.decision))
      issue("invalid outcome for stage");
    if (entry.stage === "source-request" && (!entry.case ||
      !z.url().safeParse(entry.source?.url).success || !entry.ref || !entry.inputHash || !entry.candidateHash ||
      typeof entry.details?.context !== "string"))
      issue("source request requires a case, URL, input receipt, candidate receipt, context, and origin");
    if (entry.stage === "research-adoption" && (!entry.case || !entry.ref ||
      typeof entry.details?.proposalId !== "string" || !/^[a-f0-9]{64}$/.test(entry.details.proposalId)))
      issue("research adoption requires its originating proposal");
    if (
      ["watch-triage", "promotion"].includes(entry.stage) &&
      entry.decision !== "failed" &&
      !entry.source
    )
      issue("source decision requires its source");
    if (entry.stage.startsWith("agenda-") && ["proposed", "scored"].includes(entry.decision) && !entry.proposal)
      issue("agenda decision requires its proposal");
    if (entry.stage === "research-proposal" && entry.decision === "proposed" && !entry.research)
      issue("research decision requires its change proposal");
    if (entry.research && (entry.stage !== "research-proposal" || entry.case !== entry.research.case ||
      entry.runId !== entry.research.runId || entry.model !== entry.research.model ||
      entry.generatedAt !== entry.research.generatedAt || entry.promptVersion !== entry.research.promptVersion))
      issue("research decision stamps differ from its proposal");
    if (entry.stage === "edition-proposal" && ["proposed", "no_change"].includes(entry.decision) && !entry.edition)
      issue("edition decision requires its proposal");
    if (entry.edition && (entry.stage !== "edition-proposal" || entry.case !== entry.edition.case ||
      entry.runId !== entry.edition.edition.runId || entry.model !== entry.edition.edition.model ||
      entry.generatedAt !== entry.edition.edition.generatedAt || entry.promptVersion !== entry.edition.edition.promptVersion))
      issue("edition decision stamps differ from its proposal");
    if (entry.stage === "edition-cycle" && !entry.editionCycle) issue("edition cycle requires its complete receipt");
    if (entry.editionCycle) {
      const cycle = entry.editionCycle;
      if (entry.stage !== "edition-cycle" || entry.case !== cycle.case || entry.runId !== cycle.runId ||
          entry.generatedAt !== cycle.generatedAt || entry.promptVersion !== cycle.promptVersion ||
          entry.inputHash !== fingerprint(cycle.basis) || entry.candidateHash !== fingerprint(cycle) ||
          entry.decision !== cycle.outcome) issue("edition decision differs from its comparison receipt");
      for (const draft of cycle.drafts) if (draft.proposal &&
          fingerprint(draft.proposal.edition.basis) !== fingerprint(cycle.basis))
        issue("edition candidate uses a different basis");
    }
    if (entry.decision === "scored" && !entry.score)
      issue("scored decision requires scores");
    if (!entry.legacy && (!entry.date || !entry.generatedAt || !entry.runId))
      issue("new decisions require date, timestamp, and run id");
    if (!entry.legacy && !entry.promptVersion)
      issue("new decisions require a protocol version");
    if (
      !entry.legacy &&
      !entry.model &&
      ["import", "shelf", "archive", "proposed", "empty"].includes(
        entry.decision,
      )
    )
      issue("new model decisions require the model that answered");
    if (entry.review) {
      if (
        new Set(entry.review.map((seat) => seat.seat)).size !==
        entry.review.length
      )
        issue("duplicate review seat");
      if (!entry.score || !entry.proposal)
        issue("review requires scores and proposal");
      else {
        const highs = entry.review.filter(
          (seat) => seat.score === "high",
        ).length;
        const concerns = entry.review
          .filter((seat) => seat.concern)
          .map((seat) => `${seat.seat}: ${seat.concern}`);
        const expected = {
          highs,
          advances:
            entry.proposal.kind === "study" &&
            advances({ highs, concerns, seats: entry.review }),
          concerns,
          seats: entry.review.map(
            (seat) => `${seat.seat}: ${seat.score ?? "failed"}`,
          ),
        };
        if (fingerprint(expected) !== fingerprint(entry.score))
          issue("scores disagree with recorded seats");
      }
    } else if (!entry.legacy && entry.decision === "scored")
      issue("new scores require the review reasons");
  });

function checkedDecision(raw, requireId = false) {
  const { id, ...fields } = raw ?? {};
  if (requireId && typeof id !== "string")
    throw new Error("stored decision requires its id");
  const decision = DecisionSchema.parse(fields);
  const expected = fingerprint(decision);
  if (id !== undefined && id !== expected)
    throw new Error("intake decision hash mismatch");
  return { id: expected, ...decision };
}

function checkCaseBinding(root, entry) {
  if (
    entry.proposal &&
    entry.case !== entry.proposal.caseSlug &&
    resolveCaseDirectory(root, entry.proposal.caseSlug) !== entry.case
  )
    throw new Error("proposal belongs to another case");
}

/** Validate both payload and file identity. Corrupt memory never becomes an empty history. */
export function readIntakeDecisions(root = process.cwd()) {
  const dir = path.join(root, INTAKE_DIR);
  if (!fs.existsSync(dir)) return [];
  const decisions = new Map();
  for (const file of fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .sort()) {
    const batch = parse(fs.readFileSync(path.join(dir, file), "utf8"));
    if (
      batch?.version !== 1 ||
      !Array.isArray(batch.decisions) ||
      batch.decisions.length === 0 ||
      Object.keys(batch).some((key) => !["version", "decisions"].includes(key))
    )
      throw new Error(`${INTAKE_DIR}/${file}: invalid decision batch`);
    if (file !== `${fingerprint(batch)}.yaml`)
      throw new Error(`${INTAKE_DIR}/${file}: batch hash mismatch`);
    const entries = batch.decisions.map((entry) =>
      checkedDecision(entry, true),
    );
    entries.forEach((entry) => checkCaseBinding(root, entry));
    entries.forEach((entry, index) => {
      if (!decisions.has(entry.id))
        decisions.set(entry.id, {
          ...entry,
          storageRef: `${INTAKE_DIR}/${file}#decisions[${index}]`,
        });
    });
  }
  return [...decisions.values()].sort(
    (a, b) =>
      (a.generatedAt ?? a.date ?? "").localeCompare(
        b.generatedAt ?? b.date ?? "",
      ) || a.id.localeCompare(b.id),
  );
}

/** A complete batch appears atomically; retries cannot overwrite an earlier run. */
export function writeIntakeDecisions(root, rawEntries) {
  if (rawEntries.length === 0) return { added: 0, file: null };
  const known = new Set(readIntakeDecisions(root).map((entry) => entry.id));
  const additions = new Map();
  for (const raw of rawEntries) {
    const entry = checkedDecision(raw);
    checkCaseBinding(root, entry);
    if (!known.has(entry.id)) additions.set(entry.id, entry);
  }
  if (additions.size === 0) return { added: 0, file: null };
  const batch = {
    version: 1,
    decisions: [...additions.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
  const name = `${fingerprint(batch)}.yaml`;
  const dir = path.join(root, INTAKE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  const temporary = path.join(dir, `.${randomUUID()}.tmp`);
  const encoded = stringify(batch, { lineWidth: 100 });
  fs.writeFileSync(temporary, encoded, { flag: "wx" });
  try {
    try {
      fs.linkSync(temporary, file);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (fs.readFileSync(file, "utf8") !== encoded)
        throw new Error(`conflicting intake batch ${name}`);
    }
  } finally {
    fs.unlinkSync(temporary);
  }
  return { added: additions.size, file: `${INTAKE_DIR}/${name}` };
}
