#!/usr/bin/env node
/**
 * Editions migration (docs/AUTOMATION.md, build step 2) — one reversible,
 * idempotent run over every case.
 *
 *   node scripts/migrations/2026-09-08-editions.ts [--dry-run]
 *
 * For each case that has no editions/ yet:
 *
 *  1. Write a MIGRATION ASSESSMENT that snapshots exactly what readers saw:
 *     case-level judgment from the displayed draft (verdict, load-bearing,
 *     weakest links, synthesis, steelman if any) plus the dossier-header and
 *     priority fields that lived on case.yaml; claim-level judgment from the
 *     featured claim RECORDS (credibility → verdict, credibilitySummary →
 *     reasoning, and the editorial fields → treatment), with confidence
 *     carried from the draft. It is stamped `migratedFrom: <draft runId>`,
 *     `model: none — mechanical migration`, and asserts nothing new. Where a
 *     record's hand-written credibility differed from the draft's verdict
 *     (5 of 144 claims), the record wins — that is what claim pages showed —
 *     and the difference is printed for the PR.
 *  2. Write EDITION ONE adopting it: the current article byte for byte, the
 *     featured claims in file order, the research items in file order, and
 *     the hashes of the ledger and founding inputs it was written against.
 *  3. Slim claims.yaml (drop tier and every evaluative field), merge
 *     claims-catalog.yaml into it (comments preserved), slim case.yaml,
 *     delete overview.md and claims-catalog.yaml, append a housekeeping
 *     history entry.
 *
 * Comments and formatting in the hand-written files are preserved through
 * the yaml Document API. A second run is a no-op.
 */
import fs from "node:fs";
import path from "node:path";
import {
  Document,
  isMap,
  isScalar,
  isSeq,
  parse as parseYaml,
  parseDocument,
  Scalar,
  type YAMLMap,
} from "yaml";
import {
  AssessmentRunSchema,
  ClaimSchema,
  EditionSchema,
  EvidenceSchema,
  ImageSchema,
  NarrativeInputSchema,
  ResearchOpportunitySchema,
  SourceSchema,
  StudySchema,
  type AssessmentRun,
} from "../../src/domain/schema.ts";
import { assessmentHash, inputsHash, ledgerHash } from "../../src/domain/hash.ts";

const ROOT = process.cwd();
const CASES = path.join(ROOT, "content", "cases");
const DATE = "2026-09-08";
const dryRun = process.argv.includes("--dry-run");

const EVALUATIVE = [
  "tier",
  "plainLanguage",
  "importance",
  "credibility",
  "credibilitySummary",
  "diagnosticity",
  "diagnosticitySummary",
  "strongestObjection",
  "whatWouldChangeOurMind",
];
const CASE_JUDGMENT = [
  "whatIsClaimed",
  "whereDisagreementLives",
  "whatWouldSettleIt",
  "bestConventionalExplanation",
  "researchPriority",
  "components",
];

type Raw = Record<string, unknown>;
const readList = (file: string): Raw[] =>
  fs.existsSync(file) ? ((parseYaml(fs.readFileSync(file, "utf8")) as Raw[]) ?? []) : [];

function migrateCase(dir: string): string[] {
  const slug = path.basename(dir);
  const report: string[] = [];
  if (fs.existsSync(path.join(dir, "editions"))) {
    report.push(`${slug}: already migrated (editions/ exists) — skipped`);
    return report;
  }
  const caseDoc = parseDocument(fs.readFileSync(path.join(dir, "case.yaml"), "utf8"));
  const caseRaw = caseDoc.toJS() as Raw;
  const claimsDoc = parseDocument(fs.readFileSync(path.join(dir, "claims.yaml"), "utf8"));
  const catalogPath = path.join(dir, "claims-catalog.yaml");
  const catalogDoc = fs.existsSync(catalogPath)
    ? parseDocument(fs.readFileSync(catalogPath, "utf8"))
    : null;
  const claimsRaw = claimsDoc.toJS() as Raw[];
  const overview = fs.readFileSync(path.join(dir, "overview.md"), "utf8");

  // The displayed draft, exactly as the old loader chose it: runs sorted by
  // date (stable over alphabetical file order), latest non-check run.
  const adir = path.join(dir, "assessments");
  const runs = fs
    .readdirSync(adir)
    .filter((f) => f.endsWith(".yaml"))
    .sort()
    .map((f) => parseYaml(fs.readFileSync(path.join(adir, f), "utf8")) as Raw)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const draft = [...runs].reverse().find((r) => r.role !== "check");
  if (!draft) throw new Error(`${slug}: no draft assessment to migrate`);
  const draftCase = draft.caseAssessment as Raw;
  const draftClaims = new Map(
    (draft.claimAssessments as Raw[]).map((ca) => [ca.claimId as string, ca]),
  );

  const featured = claimsRaw.filter(
    (c) => c.tier === "featured" && c.reviewState !== "rejected",
  );
  const disagreements: string[] = [];
  const claimAssessments = featured.map((c) => {
    const d = draftClaims.get(c.id as string);
    if (!d) throw new Error(`${slug}: draft ${draft.runId} has no entry for ${c.id}`);
    if (d.verdict !== c.credibility) {
      disagreements.push(`${c.id}: record ${c.credibility}, draft ${d.verdict}`);
    }
    return {
      claimId: c.id,
      verdict: c.credibility,
      reasoning: c.credibilitySummary,
      confidence: d.confidence,
      treatment: {
        plainLanguage: c.plainLanguage,
        importance: c.importance,
        diagnosticity: c.diagnosticity,
        diagnosticitySummary: c.diagnosticitySummary,
        strongestObjection: c.strongestObjection,
        whatWouldChangeOurMind: c.whatWouldChangeOurMind ?? [],
      },
    };
  });

  const migrationRunId = `${DATE}-migration-${slug}`;
  const runInput: Raw = {
    runId: migrationRunId,
    model: "none — mechanical migration (scripts/migrations/2026-09-08-editions.ts)",
    date: DATE,
    promptVersion: "migration-editions-v1",
    humanReviewed: false,
    role: "draft",
    migratedFrom: draft.runId,
    caseAssessment: {
      verdict: draftCase.verdict,
      whatIsClaimed: caseRaw.whatIsClaimed,
      whereDisagreementLives: caseRaw.whereDisagreementLives,
      whatWouldSettleIt: caseRaw.whatWouldSettleIt,
      bestConventionalExplanation: caseRaw.bestConventionalExplanation,
      components: caseRaw.components ?? [],
      researchPriority: caseRaw.researchPriority,
      loadBearing: draftCase.loadBearing,
      weakestLinks: draftCase.weakestLinks,
      synthesis: draftCase.synthesis,
      ...(draftCase.steelman ? { steelman: draftCase.steelman } : {}),
    },
    claimAssessments,
  };
  const run: AssessmentRun = AssessmentRunSchema.parse(runInput);

  // Slim the claims (comments preserved) and merge the catalog in.
  const seq = claimsDoc.contents;
  if (!isSeq(seq)) throw new Error(`${slug}: claims.yaml is not a list`);
  const slim = (node: unknown) => {
    if (!isMap(node)) throw new Error(`${slug}: claim entry is not a map`);
    for (const key of EVALUATIVE) (node as YAMLMap).delete(key);
  };
  for (const item of seq.items) slim(item);
  if (catalogDoc) {
    const cat = catalogDoc.contents;
    if (!isSeq(cat)) throw new Error(`${slug}: claims-catalog.yaml is not a list`);
    let first = true;
    for (const item of cat.items) {
      slim(item);
      if (first && catalogDoc.commentBefore) {
        (item as YAMLMap).commentBefore =
          `\n${catalogDoc.commentBefore.trim()}\n\n(merged from claims-catalog.yaml on ${DATE}: tiers ended with the editions migration; featuring is now an edition decision)\n`;
        first = false;
      }
      seq.items.push(item);
    }
  }
  const slimClaims = (claimsDoc.toJS() as Raw[]).map((c) => ClaimSchema.parse(c));

  for (const key of CASE_JUDGMENT) (caseDoc.contents as YAMLMap).delete(key);

  const evidence = readList(path.join(dir, "evidence.yaml")).map((e) => EvidenceSchema.parse(e));
  const sources = readList(path.join(dir, "sources.yaml")).map((s) => SourceSchema.parse(s));
  const research = readList(path.join(dir, "research.yaml")).map((r) =>
    ResearchOpportunitySchema.parse(r),
  );
  const images = readList(path.join(dir, "images.yaml")).map((i) => ImageSchema.parse(i));
  const studiesDir = path.join(dir, "studies");
  const studies = fs.existsSync(studiesDir)
    ? fs
        .readdirSync(studiesDir)
        .filter((f) => f.endsWith(".yaml"))
        .sort()
        .map((f) => StudySchema.parse(parseYaml(fs.readFileSync(path.join(studiesDir, f), "utf8"))))
    : [];
  const inputs = readList(path.join(dir, "inputs", "manifest.yaml"))
    .map((i) => NarrativeInputSchema.parse(i))
    .map((i) => ({
      id: i.id,
      text: fs.readFileSync(
        i.file.startsWith("inputs/") ? path.join(dir, i.file) : path.join(ROOT, i.file),
        "utf8",
      ),
    }));

  const edition = EditionSchema.parse({
    runId: `edition-${DATE}-migration`,
    date: DATE,
    model: "none — mechanical migration (scripts/migrations/2026-09-08-editions.ts)",
    promptVersion: "migration-editions-v1",
    rationale:
      `First edition, migrated: the article is the case's overview.md byte for byte; the featured set is the ${featured.length} claims the ledger carried at featured tier, in file order; the adopted assessment ${migrationRunId} transfers the displayed judgment (case level from draft ${draft.runId}, claim level from the featured records) without adding any.`,
    basis: {
      ledgerHash: ledgerHash({ claims: slimClaims, evidence, sources, research, studies, images }),
      inputsHash: inputsHash(inputs),
    },
    previous: null,
    assessment: { runId: run.runId, hash: assessmentHash(run) },
    featuredClaimIds: featured.map((c) => c.id as string),
    cruxOrder: research.map((r) => r.id),
    article: overview,
  });

  report.push(
    `${slug}: featured=${featured.length} catalog=${slimClaims.length - claimsRaw.length} draft=${draft.runId} steelman=${Boolean(draftCase.steelman)} disagreements=${disagreements.length}${disagreements.length ? " [" + disagreements.join("; ") + "]" : ""}`,
  );
  if (dryRun) return report;

  // ---- write --------------------------------------------------------------
  const runDoc = new Document(run);
  runDoc.commentBefore = ` Migration assessment (${DATE}) — a mechanical transfer, not a judgment.
 Case-level fields come from draft ${draft.runId} and from the dossier
 header formerly on case.yaml; claim-level fields come from the featured
 claim records as they stood (the displayed credibility and editorial
 workup). The draft's own per-claim reasoning remains in its overlay.
 migratedFrom names the source draft; no model wrote this file.`;
  fs.writeFileSync(path.join(adir, `${run.runId}.yaml`), runDoc.toString({ lineWidth: 0 }));

  const edDoc = new Document(edition);
  const art = edDoc.get("article", true);
  if (isScalar(art)) (art as Scalar).type = Scalar.BLOCK_LITERAL;
  edDoc.commentBefore = ` Edition — the reader's unit (docs/AUTOMATION.md). Append-only; the
 current edition is the latest by date. This first edition was produced by
 the migration of ${DATE} and adopts the migration assessment above.`;
  fs.mkdirSync(path.join(dir, "editions"), { recursive: true });
  fs.writeFileSync(path.join(dir, "editions", `${edition.runId}.yaml`), edDoc.toString({ lineWidth: 0 }));

  fs.writeFileSync(path.join(dir, "claims.yaml"), claimsDoc.toString({ lineWidth: 0 }));
  fs.writeFileSync(path.join(dir, "case.yaml"), caseDoc.toString({ lineWidth: 0 }));
  fs.rmSync(path.join(dir, "overview.md"));
  if (catalogDoc) fs.rmSync(catalogPath);

  const histPath = path.join(dir, "history.yaml");
  const hist = parseDocument(fs.readFileSync(histPath, "utf8"));
  if (!isSeq(hist.contents)) throw new Error(`${slug}: history.yaml is not a list`);
  (hist.contents.items as unknown[]).push(
    hist.createNode({
      date: DATE,
      change:
        `Migrated to editions (docs/AUTOMATION.md, build step 2). The article, the ${featured.length}-claim featured set, and the displayed judgment now live in edition ${edition.runId}, which adopts the migration assessment ${run.runId}. Claim records carry propositions and anchors only; evaluative fields moved into the adopted assessment's per-claim treatment; the dossier header, research priority, and component verdicts moved from case.yaml into the assessment; claims-catalog.yaml merged into claims.yaml (tiers ended). No judgment changed.` +
        (disagreements.length
          ? ` Where a claim record's hand-written credibility differed from the draft overlay's verdict, the record's value (what claim pages displayed) was carried: ${disagreements.join("; ")}.`
          : ""),
      reason:
        "One reader-facing unit that binds verdict, selection, and article, so they cannot drift apart; one home for judgment; featuring becomes a recorded decision.",
      actor: "scripts/migrations/2026-09-08-editions.ts (mechanical), founder-directed session",
      aiAssisted: true,
      kind: "housekeeping",
    }),
  );
  fs.writeFileSync(histPath, hist.toString({ lineWidth: 0 }));
  return report;
}

const report: string[] = [];
for (const name of fs.readdirSync(CASES).sort()) {
  const dir = path.join(CASES, name);
  if (!fs.existsSync(path.join(dir, "case.yaml"))) continue;
  report.push(...migrateCase(dir));
}
console.log(report.join("\n"));
