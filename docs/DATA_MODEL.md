# Aletheia Data Model

Nine kinds of record in three groups (docs/AUTOMATION.md, "The objects").
The authoritative schema is the Zod definitions in `src/domain/schema.ts`;
this document explains the concepts and the one rule that decides where a
field lives.

## The rule

**On the record, what is true of the record itself. In the assessment,
anything a new piece of evidence could change.**

A claim's statement, rung, type, anchor, dependencies, and provenance are
facts about the record; they change rarely and by correction. Its
credibility, diagnosticity, importance, plain-language gloss, strongest
objection, and what would change our mind are judgments that move every
time evidence arrives; they live in the assessment and reach the reader
through the edition. Whether a claim is featured is an edition decision,
not a field on the claim. Evidence direction, a claim's rung, and a
source's verification label are judgments too, but local and stable ones
about the record, so they stay on it. Test: if adding one evidence record
could change the value, it is assessment.

## Two layers

- **The ledger** — grows, never compressed. Source, Evidence, Claim,
  ResearchOpportunity, Study, Image. Human-editable YAML under git; a
  record's statement never silently changes.
- **The judgment** — append-only, dated, the latest stands, history
  visible. Assessment runs and Editions. Every run carries `runId`, model,
  date, and prompt version. Nothing evaluative lives anywhere else.

Plus the intake (Proposal, Disposition — see AUTOMATION.md), the
founder's two small records (`conjectures.yaml`, `inputs/`), and the
append-only change log.

## Content folder layout

```
content/cases/<case>/
  case.yaml            identity: id, slug, title, subtitle, domain, status, summary, themes, editors
  claims.yaml          propositions with anchors — one file, no tiers
  evidence.yaml  sources.yaml  research.yaml  images.yaml  studies/<id>.yaml
  history.yaml         append-only changelog
  inputs/              founding texts + manifest (founder-owned; voice, never evidence)
  conjectures.yaml     the founder's on-the-record intuitions (no weight)
  assessments/         append-only runs, role draft or check
  editions/            append-only; the latest is the case page
```

## Case

Identity only: `id`, `slug`, `title`, `subtitle`, `domain`, `status`, a
one-paragraph `summary` framing the question, `themes`, `editors`,
`lastReviewed`, and an optional external research link. The dossier header
(what is claimed, where the disagreement lives, what would settle it), the
best conventional explanation, the research priority, and the component
verdicts are judgments and live in the adopted assessment.

## Claim

One atomic proposition with a reasonably clear truth condition — and
nothing evaluative.

- `id` — stable, human-readable (`GEO-C001`).
- `statement` — the proposition.
- `theme` — grouping key for the explorer.
- `rung` — `observation` | `mechanism` | `attribution`; credibility tends
  to decay up the ladder and the UI makes this visible.
- `claimType` (optional) — observation / measurement / historical / causal
  / mechanistic / statistical / interpretive / methodological / existence
  / theory_description / mathematical. A classification, not a grade.
- `sourceAnchor` (optional) — `locator`, optional verbatim `quote`,
  optional `sourceId`. **Every claim dated on or after 2026-09-08 must be
  anchored**: a source anchor here, or at least one evidence record citing
  it (`claimAnchorErrors` in the loader). Six earlier claims carry neither
  and are history.
- `parentClaimIds` / `dependsOnClaimIds` — hierarchy and dependency; must
  reference existing, non-rejected claims.
- `independenceGroup` — near-duplicate extractions that must never count
  as independent evidence.
- `reviewState` — provenance, displayed honestly: `ai_extracted`,
  `human_reviewed`, `disputed`, `rejected` (a tombstone with
  `rejectionReason`, never rendered in normal views and never linked).
- `origin` — how our record was produced (ref, extractedBy, runId, date).
- `genealogy` (optional) — earliest known public appearance of the
  proposition itself.

There are no tiers. A claim the current edition features carries a
treatment in the adopted assessment; a claim it does not feature is in the
ledger's backlog, shown honestly sparse.

## Evidence

The specific observation extracted from a Source and connected to Claims.
Direction is explicit: `supports` | `undermines` | `qualifies` | `context`.
Also strength, `sourceStatement` (what the source says) kept separate from
`editorInference` (what we infer), `exactLocator`, limitations, provenance.

## Source

The provenance container: bibliographic identity, type, identifier/URL,
and a verification label — `verified` (held in the project library),
`ai_verified` (located and checked by an AI agent), `unverified`,
`placeholder`. Never invent locators. `derivedFrom` marks a source that
repeats another without adding evidence. **Admission rule (build-time):** a
source may sit in the ledger only if an evidence record, claim anchor, or
genealogy cites it, or if it carries `background: true` as reading-guide
material; the label fails in both directions.

## Assessment run

One file per run, append-only, never a mutation of canon:

- `runId`, `model`, `date`, `promptVersion`, `humanReviewed`, `role`
  (`draft` written by the drafter; `check` written blind by another vendor).
- `basis.ledgerHash` — the hash of the ledger this run judged. Staleness is
  a hash, not a date: a check is current while the ledger still hashes the
  same. Optional for runs that predate the field (date fallback).
- `caseAssessment` — the verdict, `loadBearing`, `weakestLinks`, the argued
  `synthesis`, the required `steelman` (the strongest argument for the
  featured hypothesis the assessment does not answer), and, on draft runs,
  the dossier header (`whatIsClaimed`, `whereDisagreementLives`,
  `whatWouldSettleIt`), `bestConventionalExplanation`, `components`, and
  `researchPriority`.
- `claimAssessments[]` — `{claimId, verdict, reasoning, confidence}` per
  claim, plus a `treatment` (`plainLanguage`, `importance`,
  `diagnosticity` and summary, `strongestObjection`,
  `whatWouldChangeOurMind`) for every claim the adopting edition features.
- `migratedFrom` — set only on the 2026-09-08 migration runs, which
  transfer previously displayed fields and assert nothing new; exempt from
  the steelman requirement for that reason.

Assessment states: `established`, `well_supported`,
`provisionally_supported`, `mixed`, `weakly_supported`, `contradicted`,
`unresolved`, `presently_untestable`, `misframed`, `provenance_failure`.
The UI groups them into four families with the precise label on the badge.

## Edition

The reader's unit: one immutable file binds what a reader experiences as
one telling.

- `runId`, `date`, `model`, `promptVersion`, `rationale` (why this edition
  replaced its predecessor).
- `assessment` — `{runId, hash}` of the adopted draft run; the loader
  recomputes the hash and fails the build on a mismatch, so an edited
  overlay can never silently change the verdict beneath an essay. Null only
  for a question-only opening.
- `featuredClaimIds` — the selection, in order. Every id must be a live
  claim with a treatment in the adopted assessment.
- `cruxOrder` — research item ids in presentation order.
- `article` — constrained markdown (`## / ###`, paragraphs, quotes, lists,
  rules, `**bold**`, `*italic*`, links, `[text]{claim=GEO-C001}` claim
  spans, `{plate:IMG-…}` plate blocks). Every claim marker must resolve to
  a live claim; every plate must be a real plate; a plate seated in the
  predecessor must survive.
- `basis` — `ledgerHash` and `inputsHash`: which ledger state and founding
  inputs this edition compressed. Provenance, not a gate.
- `previous` — the predecessor's runId, or null.

The current edition is the latest by date (runId breaks ties). An edition
that changes only the article re-adopts the same assessment and inherits
its standing; only a new judgment needs new blind checks. Standing itself
is derived at build time from the check runs of the adopted assessment
(`ratification` in `src/domain/load.ts`) — never stored.

## CaseView

The one join the pages read (`src/domain/view.ts`): every live claim once
with its treatment from the adopted assessment or none, the featured set in
edition order, the backlog, the dossier header, the article, the standing.
Pages hold no logic about how judgments are made.

## ResearchOpportunity, Study, Image

Research items are crux-directed projects (title, summary, `claimIds`,
effort tier, information gain, track). Studies are pre-registered desk
workpapers with frozen criteria (`docs/AUTOMATION.md`, the Bench). Images
are plates (real, with provenance and license; AI-generated images may
never be plates) or covers (generated, credited as such).

## ChangeLogEntry

Date, what changed, why, actor, AI-assistance disclosure, and an optional
`kind` (`content` | `housekeeping`). Append-only; whoever makes a material
change appends the entry in the same PR. Within a date, file order is the
timeline. (The design records a later candidate: deriving this log from
editions, adopted proposals, and assessment movements.)

## Record references in prose

Cite other records by exact id — `GEO-C001`, `SRC-MARCIS-2023`,
`GEO-E012`, `GEO-R003`, `GEO-001` — and the UI auto-linkifies them.
Articles use the inline claim-span syntax instead.

## Integrity rules (enforced at build time)

The loader fails the build on: any schema violation; dangling claim,
evidence, source, research, or assessment ids; references to rejected
claims; an unanchored claim dated on or after 2026-09-08; a source that is
neither cited nor background; an edition whose adopted assessment is
missing, hash-mismatched, or a check run; a featured claim without a
treatment; an article marker that does not resolve; a non-plate in the
plate position; a plate lost between editions; a missing steelman on any
run dated on or after 2026-09-04 (migration runs excepted). No silent data
repair.
