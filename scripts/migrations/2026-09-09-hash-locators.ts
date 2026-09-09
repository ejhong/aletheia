/**
 * One-off: the ledger hash stopped covering source locators (url,
 * archivedUrl) on 2026-09-09. Every edition and check whose recorded basis
 * equals the case's hash under the OLD definition is re-stamped with the
 * hash under the new one — content unchanged, so a judgment that was
 * current stays current; a basis that was already stale stays stale. The
 * adopted-assessment hash on each re-stamped edition is recomputed, since
 * it covers the run's basis. One housekeeping history entry per case.
 *
 *   node scripts/migrations/2026-09-09-hash-locators.ts
 */
import fs from "node:fs";
import path from "node:path";
import { parseDocument } from "yaml";
import { assessmentHash, canonicalJson, sha256Hex } from "../../src/domain/hash.ts";
import { loadAllCases } from "../../src/domain/load.ts";
import { AssessmentRunSchema } from "../../src/domain/schema.ts";
import { appendHistory } from "../../src/pipeline/ledger-write.ts";

const oldHash = (c: ReturnType<typeof loadAllCases>[number]) =>
  sha256Hex(canonicalJson({ claims: c.claims, evidence: c.evidence, sources: c.sources, research: c.research, studies: c.studies, images: c.images }));

for (const c of loadAllCases()) {
  const before = oldHash(c);
  const after = c.ledgerHash; // the loader already uses the new definition
  if (before === after) continue;
  const dir = path.join(process.cwd(), "content", "cases", c.dir);
  const restamped: string[] = [];
  const newAssessmentHashes = new Map<string, string>();
  for (const f of fs.readdirSync(path.join(dir, "assessments"))) {
    const file = path.join(dir, "assessments", f);
    const doc = parseDocument(fs.readFileSync(file, "utf8"));
    if (doc.getIn(["basis", "ledgerHash"]) !== before) continue;
    doc.setIn(["basis", "ledgerHash"], after);
    fs.writeFileSync(file, doc.toString({ lineWidth: 0 }));
    const run = AssessmentRunSchema.parse(doc.toJS());
    newAssessmentHashes.set(run.runId, assessmentHash(run));
    restamped.push(f);
  }
  for (const f of fs.readdirSync(path.join(dir, "editions"))) {
    const file = path.join(dir, "editions", f);
    const doc = parseDocument(fs.readFileSync(file, "utf8"));
    let changed = false;
    if (doc.getIn(["basis", "ledgerHash"]) === before) {
      doc.setIn(["basis", "ledgerHash"], after);
      changed = true;
    }
    const adopted = doc.getIn(["assessment", "runId"]) as string | undefined;
    if (adopted && newAssessmentHashes.has(adopted)) {
      doc.setIn(["assessment", "hash"], newAssessmentHashes.get(adopted));
      changed = true;
    }
    if (changed) {
      fs.writeFileSync(file, doc.toString({ lineWidth: 0 }));
      restamped.push(f);
    }
  }
  if (restamped.length) {
    appendHistory(c.dir, {
      date: "2026-09-09",
      change: `Ledger hash redefined to exclude source locators (url, archivedUrl); ${restamped.length} edition/assessment basis stamp(s) recomputed mechanically, content unchanged: ${restamped.join(", ")}.`,
      reason: "Founder decision 2026-09-09: a locator says where a record is read, not what it says; a by-hand URL addition had set a fresh panel aside and made an edition due that could only re-adopt.",
      actor: "scripts/migrations/2026-09-09-hash-locators.ts (mechanical re-stamp)",
      aiAssisted: true,
      kind: "housekeeping",
    });
    console.log(`${c.record.slug}: ${restamped.length} re-stamped`);
  }
}
