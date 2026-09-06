#!/usr/bin/env node
import { parseArgs } from "node:util";
import { stringify } from "yaml";
import { randomUUID } from "node:crypto";
import { seedEdition } from "./lib/edition-proposals.ts";

const { positionals } = parseArgs({ allowPositionals: true });
if (positionals.length !== 1) throw new Error("usage: node scripts/prepare-edition.ts <case> > candidate.yaml");
const generatedAt = new Date().toISOString();
process.stdout.write(stringify(seedEdition(process.cwd(), positionals[0], {
  runId: `edition-${generatedAt.slice(0, 10)}-${randomUUID()}`,
  generatedAt, model: "Aletheia incumbent assembler (no model call)", promptVersion: "edition-assembly-v1",
})));
