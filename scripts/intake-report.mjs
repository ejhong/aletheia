#!/usr/bin/env node
/** Read-only, model-free intake inspection; identifiers need not be new to be useful. */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { parse } from "yaml";
import { intakeContext, readIntakeMemory } from "./lib/intake-memory.mjs";

const { values } = parseArgs({
  options: {
    case: { type: "string" },
    source: { type: "string" },
    title: { type: "string" },
    "watch-run": { type: "string" },
  },
});
if (!values.case || (values.source && values["watch-run"])) {
  throw new Error(
    "usage: node scripts/intake-report.mjs --case <directory or slug> [--source <URL or identifier> | --watch-run <run-id>]",
  );
}
const memory = readIntakeMemory();
values.case = memory.caseAliases[values.case] ?? values.case;
if (!Object.hasOwn(memory.sourcesByCase, values.case))
  throw new Error(`unknown case: ${values.case}`);
let items;
if (values["watch-run"]) {
  if (!/^watch-[a-z0-9-]+$/.test(values["watch-run"]))
    throw new Error("invalid watch run id");
  const file = path.join(
    "proposals",
    "watch",
    values["watch-run"],
    `${values.case}.yaml`,
  );
  items = parse(fs.readFileSync(file, "utf8"))?.items;
  if (!Array.isArray(items)) throw new Error(`${file}: missing items`);
} else if (values.source) {
  items = [
    {
      url: values.source,
      identifier: values.source,
      title: values.title ?? "",
    },
  ];
} else items = null;
console.log(
  JSON.stringify(
    {
      case: values.case,
      ...(items
        ? {
            items: items.map((source) => ({
              source,
              context: intakeContext(
                { kind: "source", source },
                values.case,
                memory,
              ),
            })),
          }
        : {
            decisions: memory.decisions.filter(
              (entry) => entry.case === values.case,
            ),
          }),
    },
    null,
    2,
  ),
);
