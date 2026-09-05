# The metabolism: how the site runs itself

**Status:** design confirmed by the founder, 2026-09-01 (see the DECISIONS
entry of the same date). Build order at the bottom; nothing here is built
until its own PR lands through the normal gates. The section immediately
below is the running status report and is rewritten, not appended, on each
reassessment; everything after it is the ratified design.

## Where we are (reassessed 2026-09-05)

The question the founder asked: is the loop — *update, surface what is
useful, re-evaluate* — actually working? Answer in three parts.

**The judging half works and has evidence.** Blind panels convene on every
canon change and standing derives correctly (transients and YDIH ratified
5/5; contested and unratified states display with their reasons). The
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

### Build order — status

| # | Step | Status |
| --- | --- | --- |
| 1 | Promotion pipe | **Built** (#148). One live promotion. |
| 2 | Bench v2 | **Built** (#141, #149, #155). Backfill scored; endorsement drafter awaiting first scheduled run. |
| 3 | Collection runner | Not built. No backlog yet: every frozen study is collected. Build when a Bench-drafted freeze merges with no one to collect it. |
| 4a | Steelman field | **Built** (#163). Required from 2026-09-04. |
| 4b | Sampling gloss audit | Deferred by founder direction. The largest unaddressed epistemic risk: no judge re-reads a source. |
| 5 | Expedition | Not built. **Blocked on a founder decision**: provider and budget line. |
| 6 | Researcher surface | Not built. Independent; the natural next build. |
| 7 | Atelier | Not built. Founding inputs (its anchor) are committed for every case. |
| 8 | Genesis | Deliberately manual. |

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
2. **Read the digest for two Mondays before building anything.** Every
   loop reports there. If the digest shows promotions, adoptions, and
   re-panels happening without a chat session, the metabolism works and
   the next build is step 6. If it shows nothing moving, the fault is in
   the producing half and no new loop should be added on top of it.
3. **Cadences should say what they do.** The content-response cron
   requests hourly and receives ~5/day; the operator runs daily and most
   days writes "nothing needed doing". Candidates once the digest has
   data: make content-response four fixed times a day (same latency,
   honest schedule), and make the operator event-driven (parked PR,
   issue, quarantine) with a weekly sweep instead of a daily one. Both
   are engine changes and should wait for the two Mondays.
4. **Retire what the lane fix made redundant.** The `GATE_EPOCH` bumps
   were a workaround for the throttle miscounting founder work; the
   `Supervised-by` trailer fixed the count. If no epoch bump is needed
   through September, remove the epoch machinery and the paragraphs
   describing it.
5. **Do not add** a new loop, a new lane, a new label, or a new document
   without removing one. The five-loop design is complete as written;
   what remains is executing steps 3, 5, 6, 7 of the build order — each
   a script in `scripts/lib` with tests, none a new kind of thing.

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

- **The ledger grows monotonically.** Claims, evidence, sources
  accumulate forever. That is the archive doing its job; tiers keep
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

## The five loops

All five write through the same gate (classifier → arbiter panel →
merge policy). No loop has its own door.

### 1. The Watch — hears (exists)

Literature watch → triage → verification pipeline, as built — plus the
segment an outside review (2026-09-01) correctly found missing: **the
promotion pipe**. Verified import proposals previously died in
`proposals/` on a 60-day timer, because nothing authored the evidence
records the ledger admission rule requires; promotion happened only when
the founder opened a chat. A Maintain step now (build step 1) drafts the
promotion — sources.yaml entry plus the evidence records that cite it —
as a needs-approval PR through the classifier, the citation-checking
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
retire by silence, as now ("ignored is retired"). Budgets bound the
pace: at most two active studies per case; a site-wide monthly freeze
budget; three adoptions per run, at most two per case.

### 4. The Tribunal — judges (exists; gains a memory)

Verification labels, blind check panels, derived standing (fails down,
nothing raises it but fresh concurrence), reconciliation that cannot
self-ratify, the constitutional arbiter. Unchanged. Banked corrections live in the
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
that did not author it — is deliberately deferred to last in the build
order (founder direction, 2026-09-01).

### 5. The Atelier — rewrites (new; experiment first)

Quarterly per case, or on a standing change: several independent models
each draft a competing revision of the case's narrative surfaces (the
overview, verdict framings, crux ordering — never ledger records). The
panel judges blind, pairwise, against the incumbent, on a constitutional
rubric: mechanical fidelity first (all claim references survive, no
uncited assertions), then honesty of
uncertainty, symmetry, readability. A challenger replaces the incumbent
only on clear preference (4 of 5 seats) — prose ratchets the way
standing does, and like standing, tolerated dissent is never silent:
**every tournament's full record — each seat's preference and reasoning,
including the dissenter's — is published like a check run** (harvested
to governance/, surfaced on /panel), so an outvoted seat's view is
preserved and displayed, not overridden into silence. The winner still
ships through the normal publication gate, where any seat's
substantiated constitutional objection parks it as usual. Superseded
versions persist in git and the changelog. Known judge pathologies
(fluency bias, length bias, family affinity) are mitigated by the
mechanical floor, randomized pairwise order, and cross-vendor seats;
aesthetics and register remain governed the constitutional way — the
founder amends the register sections (§7 and the style documents it
points to), and panels enforce them.

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

Two rewrite laws (founder direction, 2026-09-01), carried in the
Atelier rubric and enforced mechanically where possible:

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

One metric per case per period — verdict-moving events (verdict changes,
standing changes, new load-bearing claims, study findings) — sets every
cadence. Hot cases run weekly watch, monthly expeditions, tournaments on
standing changes; cases that haven't moved cool toward quarterly sweeps
and an annual tournament. Dormancy is a measured, reversible state, never
abandonment. Site-wide budgets (model spend; the existing content-merge
throttle) cap the whole metabolism, and every loop's activity logs to the
/panel operations section.

## The founder's role, after

Exactly the two constitutional powers, exercised as they always were:
the kill switch, and the constitution — through which taste and register
are governed (the founder amends §7 and the style documents; panels
enforce them). Beyond the two powers, the founder participates as
contributor: reading the weekly digest, dropping material and directions
into the inbox, all of it riding the same gates as anyone else's.
Everything else is panel-governed inside budgets.

## Build order (by dependency and risk; revised 2026-09-01 after the outside review — see DECISIONS)

1. **The promotion pipe** — verified import proposals become gated
   sources+evidence PRs (the single highest-value fix: it is what makes
   existing cases alive rather than beautifully maintained snapshots,
   and it must precede any reliance on yield decay).
2. **Bench v2** — panel scoring on agenda output; ranked report;
   auto-drafted freeze PRs for 4-of-5-high scorers with no
   constitutional objection (founder tap retained initially).
3. **Collection runner** — merged zero-row freezes execute their frozen
   protocols (refusal-fallback provider path mandatory).
4. **Epistemic counterweights** — two small mechanisms from the outside
   review: every check run gains a required field naming the strongest
   argument for the featured hypothesis the assessment does not answer
   (making the panel's shared-prior blindspot visible without giving
   advocacy a vote), and a sampling gloss audit (one random evidence
   record per hot case per cycle re-verified against its primary by a
   model that did not author it), with the honest limitation stated on
   /method: citation checking verifies existence, not readings.
5. **Expedition** — coverage-diff tool + scheduled sweeps (now honest:
   its output has somewhere to go). Requires a provider decision and a
   budget line from the founder.
6. **Researcher surface** — "state of the question" case header +
   per-case JSON export. Independent; can land any time.
7. **Atelier** — as a labeled experiment on one case (transients), with
   the mechanical fidelity floor and the narrative-inputs anchor already
   in force.
8. **Genesis — last, deliberately.** Case creation (topic seed →
   expedition discovery → ladder decomposition → drafted case → one
   giant needs-approval PR → published unratified, thickening in
   public) is the hardest, most judgment-laden job and the least
   frequent; the founder continues to commission cases manually until
   everything upstream has a track record. Until then, "from scratch"
   is not automated, and the design says so rather than pretending.


Implementation constraints throughout: no new services, no databases —
git as state, Actions as scheduler, YAML validated fail-closed by the
loader, every new mechanism a tested script in `scripts/lib`, budgets in
one config, engine work upstream here and synced downstream. Machine
artifacts declare their lifecycle (status, expiry, surviving record) from
their first run — no more folders a reader cannot date.
