#!/usr/bin/env node
/**
 * Stamp (or verify) a study's frozen-criteria hash.
 *
 * Usage:
 *   node scripts/stamp-study.mjs <case-dir> <study-id>          # stamp
 *   node scripts/stamp-study.mjs <case-dir> <study-id> --check  # verify
 *
 * Run at freeze time, before the freeze PR. The hash computation is the
 * plain-node mirror of computeCriteriaHash in src/domain/studies.ts —
 * that file is the authority; the loader re-verifies on every build, so
 * a drifted mirror fails loudly rather than silently.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const [caseDir, studyId, flag] = process.argv.slice(2);
if (!caseDir || !studyId) {
  console.error("usage: node scripts/stamp-study.mjs <case-dir> <study-id> [--check]");
  process.exit(1);
}
const file = path.join(
  process.cwd(),
  "content",
  "cases",
  caseDir,
  "studies",
  `${studyId.toLowerCase()}.yaml`,
);
if (!fs.existsSync(file)) {
  console.error(`no study at ${file}`);
  process.exit(1);
}
const study = parseYaml(fs.readFileSync(file, "utf8"));
const c = study.criteria ?? {};

// Mirror of src/domain/studies.ts computeCriteriaHash — keep in sync.
const canonical = JSON.stringify([
  c.frozenOn,
  c.inclusion,
  c.exclusion ?? [],
  c.searchProtocol,
  (c.knownCandidates ?? []).map((k) => [k.name, k.disposition, k.reason]),
]);
const hash = createHash("sha256").update(canonical).digest("hex").slice(0, 12);

if (flag === "--check") {
  if (c.criteriaHash === hash) {
    console.log(`ok: ${studyId} criteria hash ${hash} matches`);
  } else {
    console.error(
      `MISMATCH: ${studyId} carries ${c.criteriaHash}, frozen criteria hash to ${hash} — frozen criteria may not be edited; a correction is a new study that supersedes this one`,
    );
    process.exit(1);
  }
} else {
  study.criteria.criteriaHash = hash;
  fs.writeFileSync(file, stringifyYaml(study));
  console.log(`stamped ${studyId} with criteria hash ${hash}`);
}
