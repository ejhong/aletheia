import fs from "node:fs";
import path from "node:path";
import { stringify as stringifyYaml } from "yaml";
import type { RunRecord } from "../domain/intake.ts";
import { runsDir } from "../domain/runs.ts";
import { spendRunFile } from "../domain/spend.ts";
import { writeRun } from "./store.ts";

/**
 * An operator session's account: the run record (runs/<runId>/run.yaml), the
 * spend rows (governance/spend/<runId>.yaml) and the session's log
 * (runs/<runId>/log.md), from what Claude Code reports when the session ends
 * (`claude -p … --output-format json`). The cost is the vendor's, as Claude
 * Code reports it per model; nothing is estimated. A session that wrote no
 * log of its own gets its final message as the log, said so.
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
