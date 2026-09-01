import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { extractClaimRefs, extractPlateRefs } from "./article";
import {
  assessmentLabels,
  AssessmentRunSchema,
  CaseSchema,
  ChangeLogEntrySchema,
  ClaimSchema,
  ConjectureSchema,
  CuratedResourceSchema,
  EvidenceSchema,
  ImageSchema,
  isCatalog,
  isFeatured,
  ResearchOpportunitySchema,
  SourceSchema,
  StudySchema,
  PinSchema,
  NarrativeInputSchema,
  WatchConfigSchema,
  type AssessmentRun,
  type AssessmentState,
  type CatalogClaim,
  type ChangeLogEntry,
  type Claim,
  type Conjecture,
  type CuratedResource,
  type Evidence,
  type FeaturedClaim,
  type ImageRecord,
  type LoadedCase,
  type Source,
  type Study,
  type Pin,
  type NarrativeInput,
  type WatchConfig,
} from "./schema";
import { studyIntegrityErrors } from "./studies";
import { pinIntegrityErrors } from "./pins";

const CONTENT_DIR = path.join(process.cwd(), "content", "cases");
const SITE_IMAGES_FILE = path.join(process.cwd(), "content", "images.yaml");
const PUBLIC_DIR = path.join(process.cwd(), "public");

class ContentError extends Error {
  constructor(caseDir: string, message: string) {
    super(`[content:${caseDir}] ${message}`);
    this.name = "ContentError";
  }
}

function readYaml(caseDir: string, file: string): unknown {
  const p = path.join(CONTENT_DIR, caseDir, file);
  if (!fs.existsSync(p)) {
    throw new ContentError(caseDir, `missing required file ${file}`);
  }
  try {
    return parseYaml(fs.readFileSync(p, "utf8"));
  } catch (e) {
    throw new ContentError(caseDir, `${file} is not valid YAML: ${String(e)}`);
  }
}

function parseList<T>(
  caseDir: string,
  file: string,
  raw: unknown,
  schema: { parse: (v: unknown) => T },
): T[] {
  if (!Array.isArray(raw)) {
    throw new ContentError(caseDir, `${file} must be a YAML list`);
  }
  return raw.map((item, i) => {
    try {
      return schema.parse(item);
    } catch (e) {
      throw new ContentError(caseDir, `${file}[${i}] invalid: ${String(e)}`);
    }
  });
}

function assertUnique(caseDir: string, kind: string, ids: string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new ContentError(caseDir, `duplicate ${kind} id ${id}`);
    }
    seen.add(id);
  }
}

function checkImages(
  scope: string,
  images: ImageRecord[],
  requireLiveClaim?: (id: string, where: string) => void,
): void {
  const seen = new Set<string>();
  const plateNumbers = new Set<number>();
  for (const img of images) {
    if (seen.has(img.id)) {
      throw new Error(`[content:${scope}] duplicate image id ${img.id}`);
    }
    seen.add(img.id);
    const onDisk = path.join(PUBLIC_DIR, img.file);
    if (!fs.existsSync(onDisk)) {
      throw new Error(
        `[content:${scope}] image ${img.id} file missing on disk: public${img.file}`,
      );
    }
    if (img.role === "plate" && img.plateNumber) {
      if (plateNumbers.has(img.plateNumber)) {
        throw new Error(
          `[content:${scope}] duplicate plate number ${img.plateNumber}`,
        );
      }
      plateNumbers.add(img.plateNumber);
    }
    if (requireLiveClaim) {
      for (const cid of img.claimIds) {
        requireLiveClaim(cid, `image ${img.id}`);
      }
    }
  }
}

function checkIntegrity(caseDir: string, loaded: LoadedCase): void {
  const claimById = new Map(loaded.claims.map((c) => [c.id, c]));
  const sourceIds = new Set(loaded.sources.map((s) => s.id));

  const requireLiveClaim = (id: string, where: string) => {
    const claim = claimById.get(id);
    if (!claim) {
      throw new ContentError(caseDir, `${where} references unknown claim ${id}`);
    }
    if (claim.reviewState === "rejected") {
      throw new ContentError(
        caseDir,
        `${where} references rejected claim ${id} (tombstones must not be linked)`,
      );
    }
  };

  for (const claim of loaded.claims) {
    if (!(claim.theme in loaded.record.themes)) {
      throw new ContentError(
        caseDir,
        `claim ${claim.id} has unknown theme "${claim.theme}"`,
      );
    }
    if (claim.tier === "featured") {
      for (const pid of claim.parentClaimIds) {
        requireLiveClaim(pid, `claim ${claim.id} parent`);
      }
      for (const did of claim.dependsOnClaimIds) {
        requireLiveClaim(did, `claim ${claim.id} dependsOn`);
      }
    }
    const anchorSourceId = claim.sourceAnchor?.sourceId;
    if (anchorSourceId && !sourceIds.has(anchorSourceId)) {
      throw new ContentError(
        caseDir,
        `claim ${claim.id} sourceAnchor references unknown source ${anchorSourceId}`,
      );
    }
    const genealogySourceId = claim.genealogy?.originSourceId;
    if (genealogySourceId && !sourceIds.has(genealogySourceId)) {
      throw new ContentError(
        caseDir,
        `claim ${claim.id} genealogy references unknown source ${genealogySourceId}`,
      );
    }
  }

  for (const src of loaded.sources) {
    for (const parentId of src.derivedFrom) {
      if (parentId === src.id) {
        throw new ContentError(
          caseDir,
          `source ${src.id} lists itself in derivedFrom`,
        );
      }
      if (!sourceIds.has(parentId)) {
        throw new ContentError(
          caseDir,
          `source ${src.id} derivedFrom references unknown source ${parentId}`,
        );
      }
    }
  }

  for (const ev of loaded.evidence) {
    if (!sourceIds.has(ev.sourceId)) {
      throw new ContentError(
        caseDir,
        `evidence ${ev.id} references unknown source ${ev.sourceId}`,
      );
    }
    for (const cid of ev.claimIds) {
      requireLiveClaim(cid, `evidence ${ev.id}`);
    }
  }

  for (const err of sourceAdmissionErrors(
    loaded.sources,
    loaded.evidence,
    loaded.claims,
  )) {
    throw new ContentError(caseDir, err);
  }

  for (const ro of loaded.research) {
    for (const cid of ro.claimIds) {
      requireLiveClaim(cid, `research ${ro.id}`);
    }
  }

  const researchIds = new Set(loaded.research.map((r) => r.id));
  for (const cj of loaded.conjectures) {
    for (const rid of cj.decisiveTestIds) {
      if (!researchIds.has(rid)) {
        throw new ContentError(
          caseDir,
          `conjecture ${cj.id} references unknown research opportunity ${rid}`,
        );
      }
    }
  }

  for (const run of loaded.assessmentRuns) {
    for (const ca of run.claimAssessments) {
      requireLiveClaim(ca.claimId, `assessment run ${run.runId}`);
    }
    for (const id of [
      ...run.caseAssessment.loadBearing,
      ...run.caseAssessment.weakestLinks,
    ]) {
      requireLiveClaim(id, `assessment run ${run.runId} roll-up`);
    }
  }

  for (const id of extractClaimRefs(loaded.overviewMarkdown)) {
    requireLiveClaim(id, `overview.md claim reference`);
  }

  checkImages(caseDir, loaded.images, requireLiveClaim);

  const imageById = new Map(loaded.images.map((i) => [i.id, i]));
  for (const ref of extractPlateRefs(loaded.overviewMarkdown)) {
    const img = imageById.get(ref);
    if (!img) {
      throw new ContentError(
        caseDir,
        `overview.md embeds unknown image ${ref}`,
      );
    }
    if (img.role !== "plate") {
      throw new ContentError(
        caseDir,
        `overview.md embeds ${ref} as a plate but its role is "${img.role}" — only real plates may appear in the record position`,
      );
    }
  }
}

/**
 * Source admission rule (AGENTS.md §3.6): the evidence ledger lists only
 * sources that carry weight — cited by an evidence record, anchoring a
 * claim, or documenting a claim's genealogy (its first known appearance).
 * Reading-guide material must say so (`background: true`), and the
 * label must stay honest in both directions: an uncited source without the
 * flag fails, and a cited source still carrying the flag fails. Enforced at
 * build time so an agent can never quietly pad the ledger with relevant-
 * looking but weightless references.
 */
export function sourceAdmissionErrors(
  sources: Pick<Source, "id" | "background">[],
  evidence: Pick<Evidence, "sourceId">[],
  claims: Pick<Claim, "sourceAnchor" | "genealogy">[],
): string[] {
  const cited = new Set<string>([
    ...evidence.map((e) => e.sourceId),
    ...claims
      .map((c) => c.sourceAnchor?.sourceId)
      .filter((id): id is string => id !== undefined),
    ...claims
      .map((c) => c.genealogy?.originSourceId)
      .filter((id): id is string => id !== undefined),
  ]);
  const errors: string[] = [];
  for (const src of sources) {
    if (!cited.has(src.id) && !src.background) {
      errors.push(
        `source ${src.id} is in the ledger but no evidence record or claim anchor cites it — extract the evidence it carries, or mark it background: true (reading-guide material)`,
      );
    }
    if (cited.has(src.id) && src.background) {
      errors.push(
        `source ${src.id} is marked background but evidence/claims cite it — remove background: true`,
      );
    }
  }
  return errors;
}

export function loadCase(caseDir: string): LoadedCase {
  const record = CaseSchema.parse(readYaml(caseDir, "case.yaml"));

  const overviewPath = path.join(CONTENT_DIR, caseDir, "overview.md");
  if (!fs.existsSync(overviewPath)) {
    throw new ContentError(caseDir, "missing required file overview.md");
  }
  const overviewMarkdown = fs.readFileSync(overviewPath, "utf8");

  const claims = parseList<Claim>(
    caseDir,
    "claims.yaml",
    readYaml(caseDir, "claims.yaml"),
    ClaimSchema,
  );

  // Bulk-imported / pipeline-proposed catalog claims live in a separate
  // file so large imports stay reversible (one file, one commit) and the
  // hand-curated canon stays readable. Same schema; claims here typically
  // carry tier: catalog until individually promoted.
  const catalogPath = path.join(CONTENT_DIR, caseDir, "claims-catalog.yaml");
  if (fs.existsSync(catalogPath)) {
    claims.push(
      ...parseList<Claim>(
        caseDir,
        "claims-catalog.yaml",
        parseYaml(fs.readFileSync(catalogPath, "utf8")),
        ClaimSchema,
      ),
    );
  }
  const evidence = parseList(
    caseDir,
    "evidence.yaml",
    readYaml(caseDir, "evidence.yaml"),
    EvidenceSchema,
  );
  const sources = parseList(
    caseDir,
    "sources.yaml",
    readYaml(caseDir, "sources.yaml"),
    SourceSchema,
  );
  const research = parseList(
    caseDir,
    "research.yaml",
    readYaml(caseDir, "research.yaml"),
    ResearchOpportunitySchema,
  );
  const history = parseList(
    caseDir,
    "history.yaml",
    readYaml(caseDir, "history.yaml"),
    ChangeLogEntrySchema,
  );

  const imagesPath = path.join(CONTENT_DIR, caseDir, "images.yaml");
  const images: ImageRecord[] = fs.existsSync(imagesPath)
    ? parseList(
        caseDir,
        "images.yaml",
        parseYaml(fs.readFileSync(imagesPath, "utf8")),
        ImageSchema,
      )
    : [];

  // Optional literature-watch config. Validated here so a malformed query
  // fails the build, not the weekly watch run.
  const watchPath = path.join(CONTENT_DIR, caseDir, "watch.yaml");
  let watch: WatchConfig | null = null;
  if (fs.existsSync(watchPath)) {
    try {
      watch = WatchConfigSchema.parse(
        parseYaml(fs.readFileSync(watchPath, "utf8")),
      );
    } catch (e) {
      throw new ContentError(caseDir, `watch.yaml invalid: ${String(e)}`);
    }
  }

  // Optional curated reading-guide entries. Real links only — the schema
  // demands a URL and an honest verification label on every entry.
  const resourcesPath = path.join(CONTENT_DIR, caseDir, "resources.yaml");
  const curatedResources: CuratedResource[] = fs.existsSync(resourcesPath)
    ? parseList(
        caseDir,
        "resources.yaml",
        parseYaml(fs.readFileSync(resourcesPath, "utf8")),
        CuratedResourceSchema,
      )
    : [];

  // Optional on-the-record editorial conjectures. Never evidential weight;
  // required disconfirmers keep the site's own editors falsifiable.
  const conjecturesPath = path.join(CONTENT_DIR, caseDir, "conjectures.yaml");
  const conjectures: Conjecture[] = fs.existsSync(conjecturesPath)
    ? parseList(
        caseDir,
        "conjectures.yaml",
        parseYaml(fs.readFileSync(conjecturesPath, "utf8")),
        ConjectureSchema,
      )
    : [];

  // Pre-registered desk workpapers (see StudySchema): one file per study,
  // validated fail-closed like everything else. Cross-record integrity —
  // frozen-criteria hash, resolvable ids, the superseded-workpaper rule —
  // is enforced below via studyIntegrityErrors.
  const studiesDir = path.join(CONTENT_DIR, caseDir, "studies");
  const studies: Study[] = fs.existsSync(studiesDir)
    ? fs
        .readdirSync(studiesDir)
        .filter((f) => f.endsWith(".yaml"))
        .sort()
        .map((f) => {
          try {
            return StudySchema.parse(
              parseYaml(fs.readFileSync(path.join(studiesDir, f), "utf8")),
            );
          } catch (e) {
            throw new ContentError(caseDir, `studies/${f} invalid: ${String(e)}`);
          }
        })
    : [];

  const assessmentsDir = path.join(CONTENT_DIR, caseDir, "assessments");
  const assessmentRuns: AssessmentRun[] = fs.existsSync(assessmentsDir)
    ? fs
        .readdirSync(assessmentsDir)
        .filter((f) => f.endsWith(".yaml"))
        .map((f) => {
          try {
            return AssessmentRunSchema.parse(
              parseYaml(fs.readFileSync(path.join(assessmentsDir, f), "utf8")),
            );
          } catch (e) {
            throw new ContentError(
              caseDir,
              `assessments/${f} invalid: ${String(e)}`,
            );
          }
        })
        .sort((a, b) => a.date.localeCompare(b.date))
    : [];

  assertUnique(caseDir, "claim", claims.map((c) => c.id));
  assertUnique(caseDir, "evidence", evidence.map((e) => e.id));
  assertUnique(caseDir, "source", sources.map((s) => s.id));
  assertUnique(caseDir, "research", research.map((r) => r.id));
  assertUnique(caseDir, "assessment run", assessmentRuns.map((r) => r.runId));
  assertUnique(caseDir, "conjecture", conjectures.map((c) => c.id));
  assertUnique(caseDir, "study", studies.map((s) => s.id));

  const studyErrors = studyIntegrityErrors({
    studies,
    sources,
    evidence,
    researchIds: new Set(research.map((r) => r.id)),
    claimIds: new Set(
      claims.filter((c) => c.reviewState !== "rejected").map((c) => c.id),
    ),
  });
  if (studyErrors.length > 0) {
    throw new ContentError(caseDir, studyErrors.join("; "));
  }

  // Banked commitments (pins.yaml, optional): corrections and founder
  // directives the presentation must keep honoring. Enforced here, fail
  // closed, so losing one fails the build — the regression exam.
  const pinsPath = path.join(CONTENT_DIR, caseDir, "pins.yaml");
  const pins: Pin[] = fs.existsSync(pinsPath)
    ? parseList(
        caseDir,
        "pins.yaml",
        parseYaml(fs.readFileSync(pinsPath, "utf8")),
        PinSchema,
      )
    : [];
  assertUnique(caseDir, "pin", pins.map((p) => p.id));
  if (pins.length > 0) {
    const checkableFiles: Record<string, string> = { "overview.md": overviewMarkdown };
    for (const f of [
      "case.yaml",
      "claims.yaml",
      "evidence.yaml",
      "sources.yaml",
      "research.yaml",
      "history.yaml",
    ]) {
      const fp = path.join(CONTENT_DIR, caseDir, f);
      if (fs.existsSync(fp)) checkableFiles[f] = fs.readFileSync(fp, "utf8");
    }
    const pinErrors = pinIntegrityErrors({ pins, claims, files: checkableFiles });
    if (pinErrors.length > 0) {
      throw new ContentError(caseDir, pinErrors.join("; "));
    }
  }

  // Founding texts (inputs/manifest.yaml, optional): the anti-drift
  // anchor for narrative revision. Validated fail-closed — a manifest
  // entry whose file is missing fails the build, so inputs cannot rot
  // into dangling references.
  const inputsManifestPath = path.join(CONTENT_DIR, caseDir, "inputs", "manifest.yaml");
  const narrativeInputs: NarrativeInput[] = fs.existsSync(inputsManifestPath)
    ? parseList(
        caseDir,
        "inputs/manifest.yaml",
        parseYaml(fs.readFileSync(inputsManifestPath, "utf8")),
        NarrativeInputSchema,
      )
    : [];
  assertUnique(caseDir, "narrative input", narrativeInputs.map((n) => n.id));
  for (const input of narrativeInputs) {
    const resolved = input.file.startsWith("inputs/")
      ? path.join(CONTENT_DIR, caseDir, input.file)
      : path.join(process.cwd(), input.file);
    if (!fs.existsSync(resolved)) {
      throw new ContentError(
        caseDir,
        `narrative input ${input.id} points at a missing file: ${input.file}`,
      );
    }
  }

  const loaded: LoadedCase = {
    record,
    overviewMarkdown,
    claims,
    evidence,
    sources,
    research,
    history,
    assessmentRuns,
    images,
    watch,
    curatedResources,
    conjectures,
    studies,
    pins,
    narrativeInputs,
  };
  checkIntegrity(caseDir, loaded);
  return loaded;
}

/** Site-level images (hero, textures) from content/images.yaml. */
export function loadSiteImages(): ImageRecord[] {
  if (!fs.existsSync(SITE_IMAGES_FILE)) return [];
  const raw = parseYaml(fs.readFileSync(SITE_IMAGES_FILE, "utf8"));
  if (!Array.isArray(raw)) {
    throw new Error("[content:site] images.yaml must be a YAML list");
  }
  const images = raw.map((item, i) => {
    try {
      return ImageSchema.parse(item);
    } catch (e) {
      throw new Error(`[content:site] images.yaml[${i}] invalid: ${String(e)}`);
    }
  });
  checkImages("site", images);
  return images;
}

export function siteImage(id: string): ImageRecord {
  const found = loadSiteImages().find((i) => i.id === id);
  if (!found) throw new Error(`no site image with id ${id}`);
  return found;
}

export function caseCover(loaded: LoadedCase): ImageRecord | null {
  return loaded.images.find((i) => i.role === "cover") ?? null;
}

export function loadAllCases(): LoadedCase[] {
  if (!fs.existsSync(CONTENT_DIR)) {
    throw new Error(`content directory not found at ${CONTENT_DIR}`);
  }
  return fs
    .readdirSync(CONTENT_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => loadCase(d.name))
    .sort((a, b) => a.record.id.localeCompare(b.record.id));
}

export function getCaseBySlug(slug: string): LoadedCase {
  const found = loadAllCases().find((c) => c.record.slug === slug);
  if (!found) throw new Error(`no case with slug ${slug}`);
  return found;
}

/** Live (non-rejected) claims only — what reader views should show. */
export function liveClaims(loaded: LoadedCase): Claim[] {
  return loaded.claims.filter((c) => c.reviewState !== "rejected");
}

/** Live featured-tier claims — the fully-treated editorial set. */
export function featuredClaims(loaded: LoadedCase): FeaturedClaim[] {
  return liveClaims(loaded).filter(isFeatured);
}

/** Live catalog-tier claims — the lightweight unreviewed backlog. */
export function catalogClaims(loaded: LoadedCase): CatalogClaim[] {
  return liveClaims(loaded).filter(isCatalog);
}

export function latestAssessment(loaded: LoadedCase): AssessmentRun | null {
  return loaded.assessmentRuns.at(-1) ?? null;
}

/** The latest draft-role run — cross-model check runs never narrate. */
export function latestDraftAssessment(loaded: LoadedCase): AssessmentRun | null {
  for (let i = loaded.assessmentRuns.length - 1; i >= 0; i--) {
    if (loaded.assessmentRuns[i].role !== "check")
      return loaded.assessmentRuns[i];
  }
  return null;
}

/**
 * Ratification-by-concurrence (AGENTS.md §3.15, Stage 3 of the AI-operated
 * pivot). The displayed assessment is always the latest draft; what varies
 * is its standing, DERIVED at build time from the independent check runs
 * rather than stored — so a re-check updates the standing with no record
 * mutated, and a new draft or new evidence automatically demotes the case
 * to unratified until the panel judges the current file. Failing safe here
 * means failing DOWN: nothing in this function can raise a run's standing
 * except fresh agreement from independent vendors.
 *
 * - `ratified`: a panel of at least RATIFICATION_MIN_PANEL independent
 *   models, judging the current content blind, agrees with the draft's
 *   case verdict with at most one dissenter, and no load-bearing claim is
 *   contested.
 * - `contested`: the panel is sufficient and current, but disagrees — on
 *   the case verdict or on a load-bearing claim. Displayed as such;
 *   disagreement is never resolved by hiding it.
 * - `unratified`: the panel is too small, absent, or judged an older
 *   version of the case file (staleSince) — or the displayed draft is a
 *   reconsideration (written non-blind, with the panel's dissents in
 *   hand) that no fresh blind check has judged yet: the checks a
 *   reconciliation engaged can never ratify the draft that answered them.
 *
 * A load-bearing claim is contested when fewer than a strict majority of
 * the models judging it land within one step of the draft's verdict on the
 * graded scale (open verdicts must match exactly — "unresolved" is not
 * adjacent to anything).
 */
export const RATIFICATION_MIN_PANEL = 4;

export type RatificationStatus = "ratified" | "contested" | "unratified";

export interface Ratification {
  status: RatificationStatus;
  /** Independent models whose current judgment was counted. */
  panel: number;
  /** How many of them agree with the draft's case verdict exactly. */
  agreeing: number;
  /** Load-bearing claims where the panel disagrees with the draft. */
  contestedLoadBearing: string[];
  /** Date of the newest counted check run, null when the panel is empty. */
  checksDate: string | null;
  /** Content moved after the newest check (mirrors CrossModelSummary). */
  staleSince: string | null;
  /** One plain sentence for the UI. */
  reason: string;
}

/**
 * A reconsideration draft is the one deliberately non-blind draft in the
 * pipeline (scripts/reconcile-contested.mjs): written with the panel's
 * dissents in hand. Detected by the `reconciles` stamp; the promptVersion
 * fallback covers overlays written before the stamp existed.
 */
export function isReconsiderationRun(run: AssessmentRun): boolean {
  return (
    run.role !== "check" &&
    (run.reconciles !== undefined || /reconsider/i.test(run.promptVersion))
  );
}

/**
 * The checks that can vouch for a reconsideration draft: only runs the
 * reconciliation never saw. Stamped drafts name the engaged runIds
 * exactly; for pre-stamp overlays, only a check dated strictly after the
 * draft is provably fresh (a same-day check may have been in hand).
 */
function freshChecksFor(
  draft: AssessmentRun,
  checks: AssessmentRun[],
): AssessmentRun[] {
  return checks.filter((r) =>
    draft.reconciles !== undefined
      ? !draft.reconciles.includes(r.runId)
      : r.date > draft.date,
  );
}

function contentStaleSince(
  loaded: LoadedCase,
  newestCheck: string,
): string | null {
  const newestContent = loaded.history
    .filter((h) => !isHousekeepingEntry(h))
    .map((h) => h.date)
    .sort()
    .at(-1);
  return newestContent && newestContent > newestCheck ? newestContent : null;
}

export function ratification(loaded: LoadedCase): Ratification | null {
  const draft = latestDraftAssessment(loaded);
  if (!draft) return null;
  const checks = latestCheckPerModel(loaded);
  const panel = checks.length;
  const checksDate =
    panel > 0 ? checks.map((r) => r.date).sort().at(-1)! : null;
  const staleSince = checksDate ? contentStaleSince(loaded, checksDate) : null;
  const agreeing = checks.filter(
    (r) => r.caseAssessment.verdict === draft.caseAssessment.verdict,
  ).length;

  const base = {
    panel,
    agreeing,
    checksDate,
    staleSince,
    contestedLoadBearing: [] as string[],
  };

  if (panel < RATIFICATION_MIN_PANEL) {
    return {
      ...base,
      status: "unratified",
      reason:
        panel === 0
          ? "no independent model has checked this case yet"
          : `only ${panel} independent model${panel === 1 ? "" : "s"} have checked this case (${RATIFICATION_MIN_PANEL} required)`,
    };
  }
  if (staleSince) {
    return {
      ...base,
      status: "unratified",
      reason: `the case file changed (${staleSince}) after the panel last judged it — standing resets until the current content is re-checked`,
    };
  }

  // A reconsideration draft was written WITH the panel's dissents in hand
  // (the one non-blind draft in the pipeline). Deriving its standing from
  // the checks it already answered would let a contested case clear by
  // converging on the judges instead of the evidence — so those checks
  // cannot ratify it. Standing stays down until at least one blind check
  // the reconciliation never saw judges the case.
  if (isReconsiderationRun(draft) && freshChecksFor(draft, checks).length === 0) {
    return {
      ...base,
      status: "unratified",
      reason:
        "the displayed draft is a reconsideration written with the panel's dissents in hand — standing resets until a fresh blind check judges it",
    };
  }

  // Load-bearing claims: majority of judging models within one step.
  const contestedLB: string[] = [];
  for (const claimId of draft.caseAssessment.loadBearing) {
    const own = draft.claimAssessments.find(
      (ca) => ca.claimId === claimId,
    )?.verdict;
    if (!own) continue;
    const verdicts = checks
      .map((r) => r.claimAssessments.find((ca) => ca.claimId === claimId))
      .filter((ca) => ca !== undefined)
      .map((ca) => ca.verdict);
    if (verdicts.length === 0) continue;
    const near = verdicts.filter((v) => {
      if (v === own) return true;
      const a = gradedScale[v];
      const b = gradedScale[own];
      return a !== undefined && b !== undefined && Math.abs(a - b) <= 1;
    }).length;
    if (near * 2 <= verdicts.length) contestedLB.push(claimId);
  }

  if (agreeing < panel - 1 || contestedLB.length > 0) {
    const parts: string[] = [];
    if (agreeing < panel - 1)
      parts.push(
        `${panel - agreeing} of ${panel} models dispute the case verdict`,
      );
    if (contestedLB.length > 0)
      parts.push(`the panel splits on load-bearing ${contestedLB.join(", ")}`);
    return {
      ...base,
      contestedLoadBearing: contestedLB,
      status: "contested",
      reason: parts.join("; "),
    };
  }

  return {
    ...base,
    status: "ratified",
    reason: `${agreeing} of ${panel} independent models concur with the case verdict, and none splits on a load-bearing claim`,
  };
}

/**
 * A ratified case's tolerated dissents — "conclusions ship with their
 * surviving objections attached, not sanitized away." For each current
 * check whose case verdict differs from the displayed draft's, return the
 * seat, its verdict, and the first sentence of its synthesis as the
 * objection's one-line form (the full reasoning lives on /panel).
 */
export function survivingObjections(
  loaded: LoadedCase,
  displayed: AssessmentRun,
): { seat: string; verdict: AssessmentState; verdictLabel: string; firstSentence: string }[] {
  return latestCheckPerModel(loaded)
    .filter((r) => r.caseAssessment.verdict !== displayed.caseAssessment.verdict)
    .map((r) => {
      const first =
        r.caseAssessment.synthesis.match(/^[\s\S]*?[.!?](?=\s|$)/)?.[0].trim() ??
        r.caseAssessment.synthesis.slice(0, 180).trim();
      return {
        seat: r.model.split("—")[0].split(", independent")[0].trim(),
        verdict: r.caseAssessment.verdict,
        verdictLabel: assessmentLabels[r.caseAssessment.verdict],
        firstSentence: first.length > 260 ? first.slice(0, 257) + "…" : first,
      };
    });
}

/**
 * The assessment to display: always the latest draft, stamped with its
 * ratification standing. No run is hidden behind a newer one — the
 * narrative is current by construction, and the standing badge tells the
 * reader exactly how much independent concurrence stands behind it.
 * (The pre-pivot rule gated display on humanReviewed; no run ever carried
 * it, and if one ever does, the run's own field still records it.)
 */
export function displayAssessment(
  loaded: LoadedCase,
): { run: AssessmentRun; ratification: Ratification } | null {
  const latest = latestDraftAssessment(loaded);
  if (!latest) return null;
  return { run: latest, ratification: ratification(loaded)! };
}

/**
 * The newest check run from each judging model, oldest-model-first by date.
 *
 * Check runs are append-only, so re-checking a case after its content
 * changes leaves the superseded runs on disk. The concurrence panel must
 * report the *current* judgment of each model, not count a vendor twice
 * because it judged the case in two different weeks. Models are keyed by
 * the first token of their label ("GPT-5.1 (OpenAI)…" → `gpt-5.1`), which
 * is stable across the label wording used by different run generations.
 */
export function latestCheckPerModel(loaded: LoadedCase): AssessmentRun[] {
  const byModel = new Map<string, AssessmentRun>();
  for (const run of loaded.assessmentRuns) {
    if (run.role !== "check") continue;
    const key = run.model.trim().split(/[\s,(]/)[0].toLowerCase();
    const prev = byModel.get(key);
    // Same-date ties happen when a case is re-checked the day it changed
    // (append-only means both runs stay). runId breaks the tie: the re-run
    // convention suffixes -r2, -r3, …, and a suffixed id string-compares
    // after its own unsuffixed prefix, so the newest run wins.
    if (
      !prev ||
      run.date > prev.date ||
      (run.date === prev.date && run.runId > prev.runId)
    )
      byModel.set(key, run);
  }
  return [...byModel.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Concurrence of independent cross-model check runs with the displayed assessment. */
export interface CrossModelSummary {
  /** Model labels of the check runs, in run-date order. */
  models: string[];
  latestDate: string;
  /** Case-verdict tally across check runs, e.g. { unresolved: 4 }. */
  caseVerdicts: Record<string, number>;
  /** Whether every check run's case verdict matches the displayed run's. */
  caseUnanimousWithDisplayed: boolean;
  claimsCompared: number;
  /**
   * Date of the newest content-bearing history entry, when that entry is
   * more recent than the newest check run — i.e. the case file moved
   * after these judges read it. Null when the checks are current.
   */
  staleSince: string | null;
  exact: number;
  /** Within one step on the graded scale (open verdicts never count as adjacent). */
  adjacent: number;
  split: number;
  splitClaimIds: string[];
}

const gradedScale: Partial<Record<AssessmentState, number>> = {
  established: 6,
  well_supported: 5,
  provisionally_supported: 4,
  mixed: 3,
  weakly_supported: 2,
  contradicted: 1,
};

export function crossModelSummary(
  loaded: LoadedCase,
): CrossModelSummary | null {
  const shown = displayAssessment(loaded);
  const checks = latestCheckPerModel(loaded);
  if (checks.length === 0 || !shown) return null;

  // The case file moved after the newest judge read it? Say so.
  const newestCheck = checks
    .map((r) => r.date)
    .sort()
    .at(-1)!;
  const staleSince = contentStaleSince(loaded, newestCheck);

  const baseline = new Map(
    shown.run.claimAssessments.map((ca) => [ca.claimId, ca.verdict]),
  );
  let exact = 0;
  let adjacent = 0;
  const splitIds = new Set<string>();
  let compared = 0;
  for (const [claimId, base] of baseline) {
    const verdicts = checks
      .map((r) => r.claimAssessments.find((ca) => ca.claimId === claimId))
      .filter((ca) => ca !== undefined)
      .map((ca) => ca.verdict);
    if (verdicts.length === 0) continue;
    compared++;
    const all = [base, ...verdicts];
    if (all.every((v) => v === base)) {
      exact++;
      continue;
    }
    const nums = all.map((v) => gradedScale[v]);
    if (
      nums.every((n) => n !== undefined) &&
      Math.max(...(nums as number[])) - Math.min(...(nums as number[])) <= 1
    ) {
      adjacent++;
    } else {
      splitIds.add(claimId);
    }
  }

  const caseVerdicts: Record<string, number> = {};
  for (const r of checks) {
    const v = r.caseAssessment.verdict;
    caseVerdicts[v] = (caseVerdicts[v] ?? 0) + 1;
  }

  return {
    models: checks.map((r) => r.model),
    latestDate: checks[checks.length - 1].date,
    caseVerdicts,
    caseUnanimousWithDisplayed: checks.every(
      (r) => r.caseAssessment.verdict === shown.run.caseAssessment.verdict,
    ),
    claimsCompared: compared,
    staleSince,
    exact,
    adjacent,
    split: splitIds.size,
    splitClaimIds: [...splitIds],
  };
}

/** Human-review coverage over the featured claims, for honest card labels. */
export function reviewCoverage(loaded: LoadedCase): {
  reviewed: number;
  total: number;
} {
  const featured = featuredClaims(loaded);
  return {
    reviewed: featured.filter((c) => c.reviewState === "human_reviewed").length,
    total: featured.length,
  };
}

/**
 * Display-layer classification of history entries. History files are
 * append-only, so past entries are never rewritten to carry `kind`; this
 * heuristic ranks them for the homepage feed instead (an explicit `kind`
 * on new entries always wins). Epistemic changes lead; artwork, watch
 * configuration, and tooling are housekeeping.
 */
export function isHousekeepingEntry(entry: ChangeLogEntry): boolean {
  if (entry.kind) return entry.kind === "housekeeping";
  return /literature watch|watch\.yaml|cover art|cover candidates|artwork|style-v2|generate-case-art|images\.yaml/i.test(
    entry.change,
  );
}

/**
 * Date shown on the case dossier as "last update": the newest
 * content-bearing history entry. Housekeeping (art, watch config) does
 * not count. Falls back to `lastReviewed` when the log has no content
 * entries — that field is a hand-set human-review date on the case
 * record, not auto-updated by intake.
 */
export function lastContentUpdate(loaded: {
  record: { lastReviewed: string };
  history: ChangeLogEntry[];
}): string {
  const newest = loaded.history
    .filter((h) => !isHousekeepingEntry(h))
    .map((h) => h.date)
    .sort()
    .at(-1);
  return newest ?? loaded.record.lastReviewed;
}

/** A change-log entry attributed to its case, for cross-case feeds. */
export type FeedEntry = ChangeLogEntry & {
  caseTitle: string;
  caseSlug: string;
};

/** The slice of a LoadedCase the feed needs (narrow for testability). */
type FeedCase = {
  record: { title: string; slug: string };
  history: ChangeLogEntry[];
};

/**
 * History entries newest-first. Dates are day-granular and history files are
 * append-only logs, so same-date entries are ordered by file position with
 * the later-appended entry treated as the more recent one.
 */
export function historyNewestFirst<T extends ChangeLogEntry>(
  entries: T[],
): T[] {
  return entries
    .map((entry, i) => ({ entry, i }))
    .sort((a, b) => b.entry.date.localeCompare(a.entry.date) || b.i - a.i)
    .map(({ entry }) => entry);
}

/**
 * Cross-case "recent changes" feed, capped at `limit` entries.
 *
 * Entries are selected round-robin by per-case recency rank: every case's
 * single most recent entry is admitted before any case's second entry, and
 * so on. This guarantees a burst of same-day activity on one case cannot
 * evict another case's latest change (e.g. a brand-new case launch) from
 * the capped feed. Display order is newest-first by date; within a rank,
 * newer dates win the remaining slots.
 */
export function recentChanges(cases: FeedCase[], limit: number): FeedEntry[] {
  const perCase = cases.map((c) =>
    historyNewestFirst(
      c.history.map((h) => ({
        ...h,
        caseTitle: c.record.title,
        caseSlug: c.record.slug,
      })),
    ),
  );
  const selected: FeedEntry[] = [];
  for (let rank = 0; selected.length < limit; rank++) {
    const atRank = perCase
      .map((h) => h[rank])
      .filter((e): e is FeedEntry => e !== undefined)
      .sort((a, b) => b.date.localeCompare(a.date));
    if (atRank.length === 0) break;
    selected.push(...atRank.slice(0, limit - selected.length));
  }
  // Stable sort: same-date entries keep selection priority (rank) order.
  return [...selected].sort((a, b) => b.date.localeCompare(a.date));
}
