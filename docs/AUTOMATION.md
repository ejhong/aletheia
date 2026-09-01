# The metabolism: how the site runs itself

**Status:** design confirmed by the founder, 2026-09-01 (see the DECISIONS
entry of the same date). Build order at the bottom; nothing here is built
until its own PR lands through the normal gates.

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

Literature watch → triage → verification pipeline, as built. One
addition: every import records whether it eventually moved anything (a
verdict, a standing, a crux), feeding the yield metric.

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
collection PR for the panel. Proposals not advanced retire by silence, as
now ("ignored is retired"). Budgets bound the pace: at most two active
studies per case; a site-wide monthly freeze budget.

### 4. The Tribunal — judges (exists; gains a memory)

Verification labels, blind check panels, derived standing (fails down,
nothing raises it but fresh concurrence), reconciliation that cannot
self-ratify, the constitutional arbiter. Unchanged. One addition, the
**regression exam**: every correction the system has fought for, and
every founder-pinned editorial commitment, becomes a frozen test that
any future edit to that case must pass before any judge votes (see Pins
below).

### 5. The Atelier — rewrites (new; experiment first)

Quarterly per case, or on a standing change: several independent models
each draft a competing revision of the case's narrative surfaces (the
overview, verdict framings, crux ordering — never ledger records). The
panel judges blind, pairwise, against the incumbent, on a constitutional
rubric: mechanical fidelity first (all claim references survive, no
uncited assertions, regression exam passed), then honesty of
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

## Pins: how editorial angles survive rewriting

Prose dies; records survive. Anything that lives only as narrative
wording will eventually be reworded. A **pin** is a per-case,
append-only record (`pins.yaml`) of a commitment the presentation must
honor: a banked correction (the record-level residue of a past mistake)
or a founder editorial directive (e.g. "this case addresses the popular
lost-civilization reading and credits its true part" — which already
exists in record form as a graded claim). Each pin carries its statement,
origin and attribution, and — wherever possible — a mechanical check
(claim ID must remain featured; string must appear / must not appear).
Pins are public records: readers can see where emphasis was directed.
Pins bind presentation, never verdicts; verdicts stay panel-governed.

Constitutional note (from the design PR's own panel review): correction
pins are record-keeping and need no new authority. Directive pins are a
new founder authority surface, and new founder authority belongs in the
constitution — so the directive kind ships together with a one-line
AGENTS.md amendment recognizing it, which is the founder's reserved act
and is ratified by his merge, exactly as register amendments are. Until
that amendment lands, no directive pin binds anything.

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
enforce them) and through which directive pins will be recognized when
they ship. Beyond the two powers, the founder participates as
contributor: reading the weekly digest, dropping material and directions
into the inbox, all of it riding the same gates as anyone else's.
Everything else is panel-governed inside budgets.

## Build order (by dependency and risk)

1. **Yield metric + cadence decay** — `scripts/lib/yield.mjs`, derived
   entirely from existing records; Maintain reads it. Pure measurement.
2. **Pins + regression exam** — `pins.yaml` schema, loader validation, CI
   check for mechanically-checkable pins; seeded from banked corrections
   and the founder's first directives. New governance surface: ships with
   a DECISIONS entry; the founder's merge ratifies it.
3. **Bench v2** — panel scoring on agenda output; ranked report;
   auto-drafted freeze PRs for unanimous scorers (founder tap retained
   initially; flipping freezes to auto-merge-on-pass is a later,
   separate merge-policy amendment).
4. **Collection runner** — workflow that detects merged zero-row freezes
   and executes them (refusal-fallback provider path mandatory).
5. **Expedition** — coverage-diff tool + scheduled sweeps. Requires a
   provider decision and a monthly budget line from the founder.
6. **Researcher surface** — "state of the question" case header + per-case
   JSON export of the ledger. Independent; can land any time.
7. **Atelier** — last, as a labeled experiment on one case (transients),
   with pins and exams already in force as its safety floor.

Implementation constraints throughout: no new services, no databases —
git as state, Actions as scheduler, YAML validated fail-closed by the
loader, every new mechanism a tested script in `scripts/lib`, budgets in
one config, engine work upstream here and synced downstream. Machine
artifacts declare their lifecycle (status, expiry, surviving record) from
their first run — no more folders a reader cannot date.
