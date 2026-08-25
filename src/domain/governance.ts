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
