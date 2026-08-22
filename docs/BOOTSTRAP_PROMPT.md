 > **HISTORICAL DOCUMENT (2026-08-22).** This was the starter kit's original bootstrap prompt for a placeholder-content mockup. The project has since been renamed **Aletheia** and re-scoped to a real-content static site (see `docs/DECISIONS.md`, `docs/CONTENT_POLICY.md`, and the revised `docs/INFORMATION_ARCHITECTURE.md`). Kept for reference; where it conflicts with the decisions log, the decisions log wins.

# Build the Athanatos Evidence Atlas mockup

You are the lead product designer and senior full-stack engineer for a new project called **Athanatos Evidence Atlas**.

Read these files completely before changing anything:

- `AGENTS.md`
- `docs/PRODUCT_SPEC.md`
- `docs/INFORMATION_ARCHITECTURE.md`
- `docs/DATA_MODEL.md`
- `docs/DEMO_CONTENT.md`
- `docs/ROADMAP.md`
- `docs/MOCKUP_REVIEW_CHECKLIST.md`

## Mission

Build a beautiful, credible, public-facing website for mapping disputed scientific, historical, archaeological, and anomalous hypotheses.

The site must let a reader begin with a compelling overview article and progressively descend into:

1. competing hypotheses;
2. atomic claims;
3. evidence for, against, and qualifying each claim;
4. source records and exact provenance;
5. unresolved cruxes;
6. decisive experiments or analyses;
7. a visible change history.

The site is not a debate forum, not a generic wiki, not a news feed, and not an automated “truth oracle.” Its purpose is transparent, fine-grained truth-seeking.

## Work order

Build **Phase 1 only: a high-fidelity, responsive mockup backed by local typed demo data**.

Do not implement:

- authentication;
- a production database;
- background jobs;
- live AI calls;
- autonomous web research;
- real community submissions;
- payments;
- email;
- production publishing workflows;
- real scientific verdicts.

The mockup should feel like a nearly finished product, but all content must come from local fixture data.

First write a concise implementation plan to `docs/IMPLEMENTATION_PLAN.md`. Then proceed immediately with implementation unless there is a genuine technical blocker. Do not stop merely to ask aesthetic questions; make strong, coherent defaults.

## Technical direction

Use:

- the current stable Next.js release with the App Router;
- TypeScript in strict mode;
- Tailwind CSS;
- accessible, reusable React components;
- local typed fixture data;
- a lightweight icon library;
- automated formatting, linting, type checking, and production build verification.

Use current stable package versions that work together. Avoid unnecessary dependencies and avoid premature infrastructure.

Create a single site configuration object so the name, subtitle, navigation, and editorial labels can be changed without hunting through components.

## Visual direction

The product should feel like a synthesis of:

- a high-end long-form journal;
- a scientific evidence workbench;
- a carefully curated museum catalog;
- a transparent research notebook.

Use:

- generous whitespace;
- strong editorial typography;
- a refined serif for display headings and a highly legible sans-serif for interface text;
- warm off-white or paper-toned surfaces;
- deep ink or midnight text;
- restrained accent colors such as muted ochre, mineral green, or oxidized copper;
- subtle borders, rules, and shadows;
- small amounts of texture or abstract CSS artwork where useful.

Avoid:

- generic AI gradients;
- neon cyberpunk styling;
- excessive glassmorphism;
- dashboard clutter;
- oversized rounded cards everywhere;
- fake scientific precision;
- visualizations that look impressive but communicate little.

The interface should feel calm, serious, inviting, and unusually clear.

## Required routes

Build these routes:

### `/`

Homepage with:

- a concise mission statement;
- one featured Case;
- a grid of additional Cases;
- a global search input;
- “recently updated” items;
- a short explanation of the method;
- an invitation to explore claims rather than merely accept a verdict.

### `/cases`

Browsable Case index with filters for domain, assessment state, review recency, and research status.

### `/cases/[caseSlug]`

The main Case page. It must include:

- title, subtitle, domain, editor, and last comprehensive review date;
- a clearly visible “demo content” marker for the prototype;
- current overall assessment in plain language;
- an accessible overview article;
- strongest evidence for;
- strongest evidence against;
- best conventional or competing explanation;
- the central crux;
- what would change the assessment;
- a compact hypothesis comparison;
- a claim tree;
- a summary of the evidence ledger;
- prioritized research opportunities;
- recent changes;
- links into every deeper layer.

Use a sticky section navigator on desktop and a compact mobile alternative.

### `/cases/[caseSlug]/claims`

Claim explorer with:

- nested claim hierarchy;
- list and tree views;
- filters for assessment, importance, claim type, and review state;
- search;
- clear parent-child relationships;
- badges that are understandable without a legend.

### `/claims/[claimId]`

Claim detail page with:

- one atomic claim statement;
- plain-language interpretation;
- current assessment;
- importance to the larger Case;
- claim type;
- parent and child claims;
- dependencies and alternatives;
- evidence supporting it;
- evidence undermining it;
- qualifying or contextual evidence;
- strongest unresolved objection;
- predictions;
- disconfirmers;
- “what would change our mind”;
- exact source links or placeholder source records;
- assessment history;
- AI involvement and human review provenance fields in the interface.

The page must clearly separate:

- whether the claim itself is credible;
- how diagnostic the claim is for the larger hypothesis.

### `/sources/[sourceId]`

Source record with:

- title;
- authors or organization;
- date;
- source type;
- identifier or placeholder status;
- reliability notes;
- exact locator fields;
- claims connected to the source;
- excerpts or summaries clearly labeled;
- source statement versus editor inference;
- correction, retraction, and version fields.

Do not fabricate real citations. Demo sources must be visibly labeled as illustrative placeholders.

### `/cases/[caseSlug]/hypotheses`

A comparison view showing:

- the featured hypothesis;
- serious competing hypotheses;
- what each predicts;
- evidence each explains well;
- evidence each struggles to explain;
- key discriminating observations;
- a simple, legible relationship map.

Do not use a chaotic force-directed graph. Prefer a carefully laid-out comparison matrix and a compact dependency diagram.

### `/cases/[caseSlug]/research`

Research agenda with:

- unresolved cruxes;
- proposed experiments or analyses;
- expected information gain;
- rough cost or effort tier;
- feasibility;
- prerequisites;
- possible failure modes;
- which claims each project would update.

### `/cases/[caseSlug]/history`

Readable change log with:

- date;
- changed object;
- previous assessment;
- new assessment;
- reason for change;
- source or review that triggered it;
- human reviewer;
- AI assistance disclosure.

### `/method`

A clear public methodology page explaining:

- atomic claims;
- competing hypotheses;
- evidence direction;
- credibility versus diagnosticity;
- source provenance;
- dependency and independence;
- negative evidence;
- uncertainty;
- versioning;
- human review;
- how AI is and is not used.

### `/editor-preview`

A nonfunctional visual preview of a future editor workspace. It should show:

- pending evidence proposals;
- source verification status;
- claim changes awaiting review;
- an assessment diff;
- approve, request changes, and reject controls that are visually disabled or marked “prototype only.”

This route exists only to test the future workflow. Do not build real editing.

## Core reusable components

Create polished, reusable components for:

- `CaseCard`
- `AssessmentBadge`
- `ClaimCard`
- `ClaimTree`
- `EvidenceCard`
- `EvidenceBalance`
- `SourceCitation`
- `HypothesisComparison`
- `ResearchCruxCard`
- `ResearchOpportunityCard`
- `ChangeTimeline`
- `ConfidenceRange`
- `DiagnosticityIndicator`
- `ProvenancePanel`
- `MethodTooltip`
- `SectionNavigator`
- `DemoContentNotice`
- `EmptyState`
- `FilterBar`
- `GlobalSearch`

Assessment vocabulary should be explicit and humane:

- Established
- Well supported
- Provisionally supported
- Mixed
- Weakly supported
- Contradicted
- Unresolved
- Presently untestable

Do not reduce the interface to red versus green. Use labels, concise explanations, and restrained visual treatment.

## Demo content

Use the illustrative Cases and claims in `docs/DEMO_CONTENT.md`.

Fully populate the Vasocomputation Case so every required route has meaningful content. The other Cases may be lighter but should make the homepage and Case index feel real.

All mock content must be visibly labeled as demonstration content. Do not invent genuine papers, quotations, DOIs, page numbers, museum identifiers, experiments, or historical facts.

No lorem ipsum. Write concise, polished interface copy.

## Interaction requirements

Implement:

- working route navigation;
- responsive desktop, tablet, and mobile layouts;
- keyboard-accessible controls;
- visible focus states;
- search over local demo data;
- client-side filtering;
- claim tree expansion and collapse;
- tabs or anchored sections where appropriate;
- tooltips or popovers explaining technical labels;
- copy-link action for claims;
- a compact “share this exact claim” affordance;
- a reading-progress or section-position treatment on long Case pages;
- graceful empty states.

Use motion sparingly and respect reduced-motion preferences.

## Data and architecture requirements

Represent the local data with typed domain objects derived from `docs/DATA_MODEL.md`.

Keep content separate from presentation. Do not hard-code Case content directly into page components.

Create a small data access layer so local fixtures can later be replaced by Git-backed content and a database without rewriting the UI.

Validate demo records at development time. A malformed claim or dangling relationship should fail loudly.

## Documentation requirements

Create or update:

- `README.md` with install, run, test, and build commands;
- `docs/IMPLEMENTATION_PLAN.md`;
- `docs/COMPONENT_MAP.md`;
- `docs/DECISIONS.md` for material design or architecture choices;
- `docs/PHASE_1_HANDOFF.md` explaining what is real, what is mocked, and the recommended next step.

## Quality requirements

Before declaring completion:

1. run formatting;
2. run linting;
3. run TypeScript checking;
4. run tests;
5. run a production build;
6. fix all errors;
7. verify every required route;
8. inspect the site at common desktop and mobile widths;
9. check for overflow, illegible contrast, broken hierarchy, and dead controls;
10. confirm that no real-looking source has been fabricated.

Add focused tests for:

- schema validation;
- route generation from fixtures;
- claim relationship integrity;
- filters;
- at least one high-value page interaction.

## Acceptance criteria

Phase 1 is complete only when:

- the homepage looks publication-ready;
- the Vasocomputation Case can be read from overview to atomic claim to evidence to source;
- the distinction between claim credibility and diagnosticity is visually obvious;
- supporting and undermining evidence receive equal structural treatment;
- the claim hierarchy is understandable on desktop and mobile;
- the research agenda feels like a natural continuation of the evidence review;
- every route is functional;
- demo content is unmistakably labeled;
- the codebase is clean enough to continue into Phase 2;
- all checks and the production build pass.

At the end, provide a concise handoff containing:

- what was built;
- routes;
- commands;
- major design decisions;
- known limitations;
- the three most important questions for the human product review.

Begin now.
