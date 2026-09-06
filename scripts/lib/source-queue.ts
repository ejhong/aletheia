import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { loadCase } from "../../src/domain/load.ts";
import { readIntakeDecisions, writeIntakeDecisions } from "./intake-store.mjs";
import { researchBasis, resolveResearchCase } from "./research-proposals.ts";
import { fingerprint } from "./review-state.mjs";
import { exactSourceMatch } from "./source-identity.mjs";
import { promotionWasHandled, readIntakeMemory } from "./intake-memory.mjs";
import type { SourceRequest } from "./source-research.ts";

export const SOURCE_QUEUE_PROTOCOL = "source-queue-v1";

/** Capturing a URL never asserts that its contents or citation were verified. */
export function queueSources(root: string, input: {
  case: string; urls: string[]; text: string; ref: string; runId: string; generatedAt: string;
}) {
  const dir = resolveResearchCase(root, input.case);
  const loaded = loadCase(dir);
  const history = readIntakeDecisions(root);
  const inputHash = fingerprint({ basis: researchBasis(dir, loaded), text: input.text });
  const entries = [...new Set(input.urls)].map(url => {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("source request is not an HTTP URL");
    const source = { url };
    const candidateHash = fingerprint({ case: loaded.record.slug, source, text: input.text });
    return { case: loaded.record.slug, stage: "source-request", decision: "queued", source,
      ref: input.ref, candidateHash, inputHash, caseBasis: loaded.contentHash,
      runId: input.runId, generatedAt: input.generatedAt, date: input.generatedAt.slice(0, 10),
      model: "Aletheia source queue (no model call)", promptVersion: SOURCE_QUEUE_PROTOCOL,
      reason: "Supplied URL queued for a bounded reading and a separate source check.",
      details: { context: input.text },
    };
  });
  const fresh = entries.filter(entry => !history.some(prior => prior.stage === "source-request" &&
    prior.case === entry.case && prior.candidateHash === entry.candidateHash && prior.inputHash === inputHash));
  const written = fresh.length ? writeIntakeDecisions(root, fresh) : null;
  return { queued: fresh.length, rested: entries.length - fresh.length, file: written?.file ?? null };
}

/** The queue is a projection of durable requests and outcomes, not another
 * cursor file. Legacy source-import files remain read-only adapters. */
export function sourceQueue(root: string) {
  const history = readIntakeDecisions(root);
  const memory = readIntakeMemory(root);
  const completed = new Set<string>();
  const attempted = new Map<string, string>();
  for (const entry of history.filter(e => e.stage === "research-run")) {
    const outcomes = entry.details?.outcomes;
    if (!Array.isArray(outcomes)) continue;
    for (const raw of outcomes) {
      if (!raw || typeof raw !== "object") continue;
      const outcome = raw as Record<string, unknown>;
      if (typeof outcome.key !== "string") continue;
      attempted.set(outcome.key, entry.generatedAt ?? entry.date ?? "");
      const proposal = history.find(e => e.stage === "research-proposal" &&
        e.storageRef.split("#")[0] === outcome.proposalFile);
      const adoption = proposal ? history.filter(e => e.stage === "research-adoption" &&
        e.details?.proposalId === proposal.id).at(-1) : null;
      const needsReconsideration = adoption && ["stale", "invalid"].includes(adoption.decision);
      if (["no_change", "rejected"].includes(String(outcome.outcome)) ||
        (outcome.outcome === "proposed" && proposal && !needsReconsideration)) completed.add(outcome.key);
    }
  }
  const candidates: Array<SourceRequest & { queuedAt: string }> = history
    .filter(entry => entry.stage === "source-request")
    .map(entry => ({ case: entry.case!, url: String(entry.source!.url), key: entry.id,
      ref: entry.ref!, context: String(entry.details!.context), queuedAt: entry.generatedAt! }));
  const issues: string[] = [];
  const base = path.join(root, "proposals/inbox");
  if (fs.existsSync(base)) for (const run of fs.readdirSync(base).sort()) {
    const dir = path.join(base, run);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const file of fs.readdirSync(dir).filter(f => /^sources-.*\.yaml$/.test(f))) {
      const full = path.join(dir, file);
      const doc = parse(fs.readFileSync(full, "utf8"));
      if (doc?.kind !== "source-proposals" || typeof doc.case !== "string" || !Array.isArray(doc.sources))
        throw new Error(`invalid legacy source proposal: ${full}`);
      let caseDir: string;
      try { caseDir = resolveResearchCase(root, doc.case); }
      catch { issues.push(`${path.relative(root, full)}: unknown case ${doc.case}; retained for review`); continue; }
      const loaded = loadCase(caseDir);
      for (const [i, source] of doc.sources.entries()) {
        if (typeof source?.url !== "string") throw new Error(`legacy source has no URL: ${full}#sources[${i}]`);
        // Legacy imports requested source records. A new explicit inbox request
        // can ask for another observation from a source already in the ledger.
        if (exactSourceMatch(source, loaded.sources) ||
          promotionWasHandled(source, path.basename(caseDir), memory, loaded.contentHash)) continue;
        const ref = `${path.relative(root, full)}#sources[${i}]`;
        candidates.push({ case: loaded.record.slug, url: source.url,
          key: fingerprint({ ref, source, case: loaded.record.slug }), ref,
          context: JSON.stringify({ proposedSource: source, origin: ref }), queuedAt: String(doc.date ?? run) });
      }
    }
  }
  const sorted = candidates.filter(c => !completed.has(c.key)).sort((a, b) =>
    (attempted.get(a.key) ?? "").localeCompare(attempted.get(b.key) ?? "") ||
    a.queuedAt.localeCompare(b.queuedAt) || a.key.localeCompare(b.key));
  // Same case/URL appears once per pass. Other requests keep their own origins
  // and remain available for reconsideration rather than losing provenance.
  const seen = new Set<string>();
  return { requests: sorted.filter(request => {
    const key = `${request.case}:${request.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }), issues };
}
