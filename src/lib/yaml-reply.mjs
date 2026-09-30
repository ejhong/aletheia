import { parse as parseYaml, parseDocument, visit } from "yaml";

/**
 * A model's YAML reply, read tolerantly: a code fence around it and up to
 * five trailing lines that are not YAML (a vendor's footer, a sign-off) are
 * set aside. One reader, because the check verb installs what it parses
 * (src/pipeline/check.ts) and the panel's packet compares a raw reply with
 * what was installed from it (src/lib/arbiter-core.mjs): the two must read a
 * reply the same way, or the comparison reports differences of its own making.
 *
 * `readYamlReply` also returns what the reading left behind — the text it
 * set aside and the YAML's own comments — because none of that reaches the
 * parsed value, and a comparison of parsed values says nothing about it
 * (the Anthropic seat's note on #422).
 *
 * @param {string} text
 * @returns {{ data: unknown, outside: string, comments: string }} the parsed value; the text outside the YAML (the
 *   fence line, the closing fence and whatever follows it, trailing lines that would not parse); the YAML's comments
 */
export function readYamlReply(text) {
  let t = text.trim();
  const outside = [];
  if (t.startsWith("```")) {
    const [opening, ...rest] = t.split("\n");
    outside.push(opening);
    t = rest.join("\n");
    const fence = t.lastIndexOf("```");
    if (fence >= 0) {
      outside.push(t.slice(fence));
      t = t.slice(0, fence);
    }
  }
  const lines = t.trim().split("\n");
  let lastErr;
  for (let drop = 0; drop <= Math.min(5, lines.length - 1); drop++) {
    const body = lines.slice(0, lines.length - drop).join("\n");
    try {
      const data = parseYaml(body);
      if (drop) outside.push(lines.slice(lines.length - drop).join("\n"));
      return { data, outside: outside.join("\n"), comments: commentsOf(body) };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

/** Every comment in a YAML text, as the parser attaches them: before and after the document and each of its nodes. */
function commentsOf(body) {
  const doc = parseDocument(body);
  const found = [];
  const take = (node) => {
    if (node?.commentBefore) found.push(node.commentBefore);
    if (node?.comment) found.push(node.comment);
  };
  take(doc);
  visit(doc, { Node: (_key, node) => void take(node) });
  return found.join("\n");
}

/**
 * The reply's parsed value alone.
 * @param {string} text
 * @returns {unknown}
 */
export function parseYamlReply(text) {
  return readYamlReply(text).data;
}
