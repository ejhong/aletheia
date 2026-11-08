---
runId: 2026-11-08-session-site-142304
title: "Before Sputnik: the defect-rate, flash-sharpness and alignment claims the panel split on, read from their sources — all three move from unresolved"
cases: [transients]
panel: [transients]
---

## What I did and why

None of my changes was held, and the founder's inbox was empty. "Before Sputnik" (the Palomar transients) is the site's fastest-moving case and had gone 39 days without work, so I checked it first for new literature. I queried arXiv for author Villarroel, for "POSS-I" and for Palomar plate transients, ran Crossref for anything published since 1 August, and ran two web searches. The newest relevant arXiv item is still the hotspot preprint of 8 September (already in the ledger), and Crossref shows nothing new. The one change is that Busko's coma paper was revised to version 4 on 8 October 2026.

With nothing new to bring in, I turned to where the case is weakest. The blind panel of 30 September split on three claims: TRN-C101 (star-like defects are common enough to contaminate a search), TRN-C102 (a sub-second flash should look sharper than a star) and TRN-C104 (alignments are reported). The draft graded all three "unresolved" because no evidence record carried any of them; the seats graded them supported. Neither side had the texts in the ledger. I read the sources in full and wrote records from them.

## What I found

- **The alignments paper** (Villarroel et al. 2025, PASP; until now characterized only from its title and a critic's account) was read in full on IOPscience.
  - Its Table 1 counts 83 aligned groups of three or more transients in the 298,165-row catalog, 20 of four or more and 2 of five or more. Five candidates are shortlisted, and the abstract cites "one with ∼3.9 σ statistical significance" (new TRN-E227).
  - The same paper says three-point alignments are "non-interesting" on these plates. It also says the two factors that would give the search-wide odds, the rate of star-like flaws and the number of multiple-transient groups in the data set, cannot be estimated: "Unfortunately, we have no grasp or means of estimating either of the two factors." (new TRN-E228). The 3.9σ is therefore a per-image figure for a group chosen from a survey-wide search.
  - Watters et al. §4.5 finds 8 of the 24 shortlisted members within 5 arcseconds of NeoWISE catalogue positions, and some members visibly asymmetric (new TRN-E229).
- **Defect rates.**
  - Hambly & Blair, in their overlap test, found "more than 100 detections on E0086 in the overlap region with brightness, eccentricity and area similar to the 9 detections on E0070" (new TRN-E230).
  - Busko's version 4 says a "small but persistent subset" of artefacts on Hamburg plates mimics real stars well enough to pass automated filters (new TRN-E234).
  - Both camps say in print that nobody has measured the rate. Hambly & Blair "cannot make any quantitative assessment of the prevalence of holes and bubbles" (new TRN-E232). The PASP paper says "no study has systematically quantified the fraction" (new TRN-E233). The PASP paper also concedes that star-like defects exist and can sit beside candidates (new TRN-E231).
- **Flash sharpness.** Busko (version 4, p. 7) reports three transients on a 1953 Hamburg plate that are "narrower than stars of same peak flux" yet carry the same coma as their neighbouring stars. He explains this with the argument that image wander dominates recorded seeing, and he warns that reciprocity failure may change faint short-exposure images (new TRN-E235). This is the first observation in the ledger that fits the claim. The proponents' commentary states the mechanism (new TRN-E236). The same Busko paper says some artefacts are sharper than stars too, which keeps sharpness ambiguous on its own.
- **A correction.** TRN-E014 said Busko worked with "532 plate pairs". That figure is the text of version 1, whose own Table 1 gave 532 plates and 407 pairs. Version 4 gives 278 pairs from 398 plates, and the eleven transients listed are the same in both versions. I corrected the record, now quoting the paper, and noted the version history on the source.

## The judgment

The new draft assessment (2026-11-08-operator-143723) changes three claim grades:

- TRN-C101 moves from unresolved to **provisionally supported** (moderate confidence). Star-like look-alikes are shown to be common on two archives, but their rate is unmeasured by both sides' own account.
- TRN-C102 moves from unresolved to **provisionally supported** (low confidence). It now has an argument and one Hamburg observation, and no calibration.
- TRN-C104 moves from unresolved to **well supported** (moderate confidence), with low diagnosticity. The claim asserts only that alignments are reported, and they are. What they are worth is recorded beside them in TRN-E228 and TRN-E229.

The case verdict stays unresolved; component states, load-bearing and weakest links are unchanged. I name the case under `panel:` so the seats can judge the revised ledger. The new edition re-tells the defect account (the overlap count, the Hamburg experience, and both sides' admission that no rate exists), the case for light (the Hamburg sharpness observation and its caveat) and the alignments paragraph, which no longer says the paper is unread. To stay inside its budget, the synthesis drops one sentence on the modelling preprint's concession about the plate background; the shadow claim's reasoning still carries it.

New research item TRN-R204 is a search-wide alignment count against shuffled controls that keep each plate's own clustering. It supplies the correction the alignment paper says it cannot estimate, and it is a desk computation on existing catalogs.

## What I set aside, and what I could not reach

- **Greiner, Wenzel & Degel 1990 (A&A 234, 251)**, the primary GRB-era study of star-like emulsion defects that both camps cite. The ADS scan has no text layer, so it is recorded as blocked in `dispositions.yaml` with a route.
- **Doherty 2026b** (alignments on seven plates). Its record TRN-E018 is "qualifies" for its current claims and would be "supports" for TRN-C104. I did not link it, so as not to mix directions in one record. A later session could split it after reading the preprint.
- **Two existing records I did not link.** TRN-E006 (the profiles argument, "qualifies" on C002/C020) stays as it was; TRN-E236 carries the same argument for C102 with the right direction.

## Checks, and one that may fail on the review's machine

- `npm test`: 297 passed.
- `npm run build`: passed.
- `site.ts stamp transients`: stamped, loader accepted.
- `check-quotes --fresh`: the first fresh run after writing the records passed (12 records, 28 passages, 0 failures). A later fresh run failed on the five passages quoted from the PASP paper (TRN-E227, E228, E231, E233 and the TRN-C104 anchor). By then IOPscience was serving the reading tool a 389-character "Radware Bot Manager Captcha" page on the DOI, the article URL and the PDF URL. This looks like rate-limiting after my repeated reads. **The final fresh run, retried twice, still fails on those passages for that reason. Every other passage passes.** I left the records as read rather than make them provisional. Every quoted span was copied from the full text the reading tool returned at the start of the session; the tool's own cache of that text has since been overwritten by the captcha. Making the records provisional would remove the weight from TRN-C104's regrade and require a re-stamp, for what appears to be a block on this machine's address only.
  - I tried an `archivedUrl`, but the Wayback captures cannot stand in. The reading tool resolves any address containing the DOI through the DOI's open-access route, including `web.archive.org/web/<ts>/https://iopscience.iop.org/article/10.1088/…`. The good captures (about 87 KB, e.g. 20260519084437) were never fetched; the tool returned the captcha again. I did not add an `archivedUrl` that does not work.
  - The arXiv preprint the group cites for this work (2204.06091) is an earlier, different text and does not contain the quoted passages, so the source cannot point there.
  - If the review's check meets the same captcha, the answer is one of two. Enter the PASP records as provisional with the route (the DOI, open access, CC BY 4.0). Or fix the engine (below) so a Wayback capture of the article page can be read.

## For the engine (the founder decides)

`site.ts read` treats a `web.archive.org` address that contains a DOI as that DOI, and reads the publisher's open-access route instead of the capture. So a capture cannot rescue a source whose publisher sits behind a bot manager, which is the case the charter's `archivedUrl` is for. The smallest fix is to fetch the capture as given when the address is a Wayback address. The fallback lives in `src/engine/fetch.ts`, which is not among the files reserved to the founder, but the fix is work for its own session.

## What the next session should do

1. If the PASP quotes were held, answer as above.
2. Read Doherty 2026b in full and split TRN-E018, so its alignment finding carries TRN-C104 with the right direction.
3. Read Busko's Paper I (SRC-BUSKO-2026A) again at its current version. Reviewers have asked for a candidate rate against matched controls, and the article's "Hamburg-style candidate rates" test depends on it.
4. Run the literature check again. The case's watch has not run since 1 September (`proposals/watch/`).
