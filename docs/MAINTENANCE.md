# Maintenance runbook

What runs, when, what it produces, and what to check when something looks
wrong. The *why* behind each mechanism lives in `docs/DECISIONS.md`; the
design of the whole system and its current status live in
`docs/AUTOMATION.md`. This file is deliberately only the how.

The site is operated by AI (AGENTS.md §3.15). The founder holds two powers:
the kill switch (revert any run by its `runId`, or freeze the repo) and the
constitution (`AGENTS.md`). Everything else below runs without a human.

## 1. The machine on one page

Every change reaches `main` through the same gate: **classifier → panel →
merge policy**. There are two lanes.

| Lane | What qualifies | What happens |
| --- | --- | --- |
| `auto:low-risk` | Reversible-by-runId material that touches no featured content: `proposals/**`, `inbox/**` moves, **new** append-only `assessments/*.yaml` overlays, new harvested `governance/arbiter/pr-*.yaml` verdicts, append-only catalog claims and sources. | `PR risk check` re-derives the class from the diff, labels the PR, and arms auto-merge. Merges when CI is green. |
| `needs-approval` | Everything else: featured claims, article text, case records, research items, studies, code, workflows, docs. | The `arbiter` check convenes five vendor seats; **pass** = ≥4 `complies` and zero `violates`. A pass auto-merges. Anything else parks the PR, publicly, until revised or a seat is restored. |

Six workflows do the work:

| Workflow | Trigger | Does | Output |
| --- | --- | --- | --- |
| **Maintain** | Mondays 14:00 UTC; dispatch; `inbox` mode on inbox pushes | Job `maintain`: process inbox → reassess changed cases → watch literature → triage → measure yield → propose agenda (due cases only) → score proposals (Bench) → harvest governance + post the **weekly digest issue** → open one PR. Jobs `promote`, `bench`, `adopt` (fresh checkouts of `main`): draft verified imports into sources+evidence; draft advancing study freezes; draft endorsed claims/research items. | One low-risk PR (proposals, moves, overlays) plus up to three `needs-approval` PRs. The digest issue, cc the founder. |
| **Content response** | Hourly cron (GitHub delivers ~5/day); dispatch | For cases whose evidence packet changed (legacy drafts use timestamps): draft a new assessment overlay and run the editorial audit; re-panel any case whose blind checks are stale. Exits in seconds when nothing is stale. | One PR per run that produced anything; supersedes its older still-open predecessor unless that one is parked. |
| **Inbox response** | Push to `inbox/**` on `main` (not `inbox/processed/**`) | Dispatches Maintain in `inbox` mode. | — |
| **Operator** | Daily 13:00 UTC; issues; dispatch | Answers parked PRs seat by seat, runs `reconcile-contested.mjs`, retries quarantined seats, triages issues. Never touches `AGENTS.md`, never pushes to `main`. | PR comments, fixes as PRs, issue replies. |
| **PR risk check** | Every PR | Classifies the diff; fails a mislabeled low-risk PR; arms the low-risk lane when it qualifies. | Label + auto-merge. |
| **Arbiter** | Every PR | Skips low-risk. Otherwise: five seats judge the diff against `AGENTS.md` at the merge base, with every added DOI/arXiv/URL mechanically resolved first. | Sticky report comment; required check; auto-merge on pass. |

Plus `CI` (typecheck, lint, test, build) and `Deploy` on every push to
`main`, and two on-demand tools: `Extract claims` (document → catalog
claims, `docs/EXTRACTION_PIPELINE.md`) and `Generate case art`
(`docs/IMAGE_STYLE.md`).

**Standing is derived, never stored.** The case page always shows the
latest draft assessment, stamped `ratified` / `contested` / `unratified`
from the blind check runs at build time. Nothing can raise standing except
fresh concurrence from separate vendors on the exact content snapshot and
displayed draft; new content or a changed draft invalidates prior receipts.
Legacy checks remain visible but cannot ratify the current version. The first
content-response runs after receipt rollout will therefore repanel old cases. That is why new overlays may auto-merge.

## 2. Feeding it

Drop files into `inbox/` from any device (the GitHub app or
[github.dev](https://github.dev/ejhong/aletheia) work from a phone). The
push is the trigger; intake runs within a minute. Full conventions in
`inbox/README.md`; the three kinds:

- **commentary note** — your view in your words, `case:` front matter.
  Becomes proposed editorial actions with your verbatim text preserved as
  the authoritative record.
- **link list** — URLs to turn into source records. Fetched and verified;
  labeled `ai_verified` only when actually fetched, `unverified` otherwise.
  Verified imports are then drafted into the ledger by the `promote` job.
- **document** — a text file to mine for catalog claims.

Everything you drop is *contributor* material: quoted, attributed, and
arbitrated like anyone else's. Feeding is optional; the loops run without
input.

**Literature watch** needs a `content/cases/<case>/watch.yaml`:

```yaml
queries:
  - id: trigger-point-imaging        # stable slug — dedup/cursor key
    query: "myofascial trigger point elastography"
    sources: [arxiv]                 # arxiv | crossref | openalex; default arxiv+crossref
    authors: [Davidovits]            # optional author filter
    keywordGroups:                   # AND of ORs — prefer this over `keywords`
      - ["trigger point", myofascial]
      - [imaging, ultrasound, elastograph]
    note: why this query exists
```

Use `keywordGroups`, not a flat `keywords` list, for anything aimed at
Crossref; drop Crossref entirely where the field is arXiv-native. Terms
match at word boundaries. Hits land in `proposals/watch/<runId>/`, all
`unverified`, and are triaged `import` / `shelf` / `archive` (default
archive) with reasons in `triage.yaml`. Archived items are appended to
`proposals/watch/archive-ledger.yaml`, which survives the 60-day expiry of
run directories and exists to be reviewed; promote a wrongly archived item
by dropping its URL in the inbox.

## 3. Reading it

- **The weekly digest issue** is the one thing to read: what settled, what
  the panel said, what parked, yield bands, Bench scores, pre-registrations
  pending, promotions. Subscribe to issues and you have the loop.
- **`/panel`** on the site: standings per case, every split claim with each
  seat's reasoning, per-seat records, the operations log, metabolism totals.
- **`/proposals`**: every agenda proposal with its Bench fate.
- **PR bodies** are plain-language digests of what that run did.
- `node scripts/yield-report.mjs` prints which cases moved and when.

## 4. When something looks wrong

| Symptom | First thing to check |
| --- | --- |
| Every `needs-approval` PR is parked, report says seats "cast no usable vote" | **Vendor billing.** Quorum is 4 of 5 `complies`; two dead seats park everything, by design. OpenAI: credits. xAI: the *monthly spending limit* on the team, not just credits. Restore the seat, re-run `Arbiter` on the PR. |
| A PR is parked with a named objection | Read the seat's reasoning in the sticky comment. The operator will answer it on its next run; or revise the diff yourself. A `violates` vote must name a rule or it degrades to `unsure`. |
| A PR parked "on the rate limit" | `CONTENT_MERGES_PER_WEEK` (10, `scripts/lib/arbiter-core.mjs`) counts autonomous canon merges in the trailing week. Founder-directed work is excluded only if its **commit message** (not the PR body — squash messages are built from title + branch commits) carries `Supervised-by: <who>`. The park clears as the week rolls. |
| A low-risk PR sits open and green | It should have been armed by `PR risk check` on open/push/ready. If not: is it a draft, a fork, or labeled `needs-approval`? Otherwise rebase on `main` to re-trigger. |
| No digest issue on Monday | Check the Maintain run log for `could not open the digest issue`; the step needs `issues: write` in the workflow permissions and a `weekly-digest.md` from `harvest-governance.mjs`. |
| A case shows `unratified — awaiting a fresh blind check` | Expected after any canon change or reconciliation. Content response re-panels on its next run with a full set of live seats. |
| A case shows `contested` | Working as designed. The operator runs reconciliation once; a case still contested afterwards is a standoff and stays displayed. |
| Content response ran 7 minutes and produced nothing | Cold npm cache. Nothing to fix. |
| Malformed panel replies | Quarantined under `proposals/cross-model-failures/`, never installed. The operator retries them. |
| An inbox link came back `unverified` | The URL was unreachable at fetch time. Re-drop it, or drop the DOI/arXiv id instead. |

## 5. Reverting a run

Every generated record carries one `runId`. Either revert the merge commit
(`git log --oneline | grep <runId>`), or surgically: delete
`proposals/**/<runId>/`, delete the overlay `assessments/<runId>.yaml`,
move files back out of `inbox/processed/<runId>/`, and remove records whose
`origin.runId` matches. Low-risk changes are append-only, so reverting them
never damages surrounding content.

## 6. Local commands

```bash
node scripts/reassess-changed.mjs --dry-run --case <slug>   # proposed prose edits as a diff
node scripts/watch-literature.mjs --dry-run [--case <dir>]  # no key needed
node scripts/triage-watch.mjs --dry-run                     # needs an LLM key
node scripts/cross-model-check.mjs <case-dir>               # paid blind panel, configured vendors
node scripts/cross-model-check.mjs geopolymer --dry-run     # inspect exact packet + receipt; no key or calls
node scripts/promote-imports.mjs --dry-run
node scripts/score-agenda.mjs --dry-run
node scripts/yield-report.mjs
```

To start a question without inventing a dossier:

```bash
node scripts/start-case.mjs --id TOP-001 --slug a-new-topic --title "A new topic" --question "What would we like to find out?" --domain "Research domain"
```

This writes `proposals/topics/a-new-topic/`. It refuses to overwrite an
existing directory. The folder uses the ordinary case format and may enter
`content/cases/` through a reviewed PR; it is not published by this command.
No priority or review date is filled in. A blank case does not trigger a paid
assessment. The question must acquire anchored claims and evidence through
normal intake before the assessor has something to judge.

## 7. Setup (once)

- Secrets: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`,
  `XAI_API_KEY`, `VENICE_API_KEY` (the five panel seats — a missing key is
  a dead seat), `MAINTENANCE_PAT` (fine-grained, contents + pull-requests
  write; PRs opened with the default token do not trigger CI), optional
  `IMAGE_API_KEY`.
- House drafting model: `claude-fable-5` with a one-retry refusal fallback
  to `claude-opus-5` (`scripts/lib/llm.mjs`); override with the Actions
  variable `EXTRACT_MODEL`. Records always stamp the model that actually
  answered. Panel seats never fall back — a refusing seat is a failed seat.
- Panel seats: one table, `scripts/lib/vendors.mjs` — model **and** pinned
  effort per seat (Opus 5 medium · GPT-5.6 Sol high · Gemini 3.8 Flash
  medium · Grok 4.5 high · GLM 5.3 Flash high via Venice). Changing a seat
  is a one-line edit there plus a DECISIONS entry; the /panel seat records
  start a new row for a new model. Gemini's intro price doubles 2027-01-01.
- Branch protection on `main`: the `arbiter` check is required (see the
  2026-08-25 "gate is live" decision); admin enforcement off, so the
  founder's override is the kill switch. Repo auto-merge enabled.
