/**
 * Endorsed-proposal adoption core (docs/AUTOMATION.md, "The Bench"):
 * the pure logic of turning panel-endorsed claim and research-item
 * proposals into drafted ledger records, kept model-free and
 * unit-tested like bench-core.mjs.
 *
 * The rule this closes (founder-confirmed 2026-09-01): a non-study
 * proposal scored high-gain by four of five seats with no
 * constitutional concern is ENDORSED — the panel telling the editor
 * "adopt this." Studies advance to a freeze; claims and research items
 * had no drafting stage at all, so endorsement quietly became a
 * waiting room. This module gives them the same treatment: endorsed
 * proposals auto-draft their ledger records — catalog-tier claims and
 * research items, never featured content — and the draft rides ONE
 * gated needs-approval PR, judged by the arbiter like everything else.
 *
 * Fabrication surface is zero by construction: ids are assigned
 * mechanically; a drafted claim may anchor ONLY to an evidence record
 * already in the ledger (the script copies sourceId and locator from
 * it — the model never writes a locator); a draft that cannot anchor
 * in-ledger is dropped with the reason, staying endorsed for manual
 * adoption rather than gaining an invented anchor.
 */

/** Site-wide cap on auto-drafted adoptions per maintenance run. */
export const MAX_ADOPTIONS_PER_RUN = 3;
/** Per-case cap within one run — keeps each diff arbiter-sized. */
export const MAX_ADOPTIONS_PER_CASE = 2;

/** Endorsement, exactly as the proposals page derives it (app/proposals). */
export const ENDORSE_REQUIRED_HIGHS = 4;

export const RESEARCH_TRACKS = ["publication_prize", "small_grant", "either"];
export const RESEARCH_EFFORT_TIERS = ["desk", "field", "lab"];
export const CLAIM_RUNGS = ["observation", "mechanism", "attribution"];
export const CLAIM_TYPES = [
  "observation",
  "measurement",
  "historical",
  "causal",
  "mechanistic",
  "statistical",
  "interpretive",
  "methodological",
  "existence",
  "theory_description",
  "mathematical",
];

/**
 * Is one scores.yaml tally an endorsed non-study proposal? Same rule the
 * proposals page renders as "endorsed — awaiting adoption": not a study
 * (studies advance to freezes instead), four highs (which requires four
 * returned seats, so a thin panel cannot endorse either), zero concerns.
 */
export function isEndorsed(tally) {
  return (
    tally?.kind !== "study" &&
    !tally?.advances &&
    (tally?.highs ?? 0) >= ENDORSE_REQUIRED_HIGHS &&
    (Array.isArray(tally?.concerns) ? tally.concerns.length : 1) === 0
  );
}

/**
 * The provenance marker an adopted record carries in origin.ref — the
 * repo is the registry (no side state), same pattern as the freeze
 * drafter's file-header comment.
 */
export function adoptionRef(proposalId) {
  return `endorsed agenda proposal (${proposalId})`;
}

export const ADOPTION_REF_RE = /endorsed agenda proposal \(([^)]+)\)/;

/**
 * Endorsed tallies not yet adopted. `adoptedIds` is the set of proposal
 * ids already carried by some record's origin.ref (scanned from the
 * ledger by the caller).
 */
export function selectEndorsed(tallies, adoptedIds) {
  return tallies.filter((t) => isEndorsed(t) && !adoptedIds.has(t.id));
}

/**
 * Budget filter, mirroring applyBudgets for freezes: caller's order is
 * the selection order; deferred candidates keep their reason so the run
 * log can say why they wait (they stay endorsed and are swept next run).
 */
export function applyAdoptionBudgets(candidates, limits = {}) {
  const maxRun = limits.maxPerRun ?? MAX_ADOPTIONS_PER_RUN;
  const maxCase = limits.maxPerCase ?? MAX_ADOPTIONS_PER_CASE;
  const selected = [];
  const deferred = [];
  const perCase = new Map();
  for (const c of candidates) {
    if (selected.length >= maxRun) {
      deferred.push({ ...c, reason: `run budget (${maxRun}) spent` });
      continue;
    }
    const n = perCase.get(c.caseSlug) ?? 0;
    if (n >= maxCase) {
      deferred.push({
        ...c,
        reason: `case budget (${maxCase}) spent this run`,
      });
      continue;
    }
    perCase.set(c.caseSlug, n + 1);
    selected.push(c);
  }
  return { selected, deferred };
}

/**
 * Agenda effort tiers (desk|records|lab|analysis) are broader than the
 * research schema's (desk|field|lab): records pulls and desk analysis
 * are both desk work in the agenda's sense.
 */
export function mapEffortTier(agendaTier) {
  if (agendaTier === "lab") return "lab";
  return "desk";
}

/**
 * Fail-closed validation of a research-item draft. Returns
 * { record, errors }: any error drops the draft (reported, never
 * repaired); on success `record` holds the model-authored fields only —
 * id and origin are the caller's mechanical additions.
 */
export function validateResearchDraft(draft, { liveClaimIds }) {
  const errors = [];
  if (typeof draft?.title !== "string" || draft.title.length < 8)
    errors.push("missing title");
  if (typeof draft?.summary !== "string" || draft.summary.length < 60)
    errors.push("summary too thin");
  if (typeof draft?.informationGain !== "string" || draft.informationGain.length < 20)
    errors.push("informationGain too thin");
  if (!RESEARCH_TRACKS.includes(draft?.track)) errors.push(`bad track: ${draft?.track}`);
  if (!RESEARCH_EFFORT_TIERS.includes(draft?.effortTier))
    errors.push(`bad effortTier: ${draft?.effortTier}`);
  const claimIds = Array.isArray(draft?.claimIds) ? draft.claimIds : [];
  if (claimIds.length === 0) errors.push("no claimIds");
  for (const id of claimIds)
    if (!liveClaimIds.has(id)) errors.push(`unknown claim ${id}`);
  if (errors.length > 0) return { record: null, errors };
  return {
    record: {
      title: draft.title,
      summary: draft.summary,
      claimIds,
      track: draft.track,
      effortTier: draft.effortTier,
      informationGain: draft.informationGain,
    },
    errors: [],
  };
}

/**
 * Fail-closed validation of a claim draft, plus the MECHANICAL anchor:
 * the model names an existing evidence record (anchorEvidenceId) whose
 * source statement grounds the claim; sourceId and locator are copied
 * from the ledger, never authored. A model that cannot name one returns
 * null there, and the draft is dropped with the reason — an endorsed
 * proposal with no in-ledger anchor waits for the promotion pipe or a
 * manual adoption; it never gains an invented locator.
 */
export function validateClaimDraft(draft, { themes, evidenceById }) {
  const errors = [];
  if (typeof draft?.statement !== "string" || draft.statement.length < 10)
    errors.push("missing statement");
  if (typeof draft?.plainLanguage !== "string" || draft.plainLanguage.length < 10)
    errors.push("missing plainLanguage");
  if (!themes.has(draft?.theme)) errors.push(`unknown theme "${draft?.theme}"`);
  if (!CLAIM_RUNGS.includes(draft?.rung)) errors.push(`bad rung: ${draft?.rung}`);
  if (draft?.claimType != null && !CLAIM_TYPES.includes(draft.claimType))
    errors.push(`bad claimType: ${draft.claimType}`);
  const evId = draft?.anchorEvidenceId;
  const anchor = typeof evId === "string" ? evidenceById.get(evId) : null;
  if (!anchor)
    errors.push(
      evId
        ? `unknown anchor evidence ${evId}`
        : "no in-ledger anchor (anchorEvidenceId null) — left for manual adoption",
    );
  if (errors.length > 0) return { record: null, errors };
  return {
    record: {
      statement: draft.statement,
      plainLanguage: draft.plainLanguage,
      theme: draft.theme,
      rung: draft.rung,
      ...(draft.claimType ? { claimType: draft.claimType } : {}),
      sourceAnchor: {
        sourceId: anchor.sourceId,
        locator:
          typeof anchor.exactLocator === "string" && anchor.exactLocator.length >= 3
            ? anchor.exactLocator
            : `as recorded in evidence ${evId}`,
      },
    },
    errors: [],
  };
}
