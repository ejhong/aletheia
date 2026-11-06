---
runId: 2026-11-06-session-site-151011
title: "Before Sputnik: three quotations re-copied exactly from the texts the quote check reads, answering the hold on #475"
cases: [transients]
---

# Answer to the review of #475

This session answers round 1 of the review of #475 (commit 718fd2e92d), which
the quote check held before any reviewer read it. Nothing else was changed.

## Answer to the review

All three failures had the same cause: the sources' DOIs now serve the
publishers' HTML, where a citation or a symbol renders differently from the
PDF copy the 2026-11-01 session quoted. In each case I read the passage again
with `node scripts/site.ts read <url> --fresh --find "…"` and re-cut the quoted
spans so that each stops short of the citation or symbol and matches the text
the check reads word for word. The words outside the quotation marks are
unchanged in meaning; no claim, direction, strength, inference or judgment
moved.

- **TRN-E233 (SRC-TOKOVININ-2002): fixed** in `content/cases/transients/evidence.yaml`.
  The served text gives the drag as a formula, "the relative drag V τ/ D of a
  wave front moving with speed V during exposure time τ for aperture
  diameter D", which the earlier quote had elided. The record now quotes
  "Reduction of image motion variance depends on the relative drag" and,
  separately, "a wave front moving with speed V during exposure time τ for
  aperture diameter D", leaving the formula outside the quotes.
- **TRN-E234 (SRC-WATTERS-2026): fixed** in the same file. The served text
  renders the citation as "( Reference Hambly and Blair 2024 )". The quote
  now ends at "…remain unanswered after Hambly & Blair", with the year given
  outside the quotation marks. The two quoted questions ("whether optical
  flashes exhibit smaller FWHM on POSS1-E plates", "whether some categories
  of plate artefacts exhibit a smaller FWHM when compared to stars, on
  average") were already exact.
- **TRN-E240 (SRC-WATTERS-2026): fixed** in the same file. The served text
  puts a citation after "Villarroel et al." and renders the arcsecond sign as
  a separate symbol. The record now quotes "We have confirmed that 8 of 24
  SPFs in Table 3 of Villarroel et al.", "are located within 5" and "of a
  NeoWISE catalogue object position" (§4.5 of the HTML), with "(2025a)" and
  "arcseconds" outside the quotes.

The locators were left as they are. Each one names the section as well as the
PDF page the 2026-11-01 session read, and the HTML copy has no page numbers to
put in their place.

## Checks

- `node scripts/site.ts check-quotes --fresh --base ed56707` (the point where
  this branch left main): 16 records, 38 passages, **0 failures**.
- `node scripts/site.ts check-quotes --fresh` with its default base
  (`origin/main`, which has moved on since this branch was cut) also reports
  no transients failure. It does report eight `ydih` records (YDIH-E004, -E007,
  -E009, -E019, -E020, -E022, -E024, -E029) as carrying no quoted passage.
  This branch does not touch `ydih`. Those records differ only because main
  has since rewritten them, and on main they quote their sources. Main's #478
  ("The quote check compares a change from where it branched") fixes exactly
  this comparison, so the review's machine should not see them.
- `npm test`: 32 files, 283 tests passed. `node scripts/site.ts status` loads
  every case.

## For the next session

The transients case shows "unratified": the panel has not yet judged the
ledger as it stands. This session wrote no new assessment, so it names no
panel. The re-cut quotations do not change what the evidence says. The review
notes from the earlier rounds on the case still stand as the next work.
