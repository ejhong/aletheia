import fs from "node:fs";
import path from "node:path";
import { researchStatus } from "../domain/schema.ts";
import type { ResearchStatus, ResearchOpportunity } from "../domain/schema.ts";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { assessmentHash, inputsHash } from "../domain/hash.ts";
import { adoptedAssessment, currentEdition } from "../domain/editions.ts";
import { currentChecks, latestCheckPerModel, ratification } from "../domain/standing.ts";
import { judgmentChanges, judgmentChangesSentence } from "../domain/judgment.ts";
import { editionErrors, findCase } from "../domain/load.ts";
import { articleBudgetErrors, assessmentBudgetErrors } from "../domain/readerBudget.ts";
import {
  AssessmentRunSchema,
  EditionComparisonSchema,
  EditionSchema,
  steelmanRequirementError,
  type AssessmentRun,
  type Edition,
  type EditionComparison,
  type LoadedCase,
} from "../domain/schema.ts";
import { articleWords } from "../domain/text.ts";
import { hhmmssUTC, isoDate } from "../lib/overlay-ids.mjs";
import { appendHistory, setField, writeYamlFile } from "./ledger-write.ts";
import { MODELS } from "../lib/models.mjs";
import { BudgetExceeded } from "./budget.ts";
import { compareTellings, comparisonSentence, tellingOf, type Telling } from "./compare.ts";
import { anthropicJson, type Meter } from "./models.ts";
import { buildPacket, renderPacket, type ReaderNote } from "./packet.ts";
import { loadProtocol, renderProtocol } from "./protocols.ts";
import { closeRun, openRun, readRuns, runDir, writeWorkingFile, type RunOutcome } from "./store.ts";

/**
 * `aletheia edition <case>` — assess and explain (docs/AUTOMATION.md).
 *
 * Due when the ledger has moved since the incumbent edition was written
 * (its recorded ledger hash differs from the current one), or when forced.
 * One drafter writes one candidate: featured set, crux order, article, and a
 * new assessment only if the judgment changed — otherwise the candidate
 * re-adopts the incumbent's assessment and inherits its standing. The
 * candidate is validated as the loader would (every featured claim has a
 * treatment, markers resolve, plates survive, the steelman is present) and
 * held to the reader's budget (src/domain/readerBudget.ts).
 *
 * Then it is read beside the incumbent by the panel's seats, as a reader
 * would (src/pipeline/compare.ts, protocols/compare-v1.md). When the ledger
 * has not moved and nothing is being answered, the candidate is only a new
 * telling: it replaces the incumbent if the seats prefer it, and otherwise
 * the incumbent stands, the candidate stays under the run's directory, and
 * the seats' reasons go to the next edition. When the ledger has moved, or
 * the candidate answers the panel's dissent or a seat's objection, it goes
 * out — a stale judgment is worse than a plainer telling — and the
 * preference is recorded on it. The constitutional panel still judges the
 * result in the PR.
 */

/** The editor is the house model (config/models.yaml); the run records the model that served. */
/** Words in a text, as the run record and the rationale count them. */
export const countWords = (t: string): number => t.split(/\s+/).filter(Boolean).length;

export const EDITOR = MODELS.house;

const VERDICTS = [
  "established", "well_supported", "provisionally_supported", "mixed", "weakly_supported",
  "contradicted", "unresolved", "presently_untestable", "misframed", "provenance_failure",
];

export const EDITION_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["rationale", "question", "accounts", "featuredClaimIds", "cruxOrder", "article", "researchStatus", "assessment"],
  properties: {
    rationale: { type: "string" },
    question: { type: ["string", "null"] },
    accounts: { type: "array", items: { type: "string" } },
    featuredClaimIds: { type: "array", items: { type: "string" } },
    cruxOrder: { type: "array", items: { type: "string" } },
    article: { type: "string" },
    researchStatus: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "status", "note"],
        properties: { id: { type: "string" }, status: { type: "string", enum: ["open", "answered", "superseded", "retired"] }, note: { type: "string" } },
      },
    },
    assessment: {
      type: ["object", "null"],
      additionalProperties: false,
      required: [
        "verdict", "loadBearing", "weakestLinks", "synthesis", "steelman", "whatIsClaimed", "whereDisagreementLives",
        "whatWouldSettleIt", "bestConventionalExplanation", "components", "researchPriority", "claimAssessments",
      ],
      properties: {
        verdict: { type: "string", enum: VERDICTS },
        loadBearing: { type: "array", items: { type: "string" } },
        weakestLinks: { type: "array", items: { type: "string" } },
        synthesis: { type: "string" },
        steelman: { type: "string" },
        whatIsClaimed: { type: "string" },
        whereDisagreementLives: { type: "string" },
        whatWouldSettleIt: { type: "string" },
        bestConventionalExplanation: { type: "string" },
        components: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["label", "state", "note"],
            properties: { label: { type: "string" }, state: { type: "string", enum: VERDICTS }, note: { type: ["string", "null"] } },
          },
        },
        researchPriority: {
          type: "object",
          additionalProperties: false,
          required: ["level", "reason"],
          properties: { level: { type: "string", enum: ["high", "medium", "low"] }, reason: { type: "string" } },
        },
        claimAssessments: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["claimId", "verdict", "confidence", "reasoning", "treatment"],
            properties: {
              claimId: { type: "string" },
              verdict: { type: "string", enum: VERDICTS },
              confidence: { type: "string", enum: ["high", "moderate", "low"] },
              reasoning: { type: "string" },
              treatment: {
                type: "object",
                additionalProperties: false,
                required: ["plainLanguage", "importance", "diagnosticity", "diagnosticitySummary", "strongestObjection", "whatWouldChangeOurMind"],
                properties: {
                  plainLanguage: { type: "string" },
                  importance: { type: "string", enum: ["headline", "major", "supporting"] },
                  diagnosticity: { type: "string", enum: ["high", "moderate", "low", "indeterminate"] },
                  diagnosticitySummary: { type: "string" },
                  strongestObjection: { type: "string" },
                  whatWouldChangeOurMind: { type: "array", items: { type: "string" } },
                },
              },
            },
          },
        },
      },
    },
  },
};

export interface EditionReply {
  rationale: string;
  /** The case's question restated, or null to keep the incumbent's (or the founding one). */
  question: string | null;
  /** The accounts set side by side, one line each; empty keeps the incumbent's. */
  accounts: string[];
  featuredClaimIds: string[];
  cruxOrder: string[];
  article: string;
  /** Research items the ledger has settled, replaced or retired since the incumbent (protocols/edition-v9.md). */
  researchStatus?: { id: string; status: "open" | "answered" | "superseded" | "retired"; note: string }[];
  assessment: {
    verdict: string;
    loadBearing: string[];
    weakestLinks: string[];
    synthesis: string;
    steelman: string;
    whatIsClaimed: string;
    whereDisagreementLives: string;
    whatWouldSettleIt: string;
    bestConventionalExplanation: string;
    components: { label: string; state: string; note: string | null }[];
    researchPriority: { level: string; reason: string };
    claimAssessments: {
      claimId: string;
      verdict: string;
      confidence: string;
      reasoning: string;
      treatment: {
        plainLanguage: string;
        importance: string;
        diagnosticity: string;
        diagnosticitySummary: string;
        strongestObjection: string;
        whatWouldChangeOurMind: string[];
      };
    }[];
  } | null;
}

export interface AssembledEdition {
  edition: Edition;
  /** The new assessment run, when the judgment changed. */
  assessment: AssessmentRun | null;
  errors: string[];
}

function inputsHashOf(loaded: LoadedCase, root: string): string {
  return inputsHash(
    loaded.narrativeInputs.map((i) => ({
      id: i.id,
      text: fs.readFileSync(
        i.file.startsWith("inputs/") ? path.join(root, "content", "cases", loaded.dir, i.file) : path.join(root, i.file),
        "utf8",
      ),
    })),
  );
}

/**
 * Every evidence id the assessment names — in any string of it, at any depth — must be a record the case holds,
 * live and read (protocols/edition-v10.md — review note #358: an assessment spent the builder-attribution record on
 * the chronology and counted an anchor-only claim among what the case shows; review note #360: a check that scans
 * chosen fields, or one prefix, is dodgeable). Any token shaped like an evidence id counts, whatever its prefix: an
 * id from another case, or from nowhere, is one this case does not hold. Which claim a citation is for is the
 * protocol's rule and the panel's reading: a claim's reasoning may lean on evidence attached to a parent or sibling
 * claim when it says so (v8), so attachment is not refused mechanically.
 */
export function assessmentEvidenceErrors(a: AssessmentRun, loaded: Pick<LoadedCase, "evidence">): string[] {
  const re = /\b[A-Z][A-Z0-9]*-E\d{3}\b/g;
  const byId = new Map(loaded.evidence.map((e) => [e.id, e]));
  const errors: string[] = [];
  const walk = (value: unknown, where: string) => {
    if (typeof value === "string") {
      for (const id of new Set(value.match(re) ?? [])) {
        const e = byId.get(id);
        if (!e) errors.push(`assessment ${where} names ${id}, which this case does not hold`);
        else if (e.reviewState === "rejected") errors.push(`assessment ${where} names ${id}, a refused record that carries nothing`);
        else if (e.reviewState === "provisional") errors.push(`assessment ${where} names ${id}, a provisional record that carries no weight (edition protocol v9)`);
      }
    } else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${where}[${i}]`));
    else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) walk(v, where ? `${where}.${k}` : k);
  };
  walk(a.caseAssessment, "caseAssessment");
  for (const ca of a.claimAssessments) walk(ca, `claimAssessments[${ca.claimId}]`);
  return errors;
}

/** Pure: reply + context → a validated edition (and assessment), or the errors that stop it. */
export function assembleEdition(
  loaded: LoadedCase,
  reply: EditionReply,
  ctx: { model: string; promptVersion: string; now: Date; root: string; reconciles?: string[]; shown?: string[]; runId?: string },
): AssembledEdition {
  const date = isoDate(ctx.now);
  const stamp = hhmmssUTC(ctx.now);
  const incumbent = currentEdition(loaded);
  const errors: string[] = [];

  let assessment: AssessmentRun | null = null;
  if (reply.assessment) {
    const a = reply.assessment;
    const parsed = AssessmentRunSchema.safeParse({
      runId: `${date}-edition-${stamp}`,
      ...(ctx.runId ? { producedBy: ctx.runId } : {}),
      model: ctx.model,
      date,
      promptVersion: ctx.promptVersion,
      humanReviewed: false,
      role: "draft",
      basis: { ledgerHash: loaded.ledgerHash },
      ...(ctx.reconciles?.length ? { reconciles: ctx.reconciles } : {}),
      ...(ctx.shown ? { shownChecks: ctx.shown } : {}),
      caseAssessment: {
        verdict: a.verdict,
        whatIsClaimed: a.whatIsClaimed,
        whereDisagreementLives: a.whereDisagreementLives,
        whatWouldSettleIt: a.whatWouldSettleIt,
        bestConventionalExplanation: a.bestConventionalExplanation,
        components: a.components.map((c) => ({ label: c.label, state: c.state, ...(c.note ? { note: c.note } : {}) })),
        researchPriority: a.researchPriority,
        loadBearing: a.loadBearing,
        weakestLinks: a.weakestLinks,
        synthesis: a.synthesis,
        steelman: a.steelman,
      },
      claimAssessments: a.claimAssessments.map((c) => ({
        claimId: c.claimId,
        verdict: c.verdict,
        confidence: c.confidence,
        reasoning: c.reasoning,
        treatment: c.treatment,
      })),
    });
    if (!parsed.success) {
      // Stop here: every later check would be run against the incumbent's
      // assessment instead and report consequences, not causes.
      return { edition: {} as Edition, assessment: null, errors: parsed.error.issues.map((i) => `assessment ${i.path.join(".")}: ${i.message}`) };
    } else {
      assessment = parsed.data;
      const steel = steelmanRequirementError(assessment);
      if (steel) errors.push(steel);
      errors.push(...assessmentEvidenceErrors(assessment, loaded));
      errors.push(...assessmentBudgetErrors(assessment));
    }
  } else {
    // A candidate that keeps the incumbent's judgment keeps its words too — so an assessment written before the
    // budget would stay over it for as long as the judgment held. It is restated once, within the budget.
    const kept = adoptedAssessment(loaded);
    const overBudget = kept ? assessmentBudgetErrors(kept) : [];
    if (overBudget.length) {
      errors.push(
        `the candidate re-adopts assessment ${kept!.runId}, which is over the reader's budget in ${overBudget.length} place(s) (${overBudget.slice(0, 3).join("; ")}${overBudget.length > 3 ? "; …" : ""}); return a complete \`assessment\` that says the same judgment within the budget — the same verdicts unless the ledger has moved them`,
      );
    }
  }
  errors.push(...articleBudgetErrors(reply.article));
  const adoptedRef = assessment
    ? { runId: assessment.runId, hash: assessmentHash(assessment) }
    : incumbent.assessment;
  if (!adoptedRef) errors.push("the incumbent has no assessment to re-adopt and the candidate supplies none");

  const parsedEdition = EditionSchema.safeParse({
    runId: `edition-${date}-${stamp}`,
    ...(ctx.runId ? { producedBy: ctx.runId } : {}),
    date,
    model: ctx.model,
    promptVersion: ctx.promptVersion,
    // The rationale ends with what the verb can measure and the model can only guess (2026-09-16, review note #294:
    // two rationales stated word and account counts that the run records contradicted) — and, since 2026-09-30, with
    // what the candidate changes in the judgment and the selection against the edition it would replace
    // (src/domain/judgment.ts). Labelled as the verb's.
    rationale: `${reply.rationale.trim()}\n\nMeasured by the verb: article ${articleWords(incumbent.article)} → ${articleWords(reply.article)} words, without markup; accounts ${(reply.accounts?.length ? reply.accounts : incumbent.accounts ?? []).length} (incumbent ${(incumbent.accounts ?? []).length}). ${judgmentChangesSentence(incumbent.runId, judgmentChanges(adoptedAssessment(loaded), assessment, incumbent, { featuredClaimIds: reply.featuredClaimIds }), assessment === null)}`,
    basis: { ledgerHash: loaded.ledgerHash, inputsHash: inputsHashOf(loaded, ctx.root) },
    previous: incumbent.runId,
    assessment: adoptedRef ?? null,
    featuredClaimIds: reply.featuredClaimIds,
    cruxOrder: reply.cruxOrder,
    // The question and the accounts are the edition's; a candidate that says nothing keeps the incumbent's.
    ...((reply.question?.trim() || incumbent.question) ? { question: reply.question?.trim() || incumbent.question } : {}),
    ...((reply.accounts?.length ? reply.accounts : incumbent.accounts)?.length ? { accounts: reply.accounts?.length ? reply.accounts.map((a) => a.trim()) : incumbent.accounts } : {}),
    article: reply.article,
  });
  if (!parsedEdition.success) {
    errors.push(...parsedEdition.error.issues.map((i) => `edition ${i.path.join(".")}: ${i.message}`));
    return { edition: {} as Edition, assessment, errors };
  }
  const edition = parsedEdition.data;

  // The loader's own rules over the prospective state.
  errors.push(
    ...editionErrors({
      editions: [...loaded.editions, edition],
      claims: loaded.claims,
      assessmentRuns: assessment ? [...loaded.assessmentRuns, assessment] : loaded.assessmentRuns,
      research: loaded.research,
      images: loaded.images,
    }).filter((e) => e.includes(edition.runId)),
  );
  // Every load-bearing claim is featured; every featured claim is graded.
  const run = assessment ?? adoptedAssessment(loaded);
  if (run) {
    for (const id of run.caseAssessment.loadBearing) {
      if (!edition.featuredClaimIds.includes(id)) errors.push(`load-bearing claim ${id} is not featured`);
    }
  }
  return { edition, assessment, errors };
}

export type Editor = (system: string, user: string, meter: Meter) => Promise<{ data: EditionReply; model: string; strict?: boolean; fallback?: string }>;

export const defaultEditor: Editor = async (system, user, meter) => {
  // A reconsideration answers every seat's dissents on top of twenty treatments and the article: 48k was not enough (2026-09-09).
  const r = await anthropicJson<EditionReply>({ ...EDITOR, system, user, schema: EDITION_SCHEMA, maxTokens: 96000, effort: "high" }, meter);
  return { data: r.data, model: r.model, strict: r.strict, fallback: r.fallback };
};

export interface EditionOptions {
  dryRun?: boolean;
  /** Draft even when the ledger has not moved since the incumbent. */
  force?: boolean;
  root?: string;
  /** Objections a panel seat raised against the incumbent (src/pipeline/answer.ts); the candidate answers each in its rationale (edition protocol v12). */
  objections?: { seat: string; rules: string[]; text: string; source: string }[];
  deps?: { edit?: Editor; now?: () => Date; cases?: () => LoadedCase[]; compare?: Comparer };
}

/** The comparison as the verb calls it; a test gives its own. */
export type Comparer = (loaded: LoadedCase, candidate: Telling, incumbent: Telling, ctx: { runId: string; against: string; meter: Meter }) => Promise<EditionComparison>;

/**
 * What the panel's seats said, as readers, that the next edition should hear: their reasons and notes on the
 * incumbent (from the comparison recorded on it), and on the last candidate they declined since, which is kept only
 * under its run's directory. Data for the drafter, in the seats' words.
 */
export function readerNotesFor(loaded: LoadedCase, root: string): ReaderNote[] {
  const out: ReaderNote[] = [];
  const from = (c: EditionComparison, about: ReaderNote["about"], source: string) => {
    for (const s of c.seats) out.push({ about, source, seat: s.seat, preferred: s.prefers, reasons: s.reasons, notes: s.notes });
  };
  const incumbent = currentEdition(loaded);
  if (incumbent.comparison) from(incumbent.comparison, "the incumbent, when it replaced the edition before it", `content/cases/${loaded.dir}/editions/${incumbent.runId}.yaml`);
  // The last edition run of this case, when no edition came of it: a candidate the seats did not prefer.
  const last = readRuns(root).filter((r) => r.verb === "edition" && r.case === loaded.record.slug && r.outcome === "completed").at(-1);
  if (last && !loaded.editions.some((e) => e.producedBy === last.runId)) {
    const file = path.join(runDir(last.runId, root), "comparison.yaml");
    if (fs.existsSync(file)) {
      const parsed = EditionComparisonSchema.safeParse(parseYaml(fs.readFileSync(file, "utf8")));
      if (parsed.success && parsed.data.against === incumbent.runId) from(parsed.data, "a candidate the seats did not prefer to the incumbent", `proposals/${last.runId}/comparison.yaml`);
    }
  }
  return out;
}

export interface EditionOutcome extends RunOutcome {
  editionFile?: string;
  assessmentFile?: string;
}

/**
 * Why an edition is due (null when it is not): the ledger moved, or the panel
 * contests an assessment no reconsideration has answered. One answer per
 * state of the evidence: when the adopted assessment is itself a
 * reconsideration and the fresh panel still contests it, the disagreement
 * stands on the record — displayed as contested, both sides' reasoning
 * public — until the ledger moves. Otherwise the loop would argue with
 * itself indefinitely at a few dollars a round.
 */
export { editionDue } from "../domain/schedule.ts";
import { editionDue } from "../domain/schedule.ts";

export async function runEdition(caseKey: string, opts: EditionOptions = {}): Promise<EditionOutcome> {
  const root = opts.root ?? process.cwd();
  const now = opts.deps?.now ?? (() => new Date());
  const loaded = findCase(caseKey, opts.deps?.cases?.());
  const incumbent = currentEdition(loaded);
  const protocol = loadProtocol("edition");
  const run = openRun("edition", loaded.record.slug, { model: EDITOR.model, promptVersion: protocol.version }, { now: now(), root });
  const { runId, date } = run;

  const due = editionDue(loaded);
  if (!due && !opts.force) {
    return closeRun(run, "rested", { reason: `the ledger has not moved since ${incumbent.runId} (hash ${loaded.ledgerHash.slice(0, 12)}) and the panel's judgment is answered; nothing material to re-tell — pass --force to draft anyway` });
  }
  const packet = buildPacket(loaded, { detail: true });
  if (opts.objections?.length) packet.objections = opts.objections;
  const readerNotes = readerNotesFor(loaded, root);
  if (readerNotes.length) packet.readerNotes = readerNotes;
  // Where the incumbent is over the reader's budget, said to the drafter before it writes rather than after.
  const adopted = adoptedAssessment(loaded);
  const overBudget = [...articleBudgetErrors(incumbent.article), ...(adopted ? assessmentBudgetErrors(adopted) : [])];
  if (overBudget.length && packet.edition) packet.edition.overBudget = overBudget;
  const user = renderPacket(packet, 900_000);
  const system = renderProtocol(protocol, {});
  if (opts.dryRun) {
    writeWorkingFile(runId, "packet.json", user, root);
    return closeRun(run, "dry-run", { reason: `packet written under proposals/${runId}/ (${user.length} chars for ${EDITOR.model}); nothing sent` });
  }
  try {
    const edit = opts.deps?.edit ?? defaultEditor;
    let reply = await edit(system, user, run.meter);
    writeWorkingFile(runId, "reply.json", JSON.stringify(reply.data, null, 1), root);
    // The dissents the candidate must answer: a contested standing no reconsideration has answered.
    const reconciles = due?.reconciles.length ? due.reconciles : undefined;
    // Every check the drafter was shown: the packet's `panel` carries each check current on this ledger, with its
    // verdicts and its reasons, whatever the standing. An assessment written with them in hand says so
    // (`shownChecks`), because those checks cannot then vouch for it (src/domain/standing.ts). Until 2026-09-30
    // only a contested case's draft was stamped: a re-telling of a ratified case re-graded nine claims toward its
    // panel, said so in its rationale, and would have kept "ratified" on the very checks it had answered.
    const shown = packet.panel?.checks.map((c) => c.runId) ?? [];
    if (reconciles && !reply.data.assessment) {
      const reason = "the panel contests the adopted assessment and the candidate returned none: a reconsideration must answer the dissents with a complete assessment (edition protocol v3)";
      writeWorkingFile(runId, "errors.md", `- ${reason}`, root);
      return closeRun(run, "failed", { reason, model: reply.model });
    }
    let assembled = assembleEdition(loaded, reply.data, { model: reply.model, promptVersion: protocol.version, now: now(), root, reconciles, shown, runId });
    if (assembled.errors.length) {
      // One repair round: the loader's findings go back with the reply. The
      // checks are mechanical (caps, ids, coverage), so the second answer is
      // validated exactly as the first; a second failure ends the run.
      writeWorkingFile(runId, "errors.md", assembled.errors.map((e) => `- ${e}`).join("\n"), root);
      const repair =
        `${user}\n\nA previous attempt at this edition returned the JSON below. The loader rejected it for these mechanical reasons:\n` +
        assembled.errors.map((e) => `- ${e}`).join("\n") +
        `\n\nReturn the complete corrected JSON — the whole candidate, not a patch — keeping everything that was not at fault.\n\n${JSON.stringify(reply.data)}`;
      reply = await edit(system, repair, run.meter);
      writeWorkingFile(runId, "reply-repaired.json", JSON.stringify(reply.data, null, 1), root);
      assembled = assembleEdition(loaded, reply.data, { model: reply.model, promptVersion: protocol.version, now: now(), root, reconciles, shown, runId });
    }
    const { assessment, errors } = assembled;
    let { edition } = assembled;
    if (errors.length) {
      const reason = `the candidate fails the loader's rules after one repair round: ${errors.join("; ")}`;
      writeWorkingFile(runId, "errors-after-repair.md", errors.map((e) => `- ${e}`).join("\n"), root);
      return closeRun(run, "failed", { reason, model: reply.model });
    }
    // The comparison: the candidate beside the incumbent, read as a reader would by each seat of the panel. There is
    // nothing to be read beside when the incumbent is a question-only opening (no assessment, no telling yet).
    let comparison: EditionComparison | null = null;
    const incumbentRun = adoptedAssessment(loaded);
    if (incumbent.assessment && incumbentRun) {
      const compare = opts.deps?.compare ?? ((l, c, i, ctx) => compareTellings(l, c, i, ctx));
      try {
        comparison = await compare(
          loaded,
          tellingOf(loaded, edition, assessment ?? incumbentRun, true),
          tellingOf(loaded, incumbent, incumbentRun, incumbent.basis.ledgerHash === loaded.ledgerHash),
          { runId, against: incumbent.runId, meter: run.meter },
        );
      } catch (e) {
        if (!(e instanceof BudgetExceeded)) throw e;
        writeWorkingFile(runId, "candidate.yaml", stringifyYaml({ edition, assessment }, { lineWidth: 0, aliasDuplicateObjects: false }), root);
        return closeRun(run, "failed", { reason: `the candidate was not compared with the incumbent, so nothing was written: ${e.message}`, model: reply.model });
      }
      writeWorkingFile(runId, "comparison.yaml", `# The panel's seats reading the candidate beside ${incumbent.runId}, as a reader would (${comparison.protocol}; src/pipeline/compare.ts).\n# AI judgments of two tellings; not a human's, and not a judgment of the verdicts.\n` + stringifyYaml(comparison, { lineWidth: 0, aliasDuplicateObjects: false }), root);
      // A candidate that must go out: the ledger moved under the incumbent, or the candidate answers the panel's
      // dissent or a seat's objection. Anything else is only a new telling of the same judgment of the same ledger.
      const mustGoOut = due?.kind === "moved" || Boolean(reconciles?.length) || Boolean(opts.objections?.length);
      if (!mustGoOut && comparison.outcome !== "candidate-preferred") {
        writeWorkingFile(runId, "candidate.yaml", `# The candidate this run wrote and the panel's seats did not prefer to ${incumbent.runId}: kept here, not published.\n` + stringifyYaml({ edition, assessment }, { lineWidth: 0, aliasDuplicateObjects: false }), root);
        if (comparison.outcome === "undecided") {
          return closeRun(run, "failed", { reason: `${comparisonSentence(comparison)}; the candidate is kept under proposals/${runId}/ and nothing was written`, model: reply.model });
        }
        return closeRun(run, "completed", {
          reason: `the incumbent stands: ${comparisonSentence(comparison)}. The ledger has not moved, so the candidate is only a new telling and replaces the incumbent only when preferred; it is kept under proposals/${runId}/candidate.yaml, and the seats' reasons go to the next edition as readerNotes (article ${articleWords(incumbent.article)} → ${articleWords(edition.article)} words)`,
          model: reply.model,
        });
      }
      edition = EditionSchema.parse({ ...edition, comparison });
    }
    const caseDir = path.join(root, "content", "cases", loaded.dir);
    let assessmentFile: string | undefined;
    if (assessment) {
      assessmentFile = path.join(caseDir, "assessments", `${assessment.runId}.yaml`);
      writeYamlFile(
        assessmentFile,
        `# Draft assessment written by the edition verb (${reply.model}, ${protocol.version}) on ${date} for\n# edition ${edition.runId}, by run ${runId} (proposals/${runId}/run.yaml). Append-only; NOT human reviewed; standing derives from blind checks.`,
        assessment,
      );
    }
    const editionFile = path.join(caseDir, "editions", `${edition.runId}.yaml`);
    writeYamlFile(
      editionFile,
      `# Edition candidate written by the edition verb (${reply.model}, ${protocol.version}) on ${date}, by run ${runId} (proposals/${runId}/run.yaml).\n# Replaces ${incumbent.runId} only if the panel prefers it; the incumbent is always the second option.`,
      edition,
    );
    const wrote = [editionFile, assessmentFile].filter((f): f is string => Boolean(f)).map((f) => path.relative(root, f));
    // The agenda's lifecycle: the candidate may settle, replace or retire research items; each change is written onto
    // the item with this run's stamp and one history entry (protocols/edition-v9.md, "The research agenda has a lifecycle").
    const statusPlan = researchStatusChanges(loaded, reply.data.researchStatus ?? []);
    // A refused status entry is on the record, not only on stderr: in the run's working file and in its notes (review note #330).
    for (const err of statusPlan.errors) console.error(`${runId}: ${err}`);
    if (statusPlan.changes.length || statusPlan.errors.length) {
      writeWorkingFile(
        runId,
        "research-status.md",
        [`# Research agenda — status changes proposed by the edition (${runId})`, ``, `## Applied`, ...statusPlan.changes.map((c) => `- ${c.id}: ${c.from} → ${c.to} — ${c.note}`), ``, `## Refused`, ...statusPlan.errors.map((e) => `- ${e}`), ``].join("\n"),
        root,
      );
    }
    if (statusPlan.changes.length) {
      const researchFile = path.join(caseDir, "research.yaml");
      const raw = parseYaml(fs.readFileSync(researchFile, "utf8")) as Record<string, unknown>[];
      for (const ch of statusPlan.changes) {
        const before = raw.find((r) => r.id === ch.id) ?? {};
        setField(researchFile, ch.id, "status", before.status ?? null, ch.to);
        setField(researchFile, ch.id, "statusNote", before.statusNote ?? null, ch.note);
        setField(researchFile, ch.id, "statusBy", before.statusBy ?? null, runId);
        setField(researchFile, ch.id, "statusDate", before.statusDate ?? null, date);
      }
      appendHistory(
        loaded.dir,
        {
          date,
          change: `Research agenda: ${statusPlan.changes.map((c) => `${c.id} ${c.from} → ${c.to} (${c.note})`).join("; ")}.`,
          reason: `Set by the edition verb (${reply.model}, ${protocol.version}) in run ${runId}, reading the agenda against the ledger as it stands; the edition ${edition.runId} carries the reasoning.`,
          actor: `aletheia edition (${reply.model})`,
          aiAssisted: true,
          kind: "content",
        },
        root,
      );
      wrote.push(path.relative(root, researchFile));
    }
    const agenda = { open: 0, answered: 0, superseded: 0, retired: 0 };
    for (const r of loaded.research) agenda[researchStatus(r)]++;
    for (const ch of statusPlan.changes) { agenda[ch.from]--; agenda[ch.to]++; }
    const notes = [assessment ? "new assessment" : "re-adopts the incumbent's assessment", `article ${articleWords(incumbent.article)} → ${articleWords(edition.article)} words`, comparison ? comparisonSentence(comparison) : "not compared: the incumbent is a question-only opening", `research agenda: ${agenda.open} open, ${agenda.answered} answered, ${agenda.superseded} superseded, ${agenda.retired} retired${statusPlan.changes.length ? ` (${statusPlan.changes.length} change(s) this run)` : ""}${statusPlan.errors.length ? `; ${statusPlan.errors.length} status entr${statusPlan.errors.length === 1 ? "y" : "ies"} refused (proposals/${runId}/research-status.md)` : ""}`, reply.fallback ? `served by the fallback: ${reply.fallback}` : undefined].filter(Boolean).join("; ");
    return { ...closeRun(run, "completed", { model: reply.model, reason: notes, wrote }), editionFile, assessmentFile };
  } catch (e) {
    return closeRun(run, "failed", { reason: (e as Error).message });
  }
}

/** A candidate's research-status entries checked against the ledger: what would change, and what cannot (2026-09-17). */
export function researchStatusChanges(
  loaded: LoadedCase,
  entries: { id: string; status: ResearchStatus; note: string }[],
): { changes: { id: string; from: ResearchStatus; to: ResearchStatus; note: string }[]; errors: string[] } {
  const changes: { id: string; from: ResearchStatus; to: ResearchStatus; note: string }[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const e of entries ?? []) {
    const item = loaded.research.find((r) => r.id === e.id);
    if (!item) { errors.push(`researchStatus names ${e.id}, which is not a research item of this case`); continue; }
    if (seen.has(e.id)) { errors.push(`researchStatus names ${e.id} twice`); continue; }
    seen.add(e.id);
    const from = researchStatus(item);
    // An open item named open again is no change and needs no note; anything else needs one.
    if (from === e.status && (e.status === "open" || (item.statusNote ?? "") === (e.note ?? "").trim())) continue;
    if (!e.note || e.note.trim().length < 3) { errors.push(`researchStatus ${e.id}: a note saying what settled, replaced or retired it is required`); continue; }
    changes.push({ id: e.id, from, to: e.status, note: e.note.trim() });
  }
  return { changes, errors };
}
