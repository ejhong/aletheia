import fs from "node:fs";
import path from "node:path";

/**
 * Protocols are committed, versioned prompt files under protocols/ — one
 * per model-involving verb (docs/AUTOMATION.md, "The protocols"). A
 * `promptVersion` stamp on any record is a protocol's file stem, so a
 * reader can open the exact text a model was given.
 *
 * A protocol file is Markdown. Everything after the first line beginning
 * `---` is the prompt; the lines before it are a human preface that is not
 * sent. `{{name}}` placeholders are filled by the verb at run time; a
 * placeholder left unfilled is an error, never sent as literal braces.
 */

const PROTOCOLS_DIR = path.join(process.cwd(), "protocols");

export interface Protocol {
  /** e.g. "check-v1" — the promptVersion stamp. */
  version: string;
  /** The prompt text, placeholders unfilled. */
  text: string;
}

/** The highest-numbered version of a protocol, e.g. loadProtocol("check") → check-v2 if present. */
export function loadProtocol(name: string): Protocol {
  const files = fs
    .readdirSync(PROTOCOLS_DIR)
    .filter((f) => new RegExp(`^${name}-v\\d+\\.md$`).test(f))
    .sort((a, b) => versionOf(a) - versionOf(b));
  const file = files.at(-1);
  if (!file) throw new Error(`no protocol named ${name} under protocols/`);
  const raw = fs.readFileSync(path.join(PROTOCOLS_DIR, file), "utf8");
  const cut = raw.indexOf("\n---");
  const text = cut === -1 ? raw : raw.slice(raw.indexOf("\n", cut + 1) + 1);
  return { version: file.replace(/\.md$/, ""), text: text.trim() };
}

function versionOf(file: string): number {
  return Number(file.match(/-v(\d+)\.md$/)?.[1] ?? 0);
}

/** Fill `{{name}}` placeholders. Throws if any remain. */
export function renderProtocol(protocol: Protocol, vars: Record<string, string | number>): string {
  let out = protocol.text;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(String(v));
  }
  const left = out.match(/\{\{[a-zA-Z0-9_]+\}\}/g);
  if (left) throw new Error(`${protocol.version}: unfilled placeholders ${[...new Set(left)].join(", ")}`);
  return out;
}
