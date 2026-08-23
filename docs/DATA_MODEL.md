# Aletheia Data Model

Four core objects — **Case, Claim, Evidence, Source** — plus append-only **assessment overlays** and supporting records (research opportunities, change log). Assessments, relationships, and provenance are fields or overlay records, not separate top-level object types. The authoritative schema is the Zod definitions in `src/domain/schema.ts`; this document explains the concepts.

## Layering principle

Content is layered and reversible:

- **Canon layer** — the claim/evidence/source files. Human-editable, versioned in git. A claim's *statement* never silently changes; corrections are new revisions in git history.
- **Overlay layer** — AI-generated assessments in `assessments/<runId>.yaml`. Append-only: a new run adds a new file; nothing mutates the canon. Every AI-generated record carries a `runId`, model label, date, and prompt version. The UI shows the latest overlay and can show history.

## Content folder layout

```
content/
  cases/
    geopolymer/
      case.yaml          # Case metadata, dossier fields, editorial state
      overview.md        # The article; inline claim refs: [text]{claim=GEO-C001}
      claims.yaml        # Claim records (canon)
      evidence.yaml      # Evidence records (canon)
      sources.yaml       # Source records (canon)
      research.yaml      # Research opportunities (from the RFP)
      history.yaml       # Change log entries
      assessments/
        2026-08-22-fable-1.yaml   # One AI assessment run (overlay, append-only)
```

## Case

Identity (id, slug, title, subtitle, domain), status, and the **dossier header** fields: `whatIsClaimed`, `whereDisagreementLives` (the central crux), `whatWouldSettleIt`. Plus the best conventional explanation, editors, last-review date, and an optional external research link (the ResearchHub RFP).

## Claim

One atomic proposition with a reasonably clear truth condition.

Claims come in two **tiers**:

- **`featured`** — full editorial treatment: plain-language gloss, both
  assessment axes, objections, relationships, "what would change our mind."
  The shape every claim had before tiers existed.
- **`catalog`** — a lightweight, honestly-unreviewed backlog record: one
  atomic statement, a theme, a ladder rung, a required **source anchor**
  (`locator`, optional verbatim `quote`, optional `sourceId`), provenance
  (`reviewState`, `origin` with runId), and an optional `independenceGroup`
  tying near-duplicate extractions together so they are never counted as
  independent evidence. Validation deliberately does not demand
  featured-level richness here.

**Promotion is a one-field edit**: flip `tier: catalog` → `featured` and the
build fails loudly, listing exactly which editorial fields are still missing.
That failure is the promotion checklist.

Catalog-scale imports live in an optional per-case `claims-catalog.yaml`
(same schema as `claims.yaml`), so a bulk import stays one reversible file
and the hand-curated canon stays readable. The loader concatenates both.

Claim fields:

- `id` — stable, human-readable (`GEO-C001`).
- `statement` / `plainLanguage` — the proposition and its accessible restatement.
- `theme` — grouping key for the explorer (e.g. `tool-marks`, `ingredients`).
- `rung` — position on the argument ladder: `observation` | `mechanism` | `attribution`. Credibility tends to decay up the ladder; the UI makes this visible.
- `importance` — `headline` | `major` | `supporting`.
- `claimType` — observation / measurement / historical / causal / mechanistic / interpretive / methodological / existence.
- `reviewState` — **provenance, displayed honestly in the UI**:
  - `ai_extracted` — machine-extracted from sources, no human hand-check.
  - `human_reviewed` — a named human checked statement and sourcing.
  - `disputed` — flagged during review; contested internally.
  - `rejected` — kept as a tombstone with `rejectionReason` so future extraction runs don't re-propose it. Not rendered in normal views.
- `origin` — where the claim came from (e.g. geo catalog T-number, extraction agent, run).
- `credibility` (state + summary) and `diagnosticity` (level + summary) — the two axes the product exists to distinguish: is the local claim true, and how much does it favor one hypothesis over alternatives?
- `parentClaimIds` / `dependsOnClaimIds` — hierarchy and dependency (must reference existing, non-rejected claims).
- `strongestObjection`, `whatWouldChangeOurMind`.

Assessment states: `established`, `well_supported`, `provisionally_supported`, `mixed`, `weakly_supported`, `contradicted`, `unresolved`, `presently_untestable`. The UI groups these into four visual families (supported / contested / against / can't-tell-yet) with the precise label on the badge.

## Evidence

The specific observation/result/quotation extracted from a Source and connected to Claims. Direction is explicit: `supports` | `undermines` | `qualifies` | `context`. Also: strength, `sourceStatement` (what the source says) kept separate from `editorInference` (what we infer), limitations, and provenance (`ai_extracted` etc.).

## Source

The provenance container: bibliographic identity, type, identifier/URL, and a **verification status**:

- `verified` — the document itself is held in the project library.
- `ai_verified` — an AI agent located and checked the citation against the claimed content; no human re-check. (All of geo's 2026-05-02 verified-citations batch is this.)
- `unverified` — cited from memory or second-hand; locator not confirmed.
- `placeholder` — illustrative only (must be visibly synthetic; not used in real cases).

Never invent locators. If a locator is not verified, label it.

## Assessment run (overlay)

One file per run: `runId`, `model`, `date`, `promptVersion`, plus:

- `caseAssessment` — the structural roll-up: verdict state, `loadBearing` (which claims the thesis actually rests on), `weakestLinks`, and an argued `synthesis` in prose. Not a score.
- `claimAssessments[]` — `{claimId, verdict, reasoning, confidence}` per claim.

## ResearchOpportunity

Crux-directed projects: title, summary, affected `claimIds`, effort tier, expected information gain, RFP topic reference (T-number), track (prize/grant).

## ChangeLogEntry

Date, what changed, why, actor, and AI-assistance disclosure.

Convention: whoever makes a material change to a case appends the entry to that case's `history.yaml` **in the same PR** — this includes the initial case launch, which must get an entry summarizing what was published (claims, evidence records, sources, verification status). `history.yaml` is an append-only log: add new entries at the end, never reorder or rewrite old ones. Dates are day-granular, so within a date, file order is the timeline (later in the file = more recent); the homepage "recent changes" feed and case-page history rely on this ordering (`historyNewestFirst` / `recentChanges` in `src/domain/load.ts`).

## Record references in prose

When another Aletheia record is cited in narrative fields (assessments, dossier copy, summaries, history, source notes, claim glosses, etc.), use the **exact record id** — e.g. `GEO-C001`, `SRC-MARCIS-2023`, `GEO-E012`, `GEO-R003`, `GEO-001`. The UI auto-linkifies these to the matching claim, source, evidence anchor, research anchor, or case page.

Overview articles are different: they use the inline claim-span syntax `[readable text]{claim=GEO-C001}` (see `overview.md` above).

## Integrity rules (enforced at build time)

The loader fails the build loudly on: dangling claim/evidence/source/assessment IDs, claim refs in `overview.md` that don't resolve, dependency references to rejected claims, and any schema violation. No silent data repair.
