# Aletheia Data Model

Four core objects — **Case, Claim, Evidence, Source** — plus append-only **assessments and editions** and supporting records (research opportunities, change log). The authoritative schema is the Zod definitions in `src/domain/schema.ts`; this document explains the concepts.

## Intake decisions

`proposals/intake/*.yaml` contains immutable, schema-validated decision batches
(`version: 1`, `decisions`). A decision names its case, producer stage,
candidate/source, outcome, reason, date, run, and available model and input
receipts. The migrated stages are watch triage, source promotion, agenda
generation, and agenda scoring. New stages also record source requests,
research runs/proposals/adoptions, and edition proposals. These records are workflow history, separate
from Evidence records and ratified case assessments.

New agenda scores preserve individual seat reasons and concerns; their totals
must agree with those seats. Failed or stale reviews cannot provide actionable
scores. Proposal Markdown remains the input artifact, and changing a proposal
invalidates its earlier score. Directory names and public slugs resolve through
`case.yaml` when they differ.

Decision IDs and batch filenames are hashes of their data. Readers fail on
invalid schemas or mismatched hashes. Writers install complete batches
atomically and never replace an earlier file. Legacy entries preserve exact
committed origins and original rows; missing historical receipts stay null.
The migration replay in `scripts/migrate-intake.mjs` retires previous stores
only after checking the migrated records. `scripts/intake-report.mjs` exposes
the history without a model call.

`source-request` records a supplied URL, its context, exact input receipts, and
the archived inbox origin. Capture does not assert source verification. Pending
work is derived from these immutable requests and reading/adoption outcomes;
legacy watch import files are read-only inputs to the same queue. Rejected or
empty readings rest that request. Changed arguments or case inputs permit a
new request; failures and stale adoption remain retryable within the pass budget.

## Research change proposals

`ResearchProposal` (`src/domain/researchProposal.ts`) is an envelope for proposed
ledger edits, stored in a `research-proposal` decision in the same intake store.
Its intent is add, correct, link, supersede, or reconsider. Each edit names its
record kind, ID, prior-record hash (null for additions), complete proposed value,
rationale, and any retrieved passages. The supported records are sources, claims,
evidence, research opportunities, and studies. The envelope is not an assessment
or permission to publish.

The proposal binds to the exact case snapshot and founding-input hash. All edits
are materialized in a temporary case and checked by the production loader
together: the first Source, Claim, and Evidence can refer to each other. Theme
additions permit an empty topic's first claim; existing theme meanings and frozen
study criteria cannot be overwritten by this operation. Human review and library
verification cannot be invented. The CLI prints before/after records and can
materialize a new review directory, never silently update canon.

Exact source identity and identical wording are mechanical checks. Semantic
overlap and independence remain review questions. Reconsideration names the
earlier decision and explains the changed argument; it need not cite a newer
paper. New run timestamps alone do not create novel substance.

`research-run` decisions retain source outcomes, separate reading checks, model
requests, returned usage, and budget reservations. A partial run can preserve a
fully checked independent bundle while recording another unavailable source.
Passages retain URL, retrieval time, response/text hashes, extraction version,
and a short quotation. Character locators refer to retrieved text, not invented
printed-page positions. The hashes record what was retrieved; full source pages
are not republished. Public reading reasons omit quoted spans and retain a hash
of the original review. These source checks do not ratify a case assessment.

`research-adoption` references the original proposal by ID and storage locator.
Its outcomes are `prepared`, `already_present`, `stale`, and `invalid`.
Preparation checks the exact basis, validates a complete prospective case, and
installs the bundle with a case changelog entry in a working tree. Failed writes
restore that tree; a failed restoration aborts the publication job. `prepared`
describes the bundle being submitted to the normal PR gate, not permission to
publish or a ratified assessment. The committed outcome and original proposal
also supply promotion totals, without a second promotion ledger.

## Layering principle

Content is layered and reversible:

- **Canon layer** — the claim/evidence/source files. Human-editable, versioned in git. A claim's *statement* never silently changes; corrections are new revisions in git history.
- **Current edition** — the essay, ordered selection, and an optional reference to an immutable assessment. Deep Memory uses `editions/<runId>.yaml`; other cases still compose `overview.md`, legacy featured records, and the latest draft assessment through `CaseView`. Original assessment authorship and review history remain in `assessments/<runId>.yaml`.

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

**Admission rule (build-time, fail-closed):** a source may sit in
`sources.yaml` only if an evidence record or claim anchor cites it —
load-bearing, not merely relevant — or if it carries `background: true`,
the honest label for reading-guide material (shown on the case's resources
page, carrying no evidential weight). The label fails in both directions:
an uncited source without the flag fails the build, and a cited source
still marked background fails too. Enforced by `sourceAdmissionErrors` in
`src/domain/load.ts`.

## Assessment run (overlay)

One file per run: `runId`, `model`, `date`, `promptVersion`, plus:

- `caseAssessment` — the structural roll-up: verdict state, `loadBearing` (which claims the thesis actually rests on), `weakestLinks`, and an argued `synthesis` in prose. Not a score.
- `claimAssessments[]` — `{claimId, verdict, reasoning, confidence}` per claim.

New draft assessments may also include a complete per-claim `treatment`:
`plainLanguage`, `claimType`, `importance`, `diagnosticity`,
`diagnosticitySummary`, `strongestObjection`, and `whatWouldChangeOurMind`.
These are judgments about the proposition, not changes to its identity or
provenance. The field is optional for immutable historical runs and requires a
timestamped draft when supplied. It cannot contain ledger fields such as
`statement` or `origin`. All its fields enter the assessment hash unchanged.

Only an edition's selected assessment supplies treatment to the current view.
Without it, legacy featured claims retain their existing editorial fields;
catalog claims remain catalog entries. An adopted treatment can give a catalog
claim full presentation without changing its stored tier or any ledger bytes.
The joined view supplies credibility from that assessment's verdict/reasoning
and the other evaluative fields from treatment. Unadopted drafts remain
inspectable in claim assessment history, with their original authorship.

## Edition

`editions/<runId>.yaml` binds the current reader-facing essay and selection to
an assessment without duplicating that assessment. `assessment` is either
`{runId, hash}` or null; null is a valid unassessed opening. The assessment's
original model/date stay intact. The edition has its own author, timestamp,
prompt version, rationale, ordered `featuredClaimIds`, and inline `article`.
Its basis records content, founding-input, ledger, and incumbent hashes.

The first edition has no predecessor; each later edition references its
predecessor's ID and hash and has a later timestamp. There is one chain and no
separate current pointer. The newest edition is displayed, even when a newer
unadopted assessment draft exists. `overview.md` must be removed when the first
edition is adopted; its exact text survives in that edition and git history.
Historical essays are readable at `/cases/<slug>/editions/<runId>/`. Those pages
preserve essay and assessment, with links and photographic captions resolved
against current records rather than a complete historical ledger snapshot.

An `EditionProposal` can include a new AI draft assessment in the same validated
bundle. It cannot overwrite or relabel an existing assessment as human-reviewed.
The authoring tools check its exact basis, build a prospective case, and use the
production loader before recording a typed `edition-proposal` intake decision
or writing a new review directory. Current selection must reference live claims
with editorial treatment and include the chosen assessment's load-bearing
claims. Article references and required plates follow the existing checks.

The current edition enters content receipts; the ledger hash excludes its
article and prior editions. Ledger changes invalidate old review receipts while
the incumbent stays readable with a revision notice. Structural validity does
not ratify selection or prose: new editions use the consequential-content gate.
Only Deep Memory is migrated. Legacy featured fields remain the source for
diagnosticity, objections, and component framing until their writers migrate.

## ResearchOpportunity

Crux-directed projects: title, summary, affected `claimIds`, effort tier, expected information gain, RFP topic reference (T-number), track (prize/grant).

## ChangeLogEntry

Date, what changed, why, actor, and AI-assistance disclosure.

Convention: whoever makes a material change to a case appends the entry to that case's `history.yaml` **in the same PR** — this includes the initial case launch, which must get an entry summarizing what was published (claims, evidence records, sources, verification status). `history.yaml` is an append-only log: add new entries at the end, never reorder or rewrite old ones. Dates are day-granular, so within a date, file order is the timeline (later in the file = more recent); the homepage "recent changes" feed and case-page history rely on this ordering (`historyNewestFirst` / `recentChanges` in `src/domain/load.ts`).

## Record references in prose

When another Aletheia record is cited in narrative fields (assessments, dossier copy, summaries, history, source notes, claim glosses, etc.), use the **exact record id** — e.g. `GEO-C001`, `SRC-MARCIS-2023`, `GEO-E012`, `GEO-R003`, `GEO-001`. The UI auto-linkifies these to the matching claim, source, evidence anchor, research anchor, or case page.

Overview articles are different: they use the inline claim-span syntax `[readable text]{claim=GEO-C001}` (see `overview.md` above).

## Integrity rules (enforced at build time)

The loader fails the build loudly on: dangling claim/evidence/source/assessment IDs, unresolved current article references, dependency references to rejected claims, invalid edition chains or assessment bindings, and any schema violation. No silent data repair.
