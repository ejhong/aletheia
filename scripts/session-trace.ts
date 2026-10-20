#!/usr/bin/env node
/**
 * The digest of an operator session's trace, made on the session's own machine so that the trace — everything the
 * session read — never leaves it: `node session-trace.ts <trace.jsonl> <digest.json>`. The workflow runs main's copy,
 * from the plan, after the session ends (.github/workflows/operator.yml); it needs only src/engine/trace.ts, which
 * imports nothing. On a fresh machine, `site session-trace` checks the digest and keeps it.
 */
import fs from "node:fs";
import { digestTrace } from "../src/engine/trace.ts";

const [trace, out] = process.argv.slice(2);
if (!trace || !out) {
  console.error("usage: session-trace.ts <trace.jsonl> <digest.json>");
  process.exit(2);
}
const d = digestTrace(fs.existsSync(trace) ? fs.readFileSync(trace, "utf8") : "");
fs.writeFileSync(out, `${JSON.stringify(d, null, 2)}\n`);
console.log(`the session ${d.ended === "cut_off" ? "was cut off before its final report" : `ended ${d.ended}`}: ${d.turns ?? "?"} turns, ${d.tools.reduce((n, t) => n + t.calls, 0)} tool calls`);
