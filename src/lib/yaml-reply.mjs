import { parse as parseYaml } from "yaml";

/**
 * A model's YAML reply, read tolerantly: a code fence around it and up to
 * five trailing lines that are not YAML (a vendor's footer, a sign-off) are
 * set aside. One reader, because the check verb installs what it parses
 * (src/pipeline/check.ts) and the panel's packet compares a raw reply with
 * what was installed from it (src/lib/arbiter-core.mjs): the two must read a
 * reply the same way, or the comparison reports differences of its own making.
 *
 * @param {string} text
 * @returns {unknown}
 */
export function parseYamlReply(text) {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.split("\n").slice(1).join("\n");
    const fence = t.lastIndexOf("```");
    if (fence >= 0) t = t.slice(0, fence);
  }
  const lines = t.trim().split("\n");
  let lastErr;
  for (let drop = 0; drop <= Math.min(5, lines.length - 1); drop++) {
    try {
      return parseYaml(lines.slice(0, lines.length - drop).join("\n"));
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}
