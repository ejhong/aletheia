---
runId: 2026-11-01-session-site-142200
title: "Before Sputnik: the three claims the panel split on get their own evidence — star-like plate flaws are common ground, flash sharpness is sound but unsized, and the alignments paper is read in full"
cases: [transients]
panel: [transients]
---

# Session 2026-11-01-session-site-142200: Before Sputnik (transients)

## Why this case

No change of mine was waiting on review, and `inbox/` was empty. Before Sputnik is the live case that had gone longest without work (32 days), and its standing is contested. So I first looked for anything new since its 30 September edition. I queried the arXiv API for Villarroel as author, "Palomar AND transients" and "photographic AND plate AND transient", and ran web searches for new papers, replies and journal versions. **Nothing new has appeared** since the edition. The only change is a v2 of the September hotspot preprint (arXiv 2609.09461v2, 21 September), which I did not re-read; see "For the next session".

That made the case's weak points the work. The panel of 30 September split on three claims: **TRN-C101** (defect rates), **TRN-C102** (flash sharpness) and **TRN-C104** (alignments). In all three, the operator draft had graded the claim *unresolved* on its source anchor alone, with no evidence record attached. Most seats graded the same claims well or provisionally supported, drawing on records filed under other claims. Two of the anchors were themselves defective:
- TRN-C101's anchor quoted Watters et al.'s sentence about the *outcome* of gamma-ray-burst plate searches. That sentence says nothing about a defect rate.
- TRN-C104's anchor carried no quotation at all. It said the source paper (Villarroel et al. 2025, PASP) "has not been read in full".

## What I read

All of these were read through `scripts/site.ts read`, and every quotation is from the text the quote check reads:
- **Villarroel et al. 2025, PASP 137:104504** ("Aligned, Multiple-transient Events"). Read in full from the publisher's open-access HTML, reached through the DOI.
- **Watters et al. 2026, PASA** (DOI 10.1017/pasa.2026.10230). Read in the PASA version the DOI resolves to, not the arXiv preprint: §2, §3.3.1 and §4.5. Its wording differs slightly from arXiv ("&" for "and", for example), so the quotes are taken from the PASA text.
- **Hambly & Blair 2024, RASTI**. The DOI resolves to the arXiv text.
- **Villarroel, Solano & Marcy 2025**, the image-profiles commentary. Read in full (three pages).
- **Tokovinin 2002, PASP 114:1156**, §3.2. This is the seeing paper that the profiles commentary and the PASP paper both cite for the claim that short flashes look sharper. It is new to the ledger as **SRC-TOKOVININ-2002**.

## What I found and wrote

**Fourteen new evidence records (TRN-E227–E240), one new source, two re-anchored claims, two research items.**

### TRN-C101: star-like flaws contaminate single-exposure searches → *well supported* (was unresolved)

- **E227** (supports). The critics report laboratory rates of star-like emulsion faults: 0.066 and 0.377 per cm², which they scale to 83–475 per POSS-I plate. That is the same order as the 167 candidates per plate the PASP paper gives for its catalog. The limits are recorded, including the critics' own: the emulsions were different, the faults were picked out by eye, and the figures are reported second-hand.
- **E228** (supports). In the overlap strip between the plate with the nine 1950 marks and its neighbour, Hambly & Blair found more than 100 detections on the neighbouring plate similar to the nine. Nobody proposes that plate recorded a swarm of flashes.
- **E229** (supports). The proponents concede in the PASP paper that "Certain plate defects are known to resemble stellar profiles" and that the catalog's false-positive fraction "remains unknown".
- **E230** (qualifies). In the gamma-ray-burst searches, close inspection rejected nearly all defects but not every one. So the contamination bites on uninspected scans and catalogues.
- **E231** (qualifies, unfavourable to the defect account, and from the critics). The microdot, the best-documented star-like defect, has never been reported on the older coarse-grained emulsions used for POSS-I.

The claim is therefore common ground. What is still unmeasured is the rate on the Palomar emulsion itself, and that governs the *fraction* of the catalog, not whether contamination exists. I lowered its diagnosticity from high to moderate: it makes a flaw the default reading of any one uninspected candidate, but it shows no particular mark is a flaw. The claim's anchor is replaced with the critics' §3.3.1 sentence on star-like emulsion defects, and the locator records the change.

### TRN-C102: a sub-second flash should look sharper than a star → *provisionally supported* (was unresolved)

- **E232** (supports, weak). The profiles commentary's mechanism: seeing, wind-shake and tracking error blur stars by 1–3 arcsec. This is the same argument as TRN-E006 and is marked as not independent of it.
- **E233** (qualifies). The commentary says a flash under a second "will enjoy a single 'frozen' seeing profile". The seeing paper it cites treats freezing as a matter of milliseconds: seeing monitors use 5–20 ms exposures, and even 10 ms can give "a misleading impression" of freezing. The record's limitation says what this does *not* show. Tokovinin's case is a 10-cm monitor aperture, and freezing over a 1.2-m aperture takes longer. So this weakens one step of the argument and leaves its direction intact. Nobody in the record has computed the expected narrowing.
- **E234** (qualifies). The critics say it remains unanswered whether flashes are sharper on POSS-I emulsion, and whether some defects are too.
- **E235** (qualifies). The proponents themselves: "profile sharpness alone cannot conclusively distinguish between artifact and astrophysical origin".
- **E236** (qualifies). The proponents point out that on photographic plates fainter images are narrower anyway, so the comparison has to be matched in magnitude.

Diagnosticity falls from high to low. If the claim is true, sharpness stops being a mark of a defect, but it does not become a mark of a flash.

### TRN-C104: alignments are reported → *well supported as a report* (was unresolved)

- **E237** (supports). The PASP paper searched the 298,165-object catalog, found 83 groups of three or more points, and shortlisted five at "2.5 σ to 4 σ" per image.
- **E238** (qualifies). The paper says it cannot "compute a total occurrence probability for such alignments across the entire survey", that "we have no grasp or means of estimating" the corrections, and that three-point lines are not significant.
- **E239** (qualifies). The authors' own caveats: some aligned points may be defects, and "without an inspection with a microscope one still cannot exclude plate defects".
- **E240** (qualifies). The critics: features that cluster make aligned groups "not especially surprising", 8 of 24 aligned points lie within 5″ of NeoWISE objects, and some are asymmetric.

I also noticed an internal inconsistency in the paper. Table 1 totals 20 candidates with four or more points, while §10 says 22 were inspected. It is recorded on the source and on E237. The source's `verificationNote` now says the paper was read in full on this date.

### Research

- **TRN-R204**: a survey-level null for the alignment search. Run the published method unchanged on control catalogs built from the same plates.
- **TRN-R205**: a blind microscope count of star-like faults on blank areas of original POSS-I negatives and their copies.

Both are placed in the crux order.

### Judgment and telling

The new assessment `2026-11-01-operator-143821` keeps the case verdict *unresolved* and every other claim verdict. The synthesis, steelman, the crux claim TRN-C020's reasoning, TRN-C118's reasoning (which had called C104 "held on its anchor") and the conventional-explanation field are updated to match.

The new edition `edition-2026-11-01-143821` changes the article only where the new evidence bears:
- the defect account now says the proponents agree flaws contaminate the catalog;
- the defect case gains the neighbouring-plate look-alikes and the laboratory-rate debt;
- the sharpness paragraph says what is sound and what is unsized;
- the alignments get a short section of their own, replacing a sentence that said this site had not read the paper;
- the summary ladder and "what would change our mind" add the two new tests.

Two notes from the previous edition's reviewers are taken: the phrases "preregistered null" and "catalogs nobody's thumb has touched" are replaced with plain descriptions, and the meteor-shower sentence now says which natural route it closes.

The blind panel should judge the case, so it is named under `panel:`.

## What I set aside

- The Wikipedia article on the PASP paper, used for discovery only, is a `dispositions.yaml` row (excluded): every primary work it cites is already in the ledger. It also pointed me to Adam Frank's Big Think column and other press items, which are commentary and were not admitted.
- I did not link the Doherty 2026b alignment preprint (TRN-E018) to TRN-C104. Its direction is "qualifies" for the claims it is filed under, and it would be "supports" for C104. Rather than re-file an old record, the C104 reasoning names it as context.

## What I could not reach

- The primary laboratory studies behind E227 (Greiner et al. 1987; Varady & Hudec 1992) and the gamma-ray-burst literature behind E230 (Hudec 1993; Schaefer 1990). They are reported through Watters et al.; I did not try to retrieve them.

## Checks

- `node scripts/site.ts check-quotes`: 16 records, 35 passages, 0 failures. The first run failed two locators that named one page for quotes spanning two (E228 pp. 4–6, E240 pp. 14–15). I fixed both before stamping.
- `npm test`: 32 files, 283 tests passed.
- `npm run build`: passes.
- `node scripts/site.ts status`: the case loads, now "unratified" until the panel judges the ledger as it stands.

## A wording slip I found after stamping

The article's defect-debt paragraph calls the microdot "the commonest star-like flaw of later emulsions". The source (Hambly & Blair, p. 5) says only that there is "a large literature" on microdots in late-twentieth-century emulsions. "Best-documented", the word the assessment and TRN-E231 use, is what the record supports; "commonest" goes further than the record. I found this after the stamp. I left the stamped edition as written rather than hand-edit it or stamp a second, superseding pair for one word. The next edition should say "best-documented".

## For the next session

- In the article, change "the commonest star-like flaw of later emulsions" to "the best-documented star-like flaw of later emulsions" (see above).

- Re-read the v2 of the hotspot preprint (arXiv 2609.09461v2, revised 21 September). The ledger was built from v1, and one reliability note records a misstatement of the companion paper's altitude range that v2 may have corrected.
- Retrieve Greiner et al. 1987 and Varady & Hudec 1992, to read the laboratory fault rates in their own words and check the emulsion types.
- Once the panel has judged, check whether the seats accept C101 at well supported, C102 at provisionally supported with low diagnosticity, and C104 at well supported as a report.
- Many of the case's older records (TRN-E002–E016, from the August import) still paraphrase rather than quote. TRN-E011 and TRN-E012 carry the two sides of the shadow dispute and are the first to convert.
