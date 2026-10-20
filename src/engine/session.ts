import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";
import type { RunRecord } from "../domain/intake.ts";
import { runsDir } from "../domain/runs.ts";
import { spendRunFile } from "../domain/spend.ts";
import { writeRun } from "./store.ts";
import { commandOf, DOI, HOST, OTHER, toolOf, traceSection, type TraceDigest } from "./trace.ts";

/**
 * An operator session's account: the run record (runs/<runId>/run.yaml), the
 * spend rows (governance/spend/<runId>.yaml) and the session's log
 * (runs/<runId>/log.md), from what Claude Code reports when the session ends
 * (the final report of `claude -p … --output-format stream-json`); and the
 * digest of its trace (runs/<runId>/trace.yaml), below. The cost is the
 * vendor's, as Claude Code reports it per model; nothing is estimated. A
 * session that wrote no log of its own gets its final message as the log,
 * said so.
 */

export interface SessionReport {
  is_error?: boolean;
  subtype?: string;
  num_turns?: number;
  result?: string;
  session_id?: string;
  total_cost_usd?: number;
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
  modelUsage?: Record<string, { inputTokens?: number; outputTokens?: number; cacheReadInputTokens?: number; cacheCreationInputTokens?: number; costUSD?: number }>;
}

export interface SessionClose {
  runId: string;
  date: string;
  /** The case the session worked on, or "site" for work across cases. */
  subject: string;
  model: string;
  /** The operator's charter, by commit: the instructions the session ran under. */
  promptVersion: string;
  report: SessionReport;
  root?: string;
}

/** Spend rows from the report: one per model Claude Code says it used, priced as it reports. */
export function sessionSpendRows(c: Pick<SessionClose, "runId" | "date" | "subject" | "model" | "report">) {
  const per = Object.entries(c.report.modelUsage ?? {});
  if (per.length) {
    return per.map(([model, u]) => ({
      date: c.date,
      runId: c.runId,
      verb: "session",
      case: c.subject,
      model,
      calls: 1,
      inputTokens: u.inputTokens ?? 0,
      outputTokens: u.outputTokens ?? 0,
      cacheReadTokens: u.cacheReadInputTokens ?? 0,
      cacheWriteTokens: u.cacheCreationInputTokens ?? 0,
      usd: u.costUSD ?? null,
    }));
  }
  const u = c.report.usage ?? {};
  return [
    {
      date: c.date,
      runId: c.runId,
      verb: "session",
      case: c.subject,
      model: c.model,
      calls: 1,
      inputTokens: u.input_tokens ?? 0,
      outputTokens: u.output_tokens ?? 0,
      cacheReadTokens: u.cache_read_input_tokens ?? 0,
      cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
      usd: c.report.total_cost_usd ?? null,
    },
  ];
}

export function closeSession(c: SessionClose): { files: string[]; usd: number | null } {
  const root = c.root ?? process.cwd();
  const rows = sessionSpendRows(c);
  const spend = spendRunFile(c.runId, root);
  fs.mkdirSync(path.dirname(spend), { recursive: true });
  fs.writeFileSync(spend, `# What operator session ${c.runId} cost, as Claude Code reported it (src/engine/session.ts).\n` + stringifyYaml(rows, { lineWidth: 0 }));
  const usd = rows.every((r) => r.usd !== null) ? Number(rows.reduce((n, r) => n + (r.usd ?? 0), 0).toFixed(6)) : null;
  const log = path.join(runsDir(root), c.runId, "log.md");
  const files = [path.relative(root, spend)];
  if (!fs.existsSync(log)) {
    fs.mkdirSync(path.dirname(log), { recursive: true });
    fs.writeFileSync(log, `# Session ${c.runId}\n\nThe session wrote no log of its own; this is its final message, as Claude Code returned it.\n\n${(c.report.result ?? "(no final message)").trim()}\n`);
    files.push(path.relative(root, log));
  }
  const failed = c.report.is_error === true || (c.report.subtype !== undefined && c.report.subtype !== "success");
  const record: RunRecord = {
    runId: c.runId,
    verb: "session",
    case: c.subject,
    date: c.date,
    model: c.model,
    promptVersion: c.promptVersion,
    inputHash: null,
    outcome: failed ? "failed" : "completed",
    cost: {
      calls: c.report.num_turns ?? rows.length,
      inputTokens: rows.reduce((n, r) => n + r.inputTokens + r.cacheReadTokens + r.cacheWriteTokens, 0),
      outputTokens: rows.reduce((n, r) => n + r.outputTokens, 0),
      usd,
    },
    notes: `${failed ? `ended ${c.report.subtype ?? "with an error"}; ` : ""}${c.report.num_turns ?? "?"} turns; the log is runs/${c.runId}/log.md`,
  };
  files.push(path.relative(root, path.join(writeRun(record, root), "run.yaml")));
  return { files, usd };
}

// ------------------------------------------------------------------ the session's trace

const count = z.number().int().min(0);
/** A name the digest's own rules would have kept: a fixed point of the rule, or the stand-in for one it would not. */
const kept = (rule: (s: string) => string) => z.string().refine((s) => rule(s) === s, "not a name the digest keeps");
const host = z.string().refine((s) => s === OTHER || HOST.test(s), "not a host");

/**
 * A session's trace digest (src/engine/trace.ts) as it arrives from the session's machine: data, kept only when it is
 * a digest — counts, and names each of which the digest's rules would have produced — so that whatever wrote the
 * file, nothing else of the trace reaches the repository.
 */
export const TraceDigestSchema = z
  .object({
    version: z.literal(1),
    ended: z.string().regex(/^[a-z_]{1,40}$/),
    model: z.string().regex(/^[A-Za-z0-9._:[\]-]{1,80}$/).nullable(),
    permissionMode: z.string().regex(/^[A-Za-z]{1,20}$/).nullable(),
    turns: count.nullable(),
    minutes: z.number().min(0).nullable(),
    usd: z.number().min(0).nullable(),
    compactions: count,
    unreadableLines: count,
    tools: z.array(z.object({ tool: kept(toolOf), calls: count, failed: count, refused: count }).strict()).max(40),
    commands: z.array(z.object({ command: kept(commandOf), calls: count, failed: count, refused: count }).strict()).max(40),
    fetched: z.array(z.object({ host, calls: count, failed: count }).strict()).max(40),
    read: z.array(z.object({ source: z.string().refine((s) => s === OTHER || HOST.test(s) || DOI.test(s), "not a DOI or a host"), calls: count, failed: count }).strict()).max(40),
    filesEdited: count,
    repeatedFailures: count,
  })
  .strict();

/** Keeps a session's trace digest as runs/<runId>/trace.yaml, once it is checked; throws when it is not a digest. */
export function writeTrace(runId: string, digest: unknown, root = process.cwd()): string {
  const d: TraceDigest = TraceDigestSchema.parse(digest);
  const file = path.join(runsDir(root), runId, "trace.yaml");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    `# What operator session ${runId} did, as its trace recorded it: the digest the workflow made on the session's machine\n# (src/engine/trace.ts), checked here (src/engine/session.ts). The session's own account of its work is its log.\n` + stringifyYaml(d, { lineWidth: 0 }),
  );
  return path.relative(root, file);
}

/** A session's place in time, from its run id (<date>-session-<subject>-<HHMMSS>): the date, then the clock. */
const when = (runId: string) => {
  const m = /^(\d{4}-\d{2}-\d{2})-.*-(\d{6})$/.exec(runId);
  return m ? `${m[1]} ${m[2]}` : runId;
};

/** Every session's trace digest, oldest first. One that is not a digest is passed over, never repaired. */
export function readTraces(root = process.cwd()): { runId: string; digest: TraceDigest }[] {
  const dir = runsDir(root);
  if (!fs.existsSync(dir)) return [];
  const out: { runId: string; digest: TraceDigest }[] = [];
  for (const runId of fs.readdirSync(dir)) {
    const file = path.join(dir, runId, "trace.yaml");
    if (!fs.existsSync(file)) continue;
    try {
      const parsed = TraceDigestSchema.safeParse(parseYaml(fs.readFileSync(file, "utf8")));
      if (parsed.success) out.push({ runId, digest: parsed.data });
    } catch {
      /* not YAML: passed over */
    }
  }
  return out.sort((a, b) => when(a.runId).localeCompare(when(b.runId)));
}

/** A session's trace digest as its pull request gives it, beneath the session's log; or that it left none. */
export function traceSummary(runId: string, root = process.cwd()): string {
  const t = readTraces(root).find((x) => x.runId === runId);
  return t ? traceSection(runId, t.digest) : "\n---\n\n*The session left no digest of its trace; the workflow's run says why.*";
}
