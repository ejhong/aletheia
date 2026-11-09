---
runId: 2026-11-09-session-site-173908
title: "Before Sputnik: the alignment paper's quotations now pass the quote check through an archived copy, and one overstated sentence on defects corrected"
cases: [transients]
---

This session answers the review of #480, the change that gave the three claims the panel split on in "Before Sputnik" (the Palomar transients) their own evidence records. Round 1 judged the change better on all four reviews. One reviewer held it for a harm: the quote check was failing on the five passages quoted from the alignment paper (Villarroel et al. 2025, PASP). I made no other changes to the case.

## Answer to the review

### The harm (weakens_checks, GLM 5.3 Flash): the PASP quotations fail the fresh quote check

**Fixed, in the records and in the reading tool. `check-quotes --fresh` now passes, with no failures.**

What happened. At the start of this session a fresh check passed all 28 passages. A few minutes later it failed all twelve PASP passages again. IOPscience served the reading tool a 389-character page, "Radware Bot Manager Captcha … please can you confirm you are a human", with HTTP 200. The reading tool did not recognise that page as a challenge, so the check took it as the article's text and failed every passage against it. Any machine IOPscience rate-limits will meet the same page, including the review's. The records had to stop depending on the live page.

What I changed:

1. **The source points at the text that was quoted, and names a capture of that address** (`content/cases/transients/sources.yaml`, SRC-VILLARROEL-2025-PASP).
   - `url` is now the IOPscience article page the DOI resolves to (`https://iopscience.iop.org/article/10.1088/1538-3873/ae0afe`). The DOI stays in `identifier`.
   - `archivedUrl` is a Wayback capture of that same page, taken 2026-05-19: `https://web.archive.org/web/20260519084437/https://iopscience.iop.org/article/10.1088/1538-3873/ae0afe`.
   - I read the capture with `site.ts read --fresh` (90,054 characters, the full article). Every quoted span of TRN-E227, E228, E231, E233 and the TRN-C104 anchor is in it.
   - The verification note says what changed and why. It also now lists TRN-E233 and the TRN-C104 anchor among the records that quote the paper; the earlier note omitted them.
2. **The reading tool recognises this bot page** (`src/engine/fetch.ts`, `looksLikeWall`). The function exists so that "no quote is ever checked against a challenge page". It now matches IOPscience's Radware page, which makes that read fail instead of counting as the article. This tightens the check; it does not loosen it. A test is added.
3. **A Wayback capture is read as itself** (`src/engine/fetch.ts`, `retrieve`). Until now, when a capture failed to load, `retrieve` took the DOI out of the captured address and read the publisher's copy instead. Here that copy was the same bot page, and the check reported it as "its archived copy". The quote check's own comment already says "an open copy found by DOI is not the capture". The reading tool now does what that comment says: a failed capture is reported as failed, with its HTTP status. That status also lets the check's existing retry for busy servers apply. A test is added.

What the check now does with this source. It reads the article page. If IOPscience answers with the bot page, the read is now a failure, and the open-copy route runs. On this machine it found only an earlier version, a CSIC repository preprint that lacks the passages. Each passage is then looked for in the capture of the record's own address, found there, and reported as a warning ("found only in the archived copy"), not passed silently. On the final fresh run: 12 records, 28 passages, 0 failures, 12 such warnings. When IOPscience serves the article, the live page passes without warnings, as it did at the start of this session.

Why the records are not entered as provisional. Provisional is the route for a source "whose text could not be read". This text was read in full and is now readable, at a stable archived address of the same page, by the same check the review runs. The reviewer was right that the change should not merge on a failing check. It no longer would.

The files changed under `src/engine/` are not among those reserved to the founder (`review.ts`, `quotecheck.ts`, `quotes.ts` and `operator.ts` are untouched). Both edits make the reading stricter about what counts as a source's text; neither relaxes a match. Tests: `npm test` passes, 298 of 298 (297 before, plus the new Wayback test; the Radware case was added to an existing test).

### Notes from GPT-5.6 Sol

- *Obtain a stable, directly fetchable or archived copy of the PASP paper before publication.* **Taken**: see the harm above.
- *Replace "Such marks are plainly common", which runs together common look-alike detections and demonstrated flaws.* **Taken in the article.** A new edition (edition-2026-11-09-174326) re-adopts the current assessment unchanged and changes this one sentence. It now reads: "One-time star-like dots are plainly common on these plates, but nobody has yet counted how many of them are flaws." The overlap count (TRN-E230) counts detections. The Hamburg report (TRN-E234) shows that convincing artefacts occur but gives no rate. The sentence now claims no more than that. A word-diff against the previous edition shows no other change to the article.
  - **The same wording in the assessment is not changed in this pass.** The draft assessment (2026-11-08-operator-143723) says star-like flaws are "shown common enough to matter" and "common, but their rate is uncounted". An assessment is append-only, and restating one sends the case back to the blind panel. That would cost a full panel round for wording that changes no grade, and the panel judged this assessment on the 8th. I queue the correction for the next assessment of this case, together with the other assessment-level notes below, so that one panel round covers all of them.
- *Split TRN-C102: separate the image-wander argument from the prediction for sub-second flashes on period emulsion, and describe TRN-E235 as consistent with the mechanism, not direct support.* **Partly already so; the split is not made in this pass.**
  - The record and the article already use the narrower words: the assessment calls TRN-E235 "the one observation in the record that fits the claim", and the article says it "fits the flash argument". Both keep Busko's reciprocity-failure caveat and his note that some artefacts are sharper than stars.
  - Splitting the claim changes the ledger's structure and the featured set, and would need a new assessment and panel. It is listed for the next pass.

### Notes from Gemini 3.8 Flash

- *Address the IOPscience captcha in the fetch engine, so automated quote verification passes on fresh runs.* **Taken**: engine changes 2 and 3 above.
- *Keep the distinction between the atmospheric-wander mechanism and the uncalibrated photographic response of period emulsions (reciprocity failure) prominent in TRN-C102.* **Already so.** The assessment's reasoning, TRN-E235's limitations and the article's case-for-light paragraph each say that no one has exposed period emulsion to controlled flashes, and give the reciprocity caveat. The split proposed above would make the distinction structural.
- *Split TRN-E018 (Doherty 2026b) in a later session.* **Queued**: next session, item 2.

### Notes from Grok 4.5

- *Mark the PASP records provisional, or restore a fetch path to a real full-text copy.* **Taken, the second way**: see the harm above.
- *Keep the "reported" grade separate from search-wide significance in the article and in the TRN-C104 assessment text.*
  - **The article already does this.** It says the best line is "very unlikely by chance within its own picture", and that the authors "cannot estimate the odds across their whole search, which is where a chance line would hide".
  - The assessment's TRN-C104 reasoning names TRN-E228 and the per-image nature of the 3.9σ. Stating it before the grade, as asked, is wording for the next assessment and is queued with the rest.
- *Read Doherty 2026b and split TRN-E018; retrieve Greiner, Wenzel & Degel 1990.* **Queued.** Greiner 1990 stays blocked in `dispositions.yaml`: the ADS scan has no text layer. The next route is an OCR of the ADS page images, or a library copy.

### Notes from GLM 5.3 Flash

- *Apply one of the two remedies before merge.* **Done**: the archived copy, with the engine fix that lets it be read.
- *Restore the synthesis sentence on the modelling preprint's concession about the plate background, trimming elsewhere if needed.* **Not in this pass, for the same reason as the wording above**: the synthesis belongs to the assessment, which is append-only.
  - The concession is not gone from what a reader meets. The article's shadow paragraph still says the modelling preprint "concedes part of the point, cutting its sky region to avoid empty stripes and edge effects that 'may influence the results.'" The shadow claim's reasoning in the assessment carries it too.
  - It is first on the list for the next assessment's synthesis.
- *Verify SRC-BUSKO-2026B's publication status against the journal; split TRN-E018.* **Queued**: next session, items 2 and 3.

## Checks

- `node scripts/site.ts check-quotes --fresh`: 12 records, 28 passages, 0 failures. There are 12 warnings, one for each PASP passage found only in the archived capture, because IOPscience was serving this machine its bot page at the time.
- `npm test`: 298 passed.
- `npm run build`: passed. `tsc --noEmit`: clean.
- `site.ts stamp transients`: stamped edition-2026-11-09-174326, which re-adopts assessment 2026-11-08-operator-143723. The loader accepted it, and the history entry was appended.

No new assessment was written, so no case is named for the panel.

## For the founder

- If IOPscience's bot manager keeps answering runners, other IOP sources in the ledger will meet it too. A source that quotes an IOP article is now safest with its `url` at the article page and an `archivedUrl` capture of that page, as SRC-VILLARROEL-2025-PASP now has.
- Nothing in this session touches a founder's file.

## What the next session on this case should do

1. **Write one new assessment that carries the wording notes**, then convene the panel:
   - the defect-rate wording ("look-alike detections are common; the share that are flaws is unmeasured");
   - the synthesis sentence on the modelling preprint's plate-background concession, restored;
   - the TRN-C104 reasoning stating up front that the 3.9σ is per image, for a group chosen from the whole search;
   - and, if it is made, the split of TRN-C102 into the image-wander mechanism and the period-emulsion prediction.
2. Read Doherty 2026b in full and split TRN-E018, so that its alignment finding carries TRN-C104 in the right direction.
3. Check SRC-BUSKO-2026B's publication status against Scientific Reports itself, and read Busko's Paper I at its current version for a candidate rate against matched controls.
4. Try an OCR route to Greiner, Wenzel & Degel 1990.
