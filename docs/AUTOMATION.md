# The metabolism: how the site runs itself

**Direction updated 2026-09-05:** a durable research ledger and a current
edition of each case. The founder authorized implementation after the
reassessment and added a blank-topic trial. This is the implementation
plan; the existing workers below are being consolidated into it. Changes
publish only after the normal checks and independent arbiter pass.

## The design we are building

Aletheia is a collection of living research essays. More AI time should
improve the questions, evidence, judgments, and explanation; it should not
oblige the site to grow longer or sound more certain.

There are **two kinds of state**:

- **The ledger:** propositions, source records, exact observations,
  dependencies, research opportunities, studies, and decisions about proposed
  changes. Corrections and supersession preserve their history. The ledger
  must be queryable, not repeated in full in every model prompt.
- **The current edition:** the argued assessment, what matters most, the
  strongest objections, next questions, and the essay. Selection and prose
  are part of judgment. They must eventually be proposed and reviewed as a
  coherent edition, not maintained by competing owners.

The workflow is **investigate → propose a change → verify and record →
assess and explain → independently review → publish**, then choose the
next useful question. Investigating, drafting, and reviewing are distinct
roles in this workflow. They do not require separate stores of the same
judgment. The code's existing content → domain → UI separation remains.

**Intake is one interface, with several adapters.** An inbox note, a source
search, a study result, and an inward-looking reconsideration all propose
changes to existing domain records. A proposal can add, correct, link,
supersede, or reconsider; its envelope names its basis, affected records,
provenance, and rationale. Source, Evidence, Claim, ResearchOpportunity,
and Study remain the domain vocabulary. A new source identifier is not
proof of a new observation, and a known DOI does not mean every passage
or interpretation has been considered. Identifier equality is mechanical;
semantic overlap is a review question with both candidates visible.

**Memory records decisions in context.** A disposition is dated, reasoned,
and tied to its inputs; it is not a permanent rejection of an idea. New
evidence, a corrected reading, a changed test, or a better argument may
justify reconsideration. No rule requires citing a record created after
the rejection. A variant should be compared with its predecessor. Repeated
wording without a substantive difference can be recorded once and rested.
Consolidate the watch, promotion, and agenda memories behind this interface
as their adapters migrate; do not maintain two authoritative ledgers.

**Review has two acts.** First assess the evidence without the incumbent's
grades or article. Then inspect the proposed edition for unsupported
assertions, lost caveats, misleading selection, and constitutional fidelity.
A blind verdict check is not independent verification of a source reading,
and model concurrence is not truth. Passage verification must be a separate
check against the retrieved primary material. The existing PR arbiter
continues to gate consequential publication.

**An edition changes only when the change earns its place.** Scope candidate
edits to the changed inputs; use whole-essay candidates when dependencies or
the question itself changed. Narrative judgment calls are settled by the
competition of candidate drafts, as AGENTS.md §7 requires. A small drafting
run can produce alternatives, with the incumbent retained as an explicit
option; the panel compares them before replacement. Larger tournaments with
several independent drafters are a later scaling choice, not an exemption from
competition. Preserve primary-source anchors, consequential objections,
corrected errors, and the route from prose to records. An unchanged edition
after a useful investigation is a successful outcome.

**Attention follows observed value.** Record accepted corrections, new
independent observations, resolved or reopened cruxes, useful tests, and
editorial improvements, alongside rejected proposals, calls, spend, and
elapsed time. Neither DOI counts nor a model's own claim of novelty measures
progress. A run limit and spend ceiling stop work even when a model keeps
finding something to say; a rest state means low recent return within the
searched scope, not proof that the topic is complete. Broader autonomous
research must wait for enforced spend accounting. The existing promotion job
now uses the bounded reader; no additional research schedule is installed.

### Implementation sequence and acceptance criteria

| Step | Deliverable | Acceptance criterion / status |
| --- | --- | --- |
| 1 | Shared case view; exact review receipts | Implemented in PR #172. Essay references, claim cards, ladder, and claim detail read the displayed draft's grades. Only a full panel on the exact current content and draft can ratify; historical reviews remain available. |
| 2 | Essay-first reading experience | Implemented in PR #172. Short frontispiece, inspectable claims with ordinary-link fallback, supporting detail in disclosures, mobile claim sheet. Existing essays and evidence are preserved. |
| 3 | Blank-topic starting path | Implemented in PR #172. `start-case.mjs` creates an incubating proposal from a question, with no invented evidence, priority, or review. The production loader and view accept it; judgment runners skip it until it has assessable evidence. This tests startup, not autonomous discovery. |
| 4 | Shared proposal memory and intake diff | Durable history for watch, promotion, and agenda; inbox links and legacy watch imports now use the common research envelope. Complete bundles and before/after edits pass the production loader, including empty topics. Notes, document extraction, and agenda adoption still need adapters. Source identity and identical wording are mechanical; semantic overlap remains a review question. |
| 5 | Bounded research and source-reading checks | Manual URLs and the existing promotion job share one reader, capped at two public HTML/text sources per pass even across cases. A separate reading checks each drafted observation. Complete, fresh proposals can be prepared for the normal publication gate; failures and stale inputs remain visible. The shared allowance now covers research, drafting, review, operator, and artwork; broad discovery and PDF/OCR remain to build. |
| 6 | Versioned edition drafting | The authoring path binds an essay, ordered selection, and exact assessment reference in one immutable edition. A selected assessment can now supply complete interpretation for catalog claims, without editing their ledger records. Proposals bind to current inputs, rest unchanged candidates, and pass the production loader before review. Deep Memory preserves its unassessed opening. Automatic model drafting, candidate comparison, and migration of assessed cases remain to build. |
| 7 | Pilot, measure, and widen | Exercise geopolymer, transients, and Deep Memory, the founder-selected topic about shared symbols and myths (`content/cases/deep-memory/`). Its empty starting point is preserved in PR #179; the illustrated opening adopts the first checked catalog observation. Its scope is informed by the birdmen project, so this is not blind rediscovery. Compare accepted changes and reading quality with the incumbent, under a single enforced budget covering research and review. The archived chats are design references and a possible held-out discovery benchmark, not an import queue. Expand only after unattended runs improve actual cases. |
| 8 | Reading experience and automation visibility, after the pipeline work | Review the whole information hierarchy across the case narrative, assessments, claims, evidence, research questions, Panel and Proposals. Try a compact current assessment near the top of the narrative, with what changed and why, followed by the essay and routes into supporting records. Make consequential judgment changes easy to notice without making change frequency a goal. Give global spend, activity, model roles and system health a quiet home; keep research decisions and edition changes within their cases. Start from durable receipts and decisions, leave missing case-level cost allocations explicit, and keep detailed run history in disclosures. Judge the result for beauty, interest and usefulness on mobile and desktop. |

The migration deliberately does not relocate every editorial field at once.
Existing cases still obtain diagnosticity and other editorial fields from
legacy records. A new edition can take each claim's interpretation from its
selected assessment instead. Component judgments and case framing remain in
the legacy case record; those fields still need an assessment-owned projection.
`CaseView` is the migration boundary. The automated edition writer remains to
build. Aggregate accounting now surrounds the source reader's local limits and
the other paid workers; see [AI operating policy](../config/README.md).

The next edition-drafting pass should compose images as part of the account:
select existing verified plate IDs, place each beside the passage it explains,
and write captions that distinguish visible observations from interpretations.
Birdmen supplies comparative image leads for Deep Memory. Exact object
identities, original image sources and rights must reach the ledger before a
new evidence plate is used. Generated covers remain editorial artwork. The
existing manifest and plate markers are the interface; no separate visual
publishing loop is needed. Automated selection and new plate acquisition are
still to build, under the same edition review and spending allowance.

### Versioned editions: the first authoring path

An edition is `editions/<runId>.yaml`: the essay, ordered featured claim IDs,
the reason for this revision, exact input hashes, and a predecessor reference.
It names an immutable assessment by run ID and hash, or explicitly leaves the
question unassessed. Reusing an assessment preserves its original authorship;
assembling an opening essay does not impersonate an assessment model. The
manifest is the publication unit, with no mutable current pointer. Earlier
editions form a validated chain and have readable archive pages.

`prepare-edition.ts` captures the incumbent. `review-edition.ts` reports changes,
validates the whole proposed case, records a typed proposal in the existing
intake store, and can materialize a new review directory. These commands make
no model calls. Unchanged substance on the same inputs rests. Stale proposals,
broken histories, invalid claim/plate references, and altered assessment hashes
fail validation. The selected assessment's load-bearing claims must remain
selected. Source interpretation and omissions still require independent review;
these structural checks do not settle them.

An assessment's per-claim `treatment` holds the plain-language explanation,
claim classification, importance, diagnosticity and its reason, strongest
objection, and what would change the judgment. Its existing verdict and
reasoning supply credibility. Treatment is optional on immutable older runs
but must be complete when provided. Only the assessment adopted by an edition
can supply these fields to the current presentation; a bare draft can be
inspected in history but cannot promote a catalog claim. A selected catalog
claim without treatment fails validation. Its proposition, anchor, origin,
independence group, and stored tier remain intact.

The case page, explorer, and claim detail share that joined view, with each
claim appearing once. Displayed treatments and independent grading share one
claim scope: legacy featured records plus the current edition's selected IDs.
An unselected catalog treatment remains in history without inheriting the
edition's standing. History preserves earlier interpretations in disclosures.
The blind packet includes all live propositions and adds newly selected catalog
IDs to its grading scope, in ledger order. It excludes treatment, prose, and
grades. Existing assessment/content receipt checks require fresh concurrence
after a changed interpretation; selection does not create ratification.

The current edition replaces `overview.md` for a migrated case. New assessment
drafts remain available but cannot silently change its displayed verdict. Its
exact bytes enter the content receipt; historical editions do not invalidate
current checks. A ledger change resets standing and displays a quiet notice
that the edition reflects earlier inputs; a useful investigation may still
retain it unchanged. The archive preserves the essay and
assessment, while record links and image captions resolve against today's
ledger; it is not a snapshot of every old page.

Only Deep Memory is migrated in this step. The old editorial audit does not
patch a versioned essay, and legacy reconciliation retains its incumbent until
an edition proposal is ready. Other cases continue through their existing
workers. New editions remain consequential content under the normal PR arbiter.
The model drafter and its independent candidate review must work before moving
assessed cases to this path. No new schedule or paid worker is enabled here.

Inbox notes and links, literature watch, inward-looking agenda proposals, and
the planned browsing Expedition are adapters to the same research-proposal
interface. Inbox links and watch imports now feed the bounded supplied-URL
reader; notes, document extraction, and agenda adoption still use their older
adapters. Shared spend accounting across research,
drafting, and review precedes unattended Expedition runs. An accepted ledger
change should then prompt an edition candidate, with retaining the incumbent
always available.

### Shared source reader and its first trial

`research-sources.ts` and the existing `promote-imports.mjs` job call the same
reader. It reads supplied public sources, the current ledger, the submitted
context, and recent intake reasons. A
drafting model proposes one local observation per source; a different model
checks the metadata, proposition, paraphrase, inference boundary, caveats, and
independence against the retrieved text. Both are OpenAI models in this first
adapter; this is a separate reading, not cross-vendor concurrence. The normal
publication arbiter and assessment-standing rules remain separate.

The source limit is two, the model-call limit four, the output-token limit 6,000
per call, the deadline four minutes, and the research allowance $1 per pass
at the explicit standard-tier rate card. Two cases share that one budget;
the allowance is not multiplied by case. Full input-context liability is
reserved before each request; returned usage replaces the reservation with an
uncached tariff estimate. Unknown usage retains its reservation and stops paid
work. There are no tool calls, hidden retries, or fallback models. These are
per-run research controls, nested inside the shared monthly/daily allowance
for all repository API workers, review, the operator, and artwork. This replaces the existing promoter's
three-source cap and house-model fallback with a two-source, metered pass.
Its weekly/dispatch cadence and one-cycle boundary are unchanged. Additional
autonomous discovery schedules wait for aggregate research-and-review allocation.

Inbox capture is model-free: it records a `source-request` with the supplied
context and origin, then archives the original file unchanged. Reachability
alone no longer creates an `ai_verified` source proposal. `source-queue.ts`
derives pending work from requests and reading/adoption outcomes; old watch
import files are a read-only adapter to that queue. There is no mutable queue
cursor. Captured requests become eligible after their PR merges and are read
on the next full maintenance run, or a manual invocation of the existing job.

`research-adoption.ts` prepares recorded proposals without a model call. It
checks the exact current basis and validates a complete prospective case before
installing changed records and a changelog entry in the working tree. A failed
installation restores the original files; a failed restoration aborts the job.
Outcomes reference the original proposal, preserving the drafting model and
reading receipts. Already present records are retained, stale proposals are
parked for a fresh reading, and prepared bundles reach an ordinary gated PR.
Neither the reader nor the materializer can publish or change an essay.

The Deep Memory trial began with an empty ledger and two supplied primary-source
leads. It produced a three-record Source/Claim/Evidence proposal from the
excavation project's Pillar 43 account. The Met returned HTTP 429 and contributes
no automatically verified observation. The final run kept the checked bundle
and recorded the retrieval failure, with $0.014834 estimated from returned model
usage. Earlier request failures and the first discarded partial run remain in
history. This demonstrates bounded source intake, not autonomous rediscovery,
semantic saturation, or a judgment that the shared-inheritance hypothesis holds.

### Durable intake history

Watch, triage, and promotion share `source-identity.mjs`: DOI/arXiv aliases
are exact identity hints, URL distinctions are preserved, and title similarity
remains advisory. Knowing a source does not mean every passage or observation
has been assessed. Legacy source-import requests already carried in the ledger
are skipped; an explicit new inbox request may seek another observation from
that same source. The reader reuses exact source identities, and the common
proposal validator rejects duplicate identifiers. Repeated claim wording and
similar source titles produce review warnings, retained in the adoption outcome.
Semantic similarity and independence still require review.

`proposals/intake/` is the authority for watch-triage, historical promotion,
agenda-proposal, agenda-score, source-request, research-run, research-proposal,
research-adoption, and edition-proposal decisions. `intake-store.mjs` validates and writes immutable
batches, normally one per worker run. Decision and batch hashes detect changed
payloads. Exclusive atomic file installation makes retries safe and concurrent
writers preserve both batches. Modifying or deleting existing history requires
the consequential-change gate; new proposal-only batches retain their existing
risk category. Workers, the proposal page, and governance totals read this store.

Every entry records the candidate or source, outcome, reason when available,
case, date, run and model/protocol stamps, and available input receipts. A panel
score keeps every seat's reasoning and concerns; totals must agree with those
seats. Fewer than four returned scores or changed case inputs leave the review
incomplete and retryable, without an actionable score. The four-highs,
zero-concerns advancement rule and the separate publication gate are unchanged.
Scoring packets include earlier reasons but omit earlier vote totals and grades.

A proposal's title is not its identity. The agenda generator receives prior
proposals and review reasons, and may revisit the same title with a changed
argument, control, or case context. Only identical substance on identical case
inputs rests mechanically; a new title alone does not defeat that check.
Silence means unreviewed. Source requests rest on the same case, submitted
context, URL, and case inputs. A rejected or empty reading closes that request;
changed context or a changed case permits a new one. Operational failures
remain retryable, and a stale or invalid adoption reopens its source request.
All retries use the same pass budget. None of these equality checks measures semantic
novelty, coverage, or saturation.

`migrate-intake.mjs` replays a committed snapshot and verifies every migrated
field and original row before retiring the old archive, promotions, triage, and
score stores. A legacy row carries its original commit and locator; duplicate
archive/report copies remain attached as provenance for one decision. Missing
historical reviewer reasons, model identities, and input receipts stay unknown.
The original agenda Markdown remains the candidate input, and new scores bind
to that exact proposal. Public case slugs resolve through case metadata when
they differ from directory names.

Watch-run expiry no longer erases a triage decision. Failed watch cases stay
due, and promotion runs save their outcomes even when no source is imported.
The existing schedules and one-cycle adoption boundary remain; the promotion
job now shares the source reader's explicit budget above. Broad discovery/retrieval coverage, source revision
monitoring, and aggregate spend enforcement are subsequent work; this cutover
does not claim that every research or drafting action is already recorded here.

### Review receipt rollout

New blind checks carry `generatedAt` and a `review` receipt: protocol,
content hash, assessment hash, and packet hash. All three hashes must match;
the loader and workers recompute the packet hash with the same builder used
to prepare the blind assessor’s inputs. The content snapshot covers
the case, essay, both claim files, evidence, sources, research, conjectures,
image manifest, and study files. Operational cursors and history are excluded;
appending a check does not invalidate itself. A run checks again before
installing results so a mid-call content change cannot receive those reviews.

The scheduled drafter also records the hash of its evidence packet to skip
unchanged work, including repeated runs on the same day. It now receives
the same sources, dependency context, and study records as the assessor.
Legacy drafts use their existing timestamp until their next reassessment;
no input receipt is backfilled without a run.

Legacy checks lack such receipts and are not retroactively certified. They
remain visible as historical checks; current standing is unratified until
fresh checks match. The existing content-response worker will repanel these
cases after rollout. This is a one-time review cost on the existing cadence,
not a declaration that their prior evidence became weaker. A reconsideration
needs a full fresh quorum, not one new seat plus the judges it consulted.

## Where we are (reassessed 2026-09-05)

The question the founder asked: is the loop — *update, surface what is
useful, re-evaluate* — actually working? Answer in three parts.

**The judging half has a track record, with a freshness defect found in this
reassessment.** Panels convene on canon changes, but calendar dates could
miss same-day edits and allow one fresh check to renew older reviews. The
receipt implementation above replaces that rule. Earlier reported standings
are historical observations, not evidence of current snapshot coverage. The
arbiter has judged every `needs-approval` PR since 2026-08-25 and its
parks have been substantively right more often than wrong — including
parking its own repository's mistakes (#47's missing permission record,
#55, the 2026-09-05 unfunded-seat park). Reassessment runs ~5 times a day
and correctly does nothing when nothing changed. Reconciliation has run
once and produced three honest standoffs. The editorial audit has made
corrections that survived the panel.

**The producing half is wired but has almost no track record.** In two
weeks the pipes have produced: one promotion (SRC-FALL-2026 → ZW-E019,
2026-09-01), three scored agenda runs, one adoption by founder direction,
and two Bench-drafted study freezes that were founder-supervised through
collection. Nearly every other verdict-moving event in the yield table is
founder-directed construction, which is why all ten cases read "hot" — the
metric has not yet had a quiet week to discriminate. The endorsement
drafter (2026-09-02) has not yet had a scheduled run. The honest statement
is: the machine can now produce, and the first unattended evidence arrives
on the Mondays of 2026-09-07 and 2026-09-14.

**Two things were not working, both fixed 2026-09-05.** (1) The weekly
digest — the founder's one observer artifact — was never posted: the
Maintain workflow lacked `issues: write`, and the failure was swallowed by
a warning fallback on every run since 2026-08-25 (#167). Nothing routed to
the digest has ever been seen. (2) Two panel seats were unfunded (OpenAI
credits; xAI *monthly spending limit*), which closed the gate to every
`needs-approval` change from 2026-09-03 until the founder restored them
(#165 made the report say so). Neither is a design fault; both are the
kind of quiet non-firing the design's own tests-over-mechanisms doctrine
exists to catch, and both were found by asking why the founder had heard
nothing, not by any monitor.

**The panel was re-seated 2026-09-05** on judgment per dollar (see the
DECISIONS entry): two seats had been far weaker than the rest — the
OpenAI seat was running `gpt-5.1` with no reasoning at all, the Google seat
a superseded Pro preview — and the open-weight seat was the second most
expensive. Every seat now pins its effort, so the judges are what the
record says they are. Expect the seat-record table on /panel to start new
rows for the new models; the old rows are history, not error.

### Existing workers

Promotion, agenda scoring, study freeze drafting, the steelman requirement,
assessment, reconciliation, and the publication arbiter are implemented.
Retrieval-based passage checking, study collection, Expedition, and a unified
edition drafter still need implementation. The sequence above replaces the
previous numbered build order.

### Simplification (founder direction, 2026-09-05: "as simple as possible")

The workflow surface has grown faster than anyone's ability to hold it in
one head. What exists: ten workflows, four Maintain jobs, three cadences
(hourly, daily, weekly), a throttle with epochs and a supervision trailer,
and three long documents. What to do about it, in order of payoff per
line changed:

1. **Three documents with three jobs, and nothing else.** `AGENTS.md`
   (rules), this file (design + status), `docs/MAINTENANCE.md` (runbook:
   what runs, what to check). `docs/DECISIONS.md` is history, not a
   manual. The Phase-1 starter-kit documents (roadmap, product spec,
   information architecture, mockup checklist, bootstrap prompt, starter
   readme) were removed 2026-09-05; the runbook was rewritten from 429
   lines of interleaved rationale to a one-page map plus a symptom table.
   Rationale goes in DECISIONS once; it is not repeated in the runbook.
2. **Use the digest to evaluate unattended work.** The founder has now
   authorized construction; the earlier two-Monday pause is superseded.
   Observing the digest remains part of validation, not a blocker to fixes.
3. **Cadences should say what they do.** The content-response cron
   requests hourly and receives ~5/day; the operator runs daily and most
   days writes "nothing needed doing". Candidates once the digest has
   data: make content-response four fixed times a day (same latency,
   honest schedule), and make the operator event-driven (parked PR,
   issue, quarantine) with a weekly sweep instead of a daily one. Change them when observed latency and cost justify it.
4. **Retire what the lane fix made redundant.** The `GATE_EPOCH` bumps
   were a workaround for the throttle miscounting founder work; the
   `Supervised-by` trailer fixed the count. If no epoch bump is needed
   through September, remove the epoch machinery and the paragraphs
   describing it.
## Purpose

The site is a compression under constraint: the best honest summary AI can
currently produce of a contested question, where every sentence is
load-bearing on a public ledger, and where the compression improves over
time without the ledger ever losing a fact, a correction, or a dissent.

A researcher landing on a case should find, within one screen: what is
established, what is contested and by whom, the strongest evidence each
way, the studies the system itself ran, and the shortest path to settling
the question — each one click from its primary source. The site's real
product is a machine for pointing at decisive tests.

Two dynamics with opposite ideals, deliberately separated:

- **The ledger preserves history.** Claims, evidence, and sources
  can be corrected, merged, or superseded without losing the earlier record. That is the archive doing its job; tiers keep
  readers above water. "Saturation" is not a property of the stream —
  the stream is infinite — it is a measured property of the judgment
  layer (below).
- **The presentation converges.** Verdicts, standing, the narrative, the
  choice of what is load-bearing: these are compressions of the ledger,
  and they are the things that ratchet toward quality.

Models are stateless; the repository is the state. Every loop reads the
smallest structured projection of the ledger its question requires — the
identifier index for dedup, the claims index for coverage, dates for
change — and pulls full records only for the claims in play. Growth costs
storage, not context.

## Existing workers and their responsibilities

These names describe capabilities being consolidated into the workflow above,
not five separate layers of state. All write through the same gate (classifier → arbiter panel →
merge policy). No loop has its own door.

### 1. The Watch — hears (exists)

Literature watch → triage → verification pipeline, as built — plus the
segment an outside review (2026-09-01) correctly found missing: **the
promotion pipe**. Verified import proposals previously died in
`proposals/` on a 60-day timer, because nothing authored the evidence
records the ledger admission rule requires; promotion happened only when
the founder opened a chat. The Maintain promotion step now uses the common
reader and complete Source/Claim/Evidence proposal validator described above.
It prepares a needs-approval PR through the classifier, the citation-checking
arbiter, and the content-response ripple. Without this pipe the site is
a metabolism for judging content, not producing it, and the yield decay
would amplify the starvation (no promotions → no movement → cases cool).
Every import records whether it eventually moved anything, feeding the
yield metric.

### 2. The Expedition — explores (new)

The deep-research sweep, formalized. On a yield-gated schedule, a
discovery-capable model receives a case's claims index (the coverage
map) and its source list, and is tasked adversarially: find what this
ledger does NOT contain — new primary documents, datasets, non-English
literature, archival material, and counter-evidence specifically. Output
is a brief (never citable, like all briefs), mechanically coverage-diffed
against the claims and source indexes; only verified-novel items proceed
to citation verification and enter through the gates. Because the
coverage map persists in the repo, each expedition judges only its diff —
which is why this converges where ad-hoc chat-session research cannot:

**Saturation is a counter, not a feeling: a case is provisionally
saturated after N consecutive expeditions whose verified novelty moved
nothing; any later watch hit or inbox drop resets it.**

### 3. The Bench — tests (exists as agenda + studies; selection changes)

The agenda generator proposes; the five-seat panel scores each proposal
for expected information gain (does it test a load-bearing claim, is it
decisive in either direction, what does it cost). A proposal advances
when **four of five seats score it high-gain and no seat identifies a
constitutional problem** with the protocol concept — deliberately not
unanimity: a single lukewarm seat must not be able to starve
exploration, while a single substantiated objection retains its stopping
power here as everywhere. (Thresholds principle, founder-confirmed
2026-09-01: one seat has stopping power only where an honest objection
should stop the presses — publication gates — and never starving power
over selection; the advanced proposal's freeze PR still faces the full
arbiter, so the real veto stays at publication.) An advancing study
proposal auto-drafts its freeze PR (criteria only, panel-judged as a
protocol, per the existing two-PR discipline);
after the freeze merges, the **collection runner** executes the frozen
search protocol — web retrieval, primary-document verification through
the citation-check machinery, refusal-fallback model path — and opens the
collection PR for the panel.

Non-study proposals get the same closure (the **endorsement drafter**,
scripts/draft-endorsements.mjs): a claim or research-item proposal four
seats score high-gain with no concern is *endorsed*, and auto-drafts its
ledger record in a gated needs-approval PR — claims at catalog tier,
anchored ONLY to evidence already in the ledger (the drafter copies the
anchoring record's sourceId and locator; it never authors either — a
draft with no in-ledger anchor is dropped with the reason and stays
endorsed for the promotion pipe or a manual adoption). Ids are
mechanical; provenance rides origin.ref, which doubles as the adoption
registry (the repo is the state). Proposals not advanced or endorsed
retain their scored disposition and can be reconsidered through intake. Budgets bound the
pace: at most two active studies per case; a site-wide monthly freeze
budget; three adoptions per run, at most two per case.

### 4. The Tribunal — judges (exists; gains a memory)

Verification labels, blind check panels, derived standing (fails down,
nothing raises it but fresh concurrence), reconciliation that cannot
self-ratify, and the constitutional arbiter. The exact-input receipt rule
above replaces calendar-date freshness; the publication gate is unchanged. Banked corrections live in the
records they corrected and in the append-only changelog — panels judging
a diff see the correction in context, in the record itself, not in a
separate registry.

**The steelman field (epistemic counterweight #1).** Every assessment
run — house draft, blind check, reconsideration — must state, in
`caseAssessment.steelman`, the strongest argument FOR the featured
hypothesis that the assessment does not answer. It exists because every
seat shares roughly the same mainstream priors and the constitution
forbids seating an advocate: the counterweight is a disclosure
obligation on the assessor itself, like a limitations section — never a
vote, never a verdict input. It is displayed beside the verdict,
checkable in every ratification diff (a lazy "some people disagree"
is visible to the other seats), and cumulative: a steelman that
persists unanswered across runs is a research crux the Bench should
pick up. Required from 2026-09-04 (fail-closed in the loader);
append-only history before that date is exempt, never rewritten.
Counterweight #2, the sampling gloss audit — one random evidence
record per hot case re-verified against its primary source by a model
that did not author it — belongs with the bounded researcher in the revised
sequence above, before unattended intake is expanded.

### 5. The Atelier — a drafting mode within the edition workflow

The edition drafter owns assessment, selection, and narrative together. Its
first narrative implementation generates candidate alternatives from a scoped
input diff and submits them with the incumbent for comparison, under §7.
The Atelier name describes that competition within the edition workflow;
several independent drafters can later widen the candidate pool. It is not a
separate owner of presentation state. Candidates compete against the incumbent
on evidential fidelity, uncertainty,
useful compression, readability, and register. Blind assessment happens before
inspection of the candidate edition. The normal arbiter still gates any
consequential publication, with substantiated objections parked publicly.

Every comparison publishes its full record, including dissent. Randomize
candidate order. Fluency, length, and model-family
preferences can bias judges; winning a prose comparison cannot substitute
for source verification or authorize dropping a consequential caveat. A
candidate that earns no improvement leaves the incumbent in place.

**Narrative inputs — the anti-drift anchor (founder direction,
2026-09-01).** If each rewrite saw only its predecessor plus the ledger,
the narrative would play telephone with itself: voice eroding a little
per cycle until nothing of the founding material remained. So each case
may carry a small set of
committed founding texts (`inputs/` with a manifest: title, origin,
license, role) — the essays and articles the case was built from, e.g.
the founder's own Substack pieces, committable because he owns and
licenses them; third-party briefs remain excluded forever. Rules:
inputs are **presentation references, never evidence** — a rewriter may
draw voice, structure, phenomenology, and framing from them, but may not
cite them for any fact not independently in the ledger. Every Atelier
candidate is drafted from **ledger + narrative inputs + incumbent**, so rewrites always drink from the original well rather
than from a fading copy — and where the evidence has parted ways with a
founding text, the rewriter has the original in hand and says so
honestly, instead of paraphrasing a paraphrase of it.

Existing rewrite guidance (2026-09-01), retained as migration checks.
Changing these behaviors requires an explicit, reviewed editorial rationale:

- **The first-edition rule.** A revision reads as if it were the first
  telling: founding texts and the current ledger digested into one
  seamless, present-tense article. No "previously this case said," no
  "updated to reflect" — the article never narrates its own revision
  history, which lives in the changelog and git. A candidate that
  writes about the case's tellings instead of from current knowledge
  loses on register.
- **The plates-survive rule.** Every plate placed in the incumbent
  appears in the candidate — a plate may move to a better seat in a
  fresh telling, but may not be lost (the same mechanical guard the
  narrow editorial pass already enforces for `{claim=…}` and
  `{plate:…}` markers). If the case gained plates since the incumbent
  was written, a candidate that fails to seat them is incomplete and
  is rejected before judging.

## Narrative guidance: inputs, judgment, competition

The rule is deliberately light (founder direction, 2026-09-01,
superseding the same-day pins design): revision prompts instruct
candidates to **consider the founding inputs for the aesthetic portions**
— voice, framing, register, the phenomenology that made the case worth a
site — following them where they serve the reader and expanding beyond
them freely where they don't. Candidates make judgment calls; the
competition and the panel settle them. No binding registry of
presentation commitments exists: banked corrections live in the records
they corrected and in the append-only changelog, and founder taste is
exercised through the constitution's register sections and, when needed,
ordinary directed PRs.

## The scheduler: attention follows yield

The current yield report counts verdict-moving events and selects watch
cadences. The revised scheduler must also credit corrections, improved tests,
and useful explanation without demanding a changed verdict. Its rest counter
uses accepted changes after verification, with a bounded exploration allowance
for missed questions. Neither a quiet fortnight nor an unchanged verdict proves
that the source landscape is exhausted. The existing content-merge throttle
limits publication pace; it is not a monetary budget. Shared spend accounting
now covers every existing API path, including the operator's streamed requests
and image generation, with one policy in `config/ai.json`. Missing receipts
retain liability; a spent allowance stops work without weakening review. Wider
Expedition browsing must account for any hosted-tool fees before being enabled.

## The founder's role, after

Exactly the two constitutional powers, exercised as they always were:
the kill switch, and the constitution — through which taste and register
are governed (the founder amends §7 and the style documents; panels
enforce them). Beyond the two powers, the founder participates as
contributor: reading the weekly digest, dropping material and directions
into the inbox, all of it riding the same gates as anyone else's.
Everything else is panel-governed inside budgets.

Implementation constraints throughout: no new services, no databases —
git as state, Actions as scheduler, YAML validated fail-closed by the
loader, every new mechanism a tested script in `scripts/lib`, budgets in
one config, engine work upstream here and synced downstream. Machine
artifacts declare their lifecycle (status, expiry, surviving record) from
their first run — no more folders a reader cannot date.
