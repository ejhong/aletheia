# The inbox

Drop anything here — from your phone (github.dev or the GitHub app) or by
pushing files. The maintenance pipeline picks items up on the weekly run, or
whenever you trigger the **Maintain** workflow by hand.

**How it is processed now (2026-09-09).** `node scripts/aletheia.ts inbox <case>`
takes everything dropped for a case — notes in your words, link lists,
documents — into one report-shaped file under `proposals/<runId>/`, with
every work the material names resolved to a locator through OpenAlex where
it can be, and the `draft` and `verify` verbs then treat it exactly as they
treat a research report: quotes only from retrieved text, a second reader
on every record, a disposition with a reason for everything raised, your
words preserved verbatim. The scheduler (`aletheia next`) picks an intake up
as a half-done chain.

**If you are the founder, just drop it.** A file committed to `inbox/<case>/`
from the founder's own GitHub account (identities in `config/founder.yaml`)
needs no sidecar and no statement: the commit is the founder's direction to
take it in, and AGENTS.md §3.15 (amendment of 2026-09-09) makes a recorded
direction the permission — the intake records the commit's author, date,
channel (git) and where it is held (the commit). The drop says nothing
about who wrote the document; the drafter reads the byline from the
document itself. A sidecar is still the place for `role: founding_narrative`
(to register an essay as a founding input), a `title:`, or `case:` when the
file is not in the case's folder. Anyone else's document enters only with a
statement of provenance: front matter, or a sidecar note of the same name for a PDF,
carrying `editor:` (your own work), `published:` (the URL where it is
public), or `from:` (who supplied it). A document that is not already
public also needs the permission in the supplier's words — `permission:`
(what may be done with it, in the gate's own words — "publish", "cite",
"quote", joined by plain connectives such as "publish and cite it"; any
other word, "only" or "prohibited" or "private" alike, is a word the gate
does not grant on, and the file stays here) and `granted:` (the
date of the grant, YYYY-MM-DD) — own work included:
the footing says whose it is, the permission says what may be done. The
intake records who granted it, on what date, by what channel (this
statement), and where it is held (`inbox/processed/<runId>/`). Without
them it stays here, with the reason in the run record (AGENTS.md §3.15:
nothing supplied in confidence is published).

**Two doors, one rule.** This folder is the capture bucket; a chat agent
session is the full-service processor. Anything dropped here gets the
mechanical treatment below on the next run. For material that needs
judgment — long PDFs, researcher correspondence, "was this already
considered?" — either wait for the weekly run and review its proposals,
or tell a chat agent to "process the inbox" and it will do the same job
immediately with live verification, filing what it used into
`inbox/processed/<runId>/` so the provenance trail is identical either
way. Items without a case assignment are never guessed at; they simply
wait here until one is added.

## What you can drop

**1. Commentary notes** (`.md` or `.txt`) — your opinions, in your words:

```markdown
---
case: geopolymer
editor: Eugene
---

Marcell's methods point is right — provenance matching genuinely can't
distinguish casting from local aggregate. The Barsoum rebuttals don't
touch that argument. I'd promote the methods claim.
```

Your text is preserved verbatim as the human editorial record; the AI only
*translates* it into proposed claim/evidence updates, and every proposal
carries your original words next to it. This is the "commentator-in-chief"
loop: you comment, the pipeline drafts, you approve the PR.

**Third-party feedback** (researcher correspondence, expert emails): add
`from:` naming the contributor — or describing them if they can't be named
(`from: "researcher contact (not for attribution)"`) — plus an optional
`provenance:` line for how it reached you. The contributor's words are then
recorded as theirs, submitted via you, never silently attributed to you:

```markdown
---
case: ccc
editor: Eugene
from: "researcher contact (not for attribution)"
provenance: "email correspondence, 2026-08-23"
---
```

**2. Link lists** (`.md` or `.txt` where most lines are URLs):

```
https://doi.org/10.1234/example-paper
https://example.org/dataset
```

Each link is fetched and verified reachable, and a source-record proposal
is drafted with an honest verification label.

**3. Documents** (`.txt`, `.md`, or `.pdf` full texts): routed through the
extraction pipeline (`docs/EXTRACTION_PIPELINE.md`) into proposed
proposed claims (anchored, unfeatured until an edition features them). PDFs
are read page by page by the pipeline itself (the same extractor the verb
chain uses; no external tool), with `[p. N]` markers so claims can cite the
page. A scanned PDF with no text layer is left in place with a note in the
run report. Link lists are fetched the same way: PDFs and HTML alike, with
an open-access copy found by DOI when a URL will not serve.

## Routing rules (plain version)

- Front matter `case: <case-dir>` targets a case (e.g. `geopolymer`).
  Alternatively drop the file inside `inbox/<case-dir>/`.
- No case given → the item is skipped with a note in the run report, never
  guessed.
- Front matter `type: commentary | links | document` overrides the
  auto-detection if it ever guesses wrong.

## What happens after

- Outputs land in `proposals/` (or PR branches) stamped with a `runId` —
  **never** directly in published content.
- Processed items move to `inbox/processed/<runId>/`, so this folder stays
  clean and every run is traceable (and revertable) by its runId.
- You get a PR with a plain-language digest — read it on your phone, tap
  merge (or request changes). See `docs/MAINTENANCE.md`.

## What does NOT belong here

Material for a case that does not exist yet. The inbox is the intake for
existing cases — its contents are committed to the public repository and
swept by the maintenance pipeline. New-case source material goes in
`casework/` (gitignored, local-only) and is worked on directly with an
agent; it enters the repository only when the case is scaffolded, record
by record, with provenance. Decided 2026-08-25 after a blanket `git add`
nearly published pre-case documents — caught by the arbiter's first live
vote.
