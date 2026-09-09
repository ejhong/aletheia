import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { z } from "zod";

/**
 * The committed configuration under config/: models (src/lib/models.mjs),
 * tariffs (spend.ts), budget (budget.ts). One reader: the file must satisfy
 * its schema, and unless the caller supplies what a missing file means, it
 * must exist — configuration is never defaulted into existence silently.
 */

export const configFile = (name: string, root = process.cwd()) => path.join(root, "config", `${name}.yaml`);

export function loadConfig<S extends z.ZodType>(
  name: string,
  schema: S,
  opts: { root?: string; whyRequired?: string; ifMissing?: () => z.infer<S> } = {},
): z.infer<S> {
  const file = configFile(name, opts.root);
  if (!fs.existsSync(file)) {
    if (opts.ifMissing) return opts.ifMissing();
    throw new Error(`config/${name}.yaml is missing — ${opts.whyRequired ?? "it is required"}`);
  }
  return schema.parse(parseYaml(fs.readFileSync(file, "utf8")));
}
