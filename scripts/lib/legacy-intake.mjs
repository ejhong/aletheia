/** One-time legacy adapters. Runtime workers read only intake-store.mjs. */
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { readAgendaCandidates } from "./intake-agenda.mjs";
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
function readOriginalIntake(root = process.cwd()) {
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
      for (const [caseIndex, result] of list(run?.cases, file).entries()) {
        if (
          !result ||
          typeof result.case !== "string" ||
          typeof result.judged !== "boolean"
        )
          throw new Error(`${file}: invalid case result`);
        if (!result.judged) {
          decisions.push({
            case: result.case,
            stage: "watch-triage",
            decision: "failed",
            source: null,
            reason: Array.isArray(result.errors)
              ? result.errors.join("; ")
              : null,
            date: run.date ?? null,
            runId: run.runId ?? null,
            model: result.model ?? null,
            promptVersion: run.promptVersion ?? null,
            inputHash: result.inputHash ?? null,
            retryable: true,
            ref: `${file}#cases[${caseIndex}]`,
          });
          continue;
        }
        if (!Array.isArray(result.decisions))
          throw new Error(`${file}: judged case has no decisions`);
        for (const [index, entry] of list(result.decisions, file).entries()) {
          decisionRecord(
            entry,
            file,
            ["import", "shelf", "archive"],
            "decision",
          );
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

/** The original row plus its committed location survives normalization verbatim. */
export function readLegacyDecisions(root, commit) {
  const { decisions } = readOriginalIntake(root);
  const unique = new Map();
  for (const entry of decisions) {
    const file = entry.ref.match(/^(.+?\.yaml)/)[1];
    const raw = readYaml(root, file);
    const index = Number(entry.ref.match(/\[(\d+)\]$/)[1]);
    const record = file.endsWith("archive-ledger.yaml")
      ? raw.items[index]
      : file.endsWith("promotions-ledger.yaml")
        ? raw[index]
        : entry.source === null
          ? raw.cases[index]
          : raw.cases.find((c) => c.case === entry.case).decisions[index];
    const identity =
      entry.stage === "watch-triage"
        ? fingerprint({
            case: entry.case,
            runId: entry.runId,
            date: entry.date,
            decision: entry.decision,
            reason: entry.reason,
            title: entry.source?.title,
            url: entry.source?.url,
          })
        : entry.ref;
    const watchRunId = file.match(
      /proposals\/watch\/(watch-[^/]+)\/triage.yaml$/,
    )?.[1];
    if (watchRunId) entry.details = { watchRunId };
    const previous = unique.get(identity);
    if (previous) {
      (previous.legacy.copies ??= []).push({ ref: entry.ref, record });
      if (entry.details && !previous.details) previous.details = entry.details;
    } else
      unique.set(identity, {
        ...entry,
        legacy: { commit, ref: entry.ref, record },
      });
  }
  const entries = [...unique.values()];
  const candidates = readAgendaCandidates(root);
  const byId = new Map(
    candidates.map((candidate) => [candidate.id, candidate]),
  );
  for (const proposal of candidates) {
    const file = `proposals/agenda/${proposal.runDir}/${proposal.caseSlug}.md`;
    const raw = fs.readFileSync(path.join(root, file), "utf8");
    const ref = `${file}#proposal-${proposal.index}`;
    entries.push({
      case: proposal.caseSlug,
      stage: "agenda-proposal",
      decision: "proposed",
      proposal,
      date:
        raw.match(/^# Agenda proposals — .+ — (\d{4}-\d{2}-\d{2})/m)?.[1] ??
        null,
      runId: raw.match(/runId (\S+?),/)?.[1] ?? null,
      model: raw.match(/Generated by (.+?), runId/)?.[1] ?? null,
      promptVersion: raw.match(/promptVersion (\S+?),/)?.[1] ?? null,
      ref,
      legacy: { commit, ref, record: proposal },
    });
  }
  const agenda = path.join(root, "proposals", "agenda");
  if (fs.existsSync(agenda))
    for (const dir of fs.readdirSync(agenda, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      const file = `proposals/agenda/${dir.name}/scores.yaml`;
      const run = readYaml(root, file);
      if (run === null) continue;
      for (const [index, tally] of list(run.tallies, file).entries()) {
        const proposal = byId.get(tally.id);
        if (
          !proposal ||
          proposal.caseSlug !== tally.case ||
          proposal.title !== tally.title ||
          proposal.kind !== tally.kind
        )
          throw new Error(
            `${file}: score has no matching proposal: ${tally.id}`,
          );
        const { highs, advances, concerns, seats } = tally;
        const ref = `${file}#tallies[${index}]`;
        entries.push({
          case: tally.case,
          stage: "agenda-score",
          decision: "scored",
          proposal,
          score: { highs, advances, concerns, seats },
          date: run.date ?? null,
          promptVersion: run.promptVersion ?? null,
          // The agenda directory identifies the proposal run, not the scoring run.
          // Old scores did not store the scoring run id or reviewers' reasoning.
          ref,
          details: { seatStatus: run.seats ?? [] },
          legacy: { commit, ref, record: tally },
        });
      }
    }
  return entries;
}
