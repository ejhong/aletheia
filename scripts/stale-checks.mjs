#!/usr/bin/env node
/** Print cases needing a full current panel. Uses the same rule as the UI. */
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { readCaseSnapshot, evidencePacket } from "./lib/case-snapshot.mjs";
import {
  REVIEW_MIN_PANEL,
  currentChecks,
  fingerprint,
  latestDraft,
  missingReviewCoverage,
} from "./lib/review-state.mjs";

const CASES = path.join(process.cwd(), "content", "cases");
for (const dir of fs.readdirSync(CASES)) {
  const caseDir = path.join(CASES, dir);
  if (!fs.existsSync(path.join(caseDir, "case.yaml"))) continue;
  const adir = path.join(caseDir, "assessments");
  const runs = (fs.existsSync(adir) ? fs.readdirSync(adir) : [])
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => parse(fs.readFileSync(path.join(adir, f), "utf8")));
  const draft = latestDraft(runs);
  const snapshot = readCaseSnapshot(caseDir);
  const packet = evidencePacket(snapshot.files);
  // A question with no evidence is an honest starting point, not a reason
  // to pay five models to manufacture an assessment.
  if (!draft || !packet.assessClaimIds.length || !packet.evidence.length)
    continue;
  const checks = currentChecks(
    runs,
    draft,
    snapshot.contentHash,
    fingerprint(packet),
  );
  if (
    checks.length < REVIEW_MIN_PANEL ||
    missingReviewCoverage(draft, checks).length
  )
    console.log(dir);
}
