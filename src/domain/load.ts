/** Loading and validation: the case files parsed, checked, and assembled into a LoadedCase — fail-closed. Editions, standing and history live beside this in their own modules (split 2026-09-09). */
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { extractClaimRefs, extractPlateRefs } from "./article.ts";
import { assessmentHash, ledgerHash } from "./hash.ts";
import { DispositionSchema, type Disposition } from "./intake.ts";
import { AssessmentRunSchema, CaseSchema, ChangeLogEntrySchema, CLAIM_ANCHOR_REQUIRED_FROM, ClaimSchema, CuratedResourceSchema, EditionSchema, EvidenceSchema, ImageSchema, ResearchOpportunitySchema, SourceSchema, steelmanRequirementError, StudySchema, NarrativeInputSchema, WatchConfigSchema, type AssessmentRun, type Claim, type CuratedResource, type Edition, type Evidence, type ImageRecord, type LoadedCase, type Source, type Study, type NarrativeInput, type WatchConfig } from "./schema.ts";
import { studyIntegrityErrors } from "./studies.ts";
import { PROSE_REFS_REQUIRED_FROM, danglingProseRefs } from "./proseRefs.ts";
import { orderEditions } from "./editions.ts";

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
  // An id written in prose must name a record that exists (2026-09-11: five
  // research summaries cited the drafter's provisional ids). Records from
  // PROSE_REFS_REQUIRED_FROM on; earlier content carries a listed backlog.
  const dangling = danglingProseRefs(loaded, PROSE_REFS_REQUIRED_FROM);
  if (dangling.length) {
    throw new ContentError(
      caseDir,
      `prose names records that do not exist: ${dangling.map((d) => `${d.record}.${d.field} → ${d.id}`).join("; ")}`,
    );
  }
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
