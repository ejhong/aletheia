# How the site runs

**The founder's direction, 2026-10-19, given in session:** make this "a
beautiful, self-updating, truth-exposing machine that brings more clarity
and next-step research ideas" — "a running, sustaining, improving system to
help surface truth" — rebuilt as simply as possible around an AI agent
working in a loop, at about $100 a month across both sites. This document
is that design. What it replaced, and why, is at the end; the history
before it is in `docs/archive/`.

## The idea in one paragraph

An AI agent — **the operator** — does the work: it reads sources, writes
the records, the articles and the judgments, and answers its critics. It
proposes every change as a pull request. **Mechanical checks** fail any
change whose quotations are not in its sources. **Reviewers** — models from
four other companies — read every change and say whether it leaves the site
better, no better or worse for a reader seeking the truth, and whether it
would do a harm that publishing cannot undo; a change publishes when most
judge it better. **The panel** — five models from five companies, judging
the evidence blind — gives each judgment its standing, and where they
disagree is where the next research begins. The founder holds two powers:
the kill switch and the constitution. The site grows by correction:
criticism is kept and becomes the next session's work; nothing waits on a
person.

## The parts

| Part | What it is | Where |
| --- | --- | --- |
| The ledger | Each case's claims, evidence (verbatim quotes with exact locators), sources, research agenda, studies, images; append-only judgments; editions (the reader's telling). The model is unchanged from September. | `content/cases/<case>/`; schema `src/domain/schema.ts`; prose `docs/DATA_MODEL.md` |
| The operator | Claude Code, run headless in GitHub Actions under a hard spending cap per session, with the constitution (`AGENTS.md`, loaded as `CLAUDE.md`) and its charter (`operator/charter.md`). It decides what most needs doing and does it. | `.github/workflows/operator.yml`; the tools it uses: `node scripts/site.ts` |
| The checks | Types, lint, tests; the loader (schemas, ids, edition integrity, the reader's budget — the build fails on any of them); the quote check (every quoted passage a change adds is read in its source; a page locator must name the page; a new DOI must resolve); links. | `.github/workflows/ci.yml`; `src/engine/quotecheck.ts` |
| The review | Four seats (OpenAI, Google, xAI, Venice/GLM), each answering: better / no better / worse; a harm or none; up to three notes. Publishes when ≥3 answer, a majority say better, ≤1 says worse, no harm. A harm holds the change until the operator answers it. Notes never block. | `.github/workflows/review.yml`; `src/engine/review.ts`; `protocols/review-v1.md` |
| The panel | Five seats, one per vendor, judging each case's ledger blind (no article, no grades). Their concurrence with the operator's draft judgment is its standing: ratified, contested, or not yet ratified. | `src/engine/check.ts`; `protocols/check-v2.md`; `src/domain/standing.ts` |
| The money | Caps per session, day and month (`config/budget.yaml`); every paid call is a row in `governance/spend/`. The operator's session cost is what Claude Code reports; the panel's and the review's are the vendors' own usage, priced from `config/tariffs.yaml`. | `src/engine/budget.ts`, `src/engine/session.ts` |
| The founder | The kill switch (`governance/operation.yaml`: `paused` stops every session and panel) and the constitution (`AGENTS.md`, amended only by the founder's own commit). | — |

## A session

1. The workflow starts (daily, or when the founder dispatches one). If the
   site is paused, or the month's money is spent, or the month has spent
   more than its share of the days gone (the pace that spreads the money
   over the month; a session started by hand runs ahead of it), it stops.
2. It harvests the reviews of changes that have closed since the last
   session into `governance/reviews/` (and their cost into the ledger).
3. If one of the operator's own changes is held or sent back by the
   reviewers, the session is about that change: it reads the review and
   answers it — a fix, or a reasoned reply in its log. A change answered
   twice without publishing is withdrawn, and its attempt stays on record.
4. Otherwise the operator reads `node scripts/site.ts status` — each case's
   standing and freshness, the reviewers' last notes, where the panel
   splits, what waits in an inbox, the money left — and chooses the work
   that most improves the site for a reader. Typically one case per
   session: search for what has appeared since the last pass, read the
   sources, add evidence (verbatim, with exact locators, from text read
   with `site read`), mend what reviewers found, re-tell the article within
   the reader's budget, write a new judgment when the evidence moved it.
5. It runs the checks itself (`site check-quotes`, `npm test`, the build)
   and stamps any new edition (`site stamp <case>`). When the judgment
   changed, the panel judges the case blind (`site panel <case>`), so the
   change carries its own standing.
6. It writes its log (`runs/<runId>/log.md`): what it did, why, what it
   left undone, what it would do next.
7. The workflow records the session's cost, commits, and opens the pull
   request. CI and the review take it from there.

## What a change must pass

- **Mechanically (CI):** everything the loader enforces; every quoted span
  in a new or changed evidence record or claim anchor found in its source's
  text, read as the operator reads it; a locator's page the page the span
  is on; a new source's DOI or arXiv id resolving. A record whose text
  cannot be read enters only as `provisional` and carries no weight.
- **The review:** better for a reader, no harm. The harms are the ones
  publication itself causes: a fabricated or misattributed source,
  quotation, locator or provenance detail; confidential material; a
  statement about a living person the record does not support; a draft
  presented as ratified; an edit to the constitution; a weakened check.
- **The founder's hand:** only for an edit to `AGENTS.md`, which the
  review always holds.

## Two sites, one engine

Aletheia (contested hypotheses) and Erebus (contested public events) run
the same engine. The engine — `src/`, `app/`, `scripts/`, the workflows,
`protocols/` — is developed here and pulled into Erebus mechanically, with
this project's name changed to Erebus's (`scripts/sync-engine.mjs` there).
A site is its own in four places only: its constitution (`AGENTS.md`), its
identity and notices (`config/site.yaml`), its theme (`config/theme.css`),
and the rules every model it calls must also follow (`config/site-rules.md`;
on Erebus, the living-persons rules). Money and models are per site
(`config/budget.yaml`, `config/models.yaml`).

## Money

The founder's direction of 2026-10-19: about $100 a month across both
sites — Aletheia $60, Erebus $40 — after a one-time start that October's
granted caps already cover. The month's money is spread over its days, so
at $10 a session, with the review and the panels on the same bill, this
site gets a session about every five or six days and Erebus about one a
week: enough to check the live cases for anything new and to give a case a
deep pass every few weeks. About $250 a month would give every case a deep
pass a month. More money buys depth and breadth, not correctness: the
checks and the review are the same at any budget.

## What was replaced on 2026-10-19, and why

The September design ran a fixed pipeline: nine verbs (report, draft,
verify, reverify, leads, answer, edition, compare, check), a scheduler with
eleven rules, weekly sittings of three steps, and a constitutional gate in
which five seats voted complies or violates on every change. It produced
real gains — the ledger's verification, the reader's budget, the blind
panel's independence — and those are kept. But by October it had stopped:
for three weeks the scheduler chose to re-try records that could not be
read (one admitted in six passes) while three cases had never been
searched; a step that rested was asked for again and the sitting stopped
itself; two parked changes waited with nobody to answer them; and one gate
seat cast 38 of the 39 objections in 136 changes, while the gate passed
twenty editions that grew one article from 2,178 words to 7,502. Rules
cannot see that a step is pointless or that a public-domain book is on the
Internet Archive; an agent can. So the judgment moved to the agent and the
guarantees stayed in code: about 12,000 lines of orchestration became one
charter, and the gate's question changed from "can this be defended?" to
"is the site truer and clearer for it, and does it do harm?" (founder
amendment of AGENTS.md §3.15, 2026-10-19).

Kept as history, readable on the site: every pipeline run
(`proposals/<runId>/`), the gate's verdicts and review notes
(`governance/arbiter/`, `governance/review-notes/`), the retired protocols
(`protocols/archive/`), and the September design and decisions
(`docs/archive/`).
