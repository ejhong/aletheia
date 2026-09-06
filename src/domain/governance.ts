import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { ArbiterRecordSchema, type ArbiterRecord } from "./schema";
import { readIntakeDecisions } from "../../scripts/lib/intake-store.mjs";

const GOVERNANCE_DIR = path.join(process.cwd(), "governance", "arbiter");

/**
 * All harvested arbiter verdicts, newest outcome first. Absent directory =
 * empty list (the page must render before the first harvest), but a file
 * that exists and fails validation fails the build — same fail-closed rule
 * as case content.
 */
export function loadArbiterRecords(): ArbiterRecord[] {
  if (!fs.existsSync(GOVERNANCE_DIR)) return [];
  return fs
    .readdirSync(GOVERNANCE_DIR)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => {
      const raw = parseYaml(
        fs.readFileSync(path.join(GOVERNANCE_DIR, f), "utf8"),
      );
      const parsed = ArbiterRecordSchema.safeParse(raw);
      if (!parsed.success)
        throw new Error(
          `governance/arbiter/${f}: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
        );
      return parsed.data;
    })
    .sort((a, b) => b.outcomeAt.localeCompare(a.outcomeAt));
}

/** One promotion outcome for the governance view. */
export interface PromotionEntry {
  url: string;
  disposition: "promoted" | "duplicate" | "failed";
  [key: string]: unknown;
}

/** Promotion outcomes derived from the shared, validated intake history. */
export function loadPromotionsLedger(): PromotionEntry[] {
  return readIntakeDecisions()
    .filter((entry) => entry.stage === "promotion")
    .map((entry) => {
      if (
        typeof entry.source?.url !== "string" ||
        !["promoted", "duplicate", "failed"].includes(entry.decision)
      )
        throw new Error("invalid promotion decision");
      return {
        url: entry.source.url,
        disposition: entry.decision as PromotionEntry["disposition"],
        date: entry.date,
        case: entry.case,
        reason: entry.reason,
        runId: entry.runId,
      };
    });
}
