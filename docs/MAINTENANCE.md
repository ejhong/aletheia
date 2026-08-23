# Maintenance: the commentator-in-chief loop

You are the editor-in-chief; the pipeline is your staff. You feed it
documents, links, and opinions; it drafts; you approve from your phone.
Nothing publishes without either your tap or a conservatively-classified
low-risk auto-merge — and everything is revertable by runId.

## Your day-to-day

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

Why auto-merging **new** assessment overlays stays low-risk (v1.1
governance rule): the site never displays an unreviewed run as the
editorial assessment. `displayAssessment()` shows the last
`humanReviewed: true` run when one exists; newer unendorsed runs render
as clearly-labeled AI drafts, and their disagreement with the editorial
assessment appears as a review alert on the case page. An auto-merged
overlay therefore cannot silently change what the public reads as the
verdict.

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
3. **Watches the literature** (`scripts/watch-literature.mjs`): runs each
   case's declared watch queries against arXiv and Crossref (OpenAlex
   optionally) and surfaces newly published/indexed items as
   **discovery-only** proposals — see the next section.
4. **Opens the PR** with the digest body and the risk label.

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
    keywords: [elastography, knot]   # optional: title/abstract must contain one
    note: why this query exists      # shown to the reviewer
```

Weekly, the watch step searches each API for items published/indexed since
the case's last run (per-case cursor and already-surfaced-item list live in
`proposals/watch/state.yaml`; the state file is machine-maintained and safe
to delete). Items already in the case's `sources.yaml` (matched by DOI or
arXiv id) or surfaced by an earlier run are skipped. Results land in
`proposals/watch/<runId>/<case>.yaml` with title, authors, venue, date,
DOI/arXiv id, abstract snippet, and the matching query — **exactly as the
APIs returned them, all labeled `unverified`**. Nothing is added to
`sources.yaml` or `evidence.yaml` automatically. If an LLM key is present,
items also carry a short relevance note explicitly labeled as an
AI-generated draft; with no key the step runs the same, minus the notes.

Watch proposals only touch `proposals/**`, so a weekly run that contains
nothing else stays `auto:low-risk`.

**Promoting a surfaced paper into a real source** (your call, two routes):

1. **Inbox**: drop the paper's DOI/URL as a link list —
   `inbox/<case>/links.md` or front matter `case: <case>` — optionally with
   a commentary note saying what it is evidence for. The next run
   fetch-verifies it and proposes a source record with an honest label.
2. **Chat**: tell the agent which item to import; it verifies the citation
   against Crossref/the publisher and writes the source (and any evidence
   records) for review.

Either way the item enters `sources.yaml` only after verification, and the
DOI/arXiv dedup means the watch will not surface it again.

Local run: `node scripts/watch-literature.mjs [--dry-run] [--case <dir>]
[--days <n>] [--no-llm]` — no API key required.

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
