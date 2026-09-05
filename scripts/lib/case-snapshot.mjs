import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { fingerprint } from "./review-state.mjs";

// Reader-facing content is versioned together. Operational cursors, history,
// and assessment files are excluded: appending a review must not stale itself.
const FILES = [
  "case.yaml",
  "overview.md",
  "claims.yaml",
  "claims-catalog.yaml",
  "evidence.yaml",
  "sources.yaml",
  "research.yaml",
  "conjectures.yaml",
  "images.yaml",
];

/** Exact file receipts; even a same-day correction invalidates old reviews.
 * @param {string} caseDir
 */
export function readCaseSnapshot(caseDir) {
  const names = [...FILES];
  const studies = path.join(caseDir, "studies");
  if (fs.existsSync(studies))
    names.push(
      ...fs
        .readdirSync(studies)
        .filter((f) => f.endsWith(".yaml"))
        .map((f) => `studies/${f}`),
    );
  const files = Object.fromEntries(
    names
      .sort()
      .filter((name) => fs.existsSync(path.join(caseDir, name)))
      .map((name) => [name, fs.readFileSync(path.join(caseDir, name), "utf8")]),
  );
  return { files, contentHash: fingerprint(files) };
}

/** The blind assessor sees propositions, source records and observations.
 * Prior verdicts, importance, article prose, and editorial strength grades
 * are deliberately absent. Evidence directions/inferences are labeled as
 * editorial interpretations to question, not as primary-source statements.
 * @param {Record<string, string>} files
 */
export function evidencePacket(files) {
  const read = (/** @type {string} */ name, fallback = []) =>
    files[name] ? parse(files[name]) : fallback;
  const record = read("case.yaml", {});
  const claims = [
    ...read("claims.yaml"),
    ...read("claims-catalog.yaml"),
  ].filter((c) => c.reviewState !== "rejected");
  return {
    case: {
      id: record.id,
      title: record.title,
      question: record.whatIsClaimed,
      themes: record.themes,
    },
    assessClaimIds: claims
      .filter((c) => (c.tier ?? "featured") === "featured")
      .map((c) => c.id),
    claims: claims.map((c) => ({
      id: c.id,
      statement: c.statement,
      rung: c.rung,
      claimType: c.claimType,
      sourceAnchor: c.sourceAnchor,
      genealogy: c.genealogy,
      parentClaimIds: c.parentClaimIds ?? [],
      dependsOnClaimIds: c.dependsOnClaimIds ?? [],
      independenceGroup: c.independenceGroup,
      reviewState: c.reviewState,
      origin: c.origin,
    })),
    evidence: read("evidence.yaml").map((e) => ({
      id: e.id,
      title: e.title,
      claimIds: e.claimIds,
      sourceId: e.sourceId,
      sourceStatement: e.sourceStatement,
      exactLocator: e.exactLocator,
      editorialInterpretation: {
        direction: e.direction,
        inference: e.editorInference,
      },
      limitations: e.limitations ?? [],
      reviewState: e.reviewState,
      origin: e.origin,
    })),
    sources: read("sources.yaml"),
    research: read("research.yaml"),
    studies: Object.keys(files)
      .filter((f) => f.startsWith("studies/"))
      .map((f) => read(f)),
  };
}
