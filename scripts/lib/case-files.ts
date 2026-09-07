import fs from "node:fs";
import path from "node:path";
import { isSeq, parseDocument, stringify } from "yaml";
import { loadCase } from "../../src/domain/load.ts";
import type { ChangeLogEntry } from "../../src/domain/schema.ts";

export function appendCaseHistory(caseDir: string, update: ChangeLogEntry) {
  const original = fs.readFileSync(path.join(caseDir, "history.yaml"), "utf8");
  const document = parseDocument(original);
  if (isSeq(document.contents) && document.contents.items.length === 0) {
    document.contents.flow = false;
    document.add(update);
    return document.toString();
  }
  return original + "\n" + stringify([update]);
}

/** Transaction for a review worktree, with production validation and rollback.
 * No commit or publication authority. A failed rollback must stop the workflow. */
export function installCaseFiles(caseDir: string, changes: Record<string, string>) {
  const originals = new Map<string, string | null>();
  const written: string[] = [];
  try {
    for (const [file, body] of Object.entries(changes)) {
      const target = path.resolve(caseDir, file);
      if (!target.startsWith(path.resolve(caseDir) + path.sep)) throw new Error("unsafe case file");
      originals.set(file, fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      written.push(file);
      fs.writeFileSync(target, body);
    }
    loadCase(caseDir);
  } catch (error) {
    const failures: unknown[] = [error];
    for (const file of written.reverse()) {
      try {
        const before = originals.get(file)!;
        if (before === null) {
          if (fs.existsSync(path.join(caseDir, file))) fs.unlinkSync(path.join(caseDir, file));
        }
        else fs.writeFileSync(path.join(caseDir, file), before);
      } catch (restoreError) { failures.push(restoreError); }
    }
    if (failures.length > 1) throw new AggregateError(failures, "case rollback failed; stop publication");
    throw error;
  }
}
