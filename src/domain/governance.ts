import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { ArbiterRecordSchema, type ArbiterRecord, ReviewNoteRecordSchema, type ReviewNoteRecord } from "./schema.ts";

const GOVERNANCE_DIR = path.join(process.cwd(), "governance", "arbiter");

/** governance/operation.yaml — whether the automation is live or paused under the kill switch, and why. */
export const OperationSchema = z.object({
  state: z.enum(["live", "paused"]),
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  by: z.string().min(1),
  reason: z.string().min(3),
});
export type Operation = z.infer<typeof OperationSchema>;

export function loadOperation(root = process.cwd()): Operation {
  const file = path.join(root, "governance", "operation.yaml");
  if (!fs.existsSync(file)) throw new Error("governance/operation.yaml is missing — the pages cannot say whether the automation is live");
  return OperationSchema.parse(parseYaml(fs.readFileSync(file, "utf8")));
}

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

const NOTES_DIR = path.join(process.cwd(), "governance", "review-notes");

/** Every harvested review note, open first, then newest first. Absent directory = none yet; a bad file fails the build. */
export function loadReviewNotes(): ReviewNoteRecord[] {
  if (!fs.existsSync(NOTES_DIR)) return [];
  return fs
    .readdirSync(NOTES_DIR)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => {
      const parsed = ReviewNoteRecordSchema.safeParse(parseYaml(fs.readFileSync(path.join(NOTES_DIR, f), "utf8")));
      if (!parsed.success) throw new Error(`governance/review-notes/${f}: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
      return parsed.data;
    })
    .sort((a, b) => (a.state === b.state ? b.createdAt.localeCompare(a.createdAt) : a.state === "open" ? -1 : 1));
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
