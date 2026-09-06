/**
 * One read interface over the existing intake decisions. Original files remain
 * authoritative until their writers migrate; this creates no second ledger.
 * A source match is context, never proof that a new observation was considered.
 */
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

function readYaml(root, file) {
  const full = path.join(root, file);
  return fs.existsSync(full) ? parse(fs.readFileSync(full, "utf8")) : null;
}

function list(value, file) {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${file}: expected a list`);
  return value;
}

function decisionRecord(entry, file, outcomes, field) {
  if (!entry || typeof entry !== "object" || !outcomes.includes(entry[field])) {
    throw new Error(`${file}: invalid ${field} record`);
  }
  return entry;
}

/** Legacy promotions sometimes lack a case. Infer only from an unambiguous record id. */
export function promotionCase(entry, sourcesByCase) {
  if (typeof entry.case === "string" && entry.case) return entry.case;
  const id = entry.as ?? entry.of;
  if (!id) return null;
  const owners = Object.entries(sourcesByCase)
    .filter(([, sources]) => sources.some((source) => source.id === id))
    .map(([caseDir]) => caseDir);
  return owners.length === 1 ? owners[0] : null;
}

/** Sources and dated decisions; unknown historical context stays unknown. */
export function readIntakeMemory(root = process.cwd()) {
  const casesDir = path.join(root, "content", "cases");
  const sourcesByCase = {};
  for (const dir of fs.readdirSync(casesDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const file = `content/cases/${dir.name}/sources.yaml`;
    sourcesByCase[dir.name] = list(readYaml(root, file), file);
  }
  const decisions = [];
  const archiveFile = "proposals/watch/archive-ledger.yaml";
  const archive = readYaml(root, archiveFile);
  if (archive !== null && !Array.isArray(archive.items))
    throw new Error(`${archiveFile}: missing items list`);
  for (const [index, entry] of list(archive?.items, archiveFile).entries()) {
    if (
      !entry ||
      typeof entry.case !== "string" ||
      typeof entry.key !== "string" ||
      typeof entry.reason !== "string"
    )
      throw new Error(`${archiveFile}: invalid archive entry ${index}`);
    decisions.push({
      case: entry.case ?? null,
      source: { title: entry.title, url: entry.url, identifier: entry.key },
      stage: "watch-triage",
      decision: "archive",
      reason: entry.reason ?? null,
      date: entry.date ?? null,
      runId: entry.triageRun ?? null,
      model: entry.model ?? null,
      promptVersion: entry.promptVersion ?? null,
      inputHash: entry.inputHash ?? null,
      candidateHash: entry.candidateHash ?? null,
      ref: `${archiveFile}#items[${index}]`,
    });
  }
  const promotionFile = "proposals/promotions-ledger.yaml";
  for (const [index, entry] of list(
    readYaml(root, promotionFile),
    promotionFile,
  ).entries()) {
    decisionRecord(
      entry,
      promotionFile,
      ["promoted", "duplicate", "failed"],
      "disposition",
    );
    if (typeof entry.url !== "string")
      throw new Error(`${promotionFile}: missing URL at entry ${index}`);
    if (entry.retryable !== undefined && typeof entry.retryable !== "boolean")
      throw new Error(
        `${promotionFile}: invalid retryable flag at entry ${index}`,
      );
    const caseDir = promotionCase(entry, sourcesByCase);
    decisions.push({
      case: caseDir,
      caseBasis: entry.case
        ? "recorded"
        : caseDir
          ? "inferred from current source record"
          : "unknown",
      source: { title: entry.title, url: entry.url },
      stage: "promotion",
      decision: entry.disposition,
      reason: entry.reason ?? null,
      date: entry.date ?? null,
      runId: entry.runId ?? null,
      model: entry.model ?? null,
      promptVersion: entry.promptVersion ?? null,
      inputHash: entry.inputHash ?? null,
      candidateHash: entry.candidateHash ?? null,
      retryable: entry.retryable ?? false,
      recordId: entry.as ?? entry.of ?? null,
      matchMethod: entry.via ?? null,
      ref: `${promotionFile}[${index}]`,
    });
  }
  // Import/shelf decisions still live in recent triage runs. Archive history
  // comes from the durable file above, so it is not duplicated in this view.
  const watchDir = path.join(root, "proposals", "watch");
  if (fs.existsSync(watchDir)) {
    for (const dir of fs.readdirSync(watchDir, { withFileTypes: true })) {
      if (!dir.isDirectory() || !dir.name.startsWith("watch-")) continue;
      const file = `proposals/watch/${dir.name}/triage.yaml`;
      const run = readYaml(root, file);
      if (run !== null && !Array.isArray(run.cases))
        throw new Error(`${file}: missing cases list`);
      for (const result of list(run?.cases, file)) {
        if (
          !result ||
          typeof result.case !== "string" ||
          typeof result.judged !== "boolean"
        )
          throw new Error(`${file}: invalid case result`);
        if (!result.judged) continue;
        if (!Array.isArray(result.decisions))
          throw new Error(`${file}: judged case has no decisions`);
        for (const [index, entry] of list(result.decisions, file).entries()) {
          decisionRecord(
            entry,
            file,
            ["import", "shelf", "archive"],
            "decision",
          );
          if (entry.decision === "archive") continue;
          decisions.push({
            case: result.case ?? null,
            source: {
              title: entry.title,
              url: entry.url,
              doi: entry.doi,
              arxivId: entry.arxivId,
            },
            stage: "watch-triage",
            decision: entry.decision,
            reason: entry.reason ?? null,
            date: run.date ?? null,
            runId: run.runId ?? null,
            model: result.model ?? null,
            promptVersion: run.promptVersion ?? null,
            inputHash: result.inputHash ?? null,
            ref: `${file}#${result.case}.decisions[${index}]`,
          });
        }
      }
    }
  }
  return { sourcesByCase, decisions };
}

/** Rest only a promotion attempt on the same case, candidate, and case inputs. */
export function promotionWasHandled(source, caseDir, memory, inputHash) {
  const candidateHash = fingerprint(source);
  return memory.decisions.some(
    (entry) =>
      entry.stage === "promotion" &&
      !entry.retryable &&
      entry.case === caseDir &&
      entry.inputHash === inputHash &&
      entry.candidateHash === candidateHash &&
      exactSourceMatch(source, [entry.source]) !== null,
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
      if (decision.case !== caseDir && decision.case !== null) return false;
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
