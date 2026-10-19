import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { adoptedAssessment, currentEdition } from "../domain/editions.ts";
import { assessmentHash, inputsHash } from "../domain/hash.ts";
import { loadCase } from "../domain/load.ts";
import { articleBudgetErrors, assessmentBudgetErrors } from "../domain/readerBudget.ts";
import { AssessmentRunSchema, EditionSchema, steelmanRequirementError, type AssessmentRun, type Edition, type LoadedCase } from "../domain/schema.ts";
import { latestCheckPerModel } from "../domain/standing.ts";
import { articleWords } from "../domain/text.ts";
import { hhmmssUTC, isoDate } from "../lib/overlay-ids.mjs";

/**
 * `stamp <case>` — what only the engine can write on a new edition. The
 * operator writes `editions/new.yaml` (and `assessments/new.yaml` when the
 * judgment changed); stamp gives each its id, date, model and prompt version
 * and the session that produced it, binds the edition to the ledger and the
 * founding inputs it was written against and to the assessment it adopts (by
 * content hash), holds both to the reader's budget, appends the case's
 * history entry, and writes them under their ids. The case is loaded again
 * afterwards; anything the loader refuses undoes the stamp and is reported.
 *
 * A new draft assessment records as `shownChecks` every check the case holds:
 * the operator could read them all, so none of them can vouch for it, and its
 * standing waits for a fresh blind panel (src/domain/standing.ts).
 */

export interface StampOptions {
  root?: string;
  now?: Date;
  /** The model that wrote the edition. */
  model: string;
  /** The version of the instructions it wrote under (the operator's charter, by commit). */
  promptVersion: string;
  /** The session that produced it. */
  producedBy: string;
}

export interface StampResult {
  ok: boolean;
  errors: string[];
  edition?: string;
  assessment?: string;
}

type DraftEdition = Partial<Edition> & { article: string; rationale: string; featuredClaimIds: string[]; assessment?: unknown };
type DraftAssessment = Pick<AssessmentRun, "caseAssessment" | "claimAssessments"> & Partial<AssessmentRun>;

/** The case's directory under content/cases, by slug or directory name. */
export function caseDirOf(key: string, root = process.cwd()): string {
  const cases = path.join(root, "content", "cases");
  for (const dir of fs.readdirSync(cases)) {
    const f = path.join(cases, dir, "case.yaml");
    if (!fs.existsSync(f)) continue;
    const slug = (parseYaml(fs.readFileSync(f, "utf8")) as { slug?: string }).slug;
    if (dir === key || slug === key) return dir;
  }
  throw new Error(`no case "${key}" under content/cases`);
}

export function inputsHashOf(loaded: LoadedCase, root: string): string {
  return inputsHash(
    loaded.narrativeInputs.map((i) => ({
      id: i.id,
      text: fs.readFileSync(i.file.startsWith("inputs/") ? path.join(root, "content", "cases", loaded.dir, i.file) : path.join(root, i.file), "utf8"),
    })),
  );
}

const EDITION_HEADER = (producedBy: string, model: string) =>
  `# Edition written by the operator (${model}) in session ${producedBy}, stamped by the engine (src/engine/stamp.ts).\n# Append-only: a later edition replaces it; this file is never edited.\n\n`;
const ASSESSMENT_HEADER = (producedBy: string, model: string) =>
  `# Draft assessment — the operator's judgment (${model}, session ${producedBy}), NOT human reviewed.\n# Its standing comes only from the blind panel (role: check runs written after it). Append-only.\n\n`;

export function stamp(caseKey: string, opts: StampOptions): StampResult {
  const root = opts.root ?? process.cwd();
  const now = opts.now ?? new Date();
  const dir = caseDirOf(caseKey, root);
  const caseDir = path.join(root, "content", "cases", dir);
  const draftEditionFile = path.join(caseDir, "editions", "new.yaml");
  const draftAssessmentFile = path.join(caseDir, "assessments", "new.yaml");
  if (!fs.existsSync(draftEditionFile)) return { ok: false, errors: [`no draft: write content/cases/${dir}/editions/new.yaml`] };

  // The drafts stand aside while the case is loaded as it otherwise is: the ledger they were written against.
  fs.mkdirSync(path.join(root, ".cache"), { recursive: true });
  const aside = fs.mkdtempSync(path.join(root, ".cache", "stamp-"));
  const moved: [string, string][] = [];
  const setAside = (f: string) => {
    if (!fs.existsSync(f)) return;
    const to = path.join(aside, path.basename(path.dirname(f)) + "-" + path.basename(f));
    fs.renameSync(f, to);
    moved.push([to, f]);
  };
  const restore = () => {
    for (const [from, to] of moved) if (fs.existsSync(from)) fs.renameSync(from, to);
    fs.rmSync(aside, { recursive: true, force: true });
  };
  const draftEdition = parseYaml(fs.readFileSync(draftEditionFile, "utf8")) as DraftEdition;
  const draftAssessment = fs.existsSync(draftAssessmentFile) ? (parseYaml(fs.readFileSync(draftAssessmentFile, "utf8")) as DraftAssessment) : null;
  setAside(draftEditionFile);
  setAside(draftAssessmentFile);

  let loaded: LoadedCase;
  try {
    // A case with no edition is being opened: the edition stamped here is its first.
    loaded = loadCase(dir, { opening: true });
  } catch (e) {
    restore();
    return { ok: false, errors: [`the case does not load without the drafts: ${(e as Error).message}`] };
  }
  const date = isoDate(now);
  const time = hhmmssUTC(now);
  const errors: string[] = [];
  const incumbent = loaded.editions.length ? currentEdition(loaded) : null;

  let assessment: AssessmentRun | null = null;
  if (draftAssessment) {
    const parsed = AssessmentRunSchema.safeParse({
      ...draftAssessment,
      runId: `${date}-operator-${time}`,
      producedBy: opts.producedBy,
      model: opts.model,
      date,
      promptVersion: opts.promptVersion,
      humanReviewed: false,
      role: "draft",
      basis: { ledgerHash: loaded.ledgerHash },
      shownChecks: latestCheckPerModel(loaded).map((c) => c.runId),
    });
    if (!parsed.success) errors.push(...parsed.error.issues.map((i) => `assessment ${i.path.join(".")}: ${i.message}`));
    else {
      assessment = parsed.data;
      const steel = steelmanRequirementError(assessment);
      if (steel) errors.push(steel);
      errors.push(...assessmentBudgetErrors(assessment));
    }
  } else {
    const kept = incumbent ? adoptedAssessment(loaded) : null;
    const over = kept ? assessmentBudgetErrors(kept) : [];
    if (over.length) errors.push(`the edition re-adopts assessment ${kept!.runId}, which is over the reader's budget (${over.slice(0, 3).join("; ")}); write assessments/new.yaml restating the same judgment within it`);
  }
  errors.push(...articleBudgetErrors(draftEdition.article ?? ""));
  const adoptedRef = assessment ? { runId: assessment.runId, hash: assessmentHash(assessment) } : (incumbent?.assessment ?? null);
  const words = articleWords(draftEdition.article ?? "");
  const measured = incumbent
    ? `Measured by the engine: article ${articleWords(incumbent.article)} → ${words} words, without markup.`
    : `Measured by the engine: article of ${words} words, without markup; the case's first edition.`;
  const parsedEdition = EditionSchema.safeParse({
    runId: `edition-${date}-${time}`,
    producedBy: opts.producedBy,
    date,
    model: opts.model,
    promptVersion: opts.promptVersion,
    rationale: `${String(draftEdition.rationale ?? "").trim()}\n\n${measured}`,
    basis: { ledgerHash: loaded.ledgerHash, inputsHash: inputsHashOf(loaded, root) },
    previous: incumbent?.runId ?? null,
    assessment: adoptedRef,
    featuredClaimIds: draftEdition.featuredClaimIds,
    cruxOrder: draftEdition.cruxOrder ?? incumbent?.cruxOrder ?? [],
    ...((draftEdition.question ?? incumbent?.question) ? { question: draftEdition.question ?? incumbent?.question } : {}),
    ...((draftEdition.accounts ?? incumbent?.accounts) ? { accounts: draftEdition.accounts ?? incumbent?.accounts } : {}),
    article: draftEdition.article,
  });
  if (!parsedEdition.success) errors.push(...parsedEdition.error.issues.map((i) => `edition ${i.path.join(".")}: ${i.message}`));
  if (errors.length) {
    restore();
    return { ok: false, errors };
  }

  const edition = parsedEdition.data!;
  const written: string[] = [];
  const write = (file: string, text: string) => {
    fs.writeFileSync(file, text);
    written.push(file);
  };
  const historyFile = path.join(caseDir, "history.yaml");
  const historyBefore = fs.existsSync(historyFile) ? fs.readFileSync(historyFile, "utf8") : null;
  if (assessment) write(path.join(caseDir, "assessments", `${assessment.runId}.yaml`), ASSESSMENT_HEADER(opts.producedBy, opts.model) + stringifyYaml(assessment, { lineWidth: 0, aliasDuplicateObjects: false }));
  write(path.join(caseDir, "editions", `${edition.runId}.yaml`), EDITION_HEADER(opts.producedBy, opts.model) + stringifyYaml(edition, { lineWidth: 0, aliasDuplicateObjects: false }));
  const entry = stringifyYaml(
    [
      {
        date,
        change: incumbent
          ? `New edition ${edition.runId}${assessment ? `, adopting a new draft assessment ${assessment.runId} (its standing waits for the blind panel)` : `, re-adopting assessment ${edition.assessment?.runId}`}.`
          : `Opened the case: its first edition ${edition.runId}${assessment ? `, adopting a draft assessment ${assessment.runId} (its standing waits for the blind panel)` : ", the question only"}.`,
        reason: String(draftEdition.rationale ?? "").trim().split(/\n\s*\n/)[0].slice(0, 1200),
        actor: `operator (${opts.model}), session ${opts.producedBy}`,
        runId: opts.producedBy,
        promptVersion: opts.promptVersion,
        aiAssisted: true,
        kind: "content",
      },
    ],
    { lineWidth: 0 },
  );
  fs.writeFileSync(historyFile, `${(historyBefore ?? "").replace(/\s*$/, "")}\n\n${entry}`);
  try {
    loadCase(dir);
  } catch (e) {
    for (const f of written) fs.rmSync(f, { force: true });
    if (historyBefore === null) fs.rmSync(historyFile, { force: true });
    else fs.writeFileSync(historyFile, historyBefore);
    restore();
    return { ok: false, errors: [`the stamped case does not load: ${(e as Error).message}`] };
  }
  fs.rmSync(aside, { recursive: true, force: true });
  return { ok: true, errors: [], edition: path.relative(root, written.at(-1)!), ...(assessment ? { assessment: path.relative(root, written[0]) } : {}) };
}
