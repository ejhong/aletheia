import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { seatKey } from "../../scripts/lib/seat-key.mjs";
import { extractClaimRefs, extractPlateRefs } from "./article.ts";
import { assessmentHash, ledgerHash } from "./hash.ts";
import { DispositionSchema, type Disposition } from "./intake.ts";
import {
  assessmentLabels,
  AssessmentRunSchema,
  CaseSchema,
  ChangeLogEntrySchema,
  CLAIM_ANCHOR_REQUIRED_FROM,
  ClaimSchema,
  ConjectureSchema,
  CuratedResourceSchema,
  EditionSchema,
  EvidenceSchema,
  ImageSchema,
  ResearchOpportunitySchema,
  SourceSchema,
  steelmanRequirementError,
  StudySchema,
  NarrativeInputSchema,
  WatchConfigSchema,
  type AssessmentRun,
  type AssessmentState,
  type ChangeLogEntry,
  type Claim,
  type Conjecture,
  type CuratedResource,
  type Edition,
  type Evidence,
  type ImageRecord,
  type LoadedCase,
  type Source,
  type Study,
  type NarrativeInput,
  type WatchConfig,
} from "./schema.ts";
import { studyIntegrityErrors } from "./studies.ts";

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
    for (const pid of claim.parentClaimIds) {
      requireLiveClaim(pid, `claim ${claim.id} parent`);
    }
    for (const did of claim.dependsOnClaimIds) {
      requireLiveClaim(did, `claim ${claim.id} dependsOn`);
    }
    for (const aid of claim.alternativeToClaimIds ?? []) {
      requireLiveClaim(aid, `claim ${claim.id} dependsOn`);
    }
    for (const cid of claim.contradictsClaimIds ?? []) {
      requireLiveClaim(cid, `claim ${claim.id} dependsOn`);
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

  for (const err of claimAnchorErrors(loaded.claims, loaded.evidence)) {
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
    // The epistemic counterweight, fail-closed: new runs must disclose the
    // strongest argument for the featured hypothesis they do not answer.
    const steelmanError = steelmanRequirementError(run);
    if (steelmanError) {
      throw new ContentError(caseDir, steelmanError);
    }
  }

  checkImages(caseDir, loaded.images, requireLiveClaim);

  for (const err of editionErrors(loaded)) {
    throw new ContentError(caseDir, err);
  }

  for (const err of dispositionErrors(loaded)) {
    throw new ContentError(caseDir, err);
  }
}

/**
 * Dispositions must point at real records: an `in` or `duplicate` row's
 * `as` is an id in this case's ledger. Everything else the schema already
 * enforces (a reason off `in`, a mechanical key).
 */
export function dispositionErrors(
  loaded: Pick<LoadedCase, "dispositions" | "claims" | "sources" | "evidence" | "research" | "studies" | "images">,
): string[] {
  const ids = new Set<string>([
    ...loaded.claims.map((c) => c.id),
    ...loaded.sources.map((s) => s.id),
    ...loaded.evidence.map((e) => e.id),
    ...loaded.research.map((r) => r.id),
    ...loaded.studies.map((s) => s.id),
    ...loaded.images.map((i) => i.id),
  ]);
  const errors: string[] = [];
  for (const d of loaded.dispositions) {
    if ((d.disposition === "in" || d.disposition === "duplicate") && d.as && !ids.has(d.as)) {
      errors.push(`disposition ${d.key} (${d.disposition}) names unknown record ${d.as}`);
    }
  }
  return errors;
}

/**
 * Every claim must be anchored — a source anchor on the record or at least
 * one evidence record citing it — from CLAIM_ANCHOR_REQUIRED_FROM onward.
 * Earlier claims are history and are not rewritten; the six that carry
 * neither are listed in the migration PR (2026-09-08).
 */
export function claimAnchorErrors(
  claims: Pick<Claim, "id" | "sourceAnchor" | "reviewState" | "origin">[],
  evidence: Pick<Evidence, "claimIds">[],
): string[] {
  const cited = new Set(evidence.flatMap((e) => e.claimIds));
  const errors: string[] = [];
  for (const c of claims) {
    if (c.reviewState === "rejected") continue;
    if (c.origin.date < CLAIM_ANCHOR_REQUIRED_FROM) continue;
    if (c.sourceAnchor || cited.has(c.id)) continue;
    errors.push(
      `claim ${c.id} (${c.origin.date}) has neither a source anchor nor an evidence record citing it — every claim dated on or after ${CLAIM_ANCHOR_REQUIRED_FROM} must be anchored`,
    );
  }
  return errors;
}

/**
 * Edition integrity (docs/AUTOMATION.md, "The objects"): the reader's unit
 * must be whole. Every featured id is a live claim with a treatment in the
 * adopted assessment; the adopted assessment exists and its content hash
 * matches (an edited overlay can never silently change the verdict beneath
 * an essay); the chain through `previous` resolves; every claim marker in
 * the article resolves to a live claim; every embedded plate is a real
 * plate; and no plate seated in the predecessor is lost (plates survive).
 */
export function editionErrors(
  loaded: Pick<
    LoadedCase,
    "editions" | "claims" | "assessmentRuns" | "research" | "images"
  >,
): string[] {
  const errors: string[] = [];
  if (loaded.editions.length === 0) {
    return ["missing editions/ — every case needs at least one edition"];
  }
  const live = new Map(
    loaded.claims.filter((c) => c.reviewState !== "rejected").map((c) => [c.id, c]),
  );
  const runs = new Map(loaded.assessmentRuns.map((r) => [r.runId, r]));
  const researchIds = new Set(loaded.research.map((r) => r.id));
  const imageById = new Map(loaded.images.map((i) => [i.id, i]));
  const byRunId = new Map(loaded.editions.map((e) => [e.runId, e]));

  for (const ed of loaded.editions) {
    const where = `edition ${ed.runId}`;
    let adopted: AssessmentRun | null = null;
    if (ed.assessment) {
      adopted = runs.get(ed.assessment.runId) ?? null;
      if (!adopted) {
        errors.push(`${where} adopts unknown assessment run ${ed.assessment.runId}`);
      } else if (assessmentHash(adopted) !== ed.assessment.hash) {
        errors.push(
          `${where} adopts assessment ${ed.assessment.runId} whose content no longer matches the recorded hash — overlays are append-only; write a new edition instead of editing the adopted run`,
        );
      } else if (adopted.role === "check") {
        errors.push(`${where} adopts a check run; only draft runs narrate`);
      }
    }
    const treated = new Set(
      (adopted?.claimAssessments ?? [])
        .filter((ca) => ca.treatment)
        .map((ca) => ca.claimId),
    );
    for (const id of ed.featuredClaimIds) {
      if (!live.has(id)) {
        errors.push(`${where} features unknown or rejected claim ${id}`);
        continue;
      }
      if (adopted && !treated.has(id)) {
        errors.push(
          `${where} features ${id} but its adopted assessment carries no treatment for it`,
        );
      }
    }
    for (const rid of ed.cruxOrder) {
      if (!researchIds.has(rid)) {
        errors.push(`${where} orders unknown research item ${rid}`);
      }
    }
    if (ed.previous !== null) {
      const prev = byRunId.get(ed.previous);
      if (!prev) {
        errors.push(`${where} names unknown predecessor ${ed.previous}`);
      } else {
        if (prev.date > ed.date) {
          errors.push(`${where} is dated before its predecessor ${prev.runId}`);
        }
        for (const plate of extractPlateRefs(prev.article)) {
          if (!extractPlateRefs(ed.article).includes(plate)) {
            errors.push(
              `${where} drops plate ${plate} seated in its predecessor — plates survive; move them, never lose them`,
            );
          }
        }
      }
    }
    for (const id of extractClaimRefs(ed.article)) {
      if (!live.has(id)) {
        errors.push(`${where} article references unknown or rejected claim ${id}`);
      }
    }
    for (const ref of extractPlateRefs(ed.article)) {
      const img = imageById.get(ref);
      if (!img) {
        errors.push(`${where} article embeds unknown image ${ref}`);
      } else if (img.role !== "plate") {
        errors.push(
          `${where} article embeds ${ref} as a plate but its role is "${img.role}" — only real plates may appear in the record position`,
        );
      }
    }
  }
  return errors;
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

  const claims = parseList<Claim>(
    caseDir,
    "claims.yaml",
    readYaml(caseDir, "claims.yaml"),
    ClaimSchema,
  );

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

  // Editions (editions/<runId>.yaml): the reader's unit, append-only. The
  // current edition is the latest by date, runId breaking same-day ties
  // (the same convention as check runs).
  const editionsDir = path.join(CONTENT_DIR, caseDir, "editions");
  const editionsUnordered: Edition[] = fs.existsSync(editionsDir)
    ? fs
        .readdirSync(editionsDir)
        .filter((f) => f.endsWith(".yaml"))
        .map((f) => {
          try {
            return EditionSchema.parse(
              parseYaml(fs.readFileSync(path.join(editionsDir, f), "utf8")),
            );
          } catch (e) {
            throw new ContentError(caseDir, `editions/${f} invalid: ${String(e)}`);
          }
        })
        .sort((a, b) => a.date.localeCompare(b.date) || a.runId.localeCompare(b.runId))
    : [];
  const editions = orderEditions(editionsUnordered);

  // Dispositions (dispositions.yaml, optional until a case has intake):
  // append-only, one row per candidate ever considered here.
  const dispositionsPath = path.join(CONTENT_DIR, caseDir, "dispositions.yaml");
  const dispositions: Disposition[] = fs.existsSync(dispositionsPath)
    ? parseList(
        caseDir,
        "dispositions.yaml",
        parseYaml(fs.readFileSync(dispositionsPath, "utf8")) ?? [],
        DispositionSchema,
      )
    : [];

  assertUnique(caseDir, "claim", claims.map((c) => c.id));
  assertUnique(caseDir, "edition", editions.map((e) => e.runId));
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
    dir: caseDir,
    ledgerHash: ledgerHash({ claims, evidence, sources, research, studies, images }),
    claims,
    evidence,
    sources,
    research,
    history,
    assessmentRuns,
    editions,
    dispositions,
    images,
    watch,
    curatedResources,
    conjectures,
    studies,
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

/** A case by slug or directory name — the one lookup every script and verb uses. */
export function findCase(key: string, cases: LoadedCase[] = loadAllCases()): LoadedCase {
  const found = cases.find((c) => c.record.slug === key || c.dir === key);
  if (!found) throw new Error(`no case with slug or directory "${key}"`);
  return found;
}

export function getCaseBySlug(slug: string): LoadedCase {
  return findCase(slug);
}

/** Live (non-rejected) claims only — what reader views should show. */
export function liveClaims(loaded: LoadedCase): Claim[] {
  return loaded.claims.filter((c) => c.reviewState !== "rejected");
}

/** The current edition — the latest by date, runId breaking ties. */
/**
 * Editions in succession order: the chain through `previous`, from the
 * edition with none to the one nobody succeeds. Filename or date order is
 * not enough — two editions written on the same day sorted the migration
 * after its successor and the site kept showing the old one (2026-09-08).
 * When the chain does not form a single line (an unknown predecessor, two
 * heads), the date order is kept and editionErrors reports the break.
 */
export function orderEditions(editions: Edition[]): Edition[] {
  const roots = editions.filter((e) => e.previous === null);
  const byPrevious = new Map<string, Edition[]>();
  for (const e of editions) {
    if (e.previous === null) continue;
    byPrevious.set(e.previous, [...(byPrevious.get(e.previous) ?? []), e]);
  }
  if (roots.length !== 1) return editions;
  const ordered: Edition[] = [];
  let cursor: Edition | undefined = roots[0];
  while (cursor) {
    ordered.push(cursor);
    const next: Edition[] = byPrevious.get(cursor.runId) ?? [];
    if (next.length > 1) return editions; // a fork: not one chain
    cursor = next[0];
  }
  return ordered.length === editions.length ? ordered : editions;
}

export function currentEdition(loaded: LoadedCase): Edition {
  const ed = loaded.editions.at(-1);
  if (!ed) throw new Error(`[content:${loaded.record.slug}] no edition`);
  return ed;
}

/**
 * The assessment the current edition adopts — the only run that narrates.
 * Null for a question-only opening. Check runs never narrate; newer draft
 * runs that no edition has adopted do not either (that is the point of
 * editions: a newer unadopted draft cannot change the verdict beneath the
 * essay a reader is looking at).
 */
export function adoptedAssessment(loaded: LoadedCase): AssessmentRun | null {
  const ref = currentEdition(loaded).assessment;
  if (!ref) return null;
  return loaded.assessmentRuns.find((r) => r.runId === ref.runId) ?? null;
}

export function latestAssessment(loaded: LoadedCase): AssessmentRun | null {
  return loaded.assessmentRuns.at(-1) ?? null;
}

/**
 * Ratification-by-concurrence (AGENTS.md §3.15, Stage 3 of the AI-operated
 * pivot). The displayed assessment is the one the current edition adopts; what varies
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

/**
 * Has the ledger moved since this run judged it? Staleness is a hash, not a
 * date (docs/AUTOMATION.md): a run that recorded the ledger hash it judged
 * is stale exactly when the current ledger hashes differently. Runs from
 * before the field existed fall back to the date rule — content-bearing
 * history newer than the run. Returns a short reason, or null when current.
 */
export function runStaleness(loaded: LoadedCase, run: AssessmentRun): string | null {
  if (run.basis) {
    return run.basis.ledgerHash === loaded.ledgerHash ? null : "the ledger changed";
  }
  const newestContent = loaded.history
    .filter((h) => !isHousekeepingEntry(h))
    .map((h) => h.date)
    .sort()
    .at(-1);
  return newestContent && newestContent > run.date ? newestContent : null;
}

/**
 * The staleness of a panel. Checks that recorded a ledger hash are judged
 * one by one (any mismatch is stale). Checks from before the field existed
 * are judged as a panel by date, as they always were: stale when
 * content-bearing history is newer than the newest of them — a panel that
 * re-judged after the change is current even if one older seat was not.
 */
function panelStaleness(loaded: LoadedCase, checks: AssessmentRun[]): string | null {
  const hashed = checks.filter((r) => r.basis);
  if (hashed.some((r) => r.basis!.ledgerHash !== loaded.ledgerHash)) {
    return "the ledger changed";
  }
  const legacy = checks.filter((r) => !r.basis);
  if (legacy.length === 0) return null;
  const newestCheck = legacy.map((r) => r.date).sort().at(-1)!;
  const newestContent = loaded.history
    .filter((h) => !isHousekeepingEntry(h))
    .map((h) => h.date)
    .sort()
    .at(-1);
  return newestContent && newestContent > newestCheck ? newestContent : null;
}

/**
 * The checks that still speak to the case as it stands: hashed checks whose
 * ledger hash is current, and legacy checks unless content-bearing history
 * is newer than the newest of them. A stale seat is set aside, not counted —
 * and does not veto the seats that re-judged (2026-09-08: one August check
 * with no hash held four fresh seats at "unratified").
 */
export function currentChecks(loaded: LoadedCase, checks: AssessmentRun[]): AssessmentRun[] {
  const legacyStale = panelStaleness(loaded, checks.filter((r) => !r.basis));
  return checks.filter((r) => (r.basis ? r.basis.ledgerHash === loaded.ledgerHash : !legacyStale));
}

export function ratification(loaded: LoadedCase): Ratification | null {
  const draft = adoptedAssessment(loaded);
  if (!draft) return null;
  const all = latestCheckPerModel(loaded);
  const checks = currentChecks(loaded, all);
  const setAside = all.length - checks.length;
  const panel = checks.length;
  const checksDate =
    panel > 0 ? checks.map((r) => r.date).sort().at(-1)! : null;
  const staleSince = setAside > 0 ? panelStaleness(loaded, all) : null;
  const agreeing = checks.filter((r) =>
    withinOneStep(r.caseAssessment.verdict, draft.caseAssessment.verdict),
  ).length;

  const base = {
    panel,
    agreeing,
    checksDate,
    staleSince,
    contestedLoadBearing: [] as string[],
  };

  if (panel < RATIFICATION_MIN_PANEL) {
    const aside =
      setAside === 0
        ? ""
        : staleSince === "the ledger changed"
          ? ` — ${setAside} earlier check${setAside === 1 ? "" : "s"} set aside because the ledger changed after ${setAside === 1 ? "it" : "they"} judged it`
          : ` — ${setAside} earlier check${setAside === 1 ? "" : "s"} set aside because the case file changed (${staleSince}) after ${setAside === 1 ? "it" : "they"} judged it`;
    return {
      ...base,
      status: "unratified",
      reason:
        panel === 0
          ? `no independent model has checked this case as it stands${aside}`
          : `only ${panel} independent model${panel === 1 ? "" : "s"} have checked this case as it stands (${RATIFICATION_MIN_PANEL} required)${aside}`,
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
    const near = verdicts.filter((v) => withinOneStep(v, own)).length;
    if (near * 2 <= verdicts.length) contestedLB.push(claimId);
  }

  if (agreeing < panel - 1 || contestedLB.length > 0) {
    const parts: string[] = [];
    if (agreeing < panel - 1)
      parts.push(
        `${panel - agreeing} of ${panel} models place the case verdict more than one step away`,
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
    reason: `${agreeing} of ${panel} independent models concur with the case verdict within one step, and none splits on a load-bearing claim`,
  };
}

/**
 * Does this case need a fresh blind panel? True when no independent model
 * has checked it, when content moved after the newest check, or when the
 * adopted assessment is a reconsideration no fresh blind check has judged.
 * The single source of the rule the content-response workflow re-panels on
 * (scripts/stale-checks.ts) — the same derivation `ratification` uses.
 */
export function checksStale(loaded: LoadedCase): boolean {
  const draft = adoptedAssessment(loaded);
  if (!draft) return false;
  const checks = latestCheckPerModel(loaded);
  if (checks.length === 0) return true;
  if (panelStaleness(loaded, checks)) return true;
  return isReconsiderationRun(draft) && freshChecksFor(draft, checks).length === 0;
}

/**
 * A ratified case's tolerated dissents — "conclusions ship with their
 * surviving objections attached, not sanitized away." For each current
 * check whose case verdict differs from the displayed draft's, return the
 * seat, its verdict, and the first sentence of its synthesis as the
 * objection's one-line form (the full reasoning lives on /panel).
 */
/** Every seat whose word differs from the displayed verdict, a neighbouring word included: the standing tolerates one step, the page still shows it. */
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
 * The assessment to display: the one the current edition adopts, stamped
 * with its ratification standing. The standing badge tells the reader
 * exactly how much independent concurrence stands behind it.
 */
export function displayAssessment(
  loaded: LoadedCase,
): { run: AssessmentRun; ratification: Ratification } | null {
  const run = adoptedAssessment(loaded);
  if (!run) return null;
  return { run, ratification: ratification(loaded)! };
}

/**
 * The newest check run from each judging model, oldest-model-first by date.
 *
 * Check runs are append-only, so re-checking a case after its content
 * changes leaves the superseded runs on disk. The concurrence panel must
 * report the *current* judgment of each model, not count a vendor twice
 * because it judged the case in two different weeks. Runs are keyed by
 * SEAT — the API vendor in the label ("GPT-5.1 (OpenAI)…" → `openai`;
 * see scripts/lib/seat-key.mjs) — which is stable across label wordings
 * and across model upgrades within a seat.
 */
export function latestCheckPerModel(loaded: LoadedCase): AssessmentRun[] {
  const byModel = new Map<string, AssessmentRun>();
  for (const run of loaded.assessmentRuns) {
    if (run.role !== "check") continue;
    const key = seatKey(run.model);
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

/**
 * Concurrence (AGENTS.md §3.15, founder amendment of 2026-09-09): a seat's
 * verdict within one step of the draft's on the graded scale concurs, two
 * steps away disputes. The two ungraded states stand between "weakly
 * supported" and "mixed": one step from either, and from each other; two
 * from "contradicted" and from "provisionally supported". Five seats from
 * five vendors choosing among eight words rarely pick the same one.
 */
const nearScale: Partial<Record<AssessmentState, number>> = { ...gradedScale, unresolved: 2.5, presently_untestable: 2.5 };
export function withinOneStep(a: AssessmentState, b: AssessmentState): boolean {
  if (a === b) return true;
  const x = nearScale[a];
  const y = nearScale[b];
  return x !== undefined && y !== undefined && Math.abs(x - y) <= 1;
}

export function crossModelSummary(
  loaded: LoadedCase,
): CrossModelSummary | null {
  const shown = displayAssessment(loaded);
  const checks = latestCheckPerModel(loaded);
  if (checks.length === 0 || !shown) return null;

  // The case file moved after a judge read it? Say so.
  const staleSince = panelStaleness(loaded, checks);

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
