# The inbox

Drop anything here — from your phone (github.dev or the GitHub app) or by
pushing files. The maintenance pipeline picks items up on the weekly run, or
whenever you trigger the **Maintain** workflow by hand.

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

**2. Link lists** (`.md` or `.txt` where most lines are URLs):

```
https://doi.org/10.1234/example-paper
https://example.org/dataset
```

Each link is fetched and verified reachable, and a source-record proposal
is drafted with an honest verification label.

**3. Documents** (`.txt` or `.md` full texts): routed through the extraction
pipeline (`docs/EXTRACTION_PIPELINE.md`) into proposed catalog-tier claims.
PDFs are noticed but not parsed — convert to text first (the run report
will remind you).

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
