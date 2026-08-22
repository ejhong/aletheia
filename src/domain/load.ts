import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { extractClaimRefs, extractPlateRefs } from "./article";
import {
  AssessmentRunSchema,
  CaseSchema,
  ChangeLogEntrySchema,
  ClaimSchema,
  EvidenceSchema,
  ImageSchema,
  isCatalog,
  isFeatured,
  ResearchOpportunitySchema,
  SourceSchema,
  type AssessmentRun,
  type CatalogClaim,
  type ChangeLogEntry,
  type Claim,
  type FeaturedClaim,
  type ImageRecord,
  type LoadedCase,
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
