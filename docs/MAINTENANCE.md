# Maintenance: an AI-operated site, and the observer's loop

Since 2026-08-25 (see `docs/DECISIONS.md`), this site is operated by AI as
a declared experiment. The epistemic rules and the fail-closed pipeline are
unchanged; what changed is who exercises judgment. The human founder holds
exactly two powers — the kill switch (revert anything by runId, or freeze
the repo) and the constitution (`AGENTS.md`, the one file reserved to a
human). Everything else is the agents' job, in public.

**Interim state (Stage 4 pending):** the target approval mechanism for
`needs-approval` changes is ratification by multi-model concurrence — an
arbiter report from independent vendors posted on the PR. Until that
arbiter runs on its own schedule, the founder's merge tap persists as a
mechanical trigger, not an editorial review: the judgment standard is
already the constitution, and the tap will be removed by Stage 4 without
any change in standard.

## The observer's loop (was: your day-to-day)

**Feed it if you feel like it** — inbox drops now enter as *contributor*
material: quoted, attributed, weighed, and arbitrated exactly like
correspondence from any outside researcher. Feeding it is optional; the
watch, reassessment, and editorial-audit loops run without input.

**Feed it** (any time, from anywhere):

- Drop files into `inbox/` — from your phone via the GitHub app or
  [github.dev](https://github.dev/ejhong/aletheia), or push from a laptop.
- Three kinds of drops (full convention in `inbox/README.md`):
  - **commentary note** — your opinions in your words
    (`inbox/2026-08-22-note.md` with `case: geopolymer` front matter);
  - **link list** — URLs worth turning into source records;
  - **document** — a text file to mine for catalog claims.

**Wait** (or don't): the **Maintain** workflow runs every Monday, or run it
now from the Actions tab (workflow_dispatch).

**Read and tap**: each run opens one PR whose body is a plain-language
digest — what changed and why, readable on a phone. Two classes:

| Label | Meaning | What you do |
| --- | --- | --- |
| `auto:low-risk` | Reversible-by-runId, touches no featured content: new proposals, inbox moves, **new** append-only assessment overlays, append-only catalog-claim/source additions. | Nothing. It auto-merges when CI is green. Skim the digest if curious. |
| `needs-approval` | Anything touching featured claims, article/overview text, case records, review states, existing human-attributed content, or code. | Read the digest in the GitHub phone app notification, tap **Merge** (or comment / request changes). |

The classification is **enforced, fail-closed**: the `PR risk check`
workflow re-derives the class from the actual diff
(`scripts/classify-pr-risk.mjs`), and a PR labeled `auto:low-risk` whose
diff exceeds the allowlist fails the check, which blocks auto-merge.

Why auto-merging **new** assessment overlays stays low-risk (stage-3
governance rule): standing is derived, never stored, and it only fails
DOWN. `displayAssessment()` always shows the latest draft, stamped with a
ratification standing computed at build time from the independent check
runs: **ratified** (≥4-model panel, at most one dissenter on the case
verdict, no load-bearing claim contested, panel newer than the content),
**contested** (panel disagrees — displayed, never hidden), or
**unratified** (panel too small or the content moved after it judged). An
auto-merged overlay can therefore change the displayed *narrative*, but it
cannot mint *standing*: a new draft or new evidence automatically demotes
the case to unratified until independent models re-judge the current file,
and nothing in the pipeline can raise standing except fresh concurrence
from separate vendors.

## What happens automatically

Weekly (or on demand), the Maintain workflow:

1. **Processes the inbox** (`scripts/process-inbox.mjs`):
   - commentary → proposed editorial actions in `proposals/inbox/<runId>/`,
     each carrying your verbatim quote; your full note is preserved as the
     authoritative `sourceStatement`;
   - links → fetched, verified, proposed as source records with honest
     verification labels (`ai_verified` only when actually fetched);
   - documents → the extraction pipeline (`docs/EXTRACTION_PIPELINE.md`);
   - processed items move to `inbox/processed/<runId>/`.
2. **Refreshes assessments** (`scripts/reassess-changed.mjs`): for each case
   whose claims/evidence/sources changed in git after its latest assessment
   overlay, drafts a **new** overlay file (never edits an old one), stamped
   `humanReviewed: false` with runId/model/promptVersion; structurally
   validated before writing, discarded (and reported) if invalid.
3. **Corrects the editorial layer** (same script, second pass): verdicts
   re-derive from the ledger on every run, but the overview article and
   research agenda do not — prose written six months ago goes on asserting
   whatever it asserted. So for each case that was reassessed, a second pass
   reads `overview.md` and `research.yaml` against the current records and
   **makes the correction**, rather than filing a to-do that leaves a false
   sentence on the public page until someone gets to it. It corrects only
   factual conflicts (the article says nobody has examined X; a record now
   reports someone has), never style, tone, or additions. Safety comes from
   structure, not from restraint:

   - edits are exact string replacements — a `find` span that is missing,
     ambiguous, or under 60 characters is rejected, never approximated;
   - the article's `{claim=...}` annotations and `{plate:...}` placements
     must survive; losing one reverts every narrative edit for that case;
   - research edits splice a single YAML scalar's source span and are then
     verified by re-parsing — if any other record or field moved, revert;
   - only prose fields are editable (`title`, `summary`, `informationGain`);
     ids, claim links and taxonomy are canon;
   - every applied edit appends a `history.yaml` entry naming the model, the
     run and that it is pending human approval;
   - the diff touches featured content, so the risk classifier marks the PR
     `needs-approval`. **Nothing in this pass reaches the site on its own.**

   Run `node scripts/reassess-changed.mjs --dry-run --case <slug>` to see the
   proposed prose printed as a before/after diff without writing anything.
   Silence is the normal result: most cases most weeks need zero edits.
4. **Watches the literature** (`scripts/watch-literature.mjs`): runs each
   case's declared watch queries against arXiv and Crossref (OpenAlex
   optionally) and surfaces newly published/indexed items as
   **discovery-only** proposals — see the next section.
5. **Triages the watch results** (`scripts/triage-watch.mjs`): one model
   call per case judges every surfaced item into `import` / `shelf` /
   `archive` with a recorded reason — see the next section.
6. **Opens the PR** with the digest body and the risk label.

## Literature watch

Each case may declare watch queries in an optional
`content/cases/<case>/watch.yaml` (schema: `WatchConfigSchema` in
`src/domain/schema.ts`, validated at build time):

```yaml
queries:
  - id: trigger-point-imaging        # stable slug — dedup/cursor key
    query: "myofascial trigger point elastography"
    sources: [crossref, arxiv]       # optional; default arxiv + crossref;
                                     # openalex also supported
    authors: [Davidovits]            # optional: keep only matching authors
    keywords: [elastography, knot]   # optional OR list: match any one
    keywordGroups:                   # optional AND of ORs: match every group
      - ["trigger point", myofascial]
      - [imaging, ultrasound, elastograph]
    note: why this query exists      # shown to the reviewer
```

**Prefer `keywordGroups` to `keywords` for anything aimed at Crossref.** A
flat OR list is only as narrow as its broadest term, and Crossref ranks by
loose relevance over everything ever published. In the 2026-08-24 run that
combination surfaced seven clinical nerve-block papers under Orch OR (one
term, `anesthe`), nanodiamond contact lenses under YDIH (`nanodiamond`), and
a novel review under geopolymer (`ancient`). Requiring a second concept —
"about anaesthesia AND about microtubules" — removed all of it without
costing a single real hit: replaying that run's 42 items through the current
configs keeps 12 and drops 30.

Terms match at a **word boundary**, so a stem like `archaeolog` still finds
`archaeological` while `psi` no longer matches inside `epsilon`.

Where a field's literature is arXiv-native, drop Crossref rather than
filtering it: CCC, transients, Zero Worlds and Orch OR's physics queries are
arXiv-only for that reason. Crossref stays where the literature genuinely is
not on arXiv — YDIH (geology), geopolymer (archaeology/materials), MPI
(psychology), vasocomputation (physiology).

Weekly, the watch step searches each API for items published/indexed since
the case's last run (per-case cursor and already-surfaced-item list live in
`proposals/watch/state.yaml`; the state file is machine-maintained and safe
to delete). Items already in the case's `sources.yaml` (matched by DOI or
arXiv id) or surfaced by an earlier run are skipped. A preprint later
published under a **different title** keeps a different identifier, so exact
dedup misses it; those items are surfaced anyway and labeled
`possibleDuplicateOf: <SRC-ID>`, never dropped — silently suppressing a
genuinely new paper is the one failure a discovery tool must not have, so
the guess is shown to a human instead of acted on. Results land in
`proposals/watch/<runId>/<case>.yaml` with title, authors, venue, date,
DOI/arXiv id, abstract snippet, and the matching query — **exactly as the
APIs returned them, all labeled `unverified`**. Nothing is added to
`sources.yaml` or `evidence.yaml` automatically. If an LLM key is present,
items also carry a short relevance note explicitly labeled as an
AI-generated draft; with no key the step runs the same, minus the notes.

Watch proposals only touch `proposals/**`, so a weekly run that contains
nothing else stays `auto:low-risk`. Un-promoted runs **expire after 60
days**: the next real run deletes the stale directory (git history keeps
the record, the seen-list dedup survives), so no proposal pile accumulates
waiting for anyone.

### Triage: what surfaced literature deserves

`scripts/triage-watch.mjs` runs after the watch and judges the newest
untriaged run — one model call per case, against versioned criteria
(`watch-triage-v1`), into exactly three outcomes, every decision recorded
with a reason in `proposals/watch/<runId>/triage.yaml`:

- **import** — likely NEW evidential weight: new primary data, a direct
  rebuttal or replication of tracked work, a retraction, or a
  methodological critique bearing on a named existing claim. Imports queue
  a verification request as an inbox link drop
  (`inbox/triage-<runId>-<case>.md`), which the next run's inbox step
  fetch-verifies into source-record proposals.
- **shelf** — useful reading with no new evidential weight; a candidate for
  the case's curated `resources.yaml`, awaiting an agent.
- **archive** — everything else, and the deliberate default: genuinely
  significant developments in these fields are rare and loud (they recur
  across queries and get discussed), while a padded ledger quietly rots.

Fail-closed by construction: a malformed model reply triages **nothing**
for that case (a silently skipped item would be indistinguishable from a
deliberate archive), and an item the watch flagged `possibleDuplicateOf`
can never be imported — the guard runs in code, not in the prompt
(`scripts/lib/triage.mjs`, tested in `src/domain/triage.test.ts`).

**The ledger admission rule backs all of this at build time** (enforced in
`src/domain/load.ts`): a source may sit in `sources.yaml` only if an
evidence record or claim anchor cites it, or it is explicitly marked
`background: true` (reading-guide material, shown on the case's resources
page). An uncited, unmarked source fails the build — so no pipeline stage,
and no agent, can quietly pad the ledger with relevant-looking but
weightless references. The flag is honest in both directions: a cited
source still marked background also fails.

**Manual promotion still works** (either route, same as before):

1. **Inbox**: drop the paper's DOI/URL as a link list —
   `inbox/<case>/links.md` or front matter `case: <case>` — optionally with
   a commentary note saying what it is evidence for.
2. **Chat**: tell the agent which item to import; it verifies the citation
   against Crossref/the publisher and writes the source (and any evidence
   records) for review.

Either way the item enters `sources.yaml` only after verification **and**
with an evidence record citing it, and the DOI/arXiv dedup means the watch
will not surface it again.

Local runs:
`node scripts/watch-literature.mjs [--dry-run] [--case <dir>] [--days <n>] [--no-llm]`
— no API key required;
`node scripts/triage-watch.mjs [--dry-run] [--run <watch-runId>]` — needs an
LLM key, skips gracefully without one; a retry of a failed run overwrites
rather than duplicates (deterministic filenames).

## Where accountability lives

- **Your commentary is the human editorial record.** The AI only translates
  your position into proposed updates; every proposal shows your exact
  words beside it, and the record names you as editor. If a translation
  misreads you, the record shows both texts — yours wins.
- Everything machine-produced stays honestly labeled: `ai_extracted`
  claims, `humanReviewed: false` overlays, `ai_verified`/`unverified`
  sources. Nothing pretends to be reviewed until you review it.

## Reverting a run

Every generated record carries one `runId`. To undo a run:

1. `git log --oneline | grep <runId>` (or find the merge PR) and revert the
   commit(s); or
2. surgically: delete `proposals/**/<runId>/`, delete the overlay file named
   `<runId>.yaml`, move files back out of `inbox/processed/<runId>/`, and
   remove any records whose `origin.runId` matches.

Since low-risk changes are append-only by policy, reverting them never
damages surrounding content.

## Setup requirements (once)

- Repository secret `ANTHROPIC_API_KEY` (preferred) or `OPENAI_API_KEY` —
  without one the workflow fails early with instructions. The model is pinned
  by the repository Actions **variable** `EXTRACT_MODEL` (currently
  `claude-fable-5`, matching the code default in `scripts/lib/llm.mjs`);
  switch models with
  `gh variable set EXTRACT_MODEL --repo ejhong/aletheia --body "<model-id>"` —
  no code edit needed. Assessment overlays stamp the model that actually ran
  (`runId`/`model`/`promptVersion`), so overlays produced by different models
  remain distinguishable.
- Optional but recommended: `MAINTENANCE_PAT` (fine-grained token, contents
  + pull-requests write). PRs opened with the default Actions token do not
  trigger CI, which would leave auto-merge waiting; a PAT fixes that.
- Repo auto-merge is enabled (`allow_auto_merge`). For strict
  "merge only when CI is green" semantics, add a branch ruleset requiring
  the CI and PR-risk checks once direct-push agent traffic to `main` winds
  down — with no required checks, GitHub may merge an auto-merge PR before
  CI finishes.

## Cross-model checks

`node scripts/cross-model-check.mjs <case-slug>` re-assesses one case with
every vendor whose API key is configured (ANTHROPIC/OPENAI/GEMINI/XAI),
each judge blind to all prior assessments. Passing replies install as
append-only `role: check` overlays in the case's `assessments/` directory
(auto:low-risk by the standard rules); malformed replies land in
`proposals/cross-model-failures/` and are never installed. The case page's
concurrence panel then reports agreement with the displayed assessment,
naming split claims as review entry points. Cost: one long completion per
vendor (a few dollars per case). Re-run after a case changes materially;
each run is dated and stamped, so history accumulates like any overlay.
