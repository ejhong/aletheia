import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { currentEdition, findCase } from "../domain/load.ts";
import { AssessmentRunSchema, type AssessmentRun, type LoadedCase } from "../domain/schema.ts";
import { overlayRunId } from "../../scripts/lib/overlay-ids.mjs";
import { loadProtocol, renderProtocol } from "./protocols.ts";
import { closeRun, openRun, writeWorkingFile, type RunOutcome } from "./store.ts";
import { callSeat, seatAvailable, VENDORS, type Reply } from "./transport.ts";
import type { Meter } from "./spend.ts";

/**
 * `aletheia check <case>` — the blind panel (docs/AUTOMATION.md, "The verbs";
 * protocol check-v1). Each seat of the roster's panel receives the ledger
 * only — case identity, claims without grades, evidence, sources, research —
 * and returns one assessment run, validated fail-closed against the site's
 * own schema and the packet's contract (every featured claim graded, no
 * other claim named). A reply that misses or invents claims goes back to the
 * seat once with the findings; a second failure is recorded, not installed.
 * Installed runs carry `role: check` and the ledger hash they judged; every
 * seat's raw reply is kept beside the run record, installed or not. Calls go
 * through the metered transport, so the panel's cost is in the ledger.
 */

export const VERDICTS = [
  "established", "well_supported", "provisionally_supported", "mixed", "weakly_supported",
  "contradicted", "unresolved", "presently_untestable",
];

const LEDGER_FILES = ["case.yaml", "claims.yaml", "evidence.yaml", "sources.yaml", "research.yaml"];

/** The blind packet: the ledger files verbatim — no assessments, no editions, no history. */
export function blindPacket(loaded: LoadedCase, root = process.cwd()): string {
  const dir = path.join(root, "content", "cases", loaded.dir);
  return LEDGER_FILES.map((f) => `===== FILE: ${f} =====\n${fs.readFileSync(path.join(dir, f), "utf8")}`).join("\n\n");
}

/** A reply's YAML, with a code fence and up to five trailing non-YAML lines (vendor footers) tolerated. */
export function parseYamlReply(text: string): unknown {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.split("\n").slice(1).join("\n");
    const fence = t.lastIndexOf("```");
    if (fence >= 0) t = t.slice(0, fence);
  }
  const lines = t.trim().split("\n");
  let lastErr: unknown;
  for (let drop = 0; drop <= Math.min(5, lines.length - 1); drop++) {
    try {
      return parseYaml(lines.slice(0, lines.length - drop).join("\n"));
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

export interface Validated {
  run: AssessmentRun | null;
  problems: string[];
}

/** Fail-closed: the site's own schema first, then the packet contract. Pure. */
export function validateCheckReply(
  text: string,
  ctx: { loaded: LoadedCase; seat: string; featuredIds: string[]; date: string; promptVersion: string; runId: string },
): Validated {
  let raw: Record<string, unknown>;
  try {
    raw = parseYamlReply(text) as Record<string, unknown>;
  } catch (e) {
    return { run: null, problems: [`YAML parse failure: ${(e as Error).message}`] };
  }
  const seat = VENDORS[ctx.seat];
  const stamped = {
    ...raw,
    runId: ctx.runId,
    date: ctx.date,
    promptVersion: ctx.promptVersion,
    humanReviewed: false,
    role: "check",
    model: `${seat.label} — independent check run via ${seat.model}`,
    basis: { ledgerHash: ctx.loaded.ledgerHash },
  };
  const parsed = AssessmentRunSchema.safeParse(stamped);
  if (!parsed.success) return { run: null, problems: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  const run = parsed.data;
  const problems: string[] = [];
  const seen = new Set(run.claimAssessments.map((ca) => ca.claimId));
  const missing = ctx.featuredIds.filter((id) => !seen.has(id));
  if (missing.length) problems.push(`missing claims: ${missing.join(", ")}`);
  for (const ca of run.claimAssessments) if (!ctx.featuredIds.includes(ca.claimId)) problems.push(`unknown claim ${ca.claimId}`);
  for (const id of [...run.caseAssessment.loadBearing, ...run.caseAssessment.weakestLinks]) {
    if (!ctx.featuredIds.includes(id)) problems.push(`roll-up references unknown claim ${id}`);
  }
  if (!run.caseAssessment.steelman) problems.push("steelman missing (the counterweight is required)");
  return { run, problems };
}

export type SeatCaller = (seat: string, prompt: { system: string; user: string; maxTokens?: number; timeoutMs?: number }, meter: Meter) => Promise<Reply>;

export interface CheckOptions {
  /** Seats to ask; default: every roster seat with a key. */
  seats?: string[];
  dryRun?: boolean;
  root?: string;
  deps?: { call?: SeatCaller; now?: () => Date; cases?: () => LoadedCase[] };
}

export interface CheckOutcome extends RunOutcome {
  installed: string[];
  failed: string[];
}

export async function runCheck(caseKey: string, opts: CheckOptions = {}): Promise<CheckOutcome> {
  const root = opts.root ?? process.cwd();
  const now = opts.deps?.now ?? (() => new Date());
  const loaded = findCase(caseKey, opts.deps?.cases?.());
  const protocol = loadProtocol("check");
  const featuredIds = currentEdition(loaded).featuredClaimIds;
  const wanted = opts.seats ?? Object.keys(VENDORS);
  const unknown = wanted.filter((s) => !VENDORS[s]);
  if (unknown.length) throw new Error(`unknown seat(s): ${unknown.join(", ")} (config/models.yaml names the panel)`);
  const active = wanted.filter((s) => opts.deps?.call || seatAvailable(s));
  const skipped = wanted.filter((s) => !active.includes(s));
  const run = openRun("check", loaded.record.slug, { model: `panel: ${active.join(", ")}`, promptVersion: protocol.version }, { now: now(), root });
  const { runId, date } = run;
  const instructions = renderProtocol(protocol, {
    title: loaded.record.title,
    today: date,
    promptVersion: protocol.version,
    verdicts: VERDICTS.join(" | "),
    featuredCount: featuredIds.length,
    featuredIds: featuredIds.join(", "),
  });
  const packet = blindPacket(loaded, root);
  if (active.length === 0) return { ...closeRun(run, "failed", { reason: `no seat has a key (${skipped.join(", ")})` }), installed: [], failed: [] };
  if (opts.dryRun) {
    writeWorkingFile(runId, "packet.md", packet, root);
    writeWorkingFile(runId, "instructions.md", instructions, root);
    return { ...closeRun(run, "dry-run", { reason: `would ask ${active.join(", ")}${skipped.length ? ` (no key: ${skipped.join(", ")})` : ""}; packet and instructions under proposals/${runId}/; nothing sent` }), installed: [], failed: [] };
  }

  const call = opts.deps?.call ?? callSeat;
  const assessmentsDir = path.join(root, "content", "cases", loaded.dir, "assessments");
  const installed: string[] = [];
  const failed: string[] = [];
  const results = await Promise.allSettled(
    active.map(async (seat) => {
      const user = `RUN HEADER:\n  TAG: ${VENDORS[seat].tag}\n  MODEL_LABEL: ${VENDORS[seat].label}, independent check run\n\nCASE FILE FOLLOWS:\n\n${packet}`;
      const overlayId = overlayRunId([date, "check", VENDORS[seat].tag], { now: now(), exists: (id) => fs.existsSync(path.join(assessmentsDir, `${id}.yaml`)) });
      const ctx = { loaded, seat, featuredIds, date, promptVersion: protocol.version, runId: overlayId };
      let reply = await call(seat, { system: instructions, user, maxTokens: 64000, timeoutMs: 1_800_000 }, run.meter);
      writeWorkingFile(runId, `seat-${seat}.yaml`, reply.text, root);
      let v = validateCheckReply(reply.text, ctx);
      if (v.problems.length) {
        // One repair round: the contract failures go back to the seat with its reply.
        writeWorkingFile(runId, `seat-${seat}.problems.txt`, v.problems.join("\n"), root);
        const repair = `${user}\n\nYOUR PREVIOUS REPLY (below) failed the packet contract:\n${v.problems.map((p) => `- ${p}`).join("\n")}\n\nReturn the complete corrected YAML — the whole run, not a patch.\n\n${reply.text}`;
        reply = await call(seat, { system: instructions, user: repair, maxTokens: 64000, timeoutMs: 1_800_000 }, run.meter);
        writeWorkingFile(runId, `seat-${seat}.repaired.yaml`, reply.text, root);
        v = validateCheckReply(reply.text, ctx);
      }
      return { seat, v };
    }),
  );
  for (const r of results) {
    if (r.status === "rejected") {
      failed.push(String((r.reason as Error).message ?? r.reason).slice(0, 200));
      continue;
    }
    const { seat, v } = r.value;
    if (!v.run || v.problems.length) {
      writeWorkingFile(runId, `seat-${seat}.problems.txt`, v.problems.join("\n"), root);
      failed.push(`${seat}: ${v.problems.join("; ")}`);
      continue;
    }
    fs.mkdirSync(assessmentsDir, { recursive: true });
    const file = path.join(assessmentsDir, `${v.run.runId}.yaml`);
    const header = `# Cross-model check run — an independent judge (${VENDORS[seat].label}), blind to all\n# prior assessments and to the editions (aletheia check, ${protocol.version}; run ${runId}).\n# role: check — never displayed as the case narrative; feeds the concurrence panel.\n# basis.ledgerHash is the ledger it judged. Append-only; NOT human reviewed.\n`;
    fs.writeFileSync(file, header + stringifyYaml(v.run));
    installed.push(path.relative(root, file));
  }
  const reason = `${installed.length} of ${active.length} seat(s) installed${skipped.length ? `; no key: ${skipped.join(", ")}` : ""}${failed.length ? `; failed: ${failed.join(" | ")}` : ""}`;
  return { ...closeRun(run, installed.length ? "completed" : "failed", { reason }), installed, failed };
}
