import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { EditionSchema } from "../../src/domain/schema.ts";
import { fingerprint } from "./review-state.mjs";

/** A single immutable chain, with no mutable 'current' pointer or silent forks. */
export function readEditions(caseDir) {
  const dir = path.join(caseDir, "editions");
  if (!fs.existsSync(dir)) return [];
  const editions = fs.readdirSync(dir).filter(file => file.endsWith(".yaml")).map(file => {
    const edition = EditionSchema.parse(parse(fs.readFileSync(path.join(dir, file), "utf8")));
    if (file !== `${edition.runId}.yaml`) throw new Error(`edition filename differs from run id: ${file}`);
    return edition;
  }).sort((a, b) => Date.parse(a.generatedAt) - Date.parse(b.generatedAt) || a.runId.localeCompare(b.runId));
  for (let i = 0; i < editions.length; i++) {
    const current = editions[i];
    const previous = editions[i - 1];
    if (!previous) {
      if (current.previous) throw new Error("first edition references a missing predecessor");
    } else if (Date.parse(current.generatedAt) <= Date.parse(previous.generatedAt) ||
      current.previous?.runId !== previous.runId || current.previous.hash !== fingerprint(previous)) {
      throw new Error(`broken or forked edition history: ${current.runId}`);
    }
  }
  return editions;
}
