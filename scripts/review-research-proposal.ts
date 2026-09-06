#!/usr/bin/env node
/** Model-free preview. --record appends to intake; --materialize writes a
 * prospective case to a new directory. Neither command publishes content. */
import fs from "node:fs";
import { parse } from "yaml";
import { recordResearchProposal, validateResearchProposal } from "./lib/research-proposals.ts";

const [file, ...args] = process.argv.slice(2);
if (!file || args.some((arg, i) => !["--record", "--materialize"].includes(arg) && args[i - 1] !== "--materialize"))
  throw new Error("usage: node scripts/review-research-proposal.ts <proposal.yaml> [--record] [--materialize <new-directory>]");
const outputIndex = args.indexOf("--materialize");
if (outputIndex >= 0 && (!args[outputIndex + 1] || args[outputIndex + 1].startsWith("--")))
  throw new Error("--materialize requires a new directory");
const raw = parse(fs.readFileSync(file, "utf8"));
const result = validateResearchProposal(process.cwd(), raw, outputIndex >= 0 ? args[outputIndex + 1] : undefined);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (args.includes("--record")) process.stdout.write(`${JSON.stringify(recordResearchProposal(process.cwd(), raw))}\n`);
