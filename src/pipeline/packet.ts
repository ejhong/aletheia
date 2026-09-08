import fs from "node:fs";
import path from "node:path";
import { declined, type Disposition } from "../domain/intake.ts";
import { adoptedAssessment, currentEdition } from "../domain/load.ts";
import { sourceKeys } from "../domain/keys.ts";
import type { LoadedCase } from "../domain/schema.ts";
import { caseView } from "../domain/view.ts";

/**
 * The packet (docs/AUTOMATION.md, "The verbs"): a deterministic function of
 * the repository that every verb reads. It carries the case compressed —
 * the edition, an index of every record with its identifiers and verdict
 * (ids and one line each, never full records), the founding inputs, the
 * declined candidates with their reasons, the previous report — so growth
 * costs storage, not context. Bounded, and never silently truncated.
 *
 * The blind variant, for check runs, omits the edition, every grade, the
 * inputs, and the dispositions: judges see the ledger and nothing else.
 */

export interface Packet {
  case: { id: string; slug: string; title: string; subtitle: string; summary: string; domain: string; themes: Record<string, string> };
  edition?: {
    runId: string;
    date: string;
    featured: string[];
    cruxOrder: string[];
    article: string;
    assessment: {
      runId: string;
      verdict: string;
      synthesis: string;
      steelman: string | null;
      loadBearing: string[];
      weakestLinks: string[];
      whatIsClaimed: string | null;
      whereDisagreementLives: string | null;
      whatWouldSettleIt: string | null;
      bestConventionalExplanation: string | null;
    } | null;
  };
  index: {
    sources: { id: string; title: string; year: string | null; keys: string[]; verification: string; background: boolean }[];
    claims: { id: string; statement: string; rung: string; theme: string; featured: boolean; verdict: string | null; anchors: number }[];
    evidence: { id: string; title: string; claimIds: string[]; sourceId: string; direction: string; strength: string }[];
    research: { id: string; title: string; claimIds: string[] }[];
    studies: { id: string; title: string; collected: boolean }[];
    images: { id: string; role: string; depicts: string | null }[];
  };
  /** Founding texts inlined when they are text; binary inputs (PDFs) are named, never inlined. */
  inputs?: { id: string; title: string; role: string; file: string; text: string | null; bytes: number }[];
  declined?: Pick<Disposition, "key" | "kind" | "disposition" | "reason" | "reopenIf" | "date" | "observed">[];
  previousReport?: string;
  ledgerHash: string;
}

export function buildPacket(
  loaded: LoadedCase,
  opts: { blind?: boolean; previousReport?: string } = {},
): Packet {
  const view = caseView(loaded);
  const evidenceCount = new Map<string, number>();
  for (const e of loaded.evidence) for (const id of e.claimIds) evidenceCount.set(id, (evidenceCount.get(id) ?? 0) + 1);

  const packet: Packet = {
    case: {
      id: loaded.record.id,
      slug: loaded.record.slug,
      title: loaded.record.title,
      subtitle: loaded.record.subtitle,
      summary: loaded.record.summary,
      domain: loaded.record.domain,
      themes: loaded.record.themes,
    },
    index: {
      sources: loaded.sources.map((s) => ({
        id: s.id,
        title: s.title,
        year: s.year ?? null,
        keys: sourceKeys(s).filter((k) => !k.startsWith("title:")),
        verification: s.verification,
        background: s.background,
      })),
      claims: view.claims.map((c) => ({
        id: c.claim.id,
        statement: c.claim.statement,
        rung: c.claim.rung,
        theme: c.claim.theme,
        featured: c.featured,
        verdict: opts.blind ? null : c.verdict,
        anchors: (c.claim.sourceAnchor ? 1 : 0) + (evidenceCount.get(c.claim.id) ?? 0),
      })),
      evidence: loaded.evidence.map((e) => ({
        id: e.id,
        title: e.title,
        claimIds: e.claimIds,
        sourceId: e.sourceId,
        direction: e.direction,
        strength: e.strength,
      })),
      research: loaded.research.map((r) => ({ id: r.id, title: r.title, claimIds: r.claimIds })),
      studies: loaded.studies.map((s) => ({ id: s.id, title: s.title, collected: s.rows.length > 0 })),
      images: loaded.images.map((i) => ({ id: i.id, role: i.role, depicts: i.depicts ?? null })),
    },
    ledgerHash: loaded.ledgerHash,
  };
  if (opts.blind) return packet;

  const ed = currentEdition(loaded);
  const run = adoptedAssessment(loaded);
  packet.edition = {
    runId: ed.runId,
    date: ed.date,
    featured: ed.featuredClaimIds,
    cruxOrder: ed.cruxOrder,
    article: ed.article,
    assessment: run
      ? {
          runId: run.runId,
          verdict: run.caseAssessment.verdict,
          synthesis: run.caseAssessment.synthesis,
          steelman: run.caseAssessment.steelman ?? null,
          loadBearing: run.caseAssessment.loadBearing,
          weakestLinks: run.caseAssessment.weakestLinks,
          whatIsClaimed: run.caseAssessment.whatIsClaimed ?? null,
          whereDisagreementLives: run.caseAssessment.whereDisagreementLives ?? null,
          whatWouldSettleIt: run.caseAssessment.whatWouldSettleIt ?? null,
          bestConventionalExplanation: run.caseAssessment.bestConventionalExplanation ?? null,
        }
      : null,
  };
  packet.inputs = loaded.narrativeInputs.map((i) => {
    const file = i.file.startsWith("inputs/")
      ? path.join(process.cwd(), "content", "cases", loaded.dir, i.file)
      : path.join(process.cwd(), i.file);
    const isText = /\.(md|txt|markdown)$/i.test(file);
    return {
      id: i.id,
      title: i.title,
      role: i.role,
      file: i.file,
      text: isText ? fs.readFileSync(file, "utf8") : null,
      bytes: fs.statSync(file).size,
    };
  });
  packet.declined = declined(loaded.dispositions).map((d) => ({
    key: d.key,
    kind: d.kind,
    disposition: d.disposition,
    reason: d.reason,
    reopenIf: d.reopenIf,
    date: d.date,
    observed: d.observed,
  }));
  if (opts.previousReport) packet.previousReport = opts.previousReport;
  return packet;
}

/** Default bound: generous for a research model, tight enough to notice runaway growth. */
export const PACKET_MAX_CHARS = 600_000;

/** Serialize; throw rather than truncate when over the bound. */
export function renderPacket(packet: Packet, maxChars = PACKET_MAX_CHARS): string {
  const text = JSON.stringify(packet, null, 1);
  if (text.length > maxChars) {
    throw new Error(
      `packet for ${packet.case.slug} is ${text.length} chars, over the ${maxChars} bound — nothing was sent; shrink the index or raise the bound deliberately`,
    );
  }
  return text;
}
