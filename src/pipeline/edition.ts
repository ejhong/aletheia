import fs from "node:fs";
import path from "node:path";
import { assessmentHash, inputsHash } from "../domain/hash.ts";
import { adoptedAssessment, currentChecks, currentEdition, editionErrors, findCase, latestCheckPerModel, ratification } from "../domain/load.ts";
import {
  AssessmentRunSchema,
  EditionSchema,
  steelmanRequirementError,
  type AssessmentRun,
  type Edition,
  type LoadedCase,
} from "../domain/schema.ts";
import { hhmmssUTC, isoDate } from "../../scripts/lib/overlay-ids.mjs";
import { writeYamlFile } from "./ledger-write.ts";
import { MODELS } from "../../scripts/lib/models.mjs";
import { anthropicJson, type Meter } from "./models.ts";
import { buildPacket, renderPacket } from "./packet.ts";
import { loadProtocol, renderProtocol } from "./protocols.ts";
import { closeRun, openRun, writeWorkingFile, type RunOutcome } from "./store.ts";

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
 * written as a new edition (and assessment) for the panel to judge against
 * the incumbent in the PR.
 */

/** The editor is the house model (config/models.yaml); the run records the model that served. */
export const EDITOR = MODELS.house;

const VERDICTS = [
  "established", "well_supported", "provisionally_supported", "mixed", "weakly_supported",
  "contradicted", "unresolved", "presently_untestable", "misframed", "provenance_failure",
];

export const EDITION_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["rationale", "featuredClaimIds", "cruxOrder", "article", "assessment"],
  properties: {
    rationale: { type: "string" },
    featuredClaimIds: { type: "array", items: { type: "string" } },
    cruxOrder: { type: "array", items: { type: "string" } },
    article: { type: "string" },
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
  featuredClaimIds: string[];
  cruxOrder: string[];
  article: string;
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

/** Pure: reply + context → a validated edition (and assessment), or the errors that stop it. */
export function assembleEdition(
  loaded: LoadedCase,
  reply: EditionReply,
  ctx: { model: string; promptVersion: string; now: Date; root: string; reconciles?: string[] },
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
      model: ctx.model,
      date,
      promptVersion: ctx.promptVersion,
      humanReviewed: false,
      role: "draft",
      basis: { ledgerHash: loaded.ledgerHash },
      ...(ctx.reconciles?.length ? { reconciles: ctx.reconciles } : {}),
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
    }
  }
  const adoptedRef = assessment
    ? { runId: assessment.runId, hash: assessmentHash(assessment) }
    : incumbent.assessment;
  if (!adoptedRef) errors.push("the incumbent has no assessment to re-adopt and the candidate supplies none");

  const parsedEdition = EditionSchema.safeParse({
    runId: `edition-${date}-${stamp}`,
    date,
    model: ctx.model,
    promptVersion: ctx.promptVersion,
    rationale: reply.rationale,
    basis: { ledgerHash: loaded.ledgerHash, inputsHash: inputsHashOf(loaded, ctx.root) },
    previous: incumbent.runId,
    assessment: adoptedRef ?? null,
    featuredClaimIds: reply.featuredClaimIds,
    cruxOrder: reply.cruxOrder,
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

export type Editor = (system: string, user: string, meter: Meter) => Promise<{ data: EditionReply; model: string; strict?: boolean }>;

export const defaultEditor: Editor = async (system, user, meter) => {
  // A reconsideration answers every seat's dissents on top of twenty treatments and the article: 48k was not enough (2026-09-09).
  const r = await anthropicJson<EditionReply>({ ...EDITOR, system, user, schema: EDITION_SCHEMA, maxTokens: 96000, effort: "high" }, meter);
  return { data: r.data, model: r.model, strict: r.strict };
};

export interface EditionOptions {
  dryRun?: boolean;
  /** Draft even when the ledger has not moved since the incumbent. */
  force?: boolean;
  root?: string;
  deps?: { edit?: Editor; now?: () => Date; cases?: () => LoadedCase[] };
}

export interface EditionOutcome extends RunOutcome {
  editionFile?: string;
  assessmentFile?: string;
}

/** Why an edition is due (null when it is not): the ledger moved, or the panel contests an assessment no reconsideration has answered. */
export function editionDue(loaded: LoadedCase): { reason: string; reconciles: string[] } | null {
  const incumbent = currentEdition(loaded);
  const standing = ratification(loaded);
  const contestedBy = standing?.status === "contested" ? currentChecks(loaded, latestCheckPerModel(loaded)).map((c) => c.runId) : [];
  const adopted = adoptedAssessment(loaded);
  const unanswered = contestedBy.filter((id) => !(adopted?.reconciles ?? []).includes(id));
  if (unanswered.length) return { reason: `the panel contests the adopted assessment (${standing!.reason}) and no reconsideration has answered it`, reconciles: contestedBy };
  if (incumbent.basis.ledgerHash !== loaded.ledgerHash) return { reason: `the ledger moved since ${incumbent.runId}`, reconciles: [] };
  return null;
}

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
    const reconciles = due?.reconciles.length ? due.reconciles : undefined;
    if (reconciles && !reply.data.assessment) {
      const reason = "the panel contests the adopted assessment and the candidate returned none: a reconsideration must answer the dissents with a complete assessment (edition protocol v3)";
      writeWorkingFile(runId, "errors.md", `- ${reason}`, root);
      return closeRun(run, "failed", { reason, model: reply.model });
    }
    let assembled = assembleEdition(loaded, reply.data, { model: reply.model, promptVersion: protocol.version, now: now(), root, reconciles });
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
      assembled = assembleEdition(loaded, reply.data, { model: reply.model, promptVersion: protocol.version, now: now(), root, reconciles });
    }
    const { edition, assessment, errors } = assembled;
    if (errors.length) {
      const reason = `the candidate fails the loader's rules after one repair round: ${errors.join("; ")}`;
      writeWorkingFile(runId, "errors-after-repair.md", errors.map((e) => `- ${e}`).join("\n"), root);
      return closeRun(run, "failed", { reason, model: reply.model });
    }
    const caseDir = path.join(root, "content", "cases", loaded.dir);
    let assessmentFile: string | undefined;
    if (assessment) {
      assessmentFile = path.join(caseDir, "assessments", `${assessment.runId}.yaml`);
      writeYamlFile(
        assessmentFile,
        `# Draft assessment written by the edition verb (${reply.model}, ${protocol.version}) on ${date} for\n# edition ${edition.runId}. Append-only; NOT human reviewed; standing derives from blind checks.`,
        assessment,
      );
    }
    const editionFile = path.join(caseDir, "editions", `${edition.runId}.yaml`);
    writeYamlFile(
      editionFile,
      `# Edition candidate written by the edition verb (${reply.model}, ${protocol.version}) on ${date}.\n# Replaces ${incumbent.runId} only if the panel prefers it; the incumbent is always the second option.`,
      edition,
    );
    return { ...closeRun(run, "completed", { model: reply.model, reason: assessment ? "new assessment" : "re-adopts the incumbent's assessment" }), editionFile, assessmentFile };
  } catch (e) {
    return closeRun(run, "failed", { reason: (e as Error).message });
  }
}
