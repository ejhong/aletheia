# AGENTS.md — Athanatos Evidence Atlas

## 1. Mission

Athanatos Evidence Atlas is a versioned, public map of contested hypotheses.

It connects:

**overview article → competing hypotheses → atomic claims → evidence → sources → research cruxes → decisive tests → change history**

The platform should allow ambitious or neglected ideas to be examined seriously without lowering evidential standards and without dismissing them in advance.

## 2. Product identity

The product is:

- an editorial publication for general readers;
- a claim graph for careful researchers;
- an evidence ledger;
- a research-prioritization system;
- a transparent record of how assessments change.

The product is not:

- an automated truth oracle;
- a personality-centered “believer versus skeptic” arena;
- a generic wiki;
- a social feed;
- an unmoderated comment forum;
- an AI-generated content farm;
- a place where a polished summary substitutes for primary evidence.

## 3. Non-negotiable epistemic rules

### 3.1 Observation before interpretation

Record what was observed, measured, depicted, or stated before assigning meaning, mechanism, identity, or historical relationship.

### 3.2 Atomic claims

Each Claim must contain one proposition with a reasonably clear truth condition.

Split compound propositions. Evidence for one rung of an argument must not silently count as evidence for every higher rung.

### 3.3 Competing hypotheses

Every major Case must include serious alternatives. Do not reduce a controversy to “featured thesis true” versus “featured thesis false.”

### 3.4 Claim credibility is not diagnosticity

Always distinguish:

- **Credibility:** how likely the local claim is to be true.
- **Diagnosticity:** how much the claim favors one hypothesis over its alternatives.

A credible observation can still be weak evidence for a grand theory.

### 3.5 Evidence direction is explicit

Every Evidence record must be classified as:

- supports;
- undermines;
- qualifies;
- context only.

Mixed effects should be split or explained.

### 3.6 Sources are not evidence by themselves

A Source is a document, dataset, object record, image, interview, or other provenance container.

An Evidence record is the specific observation, result, quotation, measurement, or methodological fact extracted from a Source and connected to one or more Claims.

### 3.7 Primary sources first

Prefer original papers, datasets, excavation reports, official artifact records, archival documents, direct measurements, and exact quotations.

Popular summaries may help discovery but should not carry a consequential assessment when a primary source is available.

### 3.8 Exact provenance

Preserve exact locators wherever possible:

- page;
- section;
- figure;
- table;
- timestamp;
- object ID;
- plate ID;
- dataset row;
- code commit;
- archival box;
- stable identifier.

If a locator is not verified, label it unverified. Never invent one.

### 3.9 Source statement versus inference

The interface and data must distinguish:

- what the source directly states or displays;
- what an editor or model infers from it.

### 3.10 Dependencies and independence

Do not count repeated reports, copied publications, related samples, shared datasets, or culturally dependent examples as independent evidence.

Use explicit independence groups and relationship records.

### 3.11 Negative evidence

Record misses, failed predictions, null results, absent expected features, unsuccessful replications, contradictory cases, and evidence unfavorable to the featured hypothesis.

### 3.12 Freeze before broad audit

For serious research workflows, freeze the Claim wording, operational definitions, inclusion criteria, predictions, and disconfirmers before open-ended evidence gathering.

### 3.13 Calibrated uncertainty

Do not use false precision.

Prefer plain-language states, probability ranges, sensitivity analysis, and explicit uncertainty over a theatrical single-number “truth score.”

### 3.14 Version everything important

Claims, evidence interpretations, assessments, and overview assertions must have visible revision histories.

A changed assessment should record what changed, why, and who approved it.

### 3.15 Human accountability

AI may assist with discovery, extraction, comparison, drafting, coding, and monitoring.

AI must not silently:

- create authoritative evidence;
- fabricate citations;
- change published assessments;
- publish externally;
- contact people;
- approve its own work.

A named human remains accountable for consequential published judgments.

## 4. Mockup-stage rules

Until explicitly moved into a later phase:

- use local typed fixture data;
- label all demo material clearly;
- do not fabricate genuine citations or identifiers;
- do not imply that demo assessments are Athanatos conclusions;
- do not build production authentication or database infrastructure;
- do not add live AI or web-research calls;
- optimize for product clarity and visual learning.

## 5. Domain objects

The core objects are:

- Case
- Hypothesis
- Claim
- ClaimRelationship
- Evidence
- Source
- Assessment
- ResearchCrux
- ResearchOpportunity
- Update
- Contributor
- ReviewAction

Keep the domain layer independent from the UI framework.

## 6. Relationship vocabulary

Supported Claim relationships include:

- `depends_on`
- `refines`
- `duplicates`
- `alternative_to`
- `contradicts`
- `supersedes`
- `is_example_of`

Evidence-to-Claim direction is modeled separately.

Relationships must reference valid IDs and must not create accidental cycles where the relationship semantics forbid them.

## 7. Interface rules

The public interface should:

- begin with an accessible overview;
- always provide a route to the underlying Claim;
- present supporting and undermining evidence symmetrically;
- explain unfamiliar epistemic terms in place;
- show the last review date;
- make “what would change our mind” prominent;
- reveal AI involvement and human review;
- work well on mobile;
- remain readable without graph expertise.

Avoid:

- visual clutter;
- unlabelled scores;
- red/green moral coding;
- infinite feeds;
- engagement bait;
- confusing personality with hypothesis;
- treating consensus as proof or outsider status as evidence.

## 8. Code rules

- TypeScript strict mode.
- Prefer small, composable components.
- Keep content and data separate from presentation.
- Centralize configuration.
- Validate domain records.
- No dangling IDs.
- No silent data repair.
- Avoid `any`.
- Avoid unnecessary dependencies.
- Preserve accessibility.
- Add tests for important transformations and interactions.
- Formatting, linting, type checking, tests, and production build must pass.

## 9. Agent workflow

For material work:

1. Read this file and relevant documentation.
2. Inspect existing code and data before changing them.
3. State assumptions in the implementation plan.
4. Make the smallest coherent change that advances the current phase.
5. Validate the result.
6. Document material decisions.
7. Report limitations honestly.

Do not ask for confirmation when a reasonable default is available. Do not make irreversible or production-affecting changes without explicit authorization.

## 10. Definition of done

A task is done when:

- the requested behavior exists;
- the interface is coherent;
- the data model remains valid;
- accessibility is preserved;
- tests cover the highest-risk behavior;
- all automated checks pass;
- documentation is updated;
- no source, citation, assessment, or provenance has been fabricated.
