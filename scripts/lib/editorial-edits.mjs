/**
 * Pure text-editing primitives for the editorial audit pass
 * (scripts/reassess-changed.mjs). Kept separate and dependency-free so the
 * logic that rewrites human-written articles is directly testable.
 */
/**
 * Re-emit one YAML block-folded scalar at a given indent, preserving
 * paragraph breaks (a blank line inside a folded block) and wrapping to the
 * house width.
 *
 * We splice a single scalar's source span rather than re-serializing the
 * file, because a full round-trip through the YAML printer re-folds every
 * other scalar too — turning a one-sentence correction into a 160-line diff
 * that no human would read closely. Reviewability is a safety property here.
 */
export function foldScalar(value, indent, width = 76) {
  const pad = " ".repeat(indent);
  return value
    .split("\n")
    .map((para) => {
      const words = para.split(/\s+/).filter(Boolean);
      if (words.length === 0) return "";
      const lines = [];
      let line = "";
      for (const w of words) {
        if (line && (pad + line + " " + w).length > width) {
          lines.push(pad + line);
          line = w;
        } else line = line ? line + " " + w : w;
      }
      if (line) lines.push(pad + line);
      return lines.join("\n");
    })
    .join("\n\n");
}

/** Inline annotations the narrative must never silently lose. */
export function claimRefs(md) {
  return [...md.matchAll(/\]\{claim=([A-Z0-9-]+)\}/g)].map((m) => m[1]);
}
export function plateRefs(md) {
  return [...md.matchAll(/^\{plate:(IMG-[A-Z0-9-]+)\}$/gm)].map((m) => m[1]);
}

/**
 * Apply exact-string edits to text, failing closed. An edit whose `find` is
 * not present exactly once is skipped and reported rather than guessed at —
 * a fuzzy match here would silently rewrite the wrong sentence.
 */
export function applyTextEdits(text, edits, label, rejected) {
  let out = text;
  const applied = [];
  for (const e of edits) {
    if (typeof e.find !== "string" || typeof e.replace !== "string") {
      rejected.push(`${label}: edit missing find/replace`);
      continue;
    }
    if (e.find.length < 60) {
      rejected.push(`${label}: find span too short to be unambiguous (${e.find.length} chars)`);
      continue;
    }
    if (e.find === e.replace) {
      rejected.push(`${label}: no-op edit`);
      continue;
    }
    const first = out.indexOf(e.find);
    if (first === -1) {
      rejected.push(`${label}: find span not present verbatim — "${e.find.slice(0, 60)}…"`);
      continue;
    }
    if (out.indexOf(e.find, first + 1) !== -1) {
      rejected.push(`${label}: find span is ambiguous (appears more than once)`);
      continue;
    }
    out = out.slice(0, first) + e.replace + out.slice(first + e.find.length);
    applied.push(e);
  }
  return { out, applied };
}
