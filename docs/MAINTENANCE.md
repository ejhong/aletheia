# Maintenance runbook

What runs, when, what it produces, and what to check when something looks
wrong. The *why* behind each mechanism lives in `docs/DECISIONS.md`; the
design of the whole system and its current status live in
`docs/AUTOMATION.md`. This file is deliberately only the how.

The site is operated by AI (AGENTS.md §3.15). The founder holds two powers:
the kill switch (revert any run by its `runId`, or freeze the repo) and the
constitution (`AGENTS.md`). Everything else below runs without a human.

## 1. The machine on one page

AI settings and spend reports: **[config/README.md](../config/README.md)**.
`config/ai.json` sets the Astra main writer, recorded tariffs and initial
$150 monthly / $25 daily allowance, with $30 kept for review. Change live limits
or pause/resume through the budget workflow, without a model call. Run the **AI budget report** Actions
workflow or `npm run ai:budget -- status`; every paid job reports its allowance.
Initialize the separate spending branch once with `npm run ai:budget -- init`.
Local paid runs require `BUDGET_GITHUB_TOKEN` as well as the model key.

Shared source reader (Node 22.18+ and `OPENAI_API_KEY` for paid readings):

```sh
node scripts/research-sources.ts deep-memory <public-https-url> [second-url]
node scripts/review-research-proposal.ts <proposal.yaml>
node scripts/review-research-proposal.ts <proposal.yaml> --materialize <new-directory>
node scripts/promote-imports.mjs --dry-run
```

The reader accepts at most two HTML/text sources and four model calls, with a
four-minute deadline and a $1 research allowance per run at the explicit rate
card in `config/ai.json`. Confirm current rates there before a new operating
period. This local allowance includes the separate source-reading call. The
shared monthly/daily allowance additionally covers the PR arbiter, all other
scripted model calls, the coding operator, and image generation. The existing
promotion job uses this same allowance, including when the two sources belong
to different cases; no additional research schedule is installed. Source
failures, refusals, and budget exhaustion are recorded in
`proposals/intake/`; local in-progress liability receipts live in the ignored
`.research-runs/` directory. Unknown token usage keeps its full reservation.

The common envelope is the `research` field of a `research-proposal` decision.
Save that field as the proposal file for the review command. `--record` appends
a validated proposal to intake; `--materialize` writes a prospective case to a
new directory for inspection. Neither publishes. Adoption still needs an
ordinary PR, a fresh basis check, and the normal gate. A partial run may contain
useful independently checked records; inspect its failed source outcomes too.

`promote-imports.mjs --dry-run` inspects queued inbox links, legacy watch imports,
and recorded proposals without fetching, model calls, or writes. Without
`--dry-run`, it reads up to two queued sources and prepares fresh, validated
proposals in the working tree, including case history and adoption receipts.
Use an isolated branch and the normal PR gate. Its full Maintain job does this
automatically on a fresh checkout of `main`; requests captured in that run wait
until the next full run. A missing OpenAI key leaves sources queued and does not
prevent model-free preparation of existing proposals. `--limit` can reduce the
source count to one; it cannot increase the shared allowance.

Manual edition authoring (Node 22.18+, no API key or model call):

```sh
node scripts/prepare-edition.ts deep-memory > /tmp/edition-candidate.yaml
node scripts/review-edition.ts /tmp/edition-candidate.yaml
node scripts/review-edition.ts /tmp/edition-candidate.yaml --record
node scripts/review-edition.ts /tmp/edition-candidate.yaml --materialize /tmp/edition-review
```

Preparation copies the incumbent, retaining the original assessment reference.
To revise it, author the candidate and update its model/author and protocol
stamp accurately. Review reports changed selection, removed claim references
and plates, and whether the essay or assessment changed. It rejects stale
inputs, missing references, invalid assessment bindings, and broken history;
unchanged candidates can be recorded but cannot produce a replacement edition.
The materialization directory must not exist. Inspect it, recheck the candidate
basis against current main, and adopt the new edition and any new assessment
together in an ordinary PR. The first adoption also removes `overview.md`;
append a case changelog entry in the same PR. No command publishes directly.

To feature a catalog claim, include its ID in the edition's `featuredClaimIds`
and provide a complete `claimAssessments[].treatment` in the assessment it
references (fields in `docs/DATA_MODEL.md`). Keep the claim's original statement,
anchor, origin, and stored tier. The validator rejects incomplete treatment;
the view reads the adopted assessment's verdict, importance, diagnosticity,
explanation, and objections together. A new draft alone cannot change the
featured set. Earlier interpretations remain in claim history. Blind checks
include selected catalog claims and must match the new edition and assessment
before standing can rise. These commands still make no model calls.

Deep Memory is the first migrated case. Its current assessment is pinned by the
edition, or explicitly absent. Legacy reassessment can still produce candidate
overlays but skips its old article patcher for migrated cases. Legacy contested
reconciliation retains the incumbent; the automated edition drafter remains
to build before assessed cases migrate. Keep the panel enabled throughout.

Every change reaches `main` through the same gate: **classifier → panel →
merge policy**. There are two lanes.

| Lane | What qualifies | What happens |
| --- | --- | --- |
| `auto:low-risk` | Reversible-by-runId material that touches no featured content: `proposals/**`, `inbox/**` moves, **new** append-only `assessments/*.yaml` overlays, new harvested `governance/arbiter/pr-*.yaml` verdicts, append-only catalog claims and sources. | `PR risk check` re-derives the class from the diff, labels the PR, and arms auto-merge. Merges when CI is green. |
| `needs-approval` | Everything else: featured claims, article text, new or changed editions, case records, research items, studies, code, workflows, docs. | The `arbiter` check convenes five vendor seats; **pass** = ≥4 `complies` and zero `violates`. A pass auto-merges. Anything else parks the PR, publicly, until revised or a seat is restored. |

Six workflows do the work:

| Workflow | Trigger | Does | Output |
| --- | --- | --- | --- |
| **Maintain** | Mondays 14:00 UTC; dispatch; `inbox` mode on inbox pushes | Job `maintain`: process inbox → reassess changed cases → watch literature → triage → measure yield → propose agenda (due cases only) → score proposals (Bench) → harvest governance + post the **weekly digest issue** → open one PR. Jobs `promote`, `bench`, `adopt` (fresh checkouts of `main`): read queued sources and prepare checked Source/Claim/Evidence bundles; draft advancing study freezes; draft endorsed claims/research items. | One low-risk PR (proposals, moves, overlays) plus up to three `needs-approval` PRs. The digest issue, cc the founder. |
| **Content response** | Hourly cron (GitHub delivers ~5/day); dispatch | For cases whose evidence packet changed (legacy drafts use timestamps): draft a new assessment overlay and run the editorial audit; re-panel any case whose blind checks are stale. Exits in seconds when nothing is stale. | One PR per run that produced anything; supersedes its older still-open predecessor unless that one is parked. |
| **Inbox response** | Push to `inbox/**` on `main` (not `inbox/processed/**`) | Dispatches Maintain in `inbox` mode. | — |
| **Operator** | Daily 13:00 UTC; issues; dispatch | Answers parked PRs seat by seat, runs `reconcile-contested.mjs`, retries quarantined seats, triages issues. Never touches `AGENTS.md`, never pushes to `main`. | PR comments, fixes as PRs, issue replies. |
| **PR risk check** | Every PR | Classifies the diff; fails a mislabeled low-risk PR; arms the low-risk lane when it qualifies. | Label + auto-merge. |
| **Arbiter** | Every PR | Skips low-risk. Otherwise: five seats judge the diff against `AGENTS.md` at the merge base, with every added DOI/arXiv/URL mechanically resolved first. | Sticky report comment; required check; auto-merge on pass. |

Plus `CI` (typecheck, lint, test, build) and `Deploy` on every push to
`main`, and two on-demand tools: `Extract claims` (document → catalog
claims, `docs/EXTRACTION_PIPELINE.md`) and `Generate case art`
(`docs/IMAGE_STYLE.md`).

**Standing is derived, never stored.** The case page shows the assessment
chosen by its current edition, or the latest draft on a legacy case,
stamped `ratified` / `contested` / `unratified`
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
- **link list** — URLs with any accompanying explanation, queued without a
  model call or an assertion of verification. The `promote` job reads them
  within its budget on the next full run; useful observations receive a
  separate source check and become complete proposals for the normal gate.
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
archive) with reasons in the durable `proposals/intake/` history. Import, shelf,
archive, and failed-triage records survive the 60-day expiry of watch runs.
Failed cases remain due; reconsider an archived item by dropping its URL in
the inbox or explicitly rerunning `triage-watch.mjs --run <watch-run-id>`.

Inspect a source across the current ledger and existing intake decisions:

```sh
node scripts/intake-report.mjs --case megalithic-casting
node scripts/intake-report.mjs --case transients --source https://arxiv.org/abs/2605.01190
node scripts/intake-report.mjs --case transients --watch-run watch-2026-08-24-7806
```

With only `--case`, this prints the complete decision history, including agenda
proposals and panel reasons. Directory names and public slugs both resolve.
This is read-only and needs no model key. It reports exact source matches,
possible title matches, earlier decisions and their file references, and
legacy decisions whose case could not be established. Unknown review metadata
stays unknown. Triage uses the same context. A prior intake decision is not
proof that a new observation has been considered.

Source requests rest for the same case, URL, submitted context, and case inputs.
Rejected and empty readings close that request; changed context or a changed
case permits reconsideration. Operational failures remain queued within the
same pass budget. Stale or invalid adoption reopens the original request for a
fresh reading. Legacy imports already represented by a Source are skipped;
an explicit inbox request can seek another observation from that same source.
The queue is derived from `source-request`, `research-run`, and
`research-adoption` history, without another state file. Prepared adoptions
reference their original proposal; source-promotion totals derive from them.

The agenda generator can reconsider a proposal under its existing title.
Changed arguments or case inputs reopen it; unchanged substance rests, and
renaming alone does not count as a change. Unscored is not rejected. New panel
scores retain each seat's reasons; failed or stale panels remain retryable.
Promotion outcomes reach a PR even when the successful-import count is zero.

For a migration audit, `node scripts/migrate-intake.mjs` reports the replay
without writing; `--write` performs it. Once migrated, it reuses the recorded
legacy commit and is idempotent. It refuses to delete a legacy file changed
after that basis. Normal workers never reread or rewrite those retired stores;
corrections and reconsiderations append a new intake decision.

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
| An inbox link has no resulting evidence | Inspect `research-run` outcomes and `promote-imports.mjs --dry-run`. Unavailable or unsupported sources remain retryable; rejected or empty readings retain their reason. Send a changed argument or better public HTML/text source when useful. PDF/OCR reading is not part of this adapter yet. |

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
- Main drafting model: `gpt-6-astra`, medium effort, in `config/ai.json`.
  The shared Responses client requires the OpenAI key; absence or refusal
  never silently substitutes another vendor. An explicit local Anthropic
  selection retains the documented Fable-to-Opus refusal fallback, with both
  attempts metered and the answering model stamped. Actions no longer read
  `EXTRACT_MODEL`; the repository policy is the setting. Panel seats never
  fall back — a refusing seat is a failed seat.
- Panel seats: one table, `scripts/lib/vendors.mjs` — model **and** pinned
  effort per seat (Opus 5 medium · GPT-5.6 Sol high · Gemini 3.8 Flash
  medium · Grok 4.5 high · GLM 5.3 Flash high via Venice). Changing a seat
  is a one-line edit there plus a DECISIONS entry; the /panel seat records
  start a new row for a new model. Gemini's intro price doubles 2027-01-01.
- Branch protection on `main`: the `arbiter` check is required (see the
  2026-08-25 "gate is live" decision); admin enforcement off, so the
  founder's override is the kill switch. Repo auto-merge enabled.
