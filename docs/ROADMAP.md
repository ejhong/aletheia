# Roadmap

## Phase 1 — Real-content static site (current; scope revised 2026-08-22)

Goal: validate the public experience with real content — the geopolymer case built from the geo project's AI-extracted catalog, honestly labeled.

Build:

- the six public routes (see `INFORMATION_ARCHITECTURE.md`);
- folder-of-files content under `content/` with build-time Zod validation;
- static export deployed to GitHub Pages from git;
- responsive paper-toned design with the dossier register;
- CI (typecheck, lint, test, build).

Do not build a backend, search, filters, or the editor preview.

## Next workstream — Extraction pipeline (immediately after Phase 1)

Goal: a repeatable AI pipeline that turns source books/papers into candidate claims, evidence, and sources in the Aletheia content format, as append-only proposals for human review.

**First test: re-run the Fóti and Davidovits books through the pipeline and diff the output against the geo catalog (95 T-numbered topics) as ground truth.** The diff measures recall (topics the pipeline missed), precision (hallucinated or non-atomic claims), and stability (ID/wording churn between runs). Rejected-claim tombstones must suppress re-proposal.

Also feeds case #2 (vasocomputation): mine the "Knots of Existence" Substack article (`research/vasocomputation/`) and Michael Johnson's published QRI works.

## Confirmed case slate (eight cases; recorded 2026-08-22)

Research documents for cases 3–7 live in `research/` (filenames as present):

1. **Geopolymer / cast megalithic stone** — live (case #1).
2. **Vasocomputation + foam rolling / muscle knots** — in flight on branch
   `case/vasocomputation`. Research: `Knots, Vasocomputation, and the
   Biology of Stored Tension_ A Critical Research Report.pdf` and
   `research/vasocomputation/`.
3. **Orch OR (Penrose–Hameroff)** — orchestrated objective reduction as a
   theory of consciousness. Research: `Orch OR Ascending - by Eugene -
   Strange Loops In My Head.pdf` (essay) and `Orch OR Consciousness
   Theory_ Claims, Evidence, Replication, Anesthesia, and Experimental
   Roadmap.pdf`.
4. **Beatriz Villarroel's VASCO transients** — vanishing and appearing
   sources in century-spanning sky surveys. Research: `Adapting the
   Villarroel transient research to Aletheia.pdf`.
5. **Lucadou's Model of Pragmatic Information** — entanglement-inspired
   account of psi effects and their systematic elusiveness. Research:
   `Entangled Minds and Pragmatic Information_ A Comprehensive Synthesis
   of Psi Theory.pdf`.
6. **Zero Worlds** — live as case `zero-worlds`:
   observer-first theories of reality: Donald Hoffman (interface theory /
   conscious agents), Markus Müller (algorithmic idealism / "law without
   law"), Stephen Wolfram (observer theory / ruliad). Built from the essay
   `Zero Worlds_ The Observer, the Coincidence, and the Collapse.pdf`
   plus the research report `From "Zero Worlds" to Quantum Worlds_ ...pdf`
   (both in `research/`).
7. **CCC — Penrose's Conformal Cyclic Cosmology** — concentric low-variance
   CMB circles, Hawking points, and the disputed null-model statistics of
   the rebuttals. Research report forthcoming.
8. **Younger Dryas Impact Hypothesis (YDIH)** — a cosmic impact/airburst
   ~12,800 years ago as the trigger for the Younger Dryas cooling,
   megafaunal extinctions, and cultural disruption. Research-rich in both
   directions: the Comet Research Group's evidence lines (platinum
   anomalies, nanodiamonds, black mat stratigraphy) versus comprehensive
   critiques (e.g. Holliday et al. 2023, the "requiem" paper). An
   Athanatos Foundation–funded research area (UofSC/UCSB). No research
   doc in `research/` yet.

There is no Hancock category or meta-case: its constituent questions are
split into standalone cases (geopolymer and YDIH already are), and other
formerly-Hancock-adjacent questions (e.g. cultural motif transmission)
may become future standalone cases as warranted.

## Phase 2 — Canonical content system

Goal: make structured records durable and versioned.

Likely work:

- Git-canonical Case, Claim, Evidence, Source, Assessment, and Update files;
- schemas and validation;
- import pipeline;
- stable IDs;
- generated site index;
- reviewable diffs;
- database read model for search and performance;
- source-file storage policy.

### Phase 2 Cursor prompt

Paste this only after the Phase 1 mockup is approved:

```text
The Phase 1 mockup and information architecture are approved.

Read AGENTS.md and all documentation. Preserve the existing public UI
unless a data integration requirement makes a small change necessary.

Design and implement Phase 2: a Git-canonical structured content system.

Requirements:

1. Define versioned YAML or JSON schemas for Case, Hypothesis, Claim,
   ClaimRelationship, Evidence, Source, Assessment, ResearchCrux,
   ResearchOpportunity, and Update.
2. Add strict validation for references, cycles, source requirements,
   assessment provenance, and demo-versus-verified content.
3. Move the existing fixture data into the canonical content layout.
4. Build a data compilation step that produces the read model consumed
   by the app.
5. Preserve stable IDs and slugs.
6. Add human-readable diffs and generated validation reports.
7. Add GitHub Actions for formatting, schema validation, tests, link
   checks where applicable, and production build.
8. Document how an editor creates, freezes, reviews, and updates a Claim.
9. Do not add live AI ingestion, autonomous browsing, or direct
   production publishing yet.
10. Run all checks and provide a migration and handoff report.

First create docs/PHASE_2_IMPLEMENTATION_PLAN.md, then implement.
```

## Phase 3 — Editorial workflow

Goal: enable authenticated, reviewable human editing.

Possible work:

- authentication and roles;
- proposal queue;
- assessment diffs;
- source verification;
- approval workflow;
- audit logs;
- preview and staging;
- structured correction requests.

## Phase 4 — AI-assisted research pipeline

Goal: assist discovery and analysis without granting autonomous authority.

Possible work:

- monitored source feeds;
- candidate-source intake;
- claim extraction;
- duplicate detection;
- proponent and skeptic audits;
- source-locator verification;
- model and prompt provenance;
- human approval gates;
- scheduled stale-review reports.

## Phase 5 — Community and funding layer

Goal: turn unresolved cruxes into constructive research.

Possible work:

- structured expert contributions;
- contributor reputation based on accepted corrections and confirmed work;
- adversarial collaborations;
- research bounties;
- preregistration links;
- grant and replication tracking;
- public report cards;
- forecast and resolution records.
