/**
 * What an operator session did, from its trace: the stream Claude Code writes as the session runs (`claude -p …
 * --output-format stream-json --verbose`), a message a line — the session's first message, the model's turns with
 * the tools they call, each tool's result, and the final report. The session's log is the operator's account of its
 * work; the trace is the record of it, and the digest is what of the record is kept (AGENTS.md §3.1: observation
 * before interpretation).
 *
 * The trace holds everything the session read — pages, filings, the text of sources, names a site does not print —
 * so the digest keeps only what cannot carry any of that: counts, tool names, the leading words of commands, the
 * hosts of the pages fetched, and the DOIs and hosts of the sources read. The workflow runs this file on the
 * session's own machine, from the plan (.github/workflows/operator.yml), so that the trace never leaves it; that
 * machine was the session's, so the digest is data, like the cost report: it informs the next session and the
 * reviewers, and decides nothing (src/engine/session.ts checks it before it is kept). It imports nothing, so that
 * it runs there alone.
 */

export interface ToolCount {
  tool: string;
  calls: number;
  failed: number;
  refused: number;
}
export interface CommandCount {
  command: string;
  calls: number;
  failed: number;
  refused: number;
}
export interface HostCount {
  host: string;
  calls: number;
  failed: number;
}
export interface SourceCount {
  source: string;
  calls: number;
  failed: number;
}

export interface TraceDigest {
  version: 1;
  /** The final report's subtype ("success", "error_max_budget_usd", …), or "cut_off" when the trace has none. */
  ended: string;
  /** The model and the permission mode the session ran under, as its first message gives them. */
  model: string | null;
  permissionMode: string | null;
  turns: number | null;
  minutes: number | null;
  usd: number | null;
  /** Times the session's context was compacted. */
  compactions: number;
  /** Lines that were not a message: a trace cut off mid-line, or output that is not the stream. */
  unreadableLines: number;
  /** A refused call is one the session's permissions did not allow; a failed call ran and came back an error. */
  tools: ToolCount[];
  /** The Bash calls, by their leading words. */
  commands: CommandCount[];
  /** The WebFetch calls, by host. */
  fetched: HostCount[];
  /** The `node scripts/site.ts read <url|doi>` calls, by DOI or host. */
  read: SourceCount[];
  /** Distinct files the session wrote or edited. */
  filesEdited: number;
  /** Calls that failed with the same input as an earlier call that had failed (the charter: no more than twice). */
  repeatedFailures: number;
}

/** What stands for a name the digest will not keep. */
export const OTHER = "(other)";
/** Each list keeps its most frequent entries. */
const LIMIT = 40;

export const HOST = /^[a-z0-9.-]{1,253}$/;
export const DOI = /^10\.\d{4,9}\/[A-Za-z0-9._;()/:<>-]{1,200}$/;
const WORD = /^[a-z][a-z0-9-]{0,39}$/;

/** A tool's name, when it is one: Claude Code's tools and MCP tools are words joined by underscores and hyphens. */
export function toolOf(name: unknown): string {
  return typeof name === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(name) ? name : OTHER;
}

/**
 * A command's leading words: the program and, for node, npm, npx and git — whose next words are a script and its
 * verb, or a subcommand — up to two more, each a plain lowercase word (for node, a script under scripts/). Never an
 * argument: not a path, a quotation, a URL or a name.
 */
export function commandOf(command: unknown): string {
  if (typeof command !== "string") return OTHER;
  const words = command.trim().split(/\s+/);
  const program = words[0] ?? "";
  if (!/^[a-z][a-z0-9._-]{0,39}$/.test(program)) return OTHER;
  const out = [program];
  if (program === "node") {
    if (/^scripts\/[a-z0-9-]{1,40}\.(ts|mjs|js)$/.test(words[1] ?? "")) {
      out.push(words[1]);
      if (WORD.test(words[2] ?? "")) out.push(words[2]);
    }
  } else if (program === "npm" || program === "npx" || program === "git") {
    if (WORD.test(words[1] ?? "")) {
      out.push(words[1]);
      if (program !== "git" && WORD.test(words[2] ?? "")) out.push(words[2]);
    }
  }
  return out.join(" ");
}

/** A URL's host, lowercased and without "www.": never its path or its query, which can carry a name. */
export function hostOf(url: unknown): string {
  if (typeof url !== "string") return OTHER;
  try {
    const host = new URL(url.trim()).hostname.toLowerCase().replace(/^www\./, "");
    return HOST.test(host) ? host : OTHER;
  } catch {
    return OTHER;
  }
}

/** What `site read` was given: a DOI as it is, since a DOI names a publication, or else a URL's host. */
export function sourceOf(target: unknown): string {
  if (typeof target !== "string") return OTHER;
  const t = target.replace(/^(["'])(.*)\1$/, "$2");
  const doi = /^(?:https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,9}\/.*)$/i.exec(t)?.[1];
  if (doi !== undefined) return DOI.test(doi) ? doi : OTHER;
  return hostOf(t);
}

type Json = Record<string, unknown>;
const isObject = (x: unknown): x is Json => typeof x === "object" && x !== null && !Array.isArray(x);
const amount = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null);
const EDITS = new Set(["Edit", "Write", "MultiEdit"]);

/** The digest of a trace, from its text. Pure; a line that is not a message is counted and passed over. */
export function digestTrace(text: string): TraceDigest {
  const messages: Json[] = [];
  let unreadableLines = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const m: unknown = JSON.parse(line);
      if (isObject(m)) messages.push(m);
      else unreadableLines++;
    } catch {
      unreadableLines++;
    }
  }
  const init = messages.find((m) => m.type === "system" && m.subtype === "init");
  const result = messages.findLast((m) => m.type === "result");
  const blocks = (m: Json) => (isObject(m.message) && Array.isArray(m.message.content) ? m.message.content.filter(isObject) : []);

  // Each tool call once, in the order the session made it, and the calls whose result came back an error.
  const calls: { id: string; tool: string; input: Json }[] = [];
  const seen = new Set<string>();
  const errored = new Set<string>();
  for (const m of messages) {
    for (const b of blocks(m)) {
      if (m.type === "assistant" && b.type === "tool_use" && typeof b.id === "string" && !seen.has(b.id)) {
        seen.add(b.id);
        calls.push({ id: b.id, tool: toolOf(b.name), input: isObject(b.input) ? b.input : {} });
      } else if (m.type === "user" && b.type === "tool_result" && typeof b.tool_use_id === "string" && b.is_error === true) errored.add(b.tool_use_id);
    }
  }
  // What the session's permissions refused, as the final report lists it: refused, not failed.
  const denials = result && Array.isArray(result.permission_denials) ? result.permission_denials : [];
  const refused = new Set(denials.filter(isObject).flatMap((d) => (typeof d.tool_use_id === "string" ? [d.tool_use_id] : [])));

  const tools = new Map<string, ToolCount>();
  const commands = new Map<string, CommandCount>();
  const fetched = new Map<string, HostCount>();
  const read = new Map<string, SourceCount>();
  const edited = new Set<string>();
  const failedInputs = new Set<string>();
  let repeatedFailures = 0;
  const bump = <T extends { calls: number; failed: number; refused?: number }>(map: Map<string, T>, key: string, make: () => T, failed: boolean, isRefused = false) => {
    const entry = map.get(key) ?? make();
    entry.calls++;
    if (failed) entry.failed++;
    if (isRefused && entry.refused !== undefined) entry.refused++;
    map.set(key, entry);
  };
  for (const c of calls) {
    const isRefused = refused.has(c.id);
    const failed = !isRefused && errored.has(c.id);
    bump(tools, c.tool, () => ({ tool: c.tool, calls: 0, failed: 0, refused: 0 }), failed, isRefused);
    if (c.tool === "Bash") {
      const command = commandOf(c.input.command);
      bump(commands, command, () => ({ command, calls: 0, failed: 0, refused: 0 }), failed, isRefused);
      const words = typeof c.input.command === "string" ? c.input.command.trim().split(/\s+/) : [];
      if (words[0] === "node" && words[1] === "scripts/site.ts" && words[2] === "read" && words[3] !== undefined && !isRefused) {
        const source = sourceOf(words[3]);
        bump(read, source, () => ({ source, calls: 0, failed: 0 }), failed);
      }
    } else if (c.tool === "WebFetch" && !isRefused) {
      const host = hostOf(c.input.url);
      bump(fetched, host, () => ({ host, calls: 0, failed: 0 }), failed);
    } else if (EDITS.has(c.tool) && !isRefused && !failed && typeof c.input.file_path === "string") edited.add(c.input.file_path);
    if (failed) {
      const key = `${c.tool}\u0000${JSON.stringify(c.input)}`;
      if (failedInputs.has(key)) repeatedFailures++;
      failedInputs.add(key);
    }
  }

  const ranked = <T extends { calls: number }>(map: Map<string, T>) =>
    [...map.entries()]
      .sort(([ka, a], [kb, b]) => b.calls - a.calls || ka.localeCompare(kb))
      .slice(0, LIMIT)
      .map(([, v]) => v);
  const subtype = result?.subtype;
  const ms = amount(result?.duration_ms);
  const turns = amount(result?.num_turns);
  const usd = amount(result?.total_cost_usd);
  return {
    version: 1,
    ended: !result ? "cut_off" : typeof subtype === "string" && /^[a-z_]{1,40}$/.test(subtype) ? subtype : result.is_error === true ? "error" : "success",
    model: typeof init?.model === "string" && /^[A-Za-z0-9._:[\]-]{1,80}$/.test(init.model) ? init.model : null,
    permissionMode: typeof init?.permissionMode === "string" && /^[A-Za-z]{1,20}$/.test(init.permissionMode) ? init.permissionMode : null,
    turns: turns === null ? null : Math.round(turns),
    minutes: ms === null ? null : Math.round(ms / 6000) / 10,
    usd: usd === null ? null : Number(usd.toFixed(4)),
    compactions: messages.filter((m) => m.type === "system" && m.subtype === "compact_boundary").length,
    unreadableLines,
    tools: ranked(tools),
    commands: ranked(commands),
    fetched: ranked(fetched),
    read: ranked(read),
    filesEdited: edited.size,
    repeatedFailures,
  };
}

// ------------------------------------------------------------------ as the status and the pull request say it

const callsIn = (d: TraceDigest) => d.tools.reduce((n, t) => n + t.calls, 0);
/** The first few of a list, and "…" for the rest. */
const few = (xs: string[], most: number) => (xs.length > most ? [...xs.slice(0, most), "…"] : xs);
/** The entries with a count, the largest first (ties keep their order: the most called first). */
const most = <T,>(xs: T[], n: (x: T) => number) => xs.filter((x) => n(x) > 0).sort((a, b) => n(b) - n(a));

/** What failed, by tool, with the commands and hosts within: "WebFetch 3 of 12 (sciencedirect.com 2, x.com 1)". */
function failures(d: TraceDigest, code: (s: string) => string, top: number): string[] {
  const failed = (x: { failed: number }) => x.failed;
  return few(
    most(d.tools, failed).map((t) => {
      const within = t.tool === "Bash" ? most(d.commands, failed).map((c) => `${code(c.command)} ${c.failed}`) : t.tool === "WebFetch" ? most(d.fetched, failed).map((h) => `${h.host} ${h.failed}`) : [];
      return `${t.tool} ${t.failed} of ${t.calls}${within.length ? ` (${few(within, top).join(", ")})` : ""}`;
    }),
    top,
  );
}

/** What the session's permissions refused, by tool, with the commands within. */
function refusals(d: TraceDigest, code: (s: string) => string, top: number): string[] {
  const refused = (x: { refused: number }) => x.refused;
  return few(
    most(d.tools, refused).map((t) => {
      const within = t.tool === "Bash" ? most(d.commands, refused).map((c) => `${code(c.command)} ${c.refused}`) : [];
      return `${t.tool} ${t.refused}${within.length ? ` (${few(within, top).join(", ")})` : ""}`;
    }),
    top,
  );
}

const endedIn = (d: TraceDigest) => (d.ended === "cut_off" ? "cut off before its final report" : `ended ${d.ended}`);

/** One session's digest in a line, as `site status` gives it to the next session. */
export function traceLine(runId: string, d: TraceDigest): string {
  const how = [d.turns !== null ? `${d.turns} turns` : null, d.usd !== null ? `$${d.usd.toFixed(2)}` : null, `${callsIn(d)} tool calls`].filter(Boolean).join(", ");
  const parts = [`${runId}: ${endedIn(d)} (${how})`];
  const failed = failures(d, (s) => s, 4);
  parts.push(failed.length ? `failed: ${failed.join(", ")}` : "nothing failed");
  const refused = refusals(d, (s) => s, 4);
  if (refused.length) parts.push(`refused: ${refused.join(", ")}`);
  if (d.repeatedFailures) parts.push(`repeated after failing: ${d.repeatedFailures}`);
  return parts.join("; ");
}

/** One session's digest as its pull request gives it, beneath the session's own log. */
export function traceSection(runId: string, d: TraceDigest): string {
  const code = (s: string) => `\`${s}\``;
  const how = [d.turns !== null ? `${d.turns} turns` : null, d.minutes !== null ? `${Math.round(d.minutes)} minutes` : null, d.usd !== null ? `$${d.usd.toFixed(2)}` : null].filter(Boolean).join(", ");
  const ran = [d.model, d.permissionMode ? `permission mode ${d.permissionMode}` : null].filter(Boolean).join(", ");
  const list = <T extends { calls: number }>(xs: T[], name: (x: T) => string) =>
    few(
      xs.map((x) => `${name(x)}${x.calls > 1 ? ` (${x.calls})` : ""}`),
      12,
    ).join(", ");
  const failed = failures(d, code, 8);
  const refused = refusals(d, code, 8);
  const lines = [
    "",
    "---",
    "",
    "### What the session did",
    "",
    `*The workflow's digest of the session's trace — the stream Claude Code recorded as the session ran (\`runs/${runId}/trace.yaml\`) — beside the operator's own account above. It keeps counts, tool names, the leading words of commands and the hosts of pages, never what the session read.*`,
    "",
    `- **Ended:** ${endedIn(d).replace(/^ended /, "")}${how ? `, after ${how}` : ""}${ran ? ` (${ran})` : ""}${d.compactions ? `; its context was compacted ${d.compactions === 1 ? "once" : `${d.compactions} times`}` : ""}.`,
    `- **Tool calls:** ${callsIn(d)}${d.tools.length ? ` — ${few(d.tools.map((t) => `${t.tool} ${t.calls}`), 10).join(", ")}` : ""}.`,
    `- **Failed:** ${failed.length ? failed.join("; ") : "nothing"}.${d.repeatedFailures ? ` Repeated after failing: ${d.repeatedFailures}.` : ""}`,
  ];
  if (refused.length) lines.push(`- **Refused by the session's permissions:** ${refused.join("; ")}.`);
  if (d.read.length) lines.push(`- **Sources read with \`site read\`:** ${list(d.read, (s) => s.source)}.`);
  if (d.fetched.length) lines.push(`- **Pages fetched, by host:** ${list(d.fetched, (h) => h.host)}.`);
  lines.push(`- **Files written or edited:** ${d.filesEdited}.`);
  if (d.unreadableLines) lines.push(`- **Lines of the trace that were not a message:** ${d.unreadableLines}.`);
  return lines.join("\n");
}
