# How the site runs itself

**Status:** design confirmed by the founder, 2026-09-07, after the overhaul
experiment of 2026-09-05 to 09-07 (preserved in `ejhong/alethia-lab`) and
the restoration of this publication to its 2026-09-05 tree (PR #193);
reassessed 2026-09-08 after the first paid runs. The section immediately
below is the running status and is rewritten, not appended, on each
reassessment. Everything after it is the design. Nothing
in the design is built until its own PR lands. The history of how the design
got here, including the earlier five-loop version it replaces, is in
`docs/DECISIONS.md`.

## Where we are (reassessed 2026-09-09, evening)

Reassessed on the founder's request against truth, beauty, simplicity,
and modular code, with the loop on. The facts first, then the plan.

- **The loop runs itself.** Since 2026-09-09: a weekly sitting of three
  budgeted choices (`chain.yml`), the Arbiter on every PR with a narrow
  veto and review notes, standing derived from the panel within one step,
  budgets that crunch until 2026-10-31 and then settle, the founder's kill
  switch in `governance/operation.yaml`. One sitting has run in CI (#214,
  an edition, $4.23); check, report, draft and verify have run only from
  a terminal. Two of ten cases have been through the chain; eight carry
  only the migration edition, and the weekly cadence will reach them one
  at a time.
- **Truth holds where it is tested, and is untested where a reader looks
  most.** Provenance is stamped, refusals are reasoned, nothing is
  fabricated, standing is derived. But the case page still shows the
  pre-edition view beside the edition's: an assessment panel and a
  cross-model panel above the article, conjectures, studies and resources
  from the earlier design — two presentations of one standing, and the
  reader is not told which is the record. What was refused, and why, is
  data (dispositions) with no page. The new vocabulary — contested,
  unratified, a restated question, accounts side by side, review notes —
  is on the record and not yet explained in place.
- **Beauty: the pipeline is the beautiful part; the rest is accumulation.**
  Verbs with protocols as versioned files, one roster, one budget, one run
  frame, one retrieval layer. Around it: six disabled workflows and about
  a dozen Maintain-era scripts still in the tree, a second vendor
  transport under the Arbiter beside the pipeline's, `load.ts` at 1,300
  lines carrying five concerns (parsing, validation, editions, standing,
  page views), protocols with six versions each in the working directory,
  and docs that describe two eras at once (MAINTENANCE, DATA_MODEL,
  EXTRACTION_PIPELINE, CHAT_BRIEFS).
- **Modular code: the three zones hold; two seams are wrong.** Content →
  domain → UI is one-way. Two seams were wrong and are mended (the
  subtraction record): the pipeline imported the legacy `scripts/lib`, now
  `src/lib`; the Arbiter called vendors through its own transport, now
  the metered one.

### The plan, in order

1. **Subtraction first (one set of PRs).** Delete the six disabled
   workflows and the Maintain-era scripts, each retirement citing the verb
   that replaced it; retire EXTRACTION_PIPELINE and CHAT_BRIEFS into three
   sentences here; move superseded protocol versions to
   `protocols/archive/`; split `load.ts` into loading, editions, standing
   and views; fold the Arbiter's vendor calls into the pipeline's
   transport; fold or drop the legacy content structures (conjectures into
   claims or out; resources into sources; watch out; studies stay — they
   are frozen-criteria evidence maps the articles cite). Subtract before
   building, because the UI pass builds views over state and must not
   build them over two states.
2. **The UI pass, two layers.** The reading layer is the case page in the
   order a reader needs: the question as it stands (with the restatement
   note), the article, the map of the controversy (the edition's accounts
   side by side, each with its linked claims and what would decide it),
   the ladder with credibility and diagnosticity explained in place,
   evidence symmetric, what would change our mind, the research agenda —
   except that the judgment and the panel stay on top, merged into one
   block computed by one rule, because what the AI thinks and what the
   panel thinks is the most interesting thing on the page (founder
   direction, 2026-09-09, in session), with a strip above them saying
   what the case has been through lately.
   The record layer sits beneath, one component per concept: what was
   proposed and what was refused and why, the review notes, the history.
   At site level, one `/operations` page replaces `/panel` and
   `/proposals` (built 2026-09-09): the operation state, the schedule and
   what the ledger wants next, spend against the caps, recent sittings,
   the review notes, and everything `/panel` showed. The assessment panel and the cross-model panel go as
   separate things — their content lives in the one block — and the
   conjecture cards go. AGENTS.md §7 is the brief: no
   clutter, no unlabelled scores, terms explained where they appear,
   mobile first.
3. **The loop keeps running meanwhile** and does the crunch on its own:
   the eight unreported cases, one a week, within the caps; the founder
   drops essays when ready, Deep Memory among them.
4. **After the UI pass:** verifier quality, driven by the refusals data
   and the review notes; then Deep Memory from scratch as the test of a
   case built from inputs alone.

### Build sequence — status

| # | Step | Status |
| --- | --- | --- |
| 1 | This design | Confirmed 2026-09-07; reassessed 2026-09-08. |
| 2 | The ledger and the edition: `editions/`, evaluation off claim records, one `CaseView`, ten cases migrated mechanically; hashes on checks and editions | **Merged** (#197 / #198). Editions ordered by their `previous` chain (#200). |
| 3a | The intake foundation: dispositions, coverage diff, packet, store, transport with the spend ledger, six protocol files, the CLI | **Merged**. |
| 3b | The chain: `report` (two seats), `draft`, `verify`, `edition`; the budget guard; tariffs from price pages; one roster (`config/models.yaml`) | **Merged**. Protocols `draft-v2`, `verify-v2`, `edition-v2` after the first runs. |
| 4a | First runs on Cast, Not Carved, both seats | **Done** (2026-09-08; #199, #200, #201). Evidence above and in DECISIONS. |
| 4b | **Close the loop on one case.** (i) A correction writer: change one field of one record in place, bytes elsewhere untouched, with the history entry — so proposals' corrections apply. (ii) `check` behind the CLI on the metered transport with the roster's panel; each seat's raw reply kept beside its verdict; the Gemini seat's omitted claims fixed (contract or output room). (iii) `edition` carries the panel's dissents when standing is contested: the drafter answers them or holds, and a fresh blind check follows — reconsideration folded in, the old script retired. (iv) `aletheia next`: choose the case by staleness, saturation, and time since its last run; a weekly `chain` workflow runs report → draft → verify → edition for that case under budget and opens the PR; the Arbiter judges it; a passing edition is re-checked after merge. (v) The operation state — live or paused under the kill switch, and why — is a governance file the pages display. | **In progress** (2026-09-08/09): (i) correction writer built, the al-Ma'mun date applied; (ii) `check` behind the CLI on the metered transport, raw replies kept, one repair round, five seats installed on the corrected ledger; (iii) dissents carried into `edition`, reconsideration folded in, one `editionDue` rule — the first reconsideration ran on Cast, Not Carved and held `unresolved` while regrading the Egyptian instance; (iv) `aletheia next` and `chain.yml`, dispatch-only until the founder uncomments the schedule; (v) `governance/operation.yaml` displayed in the footer. Remaining: the Arbiter toggle. |
| 4c | Breadth: the loop reaches the eight unreported cases on its own cadence; Deep Memory from the Birdmen inputs, from scratch | Running (weekly sittings since 2026-09-09). **Deep Memory opened 2026-09-09**: a question-only case (`content/cases/deep-memory/`, an opening edition with no assessment, an empty ledger, no inputs yet). The founder's pages enter by his own drop from GitHub (the founder-drop door; the panel's GPT seat on #236 read §3.15 as requiring the founder's own grant for republished copies, so the operator commits none); the intake then registers them as founding inputs, and the scheduler's next choices are the draft from that intake, verify, the first assessing edition, and the blind check — the loop's, unattended. The drop landed the same day on the founder's grant (#240: the home page as DEEP-IN001), and the first chain was dispatched. No second drop: the founder judges the five study pages experimental and does not want them taken in; the home page carries each investigation's question, finding and limitations in summary, which is their weight (founder direction, 2026-09-09, in session). |
| 5 | Subtraction by evidence: six disabled workflows and the Maintain-era scripts retired, each citing the verb that replaced it; legacy docs folded; superseded protocols archived; `load.ts` split; one vendor transport; legacy content structures folded or dropped | **Next** (reassessment of 2026-09-09): before the UI pass. |
| 6 | Presentation: the reading layer (question, article, map of the controversy, ladder, evidence, what would change our mind, agenda) and the record layer (runs, refusals, panel words, review notes, history) on the case page; `/operations` at site level | After 5; the brief is in "The plan, in order". |

### Two rules settled by the runs

- **A quiet case is searched rarely, and by alternating eyes.** The cadence
  is seven days for a case whose last pass landed something and doubles
  after each cycle (a report and its draft) that lands nothing, to ninety
  days; the seats alternate on such a case — the OpenAI seat after the
  first empty cycle, the house seat after the second — never both on one
  pass. This is what lets the system settle to almost no cost: ten quiet
  cases cost a few dollars a month (founder direction, 2026-09-09, in session). Until
  that day the saturation rule never saw a landing — it looked for the
  producer's run id where the verify run's was written — and every case
  with runs read as saturated.
- **A narrow veto and a wide voice.** One seat parks a change alone only
  for fabrication, exposure of confidence material, or an edit to the
  constitution; two seats park for anything; a lone objection of another
  kind is a review note — an issue the operator answers on the record —
  and the change merges (AGENTS.md §3.15, founder amendment of
  2026-09-09, after one seat parked twelve pushes in a day against four
  complies each time).
- **A contested standing is a task, not a label.** It triggers the
  reconsideration edition and a fresh check on the schedule's next turn for
  that case; the standing stays displayed as contested until the panel
  re-judges.

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

The founder's own record lives in one small place that is neither
ledger nor judgment: `inputs/` (founding texts the founder owns, the
voice anchor for every edition, never evidence). The conjecture cards of
August — the founder's on-the-record bets beside the ledger — retired on
2026-09-09: a bet with a stated confidence and a disconfirmer is a claim,
graded honestly, and the bets themselves are banked in each case's
changelog (docs/DECISIONS.md, 2026-09-09).

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

Superseded versions live under `protocols/archive/`; the loader reads the
top level only, and a run's `promptVersion` names the file it used, so the
text behind any recorded run is still in the tree.

| Protocol | Inherits | Non-obvious rules it carries |
| --- | --- | --- |
| `report` | the missing-evidence audit prompts (`research/`); the lab's `case-research-report-v1` | state actual coverage, never claim saturation; distinguish opened from snippet from inaccessible; prior failed retrievals are not findings of absence; look beyond the incumbent's framing |
| `draft` | extract-v1 (atomic claim, one rung, theme, verbatim quote from the shown text); the chat-briefs consolidate and construct steps, written down for the first time; the lab's source reader | a quote comes only from retrieved text the drafter was shown; the default is in; blocked stays out; split a load-bearing compound claim; label source statement versus inference; every item raised gets a disposition; v2: direction labels defined (a record from the anchoring passage supports its claim), PDF page locators, `via` for open-access copies; v3: propose a URL for a held source read without one, resolved works are candidates; v4: a supplied document that is a ledger source anchors claims and is mined broadly for its propositions; v5: competition is linked (`alternativeToRefs`, `contradictsRefs`), never merged; one proposition per claim; a new author-supplied document is a Source to propose; v6: an anchor may carry further passages (`also`), each verbatim with its locator, for a proposition stated across pages |
| `verify` | extract's anchor check and verify-v1; the verification-ledger rule; the lab's `source-reading-v6` checker | a quote the source never said is rejected, never repaired; model agreement is not verification; a blocked primary stays out; v2: mechanical and factual failures gate, a direction dispute is recorded on the admitted record, anchors are judged on quote, locator, and bearing only; v3: the reader judges atomicity and a compound claim is split (protocol `split`) and judged part by part; `split-v2`: parts are propositions about the world, never about the text; a part's `origin` names the splitter and the verify run; evidence that cited the compound is judged against each part and cites only the parts it bears on (the Arbiter's GPT seat on #207, §3.2, §3.14); v4: relevance is judged against the question as the current edition states it and the accounts it sets side by side; an anchor's further passages are checked verbatim and judged together; a compound evidence record is split (protocol `split-v3`, one observation each with its quote) and judged part by part; v5: the reader names the direction it finds and the claims the passage bears on, and verify writes both on the admitted record, stamped as the reader's act — a dispute is applied, not annotated (the GPT seat on #245, review note #248); a record that bears on none of its claims is refused |
| `edition` | the assessment drafting prompt; the narrative-inputs rule (§7) | grade credibility and diagnosticity separately per claim; the featured set is a decision with a reason; re-adopt the incumbent's assessment when the judgment did not change; consider the founding inputs for voice, follow them where they serve the reader; the article never narrates its own revisions; v3: answer the panel's dissents; v4: feature by stakes — the claims whose truth or falsity would most move the case, the competing accounts and their rungs, parents over their subclaims — thin evidence graded low, never left out; competing accounts set side by side; v5: the edition owns the case's question (`question`, the subtitle a reader sees) and names the accounts it sets side by side (`accounts`); both inherit when a candidate says nothing; the title stays the founder's |
| `split` | §3.2 | inside `verify`: a compound claim becomes the distinct propositions its anchor states, each judged on the same anchor |
| `check` | the blind-check prompt | blind: no incumbent, no grades, no article; the steelman is required; record the ledger hash judged |
| `panel` | the arbiter prompt | a `violates` must name the rule or degrades to `unsure`; notes are separate from verdicts |
| `references` | the inbox's link and document handling | list the works a supplied text names, exactly as written, nothing invented; OpenAlex resolves them by title, or by author and year with a shared topic stem, and the drafter is shown each as a candidate with its similarity, never as a confirmed match |

`docs/CHAT_BRIEFS.md` (the genesis procedure) and
`research/missing-evidence-audit-prompts.md` retire into these files when
they land; `docs/EXTRACTION_PIPELINE.md` retired on 2026-09-09 into one
sentence: the extraction pipeline of August — one proposition per claim,
one rung, a theme, a verbatim quote from the shown text — is what `draft`
inherits. Genesis — founding inputs to a
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
  place by construction), and the intake store (proposals, dispositions,
  and the run frame every verb opens and closes: one id, one date, one
  meter, one record, its cost read back from the ledger). No verb has its
  own copy of any of these; the committed configuration under `config/`
  has one reader, and a case is found by one lookup in the loader.
- **One roster.** Every model the site calls — house model and fallback,
  second reader, research seats and default, panel seats with pinned
  effort — is chosen in `config/models.yaml` and nowhere else. The
  transport takes a model and an optional fallback as arguments; it names
  none. Switching a model is an edit to that file, a tariff row in
  `config/tariffs.yaml`, and a DECISIONS entry.
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
- **Retrieval is a layer, not a scatter of fetches.** `src/pipeline/fetch.ts`
  turns a URL or DOI into text: HTML reduced, PDFs read page by page (the one
  pipeline-only dev dependency, Mozilla's pdfjs), walls detected, and an
  open-access copy found through OpenAlex when the URL will not serve. The
  drafter and the verifier call it and nothing else fetches.

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

### Subtraction record

Each retirement names what replaced it; the run that made it safe is the
chain's own sittings.

- **2026-09-09 — the Maintain era.** Retired: the `Maintain`, `Content
  response`, `Inbox response` and `Operator` workflows and the two
  on-demand tools (`Extract claims`, `Generate case art`); the scripts
  `process-inbox` (→ `inbox`), `extract-claims` (→ `draft`),
  `promote-imports` (→ `draft` + `verify`), `watch-literature` and
  `triage-watch` (→ `report`, on the cadence), `reassess-changed`
  (→ `edition`, owed when the ledger moves), `reconcile-contested`
  (→ `edition`'s reconsideration), `propose-agenda`, `score-agenda`,
  `draft-endorsements` and `draft-freeze` (the Bench and the study freeze —
  no verb yet; a `freeze` verb would replace them if studies are made
  again), `stamp-study` (with them), `yield-report` (→ the spend ledger and
  the dispositions), `stale-checks` (→ `checksStale` in the loader),
  `preflight-citations` (→ `verify`'s citation check), `generate-case-art`
  and `add-commons-image` (retired with no replacement, and returned the
  same day on the founder's direction — he wants the covers, and plates
  for Deep Memory; the loop makes no images, an edition seats the plates
  that exist; docs/IMAGE_STYLE.md); their nine library modules and ten test files; the
  `/proposals` page and its `agendaProposals` domain module (the Bench's
  shelf); `docs/EXTRACTION_PIPELINE.md`. Kept: `harvest-governance` (now a
  step of the sitting, so `/operations` stays current), `classify-pr-risk`,
  `audit-links`, and the library modules the pipeline and the Arbiter
  still share (`models`, `overlay-ids`, `vendors`, `llm`, `citation-check`,
  `seat-key`, `harvest-parse`, `arbiter-core`) — the next subtraction moves
  those into `src/`. Added in the same change: the scheduler's first
  choice is an inbox with items, which the retired Inbox response workflow
  used to trigger on push. Earlier artifacts under `proposals/` (watch
  runs, agenda scores, the promotions ledger) stay as history.
- **2026-09-09 — the second set.** The eight library modules the pipeline
  and the Arbiter still shared moved from `scripts/lib/` to `src/lib/`
  (the roster reader, the id stamper, the vendor table, the legacy chat
  helper, the citation checker, the seat key, the harvest parser, the
  Arbiter's core): the pipeline no longer imports from beneath itself, and
  `scripts/` holds only entry points. Sixteen superseded protocol versions
  moved to `protocols/archive/`. The review-note label is applied as its
  own step, after the first two notes were opened without it.
- **2026-09-09 — the third set.** `src/domain/load.ts` (1,330 lines, five
  concerns) split at its own seams into `load.ts` (parsing, validation,
  assembly — 707 lines), `editions.ts` (order, the current edition, the
  question and accounts as they stand, the adopted assessment),
  `standing.ts` (ratification, staleness, surviving objections, the
  cross-model summary) and `history.ts` (the changelog, housekeeping, the
  feed); sixteen importers re-pointed to the module that owns each name;
  no behaviour changed and the 272 tests say so.
- **2026-09-09 — the fourth set.** The Arbiter's seats are called through
  the pipeline's metered transport — the same path a verb takes, the same
  tariffs, the vendor's own usage on every reply — and the panel's cost
  (tokens always, dollars when every seat was priced) rides in the verdict
  blob into `governance/arbiter/pr-<n>.yaml` at harvest. The unmetered
  `callVendor` is gone; one vendor transport remains. The ledger is the
  whole bill, the panel included.

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
