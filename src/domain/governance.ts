import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { ArbiterRecordSchema, type ArbiterRecord } from "./schema";

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
      const raw = parseYaml(fs.readFileSync(path.join(GOVERNANCE_DIR, f), "utf8"));
      const parsed = ArbiterRecordSchema.safeParse(raw);
      if (!parsed.success)
        throw new Error(`governance/arbiter/${f}: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
      return parsed.data;
    })
    .sort((a, b) => b.outcomeAt.localeCompare(a.outcomeAt));
}

/** One promotions-ledger entry (proposals/promotions-ledger.yaml). */
export interface PromotionEntry {
  url: string;
  disposition: "promoted" | "duplicate" | "failed";
  [key: string]: unknown;
}

/**
 * The promotion pipe's dispositions ledger — every verified import's
 * fate (promoted / duplicate / failed, with reasons), appended by
 * scripts/promote-imports.mjs in the archive-ledger tradition. Missing
 * file = the pipe has not run yet; an unparseable file loses the vitals
 * row, never the page.
 */
export function loadPromotionsLedger(): PromotionEntry[] {
  const p = path.join(process.cwd(), "proposals", "promotions-ledger.yaml");
  if (!fs.existsSync(p)) return [];
  try {
    const parsed = parseYaml(fs.readFileSync(p, "utf8"));
    return Array.isArray(parsed)
      ? parsed.filter(
          (e): e is PromotionEntry =>
            typeof e?.url === "string" && typeof e?.disposition === "string",
        )
      : [];
  } catch {
    return [];
  }
}
