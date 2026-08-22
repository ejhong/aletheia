# Content Policy

Supersedes the starter kit's `DEMO_CONTENT.md` (placeholder-only rules, deleted 2026-08-22). Aletheia publishes **real content with honest provenance labels**, not invented demo material.

## Real citations only

- Every Source must be a real document. Fabricating a citation, quotation, DOI, page number, or locator is the one unforgivable failure.
- Verification status is always displayed: `verified` (document held in the project library), `ai_verified` (AI-checked citation, no human re-check), `unverified` (cited second-hand or from memory; locator unconfirmed).
- If any part of a citation is uncertain (e.g. a DOI remembered rather than checked), omit it and mark the source `unverified` with a note, rather than guessing.

## AI provenance is disclosed at the record level

- Claims extracted by AI agents without human hand-checking are `ai_extracted` and rendered with that badge. They are honest work products, not established findings.
- AI assessments live in append-only overlay files stamped with `runId`, model, date, and prompt version. The UI labels them as AI-generated drafts until a named human reviews them.
- AI-performed citation verification is labeled `ai_verified`, never `verified`.

## Rejected claims are tombstones

A claim rejected during review keeps its record with `reviewState: rejected` and a `rejectionReason`. This prevents future extraction runs from re-proposing it and preserves the reasoning. Rejected claims do not render in normal reader views.

## Source statement vs. editor inference

Evidence records keep what the source states (`sourceStatement`) strictly separate from what we infer from it (`editorInference`). Where a proponent author's characterization of a source differs from the source itself, the evidence record says so (see the Marčiš, Sayre & Smith, and Nash corrections inherited from the geo project).

## Confidentiality constraints (inherited from the geo project)

- Nothing from geo's `arc/` directory or `notes.txt` may surface in this site.
- Topics derived from Trevor Hawke's confidential pre-publication Cusco work (geo T-089–T-093) must be framed neutrally — "test whether method X can discriminate cast from natural stone" — never as validating specific findings, and never citing the confidential paper.
- The source books (Fóti, Davidovits) are copyrighted; quote briefly with attribution, never reproduce at length.

## Fairness rules

- Supporting and undermining evidence get the same structure and visual seriousness.
- The best conventional explanation is steelmanned, not strawmanned.
- Corrections that weaken the featured hypothesis are recorded as prominently as evidence that supports it.
