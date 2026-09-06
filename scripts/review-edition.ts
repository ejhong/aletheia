#!/usr/bin/env node
import fs from "node:fs";
import { parseArgs } from "node:util";
import { parse } from "yaml";
import { recordEditionProposal, validateEditionProposal } from "./lib/edition-proposals.ts";

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  record: { type: "boolean" }, materialize: { type: "string" },
} });
if (positionals.length !== 1 || (values.record && values.materialize))
  throw new Error("usage: node scripts/review-edition.ts <candidate.yaml> [--record | --materialize <new-directory>]");
const proposal = parse(fs.readFileSync(positionals[0], "utf8"));
const result = values.record ? recordEditionProposal(process.cwd(), proposal)
  : validateEditionProposal(process.cwd(), proposal, values.materialize);
process.stdout.write(JSON.stringify(result, null, 2) + "\n");
