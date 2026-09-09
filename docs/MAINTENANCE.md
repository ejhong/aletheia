# Maintenance runbook

What runs, when, what it produces, and what to check when something looks
wrong. The *why* behind each mechanism lives in `docs/DECISIONS.md`; the
design of the whole system and its current status live in
`docs/AUTOMATION.md`. This file is deliberately only the how.

The site is operated by AI (AGENTS.md §3.15). The founder holds two powers:
the kill switch (revert any run by its `runId`, or freeze the repo) and the
constitution (`AGENTS.md`). Everything else below runs without a human.

> **Paused (2026-09-07).** Every AI workflow below is disabled by hand under
> the kill switch after the restore (PR #193); CI, PR risk check, and Deploy
> run. Workflows re-enable one at a time as the tests in `docs/AUTOMATION.md`
> need them. Until then a `needs-approval` PR has no arbiter and is merged by
> the founder.

## 1. The machine on one page

Every change reaches `main` through the same gate: **classifier → panel →
merge policy**. There are two lanes.

| Lane | What qualifies | What happens |
| --- | --- | --- |
| `auto:low-risk` | Reversible-by-runId material that touches no featured content: `proposals/**`, `inbox/**` moves, **new** append-only `assessments/*.yaml` overlays, new harvested `governance/arbiter/pr-*.yaml` verdicts, append-only claims, sources, and dispositions (a new claim cannot feature itself; a disposition row publishes nothing). | `PR risk check` re-derives the class from the diff, labels the PR, and arms auto-merge. Merges when CI is green. |
| `needs-approval` | Everything else: featured claims, article text, case records, research items, studies, code, workflows, docs. | The `arbiter` check convenes five vendor seats; **pass** = ≥4 `complies` and zero `violates`. A pass auto-merges. Anything else parks the PR, publicly, until revised or a seat is restored. |

Three workflows do the work, and two more build and deploy:

| Workflow | Trigger | Does | Output |
| --- | --- | --- | --- |
| **Chain** | Mondays 06:17 UTC; dispatch (`steps`, `even_if_paused`) | One sitting: harvests settled Arbiter verdicts, then `aletheia next --run --steps N` — an inbox with items first, then a half-done chain, an owed edition, a stale panel, the least recently reported case, a contested reconsideration. Refuses to run while `governance/operation.yaml` says paused unless the founder dispatches with `even_if_paused`. | One PR, `Chain: <date>`, carrying the runs, the records, and the spend rows. |
| **PR risk check** | Every PR | Classifies the diff; fails a mislabeled low-risk PR; arms the low-risk lane when it qualifies. | Label + auto-merge. |
| **Arbiter** | Every PR | Skips low-risk. Otherwise: five seats judge the diff — a content run by its own account — against `AGENTS.md` at the merge base, with every added DOI/arXiv/URL mechanically resolved first. A lone objection of the ordinary kind becomes a review-note issue; the change merges. | Sticky report comment; verdict as the check; review-note issues. |

Plus `CI` (typecheck, lint, test, build) and `Deploy` on every push to
`main`. The Maintain, Content response, Inbox response and Operator
workflows and the two on-demand tools (Extract claims, Generate case art)
were retired on 2026-09-09; the sitting does their work
(docs/AUTOMATION.md, "Subtraction record").

**Standing is derived, never stored.** The case page always shows the
latest draft assessment, stamped `ratified` / `contested` / `unratified`
from the blind check runs at build time. Nothing can raise standing except
fresh concurrence from separate vendors; any new draft or new evidence
demotes the case until re-checked. That is why new overlays may auto-merge.

## 1b. The verb chain (a weekly sitting since 2026-09-09)

One CLI, four verbs, one direction (docs/AUTOMATION.md, "The verbs"). Every
run writes `proposals/<runId>/run.yaml` with its cost; every paid call is
checked against `config/budget.yaml` first and recorded in
`governance/spend.yaml`. Dollars appear only for models with a reviewed
tariff in `config/tariffs.yaml`.

```bash
node scripts/aletheia.ts status                                   # standing, edition, counts, saturation, spend per case
node scripts/aletheia.ts report <case> --seat openai --dry-run    # write the packet and instructions, send nothing
node scripts/aletheia.ts report <case>                            # the research pass: the house model (Fable 5.1, fallback Opus 5) with web search and fetch
node scripts/aletheia.ts report <case> --seat openai              # …or the OpenAI seat (gpt-5.6-sol with web_search), for the comparison
node scripts/aletheia.ts draft <reportRunId>                      # report + fetched sources → proposals/<runId>/proposal.yaml
node scripts/aletheia.ts verify <proposalRunId> --dry-run         # mechanical checks + second reader; writes verification.md only
node scripts/aletheia.ts verify <proposalRunId>                   # …and appends accepted records, dispositions, history to the working tree
node scripts/aletheia.ts edition <case>                           # a new edition when the ledger moved or the panel contests the assessment unanswered (rests otherwise; --force)
node scripts/aletheia.ts check <case> [--seats a,b] [--dry-run]   # the blind panel through the metered transport; raw replies under proposals/<runId>/
node scripts/aletheia.ts next [--run] [--steps N]                 # what the ledger wants next; with --run, do it and continue the chain; --steps N choices in one sitting
node scripts/aletheia.ts inbox <case> [--dry-run]                 # the founder's door as a producer: dropped items → one report for draft/verify
```

**Review notes — the operator's queue.** When the panel passes a change
over one seat's objection (AGENTS.md §3.15, amendment of 2026-09-09: a
lone objection parks only for fabrication, confidence material, or a
constitution edit), the objection becomes an issue labeled `review-note`,
opened by the Arbiter workflow. Nothing closes it by itself. The answer is
a fix whose PR description says `Closes #N` — GitHub closes it on merge —
or, when the objection is declined, a reply saying why and a manual close.
`gh issue list --label review-note` is the queue (or
`gh issue list --search "Review note on"` — every title begins so); hand
it to the operator ("work the review notes").

**Running the chain in CI, supervised.** The workflow refuses to run while
`governance/operation.yaml` says paused unless the dispatch says
`even_if_paused`. To run one step by hand and watch it:

```sh
gh workflow run Chain -f steps=1 -f even_if_paused=true   # or Actions → Chain → Run workflow
gh run watch                                              # ten to twenty minutes for an edition
gh run view --log-failed                                  # if it fails, this is the reason
```

A completed run opens a PR named `Chain: <date>` (through MAINTENANCE_PAT,
so the Arbiter and CI run on it); its run directory and spend rows are in
the PR, and the Arbiter's report is on the PR. A passing verdict enables
auto-merge; a park waits for the founder. The loop has run itself since
2026-09-09 (weekly cron, `state: live`); to stop it, set `state: paused`
in `governance/operation.yaml` or comment the cron out — either is the
kill switch, and the pages say so.

**Two doors for a founder essay.** A document — a PDF, an HTML page, or a
text — dropped with `role: founding_narrative` (or `founding_research`) in
its sidecar or front matter is registered as a narrative input at intake — original and text extraction under
`research/<case>/`, a manifest entry — and taken in as a producer at the same
time. The two doors do different work: the founding input shapes the
telling (the edition drafter reads it for framing, voice, and which
alternatives to set side by side), the producer path puts its propositions
on the record as claims anchored to the essay, verified quote by quote and
split until atomic. Nothing reaches the article from an input that is not
independently in the ledger.

The loop, closed (docs/AUTOMATION.md, step 4b): `next` finishes a half-done
chain first, then a due edition, then reports the case least recently
reported (house seat; on a case whose passes land nothing the cadence
doubles, 7 → 90 days, and the seats alternate).
`.github/workflows/chain.yml` runs `next --run --steps N` and opens the PR
the Arbiter judges; its schedule is a commented cron line — uncommenting it
is the founder's act that lets the loop run itself — and it refuses to run
while `governance/operation.yaml` says the automation is paused, unless the
founder dispatches it by hand with `even_if_paused`, which the run log
records. **Turning the loop on, in order:** (1) re-enable the Arbiter
workflow, so the chain's PRs are judged; (2) dispatch `Chain` once by hand
with `even_if_paused` and watch it open a PR, be judged, and merge; (3)
uncomment the cron line and set `governance/operation.yaml` to `live`. That file is
what the pages display in the footer: live, or paused since when, by whom,
and why. A contested standing is a task: the edition packet carries every
seat's dissents, the drafter answers each (adopt, naming the deciding
record, or hold), the answering assessment is stamped as reconciling those
checks, and standing resets until a fresh blind check judges it.

Keys: `ANTHROPIC_API_KEY` for the default seat, the drafter, the verifier,
and the editor; `OPENAI_API_KEY` for the openai seat. Every model, and the
default seat, is chosen in `config/models.yaml`. The house model falls
back server-side to its configured fallback on a safety decline; the run
records the model that actually served. A run that would
pass a cap ends `failed` with the cap named; a model with no tariff is
refused unless `ALETHEIA_ALLOW_UNPRICED=1`. `verify` and `edition` change
the working tree and stop: review the diff, then open the PR the panel
judges. Unchanged inputs rest — `report` per seat, `edition` per ledger
hash — and say so in `run.yaml`.

What the first paid day (2026-09-08, Cast Not Carved) taught about running
it:

- **Runs are long.** A house-seat report or an edition takes ten to twenty
  minutes. Run them detached (`nohup … &`, or a terminal that will not be
  closed) and read `run.yaml` afterwards; a tool or shell timeout that kills
  the process leaves the vendor's work running and unrecorded.
- **Budgets crunch, then settle.** `config/budget.yaml` has standing caps
  (the steady state) and a dated `crunch` block whose higher caps hold until
  its `until` date, then fall away — the bootstrap sweep is the expensive
  part and it ends on the record; the founder moves the date. A single day
  can still be lifted with a dated `exemptions` entry (date, perDay, reason,
  by); the guard uses the exemption on that date, the crunch while it lasts,
  and the standing caps after, and its refusal names which.
  There is no environment override — a grant that is not in the file did not
  happen.
- **The guard is an estimate.** It cannot stop a single server turn once
  sent. A run whose ledger cost passed the per-run cap is kept, and its
  record and stderr say `OVER THE PER-RUN CEILING`; when that appears, the
  estimate in `src/pipeline/budget.ts` is wrong for that call shape and must
  be looked at before the next run.
- **Failures cost nothing or everything.** A 400 from the vendor (a schema
  it will not compile, an unknown model) bills nothing and the run says so.
  A connection that dies mid-reply may have billed the whole reply; the
  reader keeps every byte received, so a stream that reached its final
  event is complete whatever the socket did afterwards.
- **The second reader is a judge, not a function.** The same proposal
  verified twice admitted different subsets (2 evidence and 2 claims, then 1
  and 1); its reasons are recorded either way. Read `verification.md`
  before opening the PR.
- **`edition` repairs once.** A candidate that fails the loader's mechanical
  rules goes back to the drafter with the findings, once; the second answer
  is validated the same way. `errors.md` and `reply-repaired.json` in the
  run directory show what happened.
- **Retrieval reads PDFs and falls back to open access.** The drafter and
  verifier read PDFs page by page (`[p. N]` markers, so locators carry the
  page) and, when a URL will not serve — a login wall, a bot challenge
  served as a 200, a dead host — ask OpenAlex for an open-access copy by
  DOI and read that, recording `via` in the proposal input and in
  `verification.md`. Login-walled hosts without a DOI (academia.edu book
  chapters) still block, with the route.
- **Admission leaves marks on the source.** A retraction, withdrawal, or
  correction notice Crossref knows (Retraction Watch data) is written into
  the source's `reliabilityNotes`, stamped with the check date; the source
  still enters — the notice is a fact about it. Every admitted URL gets a
  Wayback snapshot on `archivedUrl` (best effort; a slow archive is a note).
- **The second reader's dissent on direction is recorded, not fatal.** A
  record whose quotes, locator, statement, independence, and bearing hold
  enters even when the reader disputes `supports` versus `qualifies`; the
  dissent is written into its `limitations` with the reader's model and
  date. Everything else the reader rejects stays rejected.

## 2. Feeding it

Drop files into `inbox/` from any device (the GitHub app or
[github.dev](https://github.dev/ejhong/aletheia) work from a phone). The
next sitting takes it in — an inbox with items is the scheduler's first
choice — or dispatch the Chain from the Actions tab. **A file the founder
commits from the GitHub app or website needs nothing else**: it falls
under the founder's standing direction in `config/founder.yaml`, which
§3.15's amendment of 2026-09-09 makes the permission; the intake requires
GitHub to attribute the commit to the founder's login and report it
signature-verified (app and web commits are; unsigned laptop commits are
not — sign them, or add a statement). Only someone else's document needs a
statement of provenance (`editor:` / `published:` / `from:` with
`permission:` and `granted:`). Full conventions in `inbox/README.md`; the
three kinds:

- **commentary note** — your view in your words, `case:` front matter.
  Becomes proposed editorial actions with your verbatim text preserved as
  the authoritative record.
- **link list** — URLs to turn into source records. Fetched and verified;
  labeled `ai_verified` only when actually fetched, `unverified` otherwise.
  The sitting then drafts and verifies what it fetched.
- **document** — a text file to mine for catalog claims.

Everything you drop is *contributor* material: quoted, attributed, and
arbitrated like anyone else's. Feeding is optional; the loops run without
input.

**Literature search** is the `report` verb's job, on each case's cadence
(docs/AUTOMATION.md); the watch queries of the earlier design
(`watch.yaml`) were retired with the script that read them.

## 3. Reading it

- **The Chain's PRs** are the record of each sitting: what ran, what it
  cost, what it proposed and what it refused and why; the Arbiter's report
  is on each.
- **`/operations`** on the site: the state and the schedule, what the ledger
  wants next, spend against the caps, recent sittings, the review notes,
  standings per case, every split claim with each seat's reasoning, the
  seats' records, the Arbiter's verdicts with their cost, the operations log.
- **Review-note issues** (`gh issue list --label review-note`): the
  objections a lone seat raised, each answered on the record.
- **PR bodies** are plain-language digests of what that run did.

## 4. When something looks wrong

| Symptom | First thing to check |
| --- | --- |
| Every `needs-approval` PR is parked, report says seats "cast no usable vote" | **Vendor billing.** Quorum is 4 of 5 `complies`; two dead seats park everything, by design. OpenAI: credits. xAI: the *monthly spending limit* on the team, not just credits. Restore the seat, re-run `Arbiter` on the PR. |
| A PR is parked with a named objection | Two seats objected, or one for fabrication, confidence material, or a constitution edit. Read the reasoning in the sticky comment; revise, or the founder decides. A lone objection of the ordinary kind does not park: it is a review-note issue. |
| A PR parked "on the rate limit" | `CONTENT_MERGES_PER_WEEK` (10, `src/lib/arbiter-core.mjs`) counts autonomous canon merges in the trailing week. Founder-directed work is excluded only if its **commit message** (not the PR body — squash messages are built from title + branch commits) carries `Supervised-by: <who>`. The park clears as the week rolls. |
| A low-risk PR sits open and green | It should have been armed by `PR risk check` on open/push/ready. If not: is it a draft, a fork, or labeled `needs-approval`? Otherwise rebase on `main` to re-trigger. |
| A case shows `unratified — awaiting a fresh blind check` | Expected after any canon change or reconsideration. The next sitting's check re-panels it. |
| A case shows `contested` | Working as designed. The next sitting on that case writes the reconsideration edition and then a fresh check; a case still contested afterwards is a standoff and stays displayed until its ledger moves. |
| Malformed panel replies | Recorded as `unsure` with the defect named; a failed seat is named in the report. Restore the seat (billing, key), then re-run the Arbiter on the PR. |
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
node scripts/aletheia.ts next                               # what the ledger wants next, and why
node scripts/aletheia.ts next --run --steps 3               # one sitting, by hand
node scripts/aletheia.ts inbox <case> [--dry-run]           # take in what the founder dropped
node scripts/aletheia.ts check <slug> [--seats a,b]         # blind panel, every roster seat with a key; metered
node scripts/harvest-governance.mjs --dry-run               # what the sitting would copy from settled PRs
npm run check:links                                         # dead links on the built site
```

## 7. Setup (once)

- Secrets: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`,
  `XAI_API_KEY`, `VENICE_API_KEY` (the five panel seats — a missing key is
  a dead seat), `MAINTENANCE_PAT` (fine-grained, contents + pull-requests
  write; PRs opened with the default token do not trigger CI).
- Models: **one file, `config/models.yaml`**, names every model the site
  calls — the house model and its fallback (drafter, editor, the browsing
  research seat), the verifier's second
  reader, the research seats and which is the default, the five panel
  seats (model **and** pinned effort), and the legacy OpenAI chat model.
  Nothing under `src/` or `scripts/` names a model id; changing one is an
  edit there plus a DECISIONS entry, and a tariff row in
  `config/tariffs.yaml` (a test fails without one). The house model falls
  back server-side on a safety decline and every run and spend row stamps
  the model that actually answered. Panel seats never fall back — a
  refusing seat is a failed seat; the /panel seat records start a new row
  for a new model. Gemini's intro price doubles 2027-01-01. The former
  `EXTRACT_MODEL` Actions variable is retired and ignored.
- Branch protection on `main`: the `arbiter` check is required (see the
  2026-08-25 "gate is live" decision); admin enforcement off, so the
  founder's override is the kill switch. Repo auto-merge enabled.
