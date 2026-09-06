# The inbox

Drop anything here — from your phone (github.dev or the GitHub app) or by
pushing files. A push to `main` triggers inbox capture. The full **Maintain**
workflow runs weekly and on demand; its bounded reader works through captured
links and watch imports after their capture PR has merged.

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
loop: you comment, the pipeline drafts, and the normal independent publication
gate checks the proposed changes.

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

```markdown
---
case: deep-memory
type: links
---
This example link is a placeholder; replace it with a public source.
https://example.org/dataset
```

Include why the source matters or what earlier interpretation it might change.
Capture preserves that context and the original file without claiming the
source is verified. The shared reader then fetches public HTML/text sources,
drafts narrow observations, and obtains a separate source-reading check. Valid
Source/Claim/Evidence proposals enter the ordinary publication gate. Each pass
is limited to two sources across all cases; larger lists stay queued. The same
URL can be reconsidered with a changed argument or changed case inputs.

**3. Documents** (`.txt`, `.md`, or `.pdf` full texts): routed through the
extraction pipeline (`docs/EXTRACTION_PIPELINE.md`) into proposed
catalog-tier claims. PDFs are converted automatically when `pdftotext`
(poppler) is available — it is installed in the weekly workflow; install
locally with `brew install poppler`. A PDF that can't be converted is left
in place with a note in the run report.

## Routing rules (plain version)

- Front matter `case:` accepts a case directory or public slug (e.g.
  `geopolymer` or `megalithic-casting`). Alternatively drop the file inside
  `inbox/<case-dir-or-slug>/`.
- No case given → the item is skipped with a note in the run report, never
  guessed.
- Front matter `type: commentary | links | document` overrides the
  auto-detection if it ever guesses wrong.

## What happens after

- Outputs land in `proposals/` (or PR branches) stamped with a `runId` —
  **never** directly in published content.
- Processed items move to `inbox/processed/<runId>/`, so this folder stays
  clean and every run is traceable (and revertable) by its runId.
- PRs carry a plain-language digest and publish after their required checks.
  Disagreements park for revision and remain inspectable. See
  `docs/MAINTENANCE.md`.

## What does NOT belong here

Material for a case that does not exist yet. The inbox is the intake for
existing cases — its contents are committed to the public repository and
swept by the maintenance pipeline. New-case source material goes in
`casework/` (gitignored, local-only) and is worked on directly with an
agent; it enters the repository only when the case is scaffolded, record
by record, with provenance. Decided 2026-08-25 after a blanket `git add`
nearly published pre-case documents — caught by the arbiter's first live
vote.
