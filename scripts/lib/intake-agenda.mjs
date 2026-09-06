/** Agenda candidates and decisions share the intake store with source intake. */
import fs from "node:fs";
import path from "node:path";
import { parseAgendaFile } from "./bench-core.mjs";
import { fingerprint } from "./review-state.mjs";
import { readIntakeDecisions } from "./intake-store.mjs";

export function readAgendaCandidates(root = process.cwd()) {
  const base = path.join(root, "proposals", "agenda");
  const result = [];
  if (!fs.existsSync(base)) return result;
  for (const dir of fs
    .readdirSync(base, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))) {
    if (!dir.isDirectory()) continue;
    for (const file of fs.readdirSync(path.join(base, dir.name)).sort()) {
      if (!file.endsWith(".md") || file === "report.md") continue;
      result.push(
        ...parseAgendaFile(
          fs.readFileSync(path.join(base, dir.name, file), "utf8"),
          {
            caseSlug: file.slice(0, -3),
            runDir: dir.name,
          },
        ),
      );
    }
  }
  return result;
}

/** Compare substance, not the title or the new run's ordinal id. */
export function agendaSubstance(proposal) {
  const compact = (value) =>
    String(value ?? "")
      .replace(/\s+/g, " ")
      .trim();
  return {
    kind: proposal.kind,
    question: compact(proposal.question),
    closestExisting: compact(
      Array.isArray(proposal.closestExisting)
        ? `${proposal.closestExisting.join(", ")} — ${proposal.gap}`
        : proposal.closestExisting,
    ),
    wouldSettle: compact(proposal.wouldSettle),
    effortTier: proposal.effortTier,
  };
}

export function agendaWasProposed(proposal, caseSlug, inputHash, decisions) {
  const substance = fingerprint(agendaSubstance(proposal));
  return decisions.some(
    (entry) =>
      entry.stage === "agenda-proposal" &&
      entry.decision === "proposed" &&
      entry.proposal?.caseSlug === caseSlug &&
      entry.inputHash === inputHash &&
      fingerprint(agendaSubstance(entry.proposal)) === substance,
  );
}

/** Latest score attached to the exact stored proposal, with historical unknowns intact. */
export function agendaScore(proposal, decisions) {
  return (
    decisions
      .filter(
        (entry) =>
          entry.stage === "agenda-score" &&
          entry.proposal?.id === proposal.id &&
          fingerprint(entry.proposal) === fingerprint(proposal),
      )
      .at(-1) ?? null
  );
}

export function readAgendaTallies(root = process.cwd()) {
  const decisions = readIntakeDecisions(root);
  return readAgendaCandidates(root).flatMap((proposal) => {
    const entry = agendaScore(proposal, decisions);
    return entry?.decision === "scored" && !entry.retryable && entry.score
      ? [
          {
            ...proposal,
            case: proposal.caseSlug,
            ...entry.score,
            review: entry.review,
            reviewRef: entry.storageRef,
          },
        ]
      : [];
  });
}

/** Prompt context is bounded explicitly; the intake report exposes the complete history. */
export function agendaContext(caseSlug, decisions, limit = 30) {
  const history = decisions.filter(
    (entry) =>
      entry.proposal?.caseSlug === caseSlug &&
      entry.stage === "agenda-proposal" &&
      entry.decision === "proposed",
  );
  return {
    total: history.length,
    entries: history.slice(-limit).map((entry) => {
      const score = agendaScore(entry.proposal, decisions);
      return {
        proposal: entry.proposal,
        date: entry.date,
        inputHash: entry.inputHash,
        score: score?.score ?? null,
        review: score?.review ?? null,
        reviewStatus: score?.decision ?? null,
        retryable: score?.retryable ?? null,
        reviewReason: score?.reason ?? null,
        ref: entry.storageRef,
      };
    }),
    note: "Prior proposals and reviews are context, not permanent rejections. Missing review reasons are unknown. An unscored proposal is unscored; silence is not a decision.",
  };
}
