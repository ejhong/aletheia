#!/usr/bin/env node
/** Replay committed intake history; remove old writers' stores only after exact verification. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { readLegacyDecisions } from "./lib/legacy-intake.mjs";
import {
  readIntakeDecisions,
  writeIntakeDecisions,
} from "./lib/intake-store.mjs";
import { fingerprint } from "./lib/review-state.mjs";

export function migrateIntake(root, { from, write = false } = {}) {
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" });
  const old = readIntakeDecisions(root);
  const earlier = [
    ...new Set(
      old.flatMap((entry) => (entry.legacy ? [entry.legacy.commit] : [])),
    ),
  ];
  if (!from && earlier.length > 1)
    throw new Error("multiple legacy bases; pass --from explicitly");
  const commit = git(
    "rev-parse",
    `${from ?? earlier[0] ?? "HEAD"}^{commit}`,
  ).trim();
  const files = git("ls-tree", "-r", "--name-only", commit)
    .trim()
    .split("\n")
    .filter(
      (file) =>
        /^content\/cases\/[^/]+\/sources\.yaml$/.test(file) ||
        /^proposals\/(?:promotions-ledger\.yaml|watch\/(?:archive-ledger\.yaml|watch-[^/]+\/triage\.yaml)|agenda\/[^/]+\/(?:scores\.yaml|[^/]+\.md))$/.test(
          file,
        ),
    );
  const scratch = fs.mkdtempSync(
    path.join(os.tmpdir(), "aletheia-intake-migration-"),
  );
  try {
    const retire = [];
    for (const file of files) {
      const original = git("show", `${commit}:${file}`);
      const snapshot = path.join(scratch, file);
      fs.mkdirSync(path.dirname(snapshot), { recursive: true });
      fs.writeFileSync(snapshot, original);
      if (
        /\/(?:archive-ledger|promotions-ledger|triage|scores)\.yaml$/.test(file)
      ) {
        const working = path.join(root, file);
        if (fs.existsSync(working)) {
          if (fs.readFileSync(working, "utf8") !== original)
            throw new Error(
              `${file} changed after ${commit}; refusing to remove unrecorded decisions`,
            );
          retire.push(file);
        }
      }
    }
    const entries = readLegacyDecisions(scratch, commit);
    const result = {
      commit,
      decisions: entries.length,
      retiring: retire,
      added: 0,
    };
    if (!write) return result;
    result.added = writeIntakeDecisions(root, entries).added;
    const stored = new Map(
      readIntakeDecisions(root)
        .filter((entry) => entry.legacy)
        .map((entry) => [entry.legacy.ref, entry]),
    );
    for (const entry of entries) {
      const persisted = stored.get(entry.legacy.ref);
      if (
        !persisted ||
        fingerprint(persisted.legacy) !== fingerprint(entry.legacy)
      )
        throw new Error(`migration replay failed for ${entry.legacy.ref}`);
      for (const [key, value] of Object.entries(entry))
        if (fingerprint(persisted[key]) !== fingerprint(value))
          throw new Error(`migration changed ${key} for ${entry.legacy.ref}`);
    }
    for (const file of retire) fs.unlinkSync(path.join(root, file));
    return result;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const { values } = parseArgs({
    options: {
      from: { type: "string" },
      write: { type: "boolean", default: false },
    },
  });
  console.log(JSON.stringify(migrateIntake(process.cwd(), values), null, 2));
}
