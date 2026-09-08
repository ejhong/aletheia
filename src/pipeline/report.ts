import fs from "node:fs";
import path from "node:path";
import { sha256Hex } from "../domain/hash.ts";
import { findCase } from "../domain/load.ts";
import type { LoadedCase } from "../domain/schema.ts";
import { MODELS } from "../../scripts/lib/models.mjs";
import { anthropicResearch, compactRaw, openaiResearch, type Meter, type ResearchResult } from "./models.ts";
import { buildPacket, renderPacket } from "./packet.ts";
import { loadProtocol, renderProtocol } from "./protocols.ts";
import { closeRun, openRun, readRuns, runDir, writeWorkingFile, type RunOutcome } from "./store.ts";

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

/** The seats and the default, from config/models.yaml — the one place a model is chosen. */
export const RESEARCH_SEATS = MODELS.research.seats;
export const DEFAULT_SEAT: ResearchSeat = MODELS.research.default;

export type Researcher = (
  seat: ResearchSeat,
  instructions: string,
  input: string,
  meter: Meter,
) => Promise<ResearchResult>;

export const defaultResearcher: Researcher = (seat, instructions, input, meter) =>
  seat === "openai"
    ? openaiResearch(
        { model: RESEARCH_SEATS.openai.model, effort: RESEARCH_SEATS.openai.effort, instructions, input, maxToolCalls: RESEARCH_SEATS.openai.maxToolCalls },
        meter,
      )
    : anthropicResearch(
        {
          model: RESEARCH_SEATS.anthropic.model,
          fallback: RESEARCH_SEATS.anthropic.fallback,
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

export interface ReportOutcome extends RunOutcome {
  reportFile?: string;
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
  const model = RESEARCH_SEATS[opts.seat].model;
  const run = openRun("report", slug, { model, promptVersion: protocol.version, inputHash }, { now: now(), root });
  const { runId, date } = run;

  if (prior && prior.inputHash === inputHash && !opts.reconsider) {
    return closeRun(run, "rested", { reason: `unchanged inputs since ${prior.runId} (same packet, seat, and protocol); pass --reconsider "why" to run anyway` });
  }
  if (opts.dryRun) {
    writeWorkingFile(runId, "packet.json", input, root);
    writeWorkingFile(runId, "instructions.md", instructions, root);
    return closeRun(run, "dry-run", { reason: `packet and instructions written under proposals/${runId}/ (${input.length} chars for ${model}); nothing sent` });
  }

  try {
    const result = await (opts.deps?.research ?? defaultResearcher)(opts.seat, instructions, input, run.meter);
    const header =
      `<!-- Unverified AI research report — working material, never citable (docs/AUTOMATION.md).\n` +
      `     runId ${runId} · seat ${opts.seat} · model ${result.model} · protocol ${protocol.version} · ${date}\n` +
      `     searches ${result.searches} · fetches ${result.fetches} · tokens in ${result.usage.inputTokens} out ${result.usage.outputTokens}` +
      (opts.reconsider ? `\n     reconsidered because: ${opts.reconsider}` : "") +
      ` -->\n\n`;
    const reportFile = writeWorkingFile(runId, "report.md", header + result.text.trim() + "\n", root);
    writeWorkingFile(runId, "citations.json", JSON.stringify(result.citations, null, 2), root);
    writeWorkingFile(runId, "raw.json", JSON.stringify(compactRaw(result.raw), null, 1), root);
    return { ...closeRun(run, "completed", { model: result.model }), reportFile };
  } catch (e) {
    return closeRun(run, "failed", { reason: (e as Error).message });
  }
}
