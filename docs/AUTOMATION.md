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
| 2 | The ledger and the edition: `editions/`, evaluation off claim records, one `CaseView`, ten cases migrated mechanically; check runs and editions record the ledger hash they judged; the touched scripts move to TypeScript on the shared domain | **Built** (2026-09-08, PR pending founder merge). Render diff against the pre-migration build: every difference accounted for (see the DECISIONS entry). |
| 3a | The intake foundation: dispositions schema and loader rule, one coverage diff with mechanical keys, the packet builder, the intake store (`proposals/<runId>/`), the model transport with the spend ledger inside it, six protocol files, the `aletheia` CLI (`status`, `diff`, `migrate-memory`); the archive and promotions ledgers migrated into dispositions | **Built** (2026-09-08, PR pending founder merge). No model calls. |
| 3b | The chain: `report` (two research seats), `draft`, `verify`, `edition` behind the CLI, each with a dry run; the budget guard on every paid call; tariffs read from the vendors' price pages | **Built** (2026-09-08, PR pending). Research seats: `o4-mini-deep-research` and `claude-opus-5` with web search and fetch; ceiling $20 per run, $50 per day, $150 per month (config/budget.yaml). `check` and `panel` still run from their own scripts. |
| 4 | The tests: Cast, Not Carved (existing case, with oracle), then Deep Memory (from scratch); two research models each | Not started. Depends on 3. |
| 5 | Subtraction by evidence: retire what the tests show redundant; ten workflows become four | Depends on 4. |
| 6 | Presentation: reading experience (current layout kept), then AI operation at case and global level | Last. Views over existing state. |

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

## The objects

Nine kinds of record, in three groups. Nothing else in the repository is
state.

**The ledger** — grows, never compressed, read through the explorer.

| Kind | One line |
| --- | --- |
| Source | a provenance container: paper, dataset, object record, archive item; an identifier, a title, an honest verification label |
| Evidence | one observation extracted from one source: locator, verbatim quote, direction (supports / undermines / qualifies / context) toward one or more claims |
| Claim | one proposition with a truth condition: statement, rung (observation / mechanism / attribution), theme, source anchor, relationships, provenance. **Nothing evaluative.** |
| Research item | a decisive test or archival route worth doing, and what it would settle |
| Study | a frozen protocol and, later, its collected result |
| Image | a plate (real, with provenance and license) or a cover (generated, credited as such) |

**The judgment** — append-only, dated, the latest stands, history visible.

| Kind | One line |
| --- | --- |
| Assessment | one run over the ledger: case verdict, per-claim treatment (credibility, diagnosticity, importance, plain-language gloss, strongest objection, what would change our mind), the steelman, what is load-bearing, what would settle it, the dossier header. Role `draft` (written by the drafter) or `check` (written blind by another vendor). Records the hash of the ledger it judged. |
| Edition | the reader's unit: the exact assessment it adopts (by run id and content hash), the featured claim ids in order, the crux order, the article, and hashes of the ledger and inputs it compressed. The case page *is* the current edition. |

Assessment and edition are separate files on purpose. An edition that
changes only the article re-adopts the same assessment and **inherits its
standing**: prose can improve without convening a new panel. Only a new
judgment needs new blind checks.

**The intake** — everything that ever tried to enter, and what became of it.

| Kind | One line |
| --- | --- |
| Proposal | a change to domain records — add, correct, link, supersede, reconsider — in one envelope: the candidate records, the basis (case and input hashes), the provenance (producer, run, model, protocol version, date, cost), the rationale. A candidate is of a kind the repository already has: source, evidence, claim, research, study, image — or **edition**, for a proposed change to selection, framing, or prose. Reports travel inside proposals as working material, never as records. |
| Disposition | the dated outcome of one candidate in one case: **in** (as record *X*), **duplicate** (of *X*), **irrelevant**, **blocked** (with the route to the primary), **failed** (verification contradicted it), **excluded** (verified, editorially left out, reason given). Every row off *in* carries a reason and may carry `reopenIf`. |

Two symmetries hold the design together. **Ledger records get
assessments; candidates get dispositions** — both append-only dated
judgments, latest per key stands. And **standing is derived, never
stored**: the case's standing (ratified / contested / unratified) is
computed at build time from the check runs of the adopted assessment,
fails down, and is raised only by fresh concurrence.

**Staleness is a hash, not a date.** A check run is current when the
ledger hash it recorded equals the current ledger's hash, and stale when
the ledger has moved since — mechanical, and independent of the changelog.
(Runs from before the field existed fall back to comparing dates with the
newest content-bearing history entry.) The same hash on an edition says
which ledger state it compressed.

The founder's own record lives in two small places that are neither
ledger nor judgment: `conjectures.yaml` (on-the-record editorial
intuition, carrying no evidential weight) and `inputs/` (founding texts
the founder owns, the voice anchor for every edition, never evidence).

## The verbs

One flow: **investigate → propose → verify → assess and explain → review →
publish.** Each step is one command on one CLI, each model-involving step
reads one protocol file, and every step that produces anything writes one
proposal or one judgment record. Nothing has a private memory.

| Verb | Command | Reads | Writes | Model |
| --- | --- | --- | --- | --- |
| investigate | `report <case>` | the packet (below) | a report inside a proposal | a browsing research model — a flag |
| propose | `draft <case>` | a report, or an inbox drop, or a watch hit — **and the fetched text of every source it cites** | a proposal: ledger deltas whose locators and verbatim quotes come from the retrieved text, a disposition for every item raised | the drafter, shown the source; it never writes a quote it has not been shown |
| verify | `verify <proposal>` | the proposal and the sources, fetched again | dispositions: `in`-eligible, `failed`, `blocked` | a second model, given the retrieved source and not the drafter's rationale, tries to reject the reading; quote match and identifier resolution are mechanical |
| assess and explain | `edition <case>` | ledger, inputs, incumbent edition | a draft assessment (when the judgment changed) and an edition candidate | the drafter |
| — | `check <case>` | the blind packet (ledger only, no incumbent, no grades) | check runs (`role: check`), each recording the ledger hash it judged | four other vendors |
| review | `panel <pr>` | the diff and the constitution | one verdict and up to three review notes per seat, the notes entering as `edition` or ledger candidates | five vendors |
| publish | merge policy | the labels and checks | the merge | none |

Two supporting commands, both pure: `diff <proposal> <case>` runs the
coverage diff (below) and prints what is novel, seen, or probably
duplicate; `status <case>` prints the derived state — standing,
saturation, last edition, last report, spend.

**The packet** is a deterministic function of the repository, built by one
module and used by every verb: the current edition; an index of every
source and claim with its identifiers, statement, and current verdict (ids,
not full records — growth costs storage, not context); the founding inputs;
the dispositions with their reasons; the previous report. It is bounded and
never silently truncated. The blind variant omits the incumbent edition
and every grade.

**The coverage diff** is one pure function, `coverageDiff(proposal, case)`.
Every candidate has a mechanical key — `doi:`, `arxiv:`, canonical `url:`,
normalised `title:`, or normalised `text:` for propositions — and the
function returns three sets: *novel*, *seen* (with the ledger record or
disposition row that saw it), and *probable* (title or text similarity;
both shown to a judge, never decided mechanically). Every verb calls it
before writing. It is the only deduplication code in the repository.

**Material change** is mechanical, never a model's own sense of novelty.
An edition is due when an adopted proposal touches a featured claim's
anchors, when a check run moves the verdict or the load-bearing set, when a
crux is resolved or reopened, or when a report proposes a different
selection. Catalog growth alone triggers nothing; unchanged inputs rest by
hash. An edition whose judgment did not change re-adopts the incumbent's
assessment and keeps its standing; one whose judgment did change carries a
new draft assessment and is unratified until checked.

**Roles stay separate.** The drafter produces (`draft`, `edition`); the
judges ratify (`assess` blind, `panel` on the PR). Standing never comes
from the drafter. That separation is the constitution's safety argument
(§3.15) and is the one thing this design does not simplify.

**The edition is judged against the incumbent, and only that.** One
drafter writes one candidate. The panel compares it with the incumbent,
which is always the second option by construction; the candidate replaces
it only on clear preference, otherwise the incumbent stands and the reasons
are recorded as review notes. That is the minimal competition §7 asks for
and the whole mechanism; an unchanged edition after a real investigation is
a good outcome. Several candidates would be a flag on the same command,
added only if the tests show single-drafter editions rejected often.

**The panel has a narrow veto and a wide voice.** A seat's *verdict*
(`complies` / `violates` / `unsure`) has stopping power only for a named
constitutional violation — a fabricated or unresolvable citation, provenance
removed, a draft presented as ratified, confidence material, a weakened
check. Everything else a seat thinks becomes *review notes*: at most three
per seat, ranked, returned in a separate field so a preference cannot be
smuggled into a veto or a violation softened into advice. Notes are intake:
each enters as a candidate — of kind `edition` when it concerns selection,
framing, or prose; of a ledger kind when it names missing evidence — through
the coverage diff, gets a disposition, and feeds the next draft; a note that
recurs across runs is a crux the case is dodging. The steelman field already
works this way and is the model.

## The protocols

Prompts are committed, versioned files under `protocols/`, one per
model-involving verb: `report`, `draft`, `verify`, `edition`, `check`,
`panel`. A `promptVersion` stamp on any record points at text a reader can
open. The rule is **formalize the contract, not the method**: each file
states the task, the scope, the output schema, and the few operational
rules the constitution does not make obvious, and cites §3 for the method
rather than paraphrasing it. A protocol changes only by a PR that attaches
test evidence.

| Protocol | Inherits | Non-obvious rules it carries |
| --- | --- | --- |
| `report` | the missing-evidence audit prompts (`research/`); the lab's `case-research-report-v1` | state actual coverage, never claim saturation; distinguish opened from snippet from inaccessible; prior failed retrievals are not findings of absence; look beyond the incumbent's framing |
| `draft` | extract-v1 (atomic claim, one rung, theme, verbatim quote from the shown text); the chat-briefs consolidate and construct steps, written down for the first time; the lab's source reader | a quote comes only from retrieved text the drafter was shown; the default is in; blocked stays out; split a load-bearing compound claim; label source statement versus inference; every item raised gets a disposition |
| `verify` | extract's anchor check and verify-v1; the verification-ledger rule; the lab's `source-reading-v6` checker | a quote the source never said is rejected, never repaired; model agreement is not verification; a blocked primary stays out |
| `edition` | the assessment drafting prompt; the narrative-inputs rule (§7) | grade credibility and diagnosticity separately per claim; the featured set is a decision with a reason; re-adopt the incumbent's assessment when the judgment did not change; consider the founding inputs for voice, follow them where they serve the reader; the article never narrates its own revisions |
| `check` | the blind-check prompt | blind: no incumbent, no grades, no article; the steelman is required; record the ledger hash judged |
| `panel` | the arbiter prompt | a `violates` must name the rule or degrades to `unsure`; notes are separate from verdicts |

`docs/CHAT_BRIEFS.md` and `research/missing-evidence-audit-prompts.md`
retire into these files when they land. Genesis — founding inputs to a
question, a first anchored claim, a first edition — stays an agent-run
procedure with the chat-briefs checklist until the Deep Memory test shows
`draft` and `edition` can do it unattended.

## The layout

```
content/cases/<case>/
  case.yaml            identity only: id, slug, title, subtitle, domain, status, themes
  claims.yaml          propositions with anchors — one file, no tiers
  evidence.yaml  sources.yaml  research.yaml  images.yaml  studies/
  history.yaml         append-only changelog
  inputs/              founding texts + manifest (founder-owned; voice, never evidence)
  conjectures.yaml     founder's on-the-record intuitions (no weight)
  dispositions.yaml    append-only: every candidate ever considered here
  assessments/         append-only runs, draft and check, each stamped with the ledger hash it judged
  editions/            append-only; the latest is the case page; an article-only edition re-adopts its predecessor's assessment
proposals/<runId>/     one directory per run: proposal.yaml, report.md, novelty.md, run.yaml
governance/            harvested panel verdicts and notes; the spend ledger
protocols/             the six versioned prompt files
```

Gone: `claims-catalog.yaml` (tiers are an edition decision); `overview.md`
(the article lives in the edition); the watch seen-list, archive ledger,
and promotions ledger (dispositions); `proposals/{agenda,watch,inbox}` as
separate shapes (one run directory shape); the editorial audit (the edition
verb); the evaluative fields on `case.yaml` and on claims.

**Workflows: four.** `ci` (typecheck, lint, test, build), `deploy`, `gate`
(risk classification and the panel, on every PR), and `run` (the flow on a
cadence set by yield: inbox → report → draft → check → edition → PR; and
`assess` whenever a case's adopted assessment lacks a full current quorum).
Parks are answered by the next `run`, not by a separate operator.

**Lanes: two, unchanged in principle.** Append-only, reversible-by-runId
material (`proposals/**`, new `assessments/*`, new `dispositions` rows,
harvested `governance/*`) auto-merges when CI is green. Everything that
changes what a reader sees or what a claim means — ledger records,
editions, protocols, code, the constitution — needs the panel.

## The code

- **One language, one domain.** Scripts are TypeScript run directly by
  Node and import the same Zod schemas and loader the site uses. There is
  no second domain model and no `.mjs` shadow of it.
- **One CLI.** `aletheia <verb> <target>`; each verb is one module in
  `src/pipeline/` with one test file. The modules share exactly four
  services: the packet builder, the coverage diff, the model transport
  (with the spend ledger inside it, so every paid call is recorded in one
  place by construction), and the intake store (proposals and
  dispositions). No verb has its own copy of any of these.
- **One view.** `CaseView` joins the ledger with the current edition:
  every claim once, with its treatment from the adopted assessment or
  none. The case page, the explorer, and the claim page read it. Standing,
  saturation (consecutive proposals that landed nothing), and yield are
  functions over the same files.
- **Fail closed everywhere.** A malformed record, a dangling id, an
  unresolved claim marker in an article, a plate not seated, a missing
  steelman, an `in` row whose record does not exist — each fails the
  build. Nothing is repaired silently.
- **Components one per concept, pure.** The UI reads `CaseView` and the
  governance files. It holds no logic about how judgments are made.

## The tests

Same packet, same protocols, two research models, two cases, before any
schedule exists. Eight reports; two per case per model is the minimum that
answers both questions — what the first pass finds, and whether memory
stops the second pass re-finding it while it still finds more.

| | Cast, Not Carved (existing case) | Deep Memory (from scratch) |
| --- | --- | --- |
| Runs | 2 per model | 2 per model, or with the model the first test picks |
| Inputs | the current case; the archived chat briefs are **not** supplied | founding inputs: the founder's Birdmen pages (narrative, five studies, revision log, image register), owned and licensable; a question-only case, no invented evidence, priority, or review |
| Oracle | the archived chats (`briefs/`): about 190 passes found the funded replications, Yi 2026, the ScanPyramids salt chemistry, the Twelve-Angled Stone fragments, Tributsch's joint model | none; judged against the incumbent |
| Measures | recall against the oracle; source-check pass rate; identifier resolution rate; whether run 2 re-finds run 1; cost; panel preference for the resulting edition over the incumbent | whether anchored claims and a ratifiable edition emerge; plates real with provenance; source-check pass rate; cost |
| Decides | which model; whether `draft` is right; what the watch and agenda still add | whether genesis can be unattended, or stays the agent procedure |

Acceptance for the flow as a whole: a true but unrelated fact is not a
finding; a new source count is not progress; a cosmetic rewrite is not a
better edition; the strongest experimental objection and the limit of its
applicability survive compression together (the founder's Orch OR test,
deferred to a later pilot).

## Subtraction by evidence

After the tests, retire what they show redundant. The hypothesis: `report`
finds what the literature watch finds and proposes what the agenda
generator, scorer, endorsement drafter, and freeze drafter propose, so
those fold into it and the inbox remains the founder's door. Nothing is
retired on the argument alone; each retirement PR cites the test run that
made it safe.

One further candidate, once editions and dispositions carry the record:
**the changelog becomes a view.** Editions carry rationales, adopted
proposals carry outcomes, assessments carry verdict moves; the history a
reader sees can be derived from those, with hand-written entries kept only
for corrections nothing else records. Staleness no longer depends on the
changelog (it is a hash), so `history.yaml` would stop being load-bearing
and could stop being a file every PR must remember to append to.

## Presentation, last

Two passes, both views over state that already exists.

- **Reading experience.** The current layout stays: assessment first, then
  the article, ladder, evidence, conventional account, research, history.
  Review the hierarchy once Cast, Not Carved and Deep Memory carry editions
  the pipeline produced, so the review judges the real product.
- **AI operation.** At case level: what ran, what it proposed, what was
  adopted or declined and why, what it cost, and how standing derives — all
  from `proposals/`, `dispositions.yaml`, and `governance/`. At global
  level: seats, spend, the run ledger.

## Constraints carried forward

No new services, no databases: git as state, Actions as scheduler, YAML
validated fail-closed by the loader. Machine artifacts declare their
lifecycle at birth. Supplied material never enters git. The
engine-as-package refactor waits for a third deployment. The founder's
powers remain exactly two: the kill switch and the constitution.
