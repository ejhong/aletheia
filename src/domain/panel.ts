import fs from "node:fs";
import path from "node:path";
import {
  crossModelSummary,
  displayAssessment,
  latestCheckPerModel,
  loadAllCases,
  type Ratification,
} from "./load";
import { loadArbiterRecords } from "./governance";
import type { AssessmentRun, AssessmentState, LoadedCase } from "./schema";

/**
 * Derivations for the /panel page — the site's governance made visible.
 * Everything here is computed at build time from records that already
 * exist (assessment runs, ratification standings, harvested arbiter
 * verdicts, history); nothing is authored, so the page cannot drift from
 * the ledger it describes.
 */

/** "Opus 5 (Anthropic) — independent check run via claude-opus-5" → "Opus 5 (Anthropic)". */
export function seatName(model: string): string {
  return model.split("—")[0].split(", independent")[0].trim();
}

/** Stable key for a seat across label wordings (mirrors latestCheckPerModel). */
export function seatKey(model: string): string {
  return model.trim().split(/[\s,(]/)[0].toLowerCase();
}

export interface CaseStanding {
  slug: string;
  title: string;
  verdict: AssessmentState;
  ratification: Ratification;
  /** Per-seat case verdicts from each seat's latest check. */
  seatVerdicts: { seat: string; verdict: AssessmentState }[];
}

export function caseStandings(): CaseStanding[] {
  const rows: CaseStanding[] = [];
  for (const c of loadAllCases()) {
    const shown = displayAssessment(c);
    if (!shown) continue;
    rows.push({
      slug: c.record.slug,
      title: c.record.title,
      verdict: shown.run.caseAssessment.verdict,
      ratification: shown.ratification,
      seatVerdicts: latestCheckPerModel(c).map((r) => ({
        seat: seatName(r.model),
        verdict: r.caseAssessment.verdict,
      })),
    });
  }
  const order = { contested: 0, unratified: 1, ratified: 2 };
  return rows.sort(
    (a, b) => order[a.ratification.status] - order[b.ratification.status],
  );
}

export interface DissentClaim {
  caseSlug: string;
  caseTitle: string;
  claimId: string;
  houseVerdict: AssessmentState;
  seats: { seat: string; verdict: AssessmentState; reasoning: string }[];
}

/**
 * Every claim where the latest panel splits against the displayed draft
 * (the same claims the concurrence summary flags), with each seat's
 * verdict and reasoning — the site's most honest content: independent
 * models disagreeing about contested science, shown per claim.
 */
export function dissentGallery(): DissentClaim[] {
  const out: DissentClaim[] = [];
  for (const c of loadAllCases()) {
    const shown = displayAssessment(c);
    if (!shown) continue;
    const checks = latestCheckPerModel(c);
    if (checks.length === 0) continue;
    const sum = crossModelSummary(c);
    if (!sum) continue;
    for (const claimId of sum.splitClaimIds) {
      const house = shown.run.claimAssessments.find(
        (ca) => ca.claimId === claimId,
      );
      if (!house) continue;
      out.push({
        caseSlug: c.record.slug,
        caseTitle: c.record.title,
        claimId,
        houseVerdict: house.verdict,
        seats: checks
          .map((r) => {
            const ca = r.claimAssessments.find((x) => x.claimId === claimId);
            return ca
              ? { seat: seatName(r.model), verdict: ca.verdict, reasoning: ca.reasoning }
              : null;
          })
          .filter((x): x is NonNullable<typeof x> => x !== null),
      });
    }
  }
  return out;
}

export interface SeatRecord {
  seat: string;
  /** Cases this seat has currently judged (latest run per case). */
  casesJudged: number;
  /** Case-verdict agreements with the displayed draft. */
  agreesWithHouse: number;
  /** Claim-level votes compared against the house draft. */
  claimVotes: number;
  claimExact: number;
  /** Pairwise case-verdict agreement with each other seat, 0–1. */
  pairwise: Record<string, { agree: number; total: number }>;
}

export function seatRecords(): SeatRecord[] {
  const seats = new Map<string, SeatRecord>();
  const byCase: { seat: string; verdict: string }[][] = [];
  for (const c of loadAllCases()) {
    const shown = displayAssessment(c);
    if (!shown) continue;
    const checks = latestCheckPerModel(c);
    const caseRow: { seat: string; verdict: string }[] = [];
    for (const r of checks) {
      const name = seatName(r.model);
      const rec =
        seats.get(name) ??
        ({
          seat: name,
          casesJudged: 0,
          agreesWithHouse: 0,
          claimVotes: 0,
          claimExact: 0,
          pairwise: {},
        } as SeatRecord);
      rec.casesJudged++;
      if (r.caseAssessment.verdict === shown.run.caseAssessment.verdict)
        rec.agreesWithHouse++;
      for (const ca of r.claimAssessments) {
        const house = shown.run.claimAssessments.find(
          (x) => x.claimId === ca.claimId,
        );
        if (!house) continue;
        rec.claimVotes++;
        if (house.verdict === ca.verdict) rec.claimExact++;
      }
      seats.set(name, rec);
      caseRow.push({ seat: name, verdict: r.caseAssessment.verdict });
    }
    byCase.push(caseRow);
  }
  // Pairwise case-verdict agreement.
  for (const row of byCase) {
    for (const a of row)
      for (const b of row) {
        if (a.seat === b.seat) continue;
        const rec = seats.get(a.seat)!;
        rec.pairwise[b.seat] ??= { agree: 0, total: 0 };
        rec.pairwise[b.seat].total++;
        if (a.verdict === b.verdict) rec.pairwise[b.seat].agree++;
      }
  }
  return [...seats.values()].sort((a, b) => a.seat.localeCompare(b.seat));
}

export interface OpsEvent {
  date: string;
  kind:
    | "arbiter"
    | "panel"
    | "content"
    | "quarantine";
  title: string;
  detail: string;
  href?: string;
}

/** The operations log: the machine's visible metabolism, newest first. */
export function opsFeed(limit = 40): OpsEvent[] {
  const events: OpsEvent[] = [];

  for (const r of loadArbiterRecords()) {
    events.push({
      date: r.outcomeAt,
      kind: "arbiter",
      title: `Arbiter ${r.verdict === "pass" ? "passed" : "parked"} PR #${r.pr}${r.verdict === "park" && r.outcome === "merged" ? " — founder merged anyway (dry period)" : ""}`,
      detail: r.reason,
      href: r.url,
    });
  }

  for (const c of loadAllCases()) {
    // Panels convened: latest check runs grouped by date.
    const byDate = new Map<string, AssessmentRun[]>();
    for (const r of latestCheckPerModel(c)) {
      byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);
    }
    for (const [date, runs] of byDate) {
      events.push({
        date,
        kind: "panel",
        title: `Panel convened on ${c.record.title} (${runs.length} seat${runs.length === 1 ? "" : "s"})`,
        detail: runs.map((r) => seatName(r.model)).join(" · "),
        href: `/cases/${c.record.slug}/`,
      });
    }
    for (const h of c.history.slice(-5)) {
      if (h.kind === "housekeeping") continue;
      events.push({
        date: h.date,
        kind: "content",
        title: `${c.record.title}: content change`,
        detail: h.change.length > 220 ? `${h.change.slice(0, 220)}…` : h.change,
        href: `/cases/${c.record.slug}/#history`,
      });
    }
  }

  const qDir = path.join(process.cwd(), "proposals", "cross-model-failures");
  if (fs.existsSync(qDir)) {
    for (const d of fs.readdirSync(qDir)) {
      const m = d.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
      if (!m) continue;
      events.push({
        date: m[1],
        kind: "quarantine",
        title: `Reply quarantined (${m[2]})`,
        detail:
          "A vendor reply failed validation and was quarantined rather than installed — fail-closed.",
      });
    }
  }

  return events
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}
