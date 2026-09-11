/**
 * The CLI's argument split, pure so it is testable: named flags that take a
 * value (`--steps 6`), bare flags (`--run`), and positional arguments. A
 * value-taking flag left off the list is read as a bare flag and its value
 * as a positional — which is how `--out next.json` went unread on
 * 2026-09-10 and a completed sitting opened its PR as "interrupted".
 */
export function splitArgs(rest: string[], valueFlags: Iterable<string>): { args: string[]; flags: Set<string>; values: Record<string, string> } {
  const names = new Set(valueFlags);
  const flags = new Set<string>();
  const args: string[] = [];
  const values: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (names.has(a)) values[a] = rest[++i] ?? "";
    else if (a.startsWith("--")) flags.add(a);
    else args.push(a);
  }
  return { args, flags, values };
}

/** Every flag the CLI reads a value for; a new one is added here, not at a call site. */
export const VALUE_FLAGS = ["--seat", "--seats", "--reconsider", "--steps", "--deadline-minutes", "--out", "--max-cases", "--busy"] as const;
