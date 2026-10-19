import fs from "node:fs";
import path from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { currentEdition } from "../domain/editions.ts";
import { sha256Hex } from "../domain/hash.ts";
import { findCase } from "../domain/load.ts";
import { AssessmentRunSchema, type AssessmentRun, type LoadedCase } from "../domain/schema.ts";
import { seatsOwed } from "../domain/standing.ts";
import { overlayRunId } from "../lib/overlay-ids.mjs";
import { seatKey } from "../lib/seat-key.mjs";
import { parseYamlReply } from "../lib/yaml-reply.mjs";
import { loadProtocol, renderProtocol, type Protocol } from "./protocols.ts";
import { closeRun, openRun, writeWorkingFile, type RunOutcome } from "./store.ts";
import { BudgetExceeded } from "./budget.ts";
import { assertSeatsWithinBudget, callSeat, seatAvailable, VENDORS, type Reply } from "./transport.ts";
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
 * through the metered transport, so the panel's cost is in the ledger, and
 * the caps are asked before the seats are called and again before a repair.
 *
 * The verb asks the seats that have not judged the case as it stands
 * (`seatsOwed`), and rests when every seat has. A seat that answered is not
 * asked the same question again because another seat failed: that pays
 * twice, and its second answer would displace its first by date alone
 * (2026-09-28: three runs on one ledger, the same four seats each time, and
 * one seat's case verdict read contradicted, weakly supported, contradicted).
 * `--seats` names seats outright and asks them whatever they hold.
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

/**
 * The featured claims that no admitted evidence record cites: held on their source alone, and a source is not
 * evidence (AGENTS.md §3.6). Counted as the edition packet counts them (src/pipeline/packet.ts, `evidence: 0`): a
 * rejected or provisional record is not an admitted one.
 */
export function unevidencedClaims(loaded: Pick<LoadedCase, "evidence">, featuredIds: string[]): string[] {
  const cited = new Set(loaded.evidence.filter((e) => e.reviewState !== "rejected" && e.reviewState !== "provisional").flatMap((e) => e.claimIds));
  return featuredIds.filter((id) => !cited.has(id));
}

/**
 * A check protocol's instructions for one case on one day. Every placeholder a check protocol may use is filled
 * here. `unevidencedIds` is filled whether or not the protocol asks for it: check-v2 does not, and the draft that an
 * experiment designed on 2026-09-30 is to test does (proposals/assessment-experiments/).
 */
export function checkInstructions(protocol: Protocol, loaded: LoadedCase, featuredIds: string[], date: string): string {
  return renderProtocol(protocol, {
    title: loaded.record.title,
    today: date,
    promptVersion: protocol.version,
    verdicts: VERDICTS.join(" | "),
    featuredCount: featuredIds.length,
    featuredIds: featuredIds.join(", "),
    unevidencedIds: unevidencedClaims(loaded, featuredIds).join(", ") || "none",
  });
}

/** A reply's YAML, with a code fence and up to five trailing non-YAML lines (vendor footers) tolerated (src/lib/yaml-reply.mjs). */
export { parseYamlReply };

export interface Validated {
  run: AssessmentRun | null;
  problems: string[];
}

/** Fail-closed: the site's own schema first, then the packet contract. Pure. */
export function validateCheckReply(
  text: string,
  ctx: { loaded: LoadedCase; seat: string; featuredIds: string[]; date: string; promptVersion: string; runId: string; producedBy?: string },
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
    ...(ctx.producedBy ? { producedBy: ctx.producedBy } : {}),
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

/** The roster seats, by name, that have not judged the case as it stands (src/domain/standing.ts, `seatsOwed`). */
export function owedSeats(loaded: LoadedCase): string[] {
  const roster = Object.keys(VENDORS);
  const owed = new Set(seatsOwed(loaded, roster.map((s) => seatKey(VENDORS[s].label))));
  return roster.filter((s) => owed.has(seatKey(VENDORS[s].label)));
}

export interface CheckOptions {
  /** Seats to ask, whatever they hold; default: every roster seat that has not judged the case as it stands. */
  seats?: string[];
  dryRun?: boolean;
  root?: string;
  deps?: { call?: SeatCaller; now?: () => Date; cases?: () => LoadedCase[]; budget?: BudgetGuard };
}

/** The budget guard over a set of seat calls about to be made: throws `BudgetExceeded` when they would pass a cap (src/pipeline/transport.ts, `assertSeatsWithinBudget`). */
export type BudgetGuard = (calls: { seat: string; prompt: { system: string; user: string; maxTokens?: number } }[], meter: Meter) => number;

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
  const wanted = opts.seats ?? owedSeats(loaded);
  const unknown = wanted.filter((s) => !VENDORS[s]);
  if (unknown.length) throw new Error(`unknown seat(s): ${unknown.join(", ")} (config/models.yaml names the panel)`);
  const active = wanted.filter((s) => opts.deps?.call || seatAvailable(s));
  const skipped = wanted.filter((s) => !active.includes(s));
  // Seats holding a check of the ledger as it stands: not asked again, and said so in the run record.
  const held = opts.seats ? [] : Object.keys(VENDORS).filter((s) => !wanted.includes(s));
  const heldNote = held.length ? `; not asked, having judged this ledger already: ${held.join(", ")}` : "";
  const run = openRun("check", loaded.record.slug, { model: `panel: ${active.join(", ") || "no seat asked"}`, promptVersion: protocol.version }, { now: now(), root });
  const { runId, date } = run;
  const instructions = checkInstructions(protocol, loaded, featuredIds, date);
  const packet = blindPacket(loaded, root);
  // The run record carries the hash of the case file every seat is sent (the packet: not the seat's own header, and
  // not the instructions, which carry the date). Two runs with one hash were sent the same file, and the record says
  // so even when nothing the run wrote is kept. Until 2026-09-30 a check's record carried no hash: only the
  // assessments it installed did, the ledger's (review note #428).
  run.stamp.inputHash = sha256Hex(packet);
  if (wanted.length === 0) return { ...closeRun(run, "rested", { reason: "every seat of the panel has judged the case as it stands; pass --seats to ask one again" }), installed: [], failed: [] };
  if (active.length === 0) return { ...closeRun(run, "failed", { reason: `no seat has a key (${skipped.join(", ")})` }), installed: [], failed: [] };
  if (opts.dryRun) {
    writeWorkingFile(runId, "packet.md", packet, root);
    writeWorkingFile(runId, "instructions.md", instructions, root);
    return { ...closeRun(run, "dry-run", { reason: `would ask ${active.join(", ")}${skipped.length ? ` (no key: ${skipped.join(", ")})` : ""}${heldNote}; packet and instructions under proposals/${runId}/; nothing sent` }), installed: [], failed: [] };
  }

  const userFor = (seat: string) => `RUN HEADER:\n  TAG: ${VENDORS[seat].tag}\n  MODEL_LABEL: ${VENDORS[seat].label}, independent check run\n\nCASE FILE FOLLOWS:\n\n${packet}`;
  // The caps hold for the panel's seats as for the house model: refused before any seat is asked, with the reason
  // (a test's own caller is not a paid call and is not budgeted, unless the test brings a guard of its own).
  const withinBudget: BudgetGuard | null = opts.deps?.budget ?? (opts.deps?.call ? null : assertSeatsWithinBudget);
  const first = (seat: string) => ({ seat, prompt: { system: instructions, user: userFor(seat), maxTokens: 64000 } });
  if (withinBudget) {
    try {
      withinBudget(active.map(first), run.meter);
    } catch (e) {
      if (!(e instanceof BudgetExceeded)) throw e;
      return { ...closeRun(run, "failed", { reason: e.message }), installed: [], failed: [] };
    }
  }
  const call = opts.deps?.call ?? callSeat;
  // The calls still out, by seat: a call's cost reaches the spend ledger when it returns, so a guard asked in the
  // middle of a run counts these at their estimates beside what the ledger already holds.
  const out = new Map(active.map((seat) => [seat, first(seat)]));
  const assessmentsDir = path.join(root, "content", "cases", loaded.dir, "assessments");
  const installed: string[] = [];
  const failed: string[] = [];
  const results = await Promise.allSettled(
    active.map(async (seat) => {
      const user = userFor(seat);
      const overlayId = overlayRunId([date, "check", VENDORS[seat].tag], { now: now(), exists: (id) => fs.existsSync(path.join(assessmentsDir, `${id}.yaml`)) });
      const ctx = { loaded, seat, featuredIds, date, promptVersion: protocol.version, runId: overlayId, producedBy: runId };
      let reply = await call(seat, { system: instructions, user, maxTokens: 64000, timeoutMs: 1_800_000 }, run.meter).finally(() => out.delete(seat));
      writeWorkingFile(runId, `seat-${seat}.yaml`, reply.text, root);
      let v = validateCheckReply(reply.text, ctx);
      if (v.problems.length) {
        // One repair round: the contract failures go back to the seat with its reply.
        writeWorkingFile(runId, `seat-${seat}.problems.txt`, v.problems.join("\n"), root);
        const repair = `${user}\n\nYOUR PREVIOUS REPLY (below) failed the packet contract:\n${v.problems.map((p) => `- ${p}`).join("\n")}\n\nReturn the complete corrected YAML — the whole run, not a patch.\n\n${reply.text}`;
        // The repair is a second paid call, and the caps hold for it as for the first. Until 2026-09-30 it was sent
        // without the budget being asked: that day the Anthropic seat's reply on Before Sputnik was cut at its
        // ceiling, and the second asking cost $2.45 that no cap had been consulted about. A seat refused here stays
        // failed, with the reason; the other seats' replies are installed as they would have been.
        const again = { seat, prompt: { system: instructions, user: repair, maxTokens: 64000 } };
        if (withinBudget) {
          try {
            withinBudget([...out.values(), again], run.meter);
          } catch (e) {
            if (!(e instanceof BudgetExceeded)) throw e;
            return { seat, v: { run: null, problems: [...v.problems, `not asked again: ${e.message}`] } };
          }
        }
        out.set(seat, again);
        reply = await call(seat, { system: instructions, user: repair, maxTokens: 64000, timeoutMs: 1_800_000 }, run.meter).finally(() => out.delete(seat));
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
    fs.writeFileSync(file, header + stringifyYaml(v.run, { aliasDuplicateObjects: false }));
    installed.push(path.relative(root, file));
  }
  const reason = `${installed.length} of ${active.length} seat(s) installed${skipped.length ? `; no key: ${skipped.join(", ")}` : ""}${failed.length ? `; failed: ${failed.join(" | ")}` : ""}${heldNote}`;
  return { ...closeRun(run, installed.length ? "completed" : "failed", { reason, wrote: installed }), installed, failed };
}
