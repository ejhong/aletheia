# Chat-seeded case briefs — the workflow

The founder seeds new cases cheaply in interactive AI chats (deep,
iterative discovery runs "until saturation"), then hands the agent one or
more share links. This document is the complete procedure for turning
those links into a case. It exists so that ANY agent — not just the one
who ran it last — can execute it identically. First run: the
pre-Columbian Amazon and Pizzagate cases, 2026-08-28.

## Standing rules

1. **A chat thread is a discovery brief — never a citable source.** Same
   status as deep-research searcher briefs: it points at primary
   material and is superseded by it. No case record may cite the chat.
2. **Verify before use, cell by cell.** Every load-bearing assertion in
   the brief must be natively re-verified against the primary source
   before it enters `content/`. Expect the verification pass to CORRECT
   the brief — on the first run it fixed dates, dollar amounts, quote
   attributions, and dropped unverifiable elements. Record corrections;
   never import on trust.
3. **Titles, URLs, and identifiers come from the fetched page, never
   from memory or description.** The arbiter panel mechanically resolves
   every DOI/URL and compares titles; a plausible-sounding invented
   title is a §3.8 violation that will park the PR (this happened; see
   aletheia PR #113).

## Procedure

### 1. Capture (do this IMMEDIATELY — chat artifacts are ephemeral)

- Fetch each share page's **raw HTML** (`curl` with a browser UA), not
  just the readable text: the readable rendering drops citation URLs,
  but the raw HTML embeds every URL the chat encountered. Extract and
  deduplicate them (unescape `\"` and `\u002F` first).
- Save: raw HTML, full readable text, and the URL index. Chat-generated
  files (ZIPs, JSON exports) die with the chat runtime — tell the
  founder to download them immediately if they still resolve; treat
  them as optional inputs, not requirements.

### 2. Consolidate

Write one `CONSOLIDATED-BRIEF.md` per case, deduplicated across threads:
provenance header (share URLs, dates, never-citable warning), the
thread's final synthesis, claim families with statuses, every hard
identifier recovered (DOIs, docket numbers, filing images, archive
capture codes, email IDs), a reopen queue of missing primary objects
(these import as research items), the thread's own defects, and — for
living-persons material — the applicable constraints, prominently.

### 3. Verify

Maintain a `VERIFICATION.md` ledger: one row per load-bearing cell,
status VERIFIED / PARTIAL / FAILED / BLOCKED-with-route, date, and a
**verbatim quote from the fetched source** for every VERIFIED row.
Parallelize with verification subagents under an explicit output
contract (verbatim quotes required; failures reported plainly; never
fill gaps). Bot-walled publishers: use Wayback, institutional-repository
PDFs, or OCR copies — and document the workaround in the source record's
`verificationNote`. What stays BLOCKED stays OUT of the case.

### 4. Construct

Build the case from the verification ledger only. Use the genealogy
block where the analysis is genealogical (first appearance, origin,
documenting source). Honest labels: `ai_verified` for natively checked
sources, `unverified` (with a nothing-leans-on-this note) for documents
not fetched. Include the initial house assessment run (`role: draft`,
`humanReviewed: false`) — the governance tests require a displayable
standing. Cover art per the house style docs; plates only from real
imagery with license and provenance. Then: full local validation
(tests, typecheck, lint, build, link audit) before the PR.

### 4b. Coverage: every brief item gets a disposition (founder policy, 2026-08-28)

The default is IN, not out. A verified item enters the case even when its
diagnosticity is zero — "this famous exhibit is authentic and proves
nothing" is exactly the information a reader needs — with the
weightlessness stated, never silently dropped on editorial instinct.
Every case PR ships a **coverage table** mapping every claim family in
the brief to one of four dispositions:

- **verified → in** (featured or catalog tier);
- **verified but editorially excluded → listed with the reason, for the
  founder's call** (this disposition should be rare);
- **blocked → research item carrying the recovery route**;
- **failed verification → documented correction**, as prominent as the
  confirmations.

Tiering keeps the UI manageable: featured tier (~20–25 claims) carries
the full editorial workup and leads the case page; the remainder rides
catalog tier in the collapsible explorer, promotable by a one-field
edit. **Living-persons tier rule (downstream deployment):**
verified-artifact and document claims may ride catalog; any claim whose
statement names a living person gets featured treatment, so it always
carries the objection/context fields that protect people — catalog's
"unreviewed backlog" label must never sit on a statement about a person.

### 5. Repo routing

- Science/history cases → this repo. Contested public events and
  anything naming living private individuals → the downstream
  deployment, under its living-persons rules (grade records, never
  conduct; presumption of innocence displayed; assertions attributed to
  their asserters).
- Conflicts of interest (e.g., founder funding of cited research) are
  disclosed on the source record AND in the article, and the affected
  claims are carried at their most assumption-exposed reading.

## Where the working files live

Brief, ledger, raw captures, and URL indexes live in the constructing
agent's persistent store (`briefs/<case-slug>/`), with the founder
holding downloaded copies. They are inputs, not repository content —
they contain living-persons material and unverified text that must not
be published. If a shared private briefs repository is created later,
they move there.
