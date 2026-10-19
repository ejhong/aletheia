import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { caseDirOf } from "./stamp.ts";

/**
 * The next free record ids for a case. An id is taken once and never again:
 * not by a record the ledger holds, a record it refused, nor a candidate a run
 * proposed and the gate never let in — a refused candidate keeps its id in the
 * run records, and a second record under it would make the history ambiguous
 * (2026-09-17, #353: a by-hand claim reused a refused proposal's id).
 */

export const KINDS = { claim: "C", evidence: "E", research: "R", study: "S" } as const;
export type Kind = keyof typeof KINDS;

/** Every file under a directory, recursively; text files only matter, and the caller filters. */
function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ya?ml|md|json|txt)$/.test(e.name)) out.push(p);
  }
  return out;
}

export function caseIdPrefix(dir: string, root = process.cwd()): string {
  const record = parseYaml(fs.readFileSync(path.join(root, "content", "cases", dir, "case.yaml"), "utf8")) as { id: string };
  return record.id.replace(/-\d+$/, "");
}

/** The highest number taken for each kind, anywhere it could have been taken. */
export function takenIds(caseKey: string, root = process.cwd()): Record<Kind, number> {
  const dir = caseDirOf(caseKey, root);
  const prefix = caseIdPrefix(dir, root);
  const high: Record<Kind, number> = { claim: 0, evidence: 0, research: 0, study: 0 };
  const files = [...walk(path.join(root, "content", "cases", dir)), ...walk(path.join(root, "proposals")), ...walk(path.join(root, "runs"))];
  const re = new RegExp(`\\b${prefix}-([CERS])(\\d{3,})\\b`, "g");
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    if (!text.includes(`${prefix}-`)) continue;
    for (const m of text.matchAll(re)) {
      const kind = (Object.entries(KINDS).find(([, letter]) => letter === m[1])![0]) as Kind;
      high[kind] = Math.max(high[kind], Number(m[2]));
    }
  }
  return high;
}

/** The next `count` free ids of a kind, formatted as the schema wants them (three digits at least). */
export function nextIds(caseKey: string, kind: Kind, count = 1, root = process.cwd()): string[] {
  const dir = caseDirOf(caseKey, root);
  const prefix = caseIdPrefix(dir, root);
  const from = takenIds(caseKey, root)[kind] + 1;
  return Array.from({ length: count }, (_, i) => `${prefix}-${KINDS[kind]}${String(from + i).padStart(3, "0")}`);
}
