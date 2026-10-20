# Runbook

What to do, and where to look, when something needs a hand. How the system
works is `docs/DESIGN.md`; why it is the way it is, `docs/DECISIONS.md`.

## The founder's levers

- **Stop everything.** Set `state: paused` in `governance/operation.yaml`
  (with `since`, `by`, `reason`) and commit it to `main`. No session starts
  and no panel sits while it says paused; the site's footer says so. Set it
  back to `live` to resume. Disabling the `Operator` workflow in GitHub's
  Actions tab does the same for sessions alone.
- **Amend the constitution.** Edit `AGENTS.md` and commit it yourself; the
  review holds any change to it, so push it to `main` directly or merge its
  pull request by hand. The operator never edits it.
- **Start a session now.** Actions → Operator → Run workflow. Optional
  inputs: a case to work on, and a focus in a sentence ("answer #470",
  "open the question of …"). The dispatcher is recorded.
- **Raise or lower the money.** `config/budget.yaml`: `perSession`, `perDay`,
  `perMonth`, or a dated `exemptions` entry with your reason. A cap is never
  an environment variable.
- **Drop material in.** Commit a file to `inbox/<case>/` from the GitHub
  website or app; your standing direction in `config/founder.yaml` is the
  permission, and the next session takes it in first (`inbox/README.md`).

## Secrets the workflows need

| Secret | Used by | Note |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | the operator; the panel's Anthropic seat | A key from a workspace with its own monthly spend limit in the Anthropic console is the strongest guard on the operator's spend (below). |
| `OPENAI_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY`, `VENICE_API_KEY` | the review; the panel | The review never sees the Anthropic key. |
| `MAINTENANCE_PAT` | opening the operator's pull requests; arming auto-merge | A fine-grained token with contents and pull-requests write on this repository. It expires: a session whose token fails stops before spending, and says so in an issue. |

### The operator's key

A session can run code it writes, so its key is the one secret a session
could take, and the caps in `config/budget.yaml` bind the workflow, not a
stolen key. A spend limit at Anthropic binds the key itself:

1. In the Claude Console, open Workspaces
   (`platform.claude.com/settings/workspaces`) and click **Create
   workspace**. The Default Workspace cannot take a spend limit.
2. Select the new workspace and, in its panel, **Spend limits**: a monthly
   limit near the sites' caps together ($100), with an alert below it.
3. Create an API key in that workspace; a key runs in the workspace it was
   created in.
4. In each repository that runs an operator (this one and Erebus):
   Settings → Secrets and variables → Actions → `ANTHROPIC_API_KEY` →
   update it to the new key.
5. Once a session has run on the new key, revoke the old one in the
   Console, if nothing else uses it.

(`platform.claude.com/docs/en/manage-claude/workspaces`.)

## When something looks wrong

- **A session failed.** The workflow opens (or comments on) one issue
  titled "The operator's session failed". The run log is in the Actions tab;
  the session's own log, when it got that far, is in `runs/<runId>/log.md`
  on its branch, and what it did — the tools that failed, the commands its
  permissions refused — in `runs/<runId>/trace.yaml` beside it.
- **A change sits unmerged.** Read its review comment. *Held for the
  founder's hand*: it changes one of your files (the constitution, the kill
  switch, `config/`, the prompts and the charter, the workflows, the review
  and quote-check code); read it and merge it yourself if you want it
  (`gh pr merge <n> --admin --squash`). *Held*: a reviewer
  flagged a harm; the next session answers it. *Revise*: not judged better;
  the next session revises or withdraws it. *Undecided*: fewer than three
  reviewers answered (a vendor was down); push nothing, re-run the Review
  workflow on the pull request. A change answered twice without publishing
  is withdrawn by the next session, its attempt on record.
- **CI fails on the quote check.** The failure names the record, the source
  and the passage. A quoted span not in the source is a real error; a source
  that could not be read in CI (a site that blocks the runner) means the
  record enters as `provisional`, with the route to its text, or the source
  is replaced by a readable copy of the same document.
- **The money ran out.** Sessions stop until the day or the month turns. The
  month's money is also spread over its days: after a session, the next
  scheduled one waits until the month is back on its pace (Run workflow by
  hand runs ahead of it, within the caps). `node scripts/site.ts budget
  --line` says what is left and when the next session can start.

## Commands

```bash
node scripts/site.ts status           # every case, the reviewers' notes, the money left
node scripts/site.ts read <url|doi>   # a source's text, as the quote check reads it
node scripts/site.ts check-quotes     # the quote check against origin/main
node scripts/site.ts ids <case>       # the next free record ids
node scripts/site.ts stamp <case>     # bind a new edition to the ledger
node scripts/site.ts panel <case>     # the blind panel on a case (paid)
npm test && npm run build             # the rest of CI
```
