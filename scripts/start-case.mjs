#!/usr/bin/env node
/** Seed a case as a proposal. No model calls and no invented review history. */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { topicSeed } from "./lib/topic-seed.mjs";

const { values } = parseArgs({
  options: {
    id: { type: "string" },
    slug: { type: "string" },
    title: { type: "string" },
    question: { type: "string" },
    domain: { type: "string" },
    output: { type: "string" },
  },
});
if (
  ![values.id, values.slug, values.title, values.question, values.domain].every(
    Boolean,
  )
) {
  throw new Error(
    'usage: node scripts/start-case.mjs --id XYZ-001 --slug a-question --title "A question" --question "What would we like to find out?" --domain "Research domain" [--output path]',
  );
}
const files = topicSeed({
  ...values,
  date: new Date().toISOString().slice(0, 10),
});
const destination = path.resolve(
  values.output ?? path.join("proposals", "topics", values.slug),
);
// mkdir without recursive on the destination is deliberately exclusive.
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.mkdirSync(destination);
for (const [file, content] of Object.entries(files))
  fs.writeFileSync(path.join(destination, file), content, { flag: "wx" });
console.log(
  `Unassessed topic created at ${destination}. No claims, evidence, priority, or review invented.`,
);
