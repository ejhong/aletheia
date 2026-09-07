# How the site runs itself

**Status:** design confirmed by the founder, 2026-09-07, after the overhaul
experiment of 2026-09-05 to 09-07 (preserved in `ejhong/alethia-lab`) and
the restoration of this publication to its 2026-09-05 tree (PR #193). The
section immediately below is the running status and is rewritten, not
appended, on each reassessment. Everything after it is the design. Nothing
in the design is built until its own PR lands. The history of how the design
got here, including the earlier five-loop version it replaces, is in
`docs/DECISIONS.md`.

## Where we are (reassessed 2026-09-07)

- **The publication is frozen.** Every AI workflow (Arbiter, Content
  response, Inbox response, Maintain, Operator, Extract claims, Generate
  case art) is disabled by hand under the kill switch. CI, PR risk check,
  and Deploy run. Ten cases are live; none has changed since 2026-09-05.
  Workflows re-enable one at a time, each when a test below needs it.
- **What the overhaul established.** Two days of implementation in the lab
  converged on the model below independently of this document: a ledger
  that grows and a per-case *edition* as the reader-facing unit; one
  source-identity module; an immutable store of intake decisions. A case
  started from a question alone reached one source, two catalog claims, and
  two editions in a day. The narrow retrieval scout (two searches, one
  page) cost about fifty cents and produced one irrelevant observation on
  which two models agreed. The research-report producer was wired but never
  run. The lab's code is roughly half again the size of this repository's
  and carries three authoring paths; it is the reference for the
  abstractions, not the target for the code.
- **What has evidence and what does not.** The judging half (arbiter,
  blind checks, derived standing) worked for two weeks and its parks were
  substantively right. The two-layer model has two independent
  confirmations. The producer has none. The plan is arranged to get that
  evidence cheaply and let it decide what else survives.

### Build sequence — status

| # | Step | Status |
| --- | --- | --- |
| 1 | This design | In review. |
| 2 | Ledger and edition: `editions/`, evaluation moves off claim records, one joined claim view, ten cases migrated mechanically | Not started. Site must render identically at the end. |
| 3 | The producer chain: packet → research report → drafter → source check → PR; three protocols as committed files | Not started. Manual invocation only. |
| 4 | The tests: Cast, Not Carved (existing case, with oracle), then Deep Memory (from scratch); two models each | Not started. Depends on 3. |
| 5 | Subtraction by evidence: retire workers the tests show redundant; re-enable the rest | Depends on 4. |
| 6 | Presentation passes: reading experience (current layout kept), then AI operation at case and global level | Last. Rendered from existing state, no new state. |

## Purpose

The site is a compression under constraint: the best honest summary AI can
currently produce of a contested question, where every sentence is
load-bearing on a public ledger, and where the compression improves over
time without the ledger ever losing a fact, a correction, or a dissent.

A reader landing on a case should find, within one screen: what is
established, what is contested and by whom, the strongest evidence each
way, the studies the system itself ran, and the shortest path to settling
the question — each one click from its primary source. A researcher should
be able to drop from any sentence to the record beneath it and from any
record to the complete ledger.

## Two layers of state

| Layer | What it holds | Dynamic | Who reads it |
| --- | --- | --- | --- |
| **The ledger** | sources, evidence (exact observations with locators and verbatim quotes), claims (one proposition, a rung, anchors, relationships, provenance), research items, studies, images, and the dispositions of everything ever proposed | grows; corrections and supersession keep their history; never compressed | researchers, through the explorer |
| **The edition** | one artifact per case: the assessment (verdict, per-claim treatment, steelman, what is load-bearing, what would settle it), the ordered featured set, the crux order, and the article | converges; a new edition replaces the incumbent only when it earns its place | general readers, through the case page |

Everything evaluative belongs to the edition: credibility, diagnosticity,
importance, plain-language gloss, strongest objection, what would change
our mind, the dossier header. A claim record is a proposition with
anchors; the edition says what it means. This ends the present duplication
where a claim's credibility lives both on its record and in the assessment
overlay, and it makes the featured set a decision recorded in one place
rather than a field scattered across records.

The edition takes the shape the lab proved: a manifest naming the exact
assessment run it adopts, the incumbent it replaces, hashes of the ledger
and inputs it was written against, the featured claim ids in order, and
the article. Editions are append-only; the current one is the latest
adopted. Standing is derived from blind checks of the adopted assessment,
exactly as now: fails down, nothing raises it but fresh concurrence, any
ledger change after the panel judged resets it.

**Ledger records get assessments; candidates get dispositions.** Both are
append-only, dated judgments; the latest per key stands; the history is
visible. Nothing else in the repository remembers anything.

## One workflow, two roles

**Investigate → propose → verify → assess and explain → review → publish.**

Two roles act on the edition and must stay separate: the **drafter**
produces; the **panel** ratifies. The drafter is one model call (or, when
much has changed, several competing calls the panel compares). The panel is
the existing cross-vendor arbiter on the PR and the blind checks that derive
standing. Standing never comes from the drafter. That separation is the
constitution's safety argument (§3.15) and is the one thing this design
does not simplify.

### Intake is one interface

An inbox note, a research report, a literature-watch hit, a study result,
and an inward reconsideration all do the same thing: **propose a change to
domain records** — add, correct, link, supersede, or reconsider — in one
envelope that names its basis (the case and input hashes it was written
against), the records it touches, its provenance (producer, run, model,
protocol version, date), and its rationale. Source, Evidence, Claim,
ResearchOpportunity, and Study remain the only vocabulary; a proposal is a
candidate record in one of those kinds, never a new noun.

Every candidate has a mechanical key — `doi:`, `arxiv:`, canonical `url:`,
normalised `title:`, or normalised `text:` for propositions — and one
function, `coverageDiff(proposal, case)`, compares candidates against the
ledger and the dispositions before anything is written. Identifier equality
is mechanical. Semantic overlap is a review question, reported as
*probable duplicate of X* with both visible; the panel decides.

### Memory records decisions in context

Per case, one append-only `dispositions.yaml`: one row per candidate ever
considered, with a six-word vocabulary — **in** (entered the ledger as
record *X*), **duplicate** (of *X*), **irrelevant**, **blocked** (primary not
reachable; the route to recover it), **failed** (verification contradicted
the proposal — a correction, as prominent as a confirmation), **excluded**
(verified but editorially left out, with the reason; meant to be rare).
Every row off *in* carries a reason and may carry `reopenIf`.

A disposition is a dated judgment against the ledger as it stood, not a
verdict. Declined candidates are handed back to producers with reason and
date; a producer may re-propose one by naming what changed — new evidence,
a corrected reading, a changed test, a better argument — and a variant is
judged with its predecessor beside it. Repeated wording without a
substantive difference is recorded once and rested. The founder's rule
from case construction becomes a rule of this store: **the default is in**;
a verified item enters even at zero diagnosticity, with its weightlessness
stated, and every item gets a disposition rather than silence.

This store replaces the watch seen-list, the archive ledger, the promotions
ledger, coverage tables in PR bodies, and "retired by silence" for agenda
proposals. The lab's intake store, which already holds 195 migrated
historical decisions, is the reference implementation.

### The producer chain

The producer the site needs is a **substantial research pass that
remembers**: given the whole case, compressed, it reports what should be
added or changed. Four steps, each a small script, model-agnostic:

1. **Packet.** A deterministic function of the repository: the current
   edition; an index of every source and claim with its verdict (ids,
   statements, identifiers — not full records); the founding inputs; the
   dispositions with reasons; the previous report. Bounded; never
   truncated silently.
2. **Report.** A browsing research model receives the packet and the
   *report protocol* and returns a cited working report: findings and how
   they differ from the record, the best evidence and competing
   explanations, precise proposed additions and corrections against
   existing ids, what would improve the article and which real objects
   would illustrate it, the next decisive questions, and its actual
   coverage. The report is intake material: never citable, never a third
   presentation layer. The model is a flag.
3. **Draft.** A drafter receives the report and the *drafter protocol* and
   returns a change proposal in the envelope: ledger deltas (each evidence
   record with locator and verbatim quote), dispositions for every item the
   report raised, and an edition candidate only when the report earns one.
   The record may deepen without the article lengthening; an unchanged
   edition after a useful investigation is a success.
4. **Check.** The *source-check protocol*: every quoted passage is fetched
   and matched mechanically; every identifier resolved; a second model,
   given the retrieved source and not the drafter's rationale, tries to
   reject the reading. Anything that fails is a `failed` or `blocked`
   disposition, never repaired. What passes opens a needs-approval PR; the
   arbiter judges; blind checks follow; standing derives.

Every run writes one record to the intake store — case, kind, model,
protocol version, date, cost, outcome — which is what the case-level and
global AI-operation views (step 6) later render.

### Three protocols, as committed files

Prompts become versioned files under `protocols/`, so a `promptVersion`
stamp on any record points at text a reader can open. The rule is
**formalize the contract, not the method**: each protocol states the task,
the scope, the output schema, and the few operational rules the
constitution does not make obvious. The method is §3 of the constitution,
which each protocol cites rather than paraphrases. A protocol changes only
by a PR that attaches test evidence.

| Protocol | Inherits | Non-obvious rules it carries |
| --- | --- | --- |
| `report` | the missing-evidence audit prompts (`research/`); the lab's `case-research-report-v1` | state actual coverage, never claim saturation; distinguish opened from snippet from inaccessible; prior failed retrievals are not findings of absence; look beyond the incumbent's framing |
| `drafter` | extract-v1 (atomic claim, one rung, theme, verbatim quote); the chat-briefs consolidate and construct steps, written down for the first time; the assessment drafting prompt | default is in; blocked stays out; split a load-bearing compound claim; grade credibility and diagnosticity separately per claim; source statement versus inference labelled; the featured set is a decision with a reason |
| `source-check` | extract's mechanical anchor check and verify-v1; the verification-ledger rule; the lab's `source-reading-v6` (separate model, actual page) | a quote the source never said is rejected, never repaired; model agreement is not verification; a blocked primary stays out |

`docs/CHAT_BRIEFS.md` and `research/missing-evidence-audit-prompts.md`
retire into these files when they land. Genesis — turning founding inputs
into a question, a first anchored claim, and a first edition — stays an
agent-run procedure with the chat-briefs checklist until the Deep Memory
test (below) shows the drafter protocol can do it unattended.

## The tests

Same packet, same protocols, two models, two cases, before any schedule
exists. Eight reports in total; two per case per model is the minimum that
answers both questions — what the first pass finds, and whether memory
stops the second pass re-finding it while it still finds more.

| | Cast, Not Carved (existing case) | Deep Memory (from scratch) |
| --- | --- | --- |
| Runs | 2 per model | 2 per model, with the model the first test picks if only one is affordable |
| Inputs | the current case; the archived chat briefs are **not** supplied | founding inputs: the founder's Birdmen pages (narrative, five studies, revision log, image register), owned and licensable; question-only case, no invented evidence, priority, or review |
| Oracle | the archived chats (briefs/): ~190 passes found the funded replications, Yi 2026, the ScanPyramids salt chemistry, the Twelve-Angled Stone fragments, Tributsch's joint model | none; judged against the incumbent |
| Measures | recall against the oracle; source-check pass rate; identifier resolution rate; whether run 2 re-finds run 1; cost; panel preference for the resulting edition over the incumbent | whether anchored claims and a ratifiable edition emerge; plates real with provenance; source-check pass rate; cost |
| Decides | which model; whether the drafter protocol is right; what the watch and agenda still add | whether genesis can be unattended, or stays the agent procedure |

Acceptance for the chain as a whole: a true but unrelated fact is not a
finding; a new source count is not progress; a cosmetic rewrite is not a
better edition. Preserve the strongest experimental objection and the limit
of its applicability together (the founder's Orch OR test, deferred to a
later pilot).

## Subtraction by evidence

After the tests, retire what they show redundant. The hypothesis: the
research pass finds what the literature watch finds and proposes what the
agenda generator, scorer, endorsement drafter, and freeze drafter propose,
so those fold into it. The inbox stays as the founder's door. The target
set of workers is: inbox, producer chain, arbiter, blind checks, deploy —
about five workflows in place of ten. Nothing is retired on the argument
alone; each retirement PR cites the test run that made it safe.

## Presentation, last

Two passes, both views over state that already exists.

- **Reading experience.** The current layout stays: assessment first, then
  the article, ladder, evidence, conventional account, research, history.
  Review the hierarchy across essay, claims, evidence, research questions,
  and history once Cast, Not Carved and Deep Memory carry editions the
  pipeline produced, so the review judges the real product.
- **AI operation.** At case level: what ran, what it proposed, what was
  adopted or declined and why, what it cost, and how standing derives. At
  global level: seats, spend, the run ledger. Rendered from the intake
  store and editions.

## Constraints carried forward

No new services, no databases: git as state, Actions as scheduler, YAML
validated fail-closed by the loader. Every mechanism a tested script; the
domain in one language. Budgets in one config; one shared allowance, with
one place that records spend, rather than accounting wrapped around each
call. Machine artifacts declare their lifecycle at birth. Supplied material
never enters git. The engine-as-package refactor waits for a third
deployment. The founder's powers remain exactly two: the kill switch and
the constitution.
