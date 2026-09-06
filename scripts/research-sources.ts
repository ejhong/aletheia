#!/usr/bin/env node
/** A supplied-source adapter to the same bounded reader used by the queue. */
import { researchSources, MAX_RESEARCH_SOURCES } from "./lib/source-research.ts";
import { fingerprint } from "./lib/review-state.mjs";

const [key, ...urls] = process.argv.slice(2);
if (!key || urls.length < 1 || urls.length > MAX_RESEARCH_SOURCES || new Set(urls).size !== urls.length)
  throw new Error("usage: node scripts/research-sources.ts <case> <public-https-url> [second-url] (at most two distinct sources)");
const report = await researchSources(process.cwd(), urls.map(url => ({ case: key, url, key: fingerprint({ case: key, url }) })));
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.failure && !report.proposals.length) process.exitCode = 1;
