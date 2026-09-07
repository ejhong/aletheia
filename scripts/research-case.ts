#!/usr/bin/env node
import { researchCase } from "./lib/case-research.ts";

const [key, flag, reconsider, ...extra] = process.argv.slice(2);
if (!key || (flag && flag !== "--reconsider") || (flag && !reconsider) || extra.length)
  throw new Error('Usage: node scripts/research-case.ts <case> [--reconsider "what warrants another report"]');
console.log(`Preparing a web investigation of ${key}; the report is working material, not a published finding.`);
const result = await researchCase(process.cwd(), key, { reconsider });
console.log(JSON.stringify(result, null, 2));
if (result.outcome === "failed") process.exitCode = 1;
