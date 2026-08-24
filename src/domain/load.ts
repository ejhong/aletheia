import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { extractClaimRefs, extractPlateRefs } from "./article";
import {
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
  WatchConfigSchema,
  type AssessmentRun,
  type AssessmentState,
  type CatalogClaim,
  type ChangeLogEntry,
  type Claim,
  type Conjecture,
  type CuratedResource,
  type FeaturedClaim,
  type ImageRecord,
  type LoadedCase,
  type WatchConfig,
} from "./schema";

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

/**
 * The last human-endorsed assessment run, or null if none exists yet.
 *
 * Governance rule: only a human-reviewed run may present as the case's
 * editorial assessment. Newer unreviewed AI runs are shown separately as
 * drafts — their disagreement with the editorial assessment is a review
 * alert, never a silent replacement (AGENTS.md §3.15).
 */
export function editorialAssessment(loaded: LoadedCase): AssessmentRun | null {
  for (let i = loaded.assessmentRuns.length - 1; i >= 0; i--) {
    if (loaded.assessmentRuns[i].humanReviewed) return loaded.assessmentRuns[i];
  }
  return null;
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
 * The assessment to display for a case: the editorial (human-endorsed) run
 * when one exists, otherwise the latest AI draft. Check runs are excluded —
 * they corroborate (or contest) the displayed assessment via the
 * concurrence panel rather than replacing its narrative.
 */
export function displayAssessment(
  loaded: LoadedCase,
): { run: AssessmentRun; humanEndorsed: boolean } | null {
  const editorial = editorialAssessment(loaded);
  if (editorial) return { run: editorial, humanEndorsed: true };
  const latest = latestDraftAssessment(loaded);
  return latest ? { run: latest, humanEndorsed: false } : null;
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
  const newestContent = loaded.history
    .filter((h) => !isHousekeepingEntry(h))
    .map((h) => h.date)
    .sort()
    .at(-1);
  const staleSince =
    newestContent && newestContent > newestCheck ? newestContent : null;

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
