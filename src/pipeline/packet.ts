import fs from "node:fs";
import path from "node:path";
import { declined, type Disposition } from "../domain/intake.ts";
import { adoptedAssessment, caseAccounts, caseQuestion, currentEdition } from "../domain/editions.ts";
import { currentChecks, latestCheckPerModel, ratification } from "../domain/standing.ts";
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
  /** `subtitle` is the case's question as it stands (the current edition's restatement, else the founding one); `foundingQuestion` is the case file's; `accounts` are the edition's side-by-side accounts. */
  case: { id: string; slug: string; title: string; subtitle: string; foundingQuestion: string; accounts: string[]; summary: string; domain: string; themes: Record<string, string> };
  edition?: {
    runId: string;
    date: string;
    question: string | null;
    accounts: string[];
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
  /**
   * Founding texts inlined: text files as they are; a PDF from the text
   * extraction committed beside it as `<file>.txt` (the pipeline's own
   * page-marked extraction), else named with `text: null`.
   */
  inputs?: { id: string; title: string; role: string; file: string; text: string | null; bytes: number }[];
  declined?: Pick<Disposition, "key" | "kind" | "disposition" | "reason" | "reopenIf" | "date" | "observed">[];
  previousReport?: string;
  /**
   * For the edition verb: the panel's current judgment of the adopted
   * assessment — standing, and each seat's case verdict and every
   * per-claim verdict that differs from the adopted one. A contested
   * standing is a task for the edition: answer each dissent or hold.
   */
  panel?: {
    standing: string;
    reason: string;
    checks: {
      runId: string;
      seat: string;
      verdict: string;
      synthesis: string;
      steelman: string | null;
      dissents: { claimId: string; adopted: string; seat: string; reasoning: string }[];
    }[];
  };
  /** For the edition verb: the full records behind the index (featured claims, all evidence, sources, research, images). */
  detail?: {
    claims: LoadedCase["claims"];
    evidence: LoadedCase["evidence"];
    sources: LoadedCase["sources"];
    research: LoadedCase["research"];
    images: LoadedCase["images"];
  };
  ledgerHash: string;
}

export function buildPacket(
  loaded: LoadedCase,
  opts: { blind?: boolean; previousReport?: string; detail?: boolean } = {},
): Packet {
  const view = caseView(loaded);
  const evidenceCount = new Map<string, number>();
  for (const e of loaded.evidence) for (const id of e.claimIds) evidenceCount.set(id, (evidenceCount.get(id) ?? 0) + 1);

  const packet: Packet = {
    case: {
      id: loaded.record.id,
      slug: loaded.record.slug,
      title: loaded.record.title,
      subtitle: caseQuestion(loaded),
      foundingQuestion: loaded.record.subtitle,
      accounts: caseAccounts(loaded),
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
    question: ed.question ?? null,
    accounts: ed.accounts ?? [],
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
    const extraction = `${file}.txt`;
    return {
      id: i.id,
      title: i.title,
      role: i.role,
      file: i.file,
      text: isText ? fs.readFileSync(file, "utf8") : fs.existsSync(extraction) ? fs.readFileSync(extraction, "utf8") : null,
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
  if (opts.detail) {
    const standing = ratification(loaded);
    const checks = currentChecks(loaded, latestCheckPerModel(loaded));
    if (standing && run && checks.length) {
      packet.panel = {
        standing: standing.status,
        reason: standing.reason,
        checks: checks.map((c) => ({
          runId: c.runId,
          seat: c.model,
          verdict: c.caseAssessment.verdict,
          synthesis: c.caseAssessment.synthesis,
          steelman: c.caseAssessment.steelman ?? null,
          dissents: c.claimAssessments
            .filter((ca) => ed.featuredClaimIds.includes(ca.claimId))
            .flatMap((ca) => {
              const own = run.claimAssessments.find((a) => a.claimId === ca.claimId);
              return own && own.verdict !== ca.verdict ? [{ claimId: ca.claimId, adopted: own.verdict, seat: ca.verdict, reasoning: ca.reasoning }] : [];
            }),
        })),
      };
    }
    const featured = new Set(ed.featuredClaimIds);
    packet.detail = {
      claims: loaded.claims.filter((c) => featured.has(c.id)),
      evidence: loaded.evidence,
      sources: loaded.sources,
      research: loaded.research,
      images: loaded.images,
    };
  }
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
