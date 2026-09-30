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

## Where we are (reassessed 2026-09-30)

Reassessed on the founder's direction of 2026-09-29, given in session: fix
what is bad and broken, against the goal below — more AI applied must mean
a better site and never a worse one. The facts first, then what is owed.
The reassessment of 2026-09-09 that stood here is in git.

- **The loop runs itself, and for two days it had stopped.** Since
  2026-09-09: a weekly sitting of three budgeted choices (`chain.yml`,
  Mondays), the Arbiter on every pull request, standing derived from the
  panel, budgets that crunch until 2026-10-31. On 2026-09-28 it stalled on
  three faults at once. The token that opens its pull requests had
  expired. The Anthropic seat, at its pinned effort, thought to its
  ceiling and returned nothing. And one missing seat held a whole panel
  stale, so the sitting asked four seats the same question three times.
  All three are mended (#417, #419): a sitting checks its token before it
  spends, a failed sitting opens an issue, and a panel of four can speak.
- **Eight of eleven cases have been through the chain.** Elusive by Law,
  Fire From the Sky and Zero Worlds carry only the migration edition of
  2026-09-08 and have never been searched by the loop.
- **The reading layer is built (#421).** The case page is for reading the
  case: the question, three header answers, what this edition moved, the
  judgment with the panel beneath it, the article, the ladder, the
  evidence, the research agenda. The record is a page of its own: every
  run with what it proposed, admitted and refused, the change history, and
  how each edition was chosen. Verdict words and standings are explained
  where they appear and on the method page.
- **"Better" is tested, not hoped (#425).** Between 2026-09-08 and
  2026-09-23 every case the loop touched grew its article, one from 2,178
  words to 7,502 over twenty editions, because each edition added what it
  had learned and none was asked to take anything out. An edition is now
  held to a reader's budget (3,000 words for the article, about a hundred
  for each header answer), and a new telling of an unmoved ledger is
  written only if the panel's seats, reading it beside the incumbent as a
  reader would, prefer it. On 2026-09-30 eight cases were re-told under
  it. All five seats preferred every one, and the eight articles went from
  36,750 words to 20,330.
- **A standing is stricter about independence (#433, #436).** A judgment
  written with the panel's verdicts in hand cannot be ratified by them,
  contested or not: the standing waits for a fresh blind check. The rule
  came from a run that re-graded nine claims toward its panel and kept
  "ratified" on the checks it had answered.
- **Seven of the eight re-told cases carry a fresh blind panel.** Three
  are ratified by five seats of five (The Emptied Amazon, The Aeon Before
  Ours, State, Not Scar) and one by three of four (Collapse, Not
  Computation, where the Anthropic seat thought to its ceiling and
  returned nothing). Three are contested: Deep Memory and Before Sputnik
  on claims the case rests on, The Religion with No Name on the case
  verdict. The eighth, Cast, Not Carved, was judged too, and the gate has
  parked its panel twice: on the Google seat's check (#445) and then on
  the OpenAI seat's (#452), each for saying of one ledger record what the
  record itself marks as unchecked against its source. The case reads
  "not yet ratified" until that record is mended.
- **Where the panel parts from a judgment, the ledger mostly holds no
  evidence for the claim.** Across those seven panels, 126 featured claims
  have an admitted evidence record, and the panel splits from the judgment
  on 2 of them. 34 have none, and it splits on 20. On 14 of the 20, every
  seat more than one step from the judgment grades the claim higher than
  it does; on the other six, all in Deep Memory, such seats go both ways;
  on none are they all lower. The edition protocol has graded a claim
  with no evidence record `unresolved` unless another basis is disclosed,
  since 2026-09-16 (a source is not evidence, AGENTS.md §3.6). The check
  protocol says nothing about such a claim, and a seat grades it from the
  rest of the ledger or from what it knows. Two of the three contested
  standings are splits on such claims. So part of what the site shows as
  contested is two protocols disagreeing, and under that a gap in the
  ledger: claims a case features and has not evidenced.
- **The gate reads what it is given.** The panel's packet puts first what
  it can read nowhere else (#422), compares a seat's raw reply and a
  drafter's reply with what was installed from them and says what it did
  not compare (#424, #437, #440, #446), and accounts for a run record
  wherever it is filed (#430). A check's run record carries the hash of
  the file its seats were sent. The build reads the content once (#423):
  its step in CI had grown to twenty-nine minutes, and the whole of CI now
  takes four.
- **A seat's answer has noise in it, and the site says so.** An experiment
  designed before it was run (#426, #432) asked four seats the same
  question three times: each gave the same word all three times on 10 to
  16 of 25 claims, and every seat's case verdict differed at least once.
  Written definitions of the verdict words did not cure it and are not
  adopted. Most of the disagreement was one pair of words, weakly
  supported and provisionally supported, which the scale sets two steps
  apart. The method page tells a reader to take a standing as a
  measurement.
- **What it cost.** September's spend was $472.98 against a cap of $550.
  $59.32 of it was spent on 2026-09-30, against that day's $60: $27.45 on
  editions and their comparisons, $31.88 on panels and the experiment. Of
  the $31.88, $24.69 was the Anthropic seat at its pinned effort, in ten
  askings. ($3.62 of the day's spend is the parked panel's, and its rows
  reach main with #452; main's ledger shows $469.36 and $55.70 until
  then.) The gate's own judgments are outside the caps and recorded at
  harvest: at least $34.16 for the 28 changes judged on 2026-09-30,
  counting each change's last judgment. From 2026-10-01 the caps are the
  crunch's: $60 a day and $400 a month until 2026-10-31, then $30 and
  $150.

### What is owed, in order

1. **One rule for a claim with no evidence.** The check protocol is to
   say what the edition protocol says: such a claim is `unresolved` unless
   the seat names the basis that carries it, each record by its id with
   the claim it is attached to, or a prior stated as a prior. It takes an
   experiment designed before it is run, as the last change to that
   protocol did, and then a fresh check of the cases it bears on. Deep
   Memory waits on this: its one reconsideration held, its fresh panel
   split again on four such claims, and the rule allows no second. Where a
   seat then names records attached to a neighbouring claim, the answer
   step can attach them, which mends the ledger and not only the standing.
2. **The answers two review notes are owed** (#447, #448): two evidence
   records on The Aeon Before Ours carry one direction for two claims, and
   one claim on The Emptied Amazon is four propositions in one. Each goes
   through the answer step: the second reader splits the records, an
   edition answers the note, a fresh check judges the result.
3. **The answer a parked change is owed** (#452). Cast, Not Carved's
   record of Engelbach's 1922 monograph (GEO-E002) states what the
   monograph contains and says of itself that it is unchecked against the
   text; the claim about that text has no evidence record. The text is
   public and the passage is in it (DECISIONS, 2026-09-30). Run on that
   change's branch, `aletheia answer 452` sends both records back to the
   second reader with the source in front of it; the edition is re-told
   over what it settles, and a fresh panel judges the case. While the
   change is open the scheduler leaves the case alone.
4. **The reconsiderations two contested cases are owed**: The Religion
   with No Name and Before Sputnik. The scheduler takes them when no
   report is due, each followed by a fresh blind check.
5. **The three cases the loop has never searched.** A report, a draft, a
   verification, an edition and a check for each; the scheduler chooses
   them as the least recently reported.
6. **The next edition protocol**, from what the seats said of the eight
   re-tellings (115 notes): an unchecked finding told by the report verb
   without an aside on the site's own checking; header answers that name
   nothing the reader has not met; a component's label that says what its
   verdict grades, kept from edition to edition; and a drafter told
   whether the panel's dissent is owed an answer or only shown. It is
   drafted (`edition-v15`, on the branch `loop/edition-v15`) and has not
   been run; a protocol is adopted with a run as its evidence.
7. **A path for the loop when the gate vetoes a check.** The answer step
   re-reads the records an objection names and re-tells the edition; it
   cannot withdraw a check or ask a seat again, and a sitting whose check
   is vetoed waits for the operator.
8. **A polish pass.** When nothing else is owed, re-tell the case whose
   readers left the most to fix; the comparison writes it only if it is
   preferred. This is what makes more AI mean a better site once every
   case is settled; today a settled case is never re-told.
9. **Sharper search per dollar** (founder, 2026-09-16, in session: "add
   them as todos"), unchanged and not begun. Three bounded changes to the
   research pass, in order: (i) a date-aware novelty task in the report
   protocol — the seat is told the date of the previous report and asked,
   as one named task among its directions, for what has appeared since;
   (ii) a citation feed on the ledger's key sources — new works citing a
   case's admitted papers (OpenAlex or Crossref cited-by), gathered
   mechanically before the pass and handed to the seat as leads, never as
   findings; (iii) retraction and correction re-checks of admitted sources
   on a cadence, since only new sources are checked at verify time today.

### What is the founder's

- **The Anthropic seat's effort.** It is pinned at `max` because that is
  what keeps the seat inside the band the panel is chosen on (58 on the
  index the roster cites, against 54 at `high`; the band is 56 to 59). At
  `max` the seat used 86,000 to 128,000 tokens on each of ten askings on
  2026-09-30, thinking and reply together, against a ceiling of 128,000
  that the model is not told. Twice it reached the ceiling: once it
  returned nothing and the panel went on with four seats, once its reply
  was cut and it was asked again. An asking cost $1.90 to $2.96, and the
  seat took $24.69 of the $31.88 that day's checks cost. Keeping `max`,
  lowering it and leaving the band, or changing the band are the founder's
  choices (`config/models.yaml`).
- **Where two verdict words sit.** The constitution's scale puts "weakly
  supported" and "provisionally supported" two steps apart, with "mixed"
  between them; a seat asked twice moves between those two more than
  between any other pair. Whether they belong a step apart is an amendment
  to AGENTS.md §3.15.

### Build sequence — status

| # | Step | Status |
| --- | --- | --- |
| 1 | This design | Confirmed 2026-09-07; reassessed 2026-09-08. |
| 2 | The ledger and the edition: `editions/`, evaluation off claim records, one `CaseView`, ten cases migrated mechanically; hashes on checks and editions | **Merged** (#197 / #198). Editions ordered by their `previous` chain (#200). |
| 3a | The intake foundation: dispositions, coverage diff, packet, store, transport with the spend ledger, six protocol files, the CLI | **Merged**. |
| 3b | The chain: `report` (two seats), `draft`, `verify`, `edition`; the budget guard; tariffs from price pages; one roster (`config/models.yaml`) | **Merged**. Protocols `draft-v2`, `verify-v2`, `edition-v2` after the first runs. |
| 4a | First runs on Cast, Not Carved, both seats | **Done** (2026-09-08; #199, #200, #201). Evidence above and in DECISIONS. |
| 4b | **Close the loop on one case.** (i) A correction writer: change one field of one record in place, bytes elsewhere untouched, with the history entry — so proposals' corrections apply. (ii) `check` behind the CLI on the metered transport with the roster's panel; each seat's raw reply kept beside its verdict; the Gemini seat's omitted claims fixed (contract or output room). (iii) `edition` carries the panel's dissents when standing is contested: the drafter answers them or holds, and a fresh blind check follows — reconsideration folded in, the old script retired. (iv) `aletheia next`: choose the case by staleness, saturation, and time since its last run; a weekly `chain` workflow runs report → draft → verify → edition for that case under budget and opens the PR; the Arbiter judges it; a passing edition is re-checked after merge. (v) The operation state — live or paused under the kill switch, and why — is a governance file the pages display. | **Done** (2026-09-08/09; the loop has run itself since 2026-09-09): (i) correction writer built, the al-Ma'mun date applied; (ii) `check` behind the CLI on the metered transport, raw replies kept, one repair round, five seats installed on the corrected ledger; (iii) dissents carried into `edition`, reconsideration folded in, one `editionDue` rule — the first reconsideration ran on Cast, Not Carved and held `unresolved` while regrading the Egyptian instance; (iv) `aletheia next` and `chain.yml`, dispatch-only until the founder uncomments the schedule; (v) `governance/operation.yaml` displayed in the footer. The Arbiter runs on every pull request since 2026-09-09. | The chain passes `--busy` (scripts/busy-cases.mjs): a case whose sitting is still open in a pull request is not chosen again (any open pull request since 2026-09-30; until then only the workflow's own `chain/*` branches). A dispatch may force the first choice — `case` and `verb` inputs on the workflow, `--case <slug> --verb report|edition|check` on the CLI — recorded as dispatched by hand; the rest of the sitting is the ledger's own choice.
| 4c | Breadth: the loop reaches the eight unreported cases on its own cadence; Deep Memory from the Birdmen inputs, from scratch | **Eight of eleven** cases have been through the chain (2026-09-30); Elusive by Law, Fire From the Sky and Zero Worlds have not, and are the scheduler's next reports. Weekly sittings since 2026-09-09. **Deep Memory opened 2026-09-09**: a question-only case (`content/cases/deep-memory/`, an opening edition with no assessment, an empty ledger, no inputs yet). The founder's pages enter by his own drop from GitHub (the founder-drop door; the panel's GPT seat on #236 read §3.15 as requiring the founder's own grant for republished copies, so the operator commits none); the intake then registers them as founding inputs, and the scheduler's next choices are the draft from that intake, verify, the first assessing edition, and the blind check — the loop's, unattended. The drop landed the same day on the founder's grant (#240: the home page as DEEP-IN001), and the first chain was dispatched. No second drop: the founder judges the five study pages experimental and does not want them taken in; the home page carries each investigation's question, finding and limitations in summary, which is their weight (founder direction, 2026-09-09, in session). |
| 5 | Subtraction by evidence: six disabled workflows and the Maintain-era scripts retired, each citing the verb that replaced it; legacy docs folded; superseded protocols archived; `load.ts` split; one vendor transport; legacy content structures folded or dropped | **Done** in four sets on 2026-09-09 (the subtraction record below), with two legacy structures left as they were: each case's resources page, and the `watch.yaml` files, which the loader still validates and nothing else reads. |
| 6 | Presentation: the reading layer (question, article, map of the controversy, ladder, evidence, what would change our mind, agenda) and the record layer (runs, refusals, panel words, review notes, history) on the case page; `/operations` at site level | **Done.** `/operations` on 2026-09-09; the reading layer and the record page on 2026-09-30 (#421). |
| 7 | Sharper search per dollar: (i) date-aware novelty task in `report`; (ii) a cited-by feed on the ledger's key sources seeding each pass; (iii) retraction re-checks of admitted sources on a cadence | **Todo** (founder direction, 2026-09-16, in session). |
| 8 | The test of better: the reader's budget, and a candidate read beside its incumbent by the panel's seats | **Done** 2026-09-30 (#425, #429, #435); eight cases re-told under it the same day. |
| 9 | Independence of the standing: a judgment written with the panel's verdicts in hand waits for a fresh blind check | **Done** 2026-09-30 (#433, #436). |
| 10 | The gate reads what it is given: what exists once comes first, replies are compared with what was installed from them, a run record is read wherever it is filed | **Done** 2026-09-30 (#422, #424, #430, #437, #440, #446). |

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
- **A new telling must be preferred.** An edition is held to the reader's
  budget, and one that only re-tells an unmoved ledger replaces its
  incumbent only when at least three of the panel's seats, reading both as
  a reader would, choose it and at most one chooses the incumbent. An
  edition that carries a moved ledger or answers the panel goes out
  whatever they prefer, with the preference on its record (2026-09-30).
- **Agreement must be independent.** The checks a judgment was written
  with in hand cannot vouch for it, whether or not the case was contested:
  the standing waits for a blind check made after the judgment. A stamp can
  add to what the judgment is known to have seen and never take from it
  (2026-09-30).
- **A panel is stale when it cannot speak, not when one seat is missing.**
  The scheduler asks for a check when fewer seats have judged the case as
  it stands than ratification requires (four), or when the adopted
  assessment was written with every current check in hand — a
  reconsideration, or any assessment the edition verb wrote while checks
  were current — and no fresh check has judged it. A panel of
  four that lacks its fifth seat ratifies or contests as the constitution
  allows, and the missing seat is asked when nothing else is owed, on a
  cadence that doubles while it keeps failing. A sitting never takes the
  same step twice running: a step that leaves the ledger wanting the same
  step has not helped, and repeating it only spends (2026-09-28).

## The goal

The founder's direction of 2026-09-16, given in session and recorded in
the decisions log, reworded on the founder's word the next day: make this
site present, assess and cover its controversies really well, so that it
keeps improving as more AI is applied to it — a recursive self-improvement
of a narrow kind, running in a long loop over time, trying to make the
site the best it can be. The goal is not cost-effectiveness. It is that
more AI reliably means a better site, and that a site left with less AI
does not quietly get worse. Money is not to be wasted, but it is the
fuel, not the measure. Three things follow for every part of this design.

- **More AI must mean a better site, and never a worse one.** A sitting
  is judged by what it left better: coverage (a case's ledger holds more
  of what is known, verified, and refused with reasons), assessment (the
  standing is better calibrated and the panel concurs with fewer notes),
  or presentation (a reader finds the state of the question sooner and can
  drop to its record). The floor matters as much as the ceiling: no pass
  may leave a case worse than it found it — a fabricated locator, a claim
  told as fact on no evidence, an article that grew and taught less — and
  a pass that spends and leaves nothing better is a defect to find and
  fix, because it breaks the relation between AI applied and quality
  gained. Cost is a guard against waste, read beside the yield, not the
  yield itself.
- **The loop improves itself, not only the content.** What a run teaches
  — a seat's objection, a stalled merge, a record rejected that should have
  been blocked — becomes a gate, a protocol version, or a fix, recorded in
  the decisions log, so that each round of AI applied buys more than the
  last. The operator's standing task is to turn review notes into
  mechanism.
- **Better is not longer.** Editions are measured in what a reader learns
  per screen, ledgers in what a researcher can verify, standings in how
  well they survive the next pass. Growth in words, records or runs is not
  the goal and does not count as improvement.

The human levers stay exactly two: the kill switch and the constitution.
Everything else — what to work on, when, how much AI to apply within the
caps, what to fix — is the loop's, under this document and AGENTS.md.

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
| reverify | `reverify <case>` | the case's provisional records and its dispositions blocked at verification, with the proposals that still hold those records; the sources, fetched again | provisional records promoted in place or refused with a tombstone; blocked records proposed again under fresh ids (one reverify run per proposal, `proposals/<run>/proposal.yaml` and `resubmission.md`) and handed to `verify`, whose rows and history are the record; legacy title-keyed rows settled beside them | the verify reader, under the verify protocol; the scheduler asks for it under rule 1b for provisional records and rule 3b for records blocked at verification (after the editions owed and the panels due, before a new report), on a cadence that doubles after each pass that neither promotes nor admits |
| leads | `leads <case>` | the case's open leads — works a producer named and could not open (a report's "Named, not opened", an intake's unresolved references, a drafter's blocked rows), oldest first, ten a pass — asked of the open indexes (OpenAlex, Semantic Scholar, Europe PMC, the Internet Archive) | a report in the shape the draft verb reads: each lead with its row's key, a *resolved* document (agreed on the checks named) or *candidates* to confirm from the text, or *still unresolved* with what was tried; `leads.json`; then draft → verify → edition as after a report, and the verifier settles a lead's own row when a source it admits is the document resolved | mechanical — no model is called; the scheduler runs it under rule 3c (after editions owed, panels due and re-submission, before a new report) on a cadence that doubles after each pass that opens nothing |
| answer | `answer <pr>` (on the PR's branch) | the PR's standing objections — the parked seats' reasoning from the arbiter's verdict and its open review notes — and the one case the PR touches | records a seat names go back through the second reader with the objection in view (kept with the reader's stamps, refused, or split, as re-verification does; a record that cannot be re-read is left as it stood); every other objection goes to the edition verb, forced, in its packet, and the candidate answers each in its rationale (edition protocol v12); an account for the PR | the second reader and the drafter; run by the operator today, by a workflow on a park or a note later; never touches AGENTS.md; the only `in` rows it leaves are the second reader's admissions of records it re-read; reads only the arbiter workflow's own verdict at the PR's head and the notes it filed — the panel judges the change again |
| assess and explain | `edition <case>` | ledger, inputs, incumbent edition, and what the panel's seats said of it as readers | a candidate held to the reader's budget; then, after the panel's seats have read it beside the incumbent (protocols/compare-v1.md), an edition with their preference recorded on it and a draft assessment when the judgment changed — or nothing, when the candidate is only a new telling and they did not prefer it | the drafter, then the panel's seats as readers |
| — | `check <case>` | the blind packet (ledger only, no incumbent, no grades) | check runs (`role: check`), each recording the ledger hash it judged | the panel's seats that have not judged the ledger as it stands — a seat that has is not asked the same question again, and the verb rests when every seat has (`--seats` names seats outright) |
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

Built on 2026-09-30, three weeks after it was written, and in two parts.
*The floor*: a candidate is held to the reader's budget
(`src/domain/readerBudget.ts`) — the article to 3,000 words, the header's
answers and the judgment's prose to ceilings the editions of 2026-09-08
already kept — and one over a ceiling is sent back once and then refused.
*The test*: each seat of the panel reads the candidate beside the
incumbent as a reader would, in an order balanced across the seats and
without being told which is the candidate (`src/pipeline/compare.ts`,
`protocols/compare-v1.md`) — though each telling is marked with the
evidence it was written from, and when the ledger has moved that marks the
newer one; a telling is preferred with three seats for it and at most one
against. The rule above holds as written for a candidate
that is only a new telling — the ledger has not moved and nothing is being
answered: it is written only when preferred, and otherwise the incumbent
stands, the candidate stays with its run, and the seats' reasons go to the
next edition as `readerNotes`. It is narrowed for a candidate that carries
a moved ledger or answers the panel's dissent or a seat's objection: that
one goes out, because a judgment the evidence has left behind is worse than
a plainer telling, and the preference is recorded on the edition. The
comparison judges the telling and nothing else; the verdicts are the blind
check's.

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
| `draft` | extract-v1 (atomic claim, one rung, theme, verbatim quote from the shown text); the chat-briefs consolidate and construct steps, written down for the first time; the lab's source reader | a quote comes only from retrieved text the drafter was shown; the default is in; blocked stays out; split a load-bearing compound claim; label source statement versus inference; every item raised gets a disposition; v2: direction labels defined (a record from the anchoring passage supports its claim), PDF page locators, `via` for open-access copies; v3: propose a URL for a held source read without one, resolved works are candidates; v4: a supplied document that is a ledger source anchors claims and is mined broadly for its propositions; v5: competition is linked (`alternativeToRefs`, `contradictsRefs`), never merged; one proposition per claim; a new author-supplied document is a Source to propose; v6: an anchor may carry further passages (`also`), each verbatim with its locator, for a proposition stated across pages; v7: a research item proposes a test and states no result or figure from a source the ledger does not hold — findings are evidence records or nothing (the seats on #266) |
| `verify` | extract's anchor check and verify-v1; the verification-ledger rule; the lab's `source-reading-v6` checker | a quote the source never said is rejected, never repaired; model agreement is not verification; a blocked primary stays out; v2: mechanical and factual failures gate, a direction dispute is recorded on the admitted record, anchors are judged on quote, locator, and bearing only; v3: the reader judges atomicity and a compound claim is split (protocol `split`) and judged part by part; `split-v2`: parts are propositions about the world, never about the text; a part's `origin` names the splitter and the verify run; evidence that cited the compound is judged against each part and cites only the parts it bears on (the Arbiter's GPT seat on #207, §3.2, §3.14); v4: relevance is judged against the question as the current edition states it and the accounts it sets side by side; an anchor's further passages are checked verbatim and judged together; a compound evidence record is split (protocol `split-v3`, one observation each with its quote) and judged part by part; v5: the reader names the direction it finds and the claims the passage bears on, and verify writes both on the admitted record, stamped as the reader's act — a dispute is applied, not annotated (the GPT seat on #245, review note #248); a record that bears on none of its claims is refused; v6: a bearing per claim — a record whose claims bear in different directions is split by direction at intake, the same quote in each, each stamped (the seats on #269); edge punctuation of a quoted span is not part of it; a source the verifier read is ai_verified whatever the drafter could reach |
| `edition` | the assessment drafting prompt; the narrative-inputs rule (§7) | grade credibility and diagnosticity separately per claim; the featured set is a decision with a reason; re-adopt the incumbent's assessment when the judgment did not change; consider the founding inputs for voice, follow them where they serve the reader; the article never narrates its own revisions; v3: answer the panel's dissents; v4: feature by stakes — the claims whose truth or falsity would most move the case, the competing accounts and their rungs, parents over their subclaims — thin evidence graded low, never left out; competing accounts set side by side; v5: the edition owns the case's question (`question`, the subtitle a reader sees) and names the accounts it sets side by side (`accounts`); both inherit when a candidate says nothing; the title stays the founder's |
| `split` | §3.2 | inside `verify`: a compound claim becomes the distinct propositions its anchor states, each judged on the same anchor; a split evidence part keeps the page its own quote is on (a reader act on `exactLocator`) |
| `draft` (v8) | the first Orch OR sitting (2026-09-11) | proposed records are referred to by title, never by an id (the verb declines prose that names an id the ledger does not hold); a statement carries no falsification clause (§3.2) |
| `edition` (v7) | the same sitting; review note #294 | the verb measures the article's word count before and after and the accounts count, appends them to the rationale under "Measured by the verb", and notes them in the run record; the model states no counts of its own; growth over a quarter needs a reason in the rationale (replaced in v13 by absolute limits) |
| `edition` (v13, v14) | the founder's direction of 2026-09-29; the goal's "better is not longer"; v14, the same day, from the first run under v13 | the reader's budget is absolute and the verb enforces it, its figures written out in the protocol and held to the code by a test; write to the target, not the ceiling; the first sentence of each header answer is the answer; the article opens with the state of the question; the article and the header's fields use neither record ids nor the ledger's vocabulary, the distinctions those words carried kept in plain ones, while the judgment's own record names its records by id; an incumbent over the budget is restated within it; `readerNotes` are answered in the telling |
| `compare` | the design's "judged against the incumbent" (2026-09-08) | a seat reads two tellings as a general reader with ten minutes, A and B in an order balanced across the seats; length is a cost; the verdicts are not judged; each telling is marked current or written before the evidence last changed; the tellings are data |
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
  drafter and the verifier call it and nothing else fetches. An arXiv abstract
  page is a record's public locator, and the layer reads the paper's PDF for
  it, under the abstract's key, saying so in `via` — so the drafter and the
  verifier read the same text (2026-09-10, after a sitting in which they did
  not and fifty-two records were refused for quotes that were in the paper).

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

**The review, done (2026-09-29).** With eight cases carrying editions the
pipeline produced, the case page had become a log with an article inside
it: on a phone the page for State, Not Scar was 122,000 pixels long, the
article began seventeen screens down, and the first line under the header
was the drafter's note to the panel. The order the founder set stays — the
question, the judgment and the panel, then the telling — and each layer now
keeps to its own place:

- **The case page is for reading the case.** The header's three answers and
  the judgment open with their first sentences and keep the rest behind a
  disclosure (nothing is cut); a strip under the header says what this
  edition changed its mind about, as verdicts that moved; the article has an
  outline and a reading time; the agenda shows the studies that would move
  the case most and folds the rest.
- **The record is a page of its own** (`/cases/<slug>/record/`): how the
  current edition was made, every run with what it admitted and what it
  refused and why, and the whole changelog. The gate's verdicts are a page
  each (`/operations/gate/<pr>/`), with how each seat has voted beside the
  latest of them.
- **The change history a reader is shown is verdicts that moved**
  (`src/domain/moves.ts`), derived from the editions and the assessments
  they adopt: on the home page across cases, on each case in full, and as a
  feed (`/feed.xml`). The changelog says what the loop did; a move says
  what it changed its mind about.
- **The words are explained where they appear.** Every verdict word and
  every standing has one plain sentence (`assessmentGlosses`,
  `standingGlosses`), shown on the badge and listed on the method page.

## Constraints carried forward

No new services, no databases: git as state, Actions as scheduler, YAML
validated fail-closed by the loader. Machine artifacts declare their
lifecycle at birth. Supplied material never enters git. The
engine-as-package refactor waits for a third deployment. The founder's
powers remain exactly two: the kill switch and the constitution.
