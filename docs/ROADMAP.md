# Roadmap

## Phase 1 — Product mockup

Goal: validate the public experience, information architecture, editorial hierarchy, visual language, and core Claim-to-Evidence navigation.

Build:

- polished public routes;
- local typed fixture data;
- search and filters;
- responsive design;
- editor-workflow preview;
- documentation;
- validation and smoke tests.

Do not build a backend.

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
