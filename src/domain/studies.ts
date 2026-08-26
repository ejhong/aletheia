import { createHash } from "node:crypto";
import type { Evidence, Source, Study } from "./schema";

/**
 * Study integrity — the pure rules behind the pre-registration
 * machinery (see StudySchema). Kept framework-free and separately
 * testable, like the other domain validators. The freeze-stamping
 * script (scripts/stamp-study.mjs) mirrors computeCriteriaHash in plain
 * node; this file is the authority.
 */

/**
 * The frozen-criteria fingerprint: sha256 (first 12 hex chars) over a
 * canonical serialization of every criteria field except the hash
 * itself. Any post-freeze edit to the criteria changes the hash and
 * fails the build.
 */
export function computeCriteriaHash(criteria: Study["criteria"]): string {
  const canonical = JSON.stringify([
    criteria.frozenOn,
    criteria.inclusion,
    criteria.exclusion,
    criteria.searchProtocol,
    criteria.knownCandidates.map((c) => [c.name, c.disposition, c.reason]),
  ]);
  return createHash("sha256").update(canonical).digest("hex").slice(0, 12);
}

/** True while a study is a public pre-registration awaiting collection. */
export function isPendingStudy(study: Study): boolean {
  return study.rows.length === 0;
}

/**
 * Cross-record integrity for one case's studies. Returns human-readable
 * errors; the loader fails the build on any. Rules:
 *  - the criteria hash must match the frozen criteria (§3.12);
 *  - researchIds / claimIds / findings.evidenceId must resolve;
 *  - `supersedes` must name another study in the case;
 *  - a workpaper Source must name a real study and vice-versa only
 *    workpaper sources may carry studyId;
 *  - evidence may not cite the workpaper of a superseded study — a
 *    retracted table cannot keep carrying ledger weight.
 */
export function studyIntegrityErrors(input: {
  studies: Study[];
  sources: Source[];
  evidence: Evidence[];
  researchIds: Set<string>;
  claimIds: Set<string>;
}): string[] {
  const { studies, sources, evidence, researchIds, claimIds } = input;
  const errors: string[] = [];
  const byId = new Map(studies.map((s) => [s.id, s]));

  for (const s of studies) {
    const expected = computeCriteriaHash(s.criteria);
    if (s.criteria.criteriaHash !== expected) {
      errors.push(
        `study ${s.id}: criteriaHash ${s.criteria.criteriaHash} does not match the frozen criteria (expected ${expected}) — frozen criteria may not be edited; a correction is a new study that supersedes this one`,
      );
    }
    for (const rid of s.researchIds) {
      if (!researchIds.has(rid))
        errors.push(`study ${s.id}: unknown research item ${rid}`);
    }
    for (const cid of s.claimIds) {
      if (!claimIds.has(cid)) errors.push(`study ${s.id}: unknown claim ${cid}`);
    }
    const evidenceIds = new Set(evidence.map((e) => e.id));
    for (const f of s.findings) {
      if (f.evidenceId && !evidenceIds.has(f.evidenceId))
        errors.push(
          `study ${s.id}: finding links unknown evidence ${f.evidenceId}`,
        );
    }
    if (s.supersedes && !byId.has(s.supersedes))
      errors.push(`study ${s.id}: supersedes unknown study ${s.supersedes}`);
  }

  const superseded = new Set(
    studies.map((s) => s.supersedes).filter((x): x is string => Boolean(x)),
  );
  for (const src of sources) {
    if (src.studyId !== undefined && src.sourceType !== "workpaper") {
      errors.push(
        `source ${src.id}: only workpaper sources may carry studyId`,
      );
    }
    if (src.sourceType === "workpaper") {
      if (!src.studyId) {
        errors.push(`source ${src.id}: workpaper source must carry studyId`);
        continue;
      }
      if (!byId.has(src.studyId)) {
        errors.push(`source ${src.id}: unknown study ${src.studyId}`);
        continue;
      }
      if (superseded.has(src.studyId)) {
        const citing = evidence.filter((e) => e.sourceId === src.id);
        for (const e of citing) {
          errors.push(
            `evidence ${e.id} cites ${src.id}, the workpaper of superseded study ${src.studyId} — re-point it at the successor or amend it`,
          );
        }
      }
    }
  }

  return errors;
}
