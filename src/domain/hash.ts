import { createHash } from "node:crypto";
import type {
  AssessmentRun,
  Claim,
  Evidence,
  ImageRecord,
  ResearchOpportunity,
  Source,
  Study,
} from "./schema.ts";

/**
 * Content hashes for editions (docs/AUTOMATION.md, "The objects").
 *
 * An edition names the exact assessment it adopts by runId AND by the hash
 * of that run's parsed content, so an edited overlay can never silently
 * change the verdict beneath an essay: the loader recomputes the hash and
 * fails the build on a mismatch. The `basis` hashes record which ledger
 * state and founding inputs the edition was written against — provenance
 * a later reader can check, not a gate (the ledger is expected to move on;
 * standing, not the hash, tracks staleness).
 *
 * Hashes are over canonical JSON (keys sorted recursively) of the PARSED
 * records — after Zod defaults — so a whitespace or key-order change in a
 * YAML file does not change a hash, and a change of meaning always does.
 */

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeys(v);
    }
    return out;
  }
  return value;
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function assessmentHash(run: AssessmentRun): string {
  return sha256Hex(canonicalJson(run));
}

export interface LedgerSlice {
  claims: Claim[];
  evidence: Evidence[];
  sources: Source[];
  research: ResearchOpportunity[];
  studies: Study[];
  images: ImageRecord[];
}

export function ledgerHash(ledger: LedgerSlice): string {
  return sha256Hex(
    canonicalJson({
      claims: ledger.claims,
      evidence: ledger.evidence,
      sources: ledger.sources,
      research: ledger.research,
      studies: ledger.studies,
      images: ledger.images,
    }),
  );
}

/** Founding inputs, hashed by id and full text so a silent edit shows. */
export function inputsHash(inputs: { id: string; text: string }[]): string {
  return sha256Hex(
    canonicalJson(
      [...inputs]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((i) => ({ id: i.id, text: i.text })),
    ),
  );
}
