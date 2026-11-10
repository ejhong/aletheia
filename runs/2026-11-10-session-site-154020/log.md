---
runId: 2026-11-10-session-site-154020
title: "Before Sputnik: the flaw-rate, flash-sharpness and alignment claims read from their sources — a measured rate of star-like plate flaws, and an older rival expectation for flash images"
cases: [transients]
panel: [transients]
---

## What I did and why

No change of mine was held and the inbox was empty. The kickoff named no focus, so I chose by the charter. Before Sputnik is the live, contested case (its standing was contested, 5 of 5). I first looked for anything new since its 30 September edition. arXiv queries (Palomar/POSS transients, Villarroel as author, plate transients) and a Crossref query from July 2026 turned up nothing after the two September preprints the case already holds. The case was therefore not behind the literature, and I turned to where it was weakest: the three claims the panel split on. The last draft had graded all three unresolved for lack of any linked evidence record, while most seats graded them supported:

- TRN-C101: flaws make star-like marks often enough to contaminate flash searches.
- TRN-C102: a sub-second flash should look sharper than a star.
- TRN-C104: alignments are reported. Its source paper had never been read; the claim was characterized from its title.

## What I found

- **A measured rate of star-like flaws.** The critics (Watters et al. §2) and the proponents (who cite Greiner et al. on star-like defects) both point to the gamma-ray-burst era of archival plate searches. I traced it to Gorosabel & Castro-Tirado 1998 (A&A 337: 691; read in full from arXiv). Their Table 2 gives star-like plate-fault rates on six Harvard plate series, from 5.0 × 10⁻⁵ to 1.2 × 10⁻³ per mm². In one blink test the unexplained spots matched what the rate predicted, and 118 of 125 suspects were dismissed with a lens (TRN-E227). The Watters paper's history of that era adds that inspection rejected nearly all flaws but left an unclassifiable residue (TRN-E230). The Greiner et al. papers themselves were looked for and not found in readable form.
- **A rival expectation for flash images.** The same 1998 paper records that the earlier literature expected flash images to be *shallower* than stars (reciprocity failure; Schaefer 1981) as well as steeper (no guiding or turbulence smear) (TRN-E231). Neither proponent text I read mentions the first effect. The critics list both flash sharpness and flaw sharpness as unanswered (TRN-E232).
- **The alignments paper, read in full** (Villarroel et al. 2025, PASP 137: 104504). The search ran on the full 298,165-row catalog. Table 1 holds 83 groups of three or more points, 20 of four or more and 2 of five or more; five groups made the shortlist, three of them four- or five-point. The authors say some members may not be point sources and that they cannot correct their per-image odds for the size of the search (TRN-E234, TRN-E235). The critics' check finds 8 of the 24 shortlisted members within 2″ of objects the catalog's builders had set aside (TRN-E236). The paper also describes its shadow sample as 106,339 transients in §8 but divides by 107,875 in the same section; this is now noted on the source record.
- **Tokovinin 2002**, cited by the proponents beside the flash-sharpness argument, was read. It treats long-exposure seeing and does not model a brief flash. It is set aside in `dispositions.yaml`.

## What changed

- **Ledger:** one new source (SRC-GOROSABEL-1998); ten evidence records (TRN-E227–E236); two research items. TRN-R204 is a star-like flaw count on POSS-I glass, done the way the gamma-ray-burst searchers did it. TRN-R205 re-runs the alignment search against nulls built from each plate's real structure, with the full trials factor. Two disposition rows. TRN-C104's anchor no longer says the paper is unread. The PASP source note is corrected.
- **Judgment** (assessment 2026-11-10-operator-160408):
  - TRN-C101: unresolved → provisionally supported.
  - TRN-C104: unresolved → provisionally supported (as a report claim, with low diagnosticity).
  - TRN-C102: stays unresolved, now resting on a rival expectation rather than on no evidence.
  - The case verdict (unresolved) and the components stand; the crux component's note is updated.
- **Telling** (edition-2026-11-10-160408): the defect account's debt is restated (a rate exists for other plates, not for this survey's glass), the gamma-ray-burst precedent is told, the case for light gives the older rival expectation, and the alignments are told from the paper and the critics' check. Three reviewer notes from the last comparison are taken: plain words replace "proper null" and "catalogs nobody's thumb has touched", the meteor-shower test is introduced with the debris it would exclude, and the altitude model's missing orbital motion is spelled out.

## Provisional records, and an engine fix

IOPscience served the PASP text to my first reads, and the first fresh quote check passed every PASP passage. After that the site served a Radware bot wall to every read. No Wayback capture holds the text. The ETH Zurich Research Collection record (which holds the published PDF) first gave only the abstract, then HTTP 500, and DIGITAL.CSIC gave a bot wall. Following the charter, the five records quoting the paper (TRN-E228, E229, E233, E234, E235) are entered **provisional**, with the route to the text, and carry no weight. The assessment rests its changed grades on the other records and the anchor, and says so.

The reading tool's wall detector (`src/engine/fetch.ts`, `looksLikeWall`) did not recognise either wall. It read the 389-character Radware captcha page as the article's text. I added two patterns, with tests in `retrieval.test.ts`, so these pages count as not retrieved and the fallbacks run. This strengthens the check, since no quote is ever compared against a wall page. It touches no founder file.

## Checks

`check-quotes --fresh`: 14 passages, 0 failures. `npm test` (vitest): 297 passed. `status` loads every case. I did not run `npm run build` separately.

## What the next session should do

- Re-read the PASP paper (IOPscience, or the ETH PDF) and promote the five provisional records if the passages check.
- The new article measures 2,833 words, over the ~2,500 reader budget (the stamp accepted it). Trim it in the next edition.
- TRN-C103 (geomagnetic trend) and TRN-C108 (altitude range) are still held on their anchors alone. Cann's tables are the next reading.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
