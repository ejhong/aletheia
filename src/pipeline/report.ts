import fs from "node:fs";
import path from "node:path";
import { sha256Hex } from "../domain/hash.ts";
import { loadAllCases } from "../domain/load.ts";
import type { LoadedCase } from "../domain/schema.ts";
import { anthropicResearch, HOUSE_MODEL, openaiDeepResearch, type Meter, type ResearchResult } from "./models.ts";
import { buildPacket, renderPacket } from "./packet.ts";
import { loadProtocol, renderProtocol } from "./protocols.ts";
import { spendFor, sumCost } from "./spend.ts";
import { newRunId, readRuns, runDir, writeRun, writeWorkingFile } from "./store.ts";

/**
 * `aletheia report <case>` — investigate (docs/AUTOMATION.md, "The verbs").
 *
 * The packet goes to a browsing research model with the report protocol;
 * the reply is saved as working material under proposals/<runId>/ and
 * never becomes a record. Two seats, one interface; the seat is a flag.
 * Unchanged inputs rest: the same packet to the same seat under the same
 * protocol is not sent twice unless a reason is given.
 */

export type ResearchSeat = "openai" | "anthropic";

export const RESEARCH_SEATS = {
  openai: { model: "o4-mini-deep-research", maxToolCalls: 40 },
  anthropic: { model: HOUSE_MODEL, maxSearches: 30, maxFetches: 15 },
} as const;
/** The seat `aletheia report` uses when none is named: the house model, browsing. */
export const DEFAULT_SEAT: ResearchSeat = "anthropic";

export type Researcher = (
  seat: ResearchSeat,
  instructions: string,
  input: string,
  meter: Meter,
) => Promise<ResearchResult>;

export const defaultResearcher: Researcher = (seat, instructions, input, meter) =>
  seat === "openai"
    ? openaiDeepResearch(
        { model: RESEARCH_SEATS.openai.model, instructions, input, maxToolCalls: RESEARCH_SEATS.openai.maxToolCalls },
        meter,
      )
    : anthropicResearch(
        {
          model: RESEARCH_SEATS.anthropic.model,
          system: instructions,
          user: input,
          maxSearches: RESEARCH_SEATS.anthropic.maxSearches,
          maxFetches: RESEARCH_SEATS.anthropic.maxFetches,
        },
        meter,
      );

export interface ReportOptions {
  seat: ResearchSeat;
  dryRun?: boolean;
  /** A stated reason to run again on unchanged inputs. */
  reconsider?: string;
  root?: string;
  deps?: { research?: Researcher; now?: () => Date; cases?: () => LoadedCase[] };
}

export interface ReportOutcome {
  outcome: "completed" | "failed" | "dry-run" | "rested";
  runId: string;
  reason?: string;
  reportFile?: string;
  cost?: ReturnType<typeof sumCost>;
}

export function findCase(key: string, cases = loadAllCases()): LoadedCase {
  const loaded = cases.find((c) => c.record.slug === key || c.dir === key);
  if (!loaded) throw new Error(`no case with slug or directory "${key}"`);
  return loaded;
}

/** The latest completed report run for a case, and its text. */
export function previousReport(slug: string, root = process.cwd()): { runId: string; inputHash: string | null; text: string } | null {
  const run = readRuns(root)
    .filter((r) => r.verb === "report" && r.case === slug && r.outcome === "completed")
    .at(-1);
  if (!run) return null;
  const file = path.join(runDir(run.runId, root), "report.md");
  return { runId: run.runId, inputHash: run.inputHash, text: fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "" };
}

export async function runReport(caseKey: string, opts: ReportOptions): Promise<ReportOutcome> {
  const root = opts.root ?? process.cwd();
  const now = opts.deps?.now ?? (() => new Date());
  const loaded = findCase(caseKey, opts.deps?.cases?.());
  const slug = loaded.record.slug;
  const prior = previousReport(slug, root);
  const packet = buildPacket(loaded, { previousReport: prior?.text });
  const input = renderPacket(packet);
  const protocol = loadProtocol("report");
  const instructions = renderProtocol(protocol, {});
  // Rest on the case, not on the previous report: a completed report changes
  // the next packet by construction and must not make the same case due again.
  const inputHash = sha256Hex(
    [opts.seat, protocol.version, instructions, renderPacket(buildPacket(loaded))].join("\n \n"),
  );
  const date = now().toISOString().slice(0, 10);
  const runId = newRunId("report", slug, now());
  const model = RESEARCH_SEATS[opts.seat].model;
  const base = { runId, verb: "report" as const, case: slug, date, model, promptVersion: protocol.version, inputHash };
  const zero = { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0 };

  if (prior && prior.inputHash === inputHash && !opts.reconsider) {
    const reason = `unchanged inputs since ${prior.runId} (same packet, seat, and protocol); pass --reconsider "why" to run anyway`;
    writeRun({ ...base, outcome: "rested", cost: zero, notes: reason }, root);
    return { outcome: "rested", runId, reason };
  }
  if (opts.dryRun) {
    writeWorkingFile(runId, "packet.json", input, root);
    writeWorkingFile(runId, "instructions.md", instructions, root);
    writeRun({ ...base, outcome: "dry-run", cost: zero, notes: `would send ${input.length} chars to ${model}` }, root);
    return { outcome: "dry-run", runId, reason: `packet and instructions written under proposals/${runId}/; nothing sent` };
  }

  const meter: Meter = { runId, verb: "report", case: slug, root };
  try {
    const result = await (opts.deps?.research ?? defaultResearcher)(opts.seat, instructions, input, meter);
    const header =
      `<!-- Unverified AI research report — working material, never citable (docs/AUTOMATION.md).\n` +
      `     runId ${runId} · seat ${opts.seat} · model ${result.model} · protocol ${protocol.version} · ${date}\n` +
      `     searches ${result.searches} · fetches ${result.fetches} · tokens in ${result.usage.inputTokens} out ${result.usage.outputTokens}` +
      (opts.reconsider ? `\n     reconsidered because: ${opts.reconsider}` : "") +
      ` -->\n\n`;
    const reportFile = writeWorkingFile(runId, "report.md", header + result.text.trim() + "\n", root);
    writeWorkingFile(runId, "citations.json", JSON.stringify(result.citations, null, 2), root);
    writeWorkingFile(runId, "raw.json", JSON.stringify(result.raw, null, 1), root);
    const cost = sumCost(spendFor(runId, root));
    writeRun({ ...base, model: result.model, outcome: "completed", cost }, root);
    return { outcome: "completed", runId, reportFile, cost };
  } catch (e) {
    const reason = (e as Error).message;
    writeRun({ ...base, outcome: "failed", cost: sumCost(spendFor(runId, root)), notes: reason }, root);
    return { outcome: "failed", runId, reason };
  }
}
