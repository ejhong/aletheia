/** Shared live source index and the single durable intake history. */
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import {
  exactSourceMatch,
  normalizeTitle,
  sourceKeys,
} from "./source-identity.mjs";
import { nearDuplicateOf } from "./watch-matching.mjs";
import { fingerprint } from "./review-state.mjs";
import { readIntakeDecisions } from "./intake-store.mjs";

export function readIntakeMemory(root = process.cwd()) {
  const sourcesByCase = {};
  const caseAliases = {};
  const casesDir = path.join(root, "content", "cases");
  for (const dir of fs.readdirSync(casesDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const file = path.join(casesDir, dir.name, "sources.yaml");
    const sources = fs.existsSync(file)
      ? parse(fs.readFileSync(file, "utf8"))
      : [];
    if (!Array.isArray(sources))
      throw new Error(`${file}: expected source list`);
    sourcesByCase[dir.name] = sources;
    const metadata = path.join(casesDir, dir.name, "case.yaml");
    const slug = fs.existsSync(metadata)
      ? parse(fs.readFileSync(metadata, "utf8"))?.slug
      : null;
    for (const key of [dir.name, ...(typeof slug === "string" ? [slug] : [])]) {
      if (caseAliases[key] && caseAliases[key] !== dir.name)
        throw new Error(`ambiguous case alias: ${key}`);
      caseAliases[key] = dir.name;
    }
  }
  const decisions = readIntakeDecisions(root).map((entry) => {
    const directory = caseAliases[entry.case];
    return directory && directory !== entry.case
      ? {
          ...entry,
          case: directory,
          recordedCase: entry.case,
          caseBasis: "resolved from current case metadata",
        }
      : entry;
  });
  return { sourcesByCase, caseAliases, decisions };
}

/** Rest only a promotion attempt on the same case, candidate, and case inputs. */
export function promotionWasHandled(source, caseDir, memory, inputHash) {
  const candidateHash = fingerprint(source);
  return memory.decisions.some(
    (entry) =>
      entry.stage === "promotion" &&
      entry.source &&
      !entry.retryable &&
      entry.case === caseDir &&
      entry.inputHash === inputHash &&
      entry.candidateHash === candidateHash &&
      exactSourceMatch(source, [entry.source]) !== null,
  );
}

/** Failed cases remain due; a forced run can reconsider any earlier triage. */
export function watchCaseTriaged(watchRunId, caseDir, items, decisions) {
  return items.every((item) =>
    decisions.some(
      (entry) =>
        entry.stage === "watch-triage" &&
        entry.case === caseDir &&
        entry.decision !== "failed" &&
        entry.details?.watchRunId === watchRunId &&
        (entry.candidateHash === fingerprint(item) ||
          (entry.legacy &&
            entry.source &&
            entry.source.title === item.title &&
            entry.source.url === item.url)),
    ),
  );
}

/**
 * Inspect every candidate. Nothing is filtered and no terminal rejection is
 * inferred. Same DOI + another passage is still another evidence question.
 * Similar titles are advisory; an unscoped legacy decision never suppresses.
 */
export function intakeContext(candidate, caseDir, memory) {
  const source = candidate.source ?? candidate;
  const sources = memory.sourcesByCase[caseDir] ?? [];
  const exact = exactSourceMatch(source, sources);
  const aliases = new Set([
    ...sourceKeys(source),
    ...(exact ? sourceKeys(exact.source) : []),
  ]);
  const related = memory.decisions
    .filter((decision) => {
      if (
        !decision.source ||
        (decision.case !== caseDir && decision.case !== null)
      )
        return false;
      if (sourceKeys(decision.source).some((key) => aliases.has(key)))
        return true;
      // A title-only historical watch key is a possible relation, not identity.
      const title = normalizeTitle(source.title);
      return (
        title.length > 12 && title === normalizeTitle(decision.source.title)
      );
    })
    .map((decision) => ({
      ...decision,
      match: sourceKeys(decision.source).some((key) => aliases.has(key))
        ? "identifier"
        : "title only",
    }))
    .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
  return {
    kind: candidate.kind ?? "source",
    sourceRecord: exact ? { id: exact.source.id, via: exact.via } : null,
    possibleSourceRecord: exact ? null : nearDuplicateOf(source, sources),
    priorDecisions: related.filter((decision) => decision.case === caseDir),
    unscopedDecisions: related.filter((decision) => decision.case === null),
    // Deliberately never an `already considered` boolean for claims/evidence.
    note: "Source identity and earlier intake decisions do not establish whether this observation or argument was assessed. Reconsideration may be justified by a better argument without a newer paper.",
  };
}
