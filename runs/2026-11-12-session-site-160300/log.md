---
runId: 2026-11-12-session-site-160300
title: "The Emptied Amazon: five claims the panel split on read from their sources — the erasure study concerns the living forest, not the cores, and the basin models bound earthworks, not people"
cases: [pre-columbian-amazon]
panel: [pre-columbian-amazon]
---

## What I did and why

No change of mine was held, and the inbox was empty. By the charter's order I went to the weakest case. The Emptied Amazon had not been worked in 43 days. The panel split on six of its claims (AMZ-C019, C020, C021, C022, C023, C029), all for one reason. None had an evidence record, so the draft graded them `unresolved`, while the seats graded them from their sources. The fix was to read the sources and write the records.

I read five of the six sources in full through `site.ts read`: Blatrix et al. 2018, Walker et al. 2023 (PMC copy), Clement et al. 2015 (PMC), Bush et al. 2025 and Peripato et al. 2023 (accepted manuscript). I wrote eleven evidence records from them (AMZ-E116 to E126). I also searched for anything new since the edition of 2026-09-30. The one substantial new paper was the July 2026 Aquiry LiDAR study in *Nature*, and the ledger already holds it (AMZ-C004, E001).

## What I found

Reading the texts corrected three claims and changed what two others carry.

- **C019 (Mojos weirs)** stated as fact a fish-trapping function that its authors only *postulate*. The measured layout stays as C019: 231 of 382 ponds lie within 35 m of a weir or causeway, p < 0.0001 against random placement. The postulate is now its own attribution claim, **AMZ-C087**. The authors also allow a natural origin for the ponds (scouring around an obstacle), which E118 records. They report one pond infill dated to about AD 1030–1424, and no fish remains from the ponds.
- **C021 (the sampling critique)** joined the 300-core total to the 1.17 m³ volume. In the reply the 300 cores (from 109 sites, western and central Amazonia) are the clustered set. The 1.17 m³ is the volume of the 124 western cores. Corrected.
- **C022 (Upano erasure)** said the pre-Columbian signal was erased "on the ecological record". The paper is one core from Lake Cormorán, and that core records the occupation clearly: maize pollen and phytoliths from about 570 BCE. What forest recovery erased is the occupation's imprint on the *composition of the modern forest*. Corrected. As a result, the erasure argument against the negative soil cores loses its cited support. The study is no evidence that cores miss old occupations (E123, qualifies).
- The same paper states when the Upano occupation ended: a protracted decline to an apparent abandonment about 550 CE, with no terminal ash layer. That meets the reopen condition of the 2026-09-17 disposition, which had refused a dated re-wording of C022. The end-date enters as its own claim, **AMZ-C088**, not folded into C022.
- **C020 and C029 (the basin models)** are accurate as stated, but read closely they bound *earthworks*, not people. Walker predicts that other kinds of archaeological site dominate more than two-thirds of the basin. Peripato's authors write that dark earths are widespread where their earthworks are improbable (E126, qualifies). I lowered their diagnosticity to low.

I corrected four source records. SRC-WALKER-2023 now points to the PMC copy (peerj.com returns HTTP 403 to the reading tool). SRC-CLEMENT-REPLY gets the reply's own title, its year (2015), its DOI and the current PMC host. SRC-BUSH-2025-UPANO gets the paper's real title ("Ecological legacies and recent footprints of the Amazon's Lost City") and its authors. Two of those titles had been descriptions written by an earlier pass.

## The judgment

The new draft assessment (2026-11-12-operator-161705) moves C019, C020, C021, C022 and C029 from unresolved to well_supported on their records. C087 and C088 enter as well_supported. C023 stays unresolved. The case verdict stays well_supported. Its components, synthesis and C014's treatment now say that:
- the sampling critique stands as made, and clustering is its stronger half;
- the erasure study bears on reading the past from today's forest, not on the cores;
- the models bound earthworks, not occupation.

The weakest links are now C017, C023, C021 (the critics' answer is unread) and C087.

The new edition (edition-2026-11-12-161705) rewrites the weir, disappearance and sparse-forest passages from the texts. It adds the Upano abandonment as "not every emptying was a colonial one", together with the 800–1200 reoccupation of some mounds (C062), so the point is not overstated. It also takes up three notes from the last comparison:
- it names Linda Newson where the collapse figures first appear (Opus);
- it replaces "this site has not yet checked" with what is and is not known (GPT);
- it gives the erasure-calibration and witness-table bullets their outcomes (Opus, Grok).

The article is 2,693 words: over the 2,500 target, under the 3,000 ceiling. The added length is the Upano paragraph and the fuller sparse-forest section.

I am naming the case under `panel:` because the judgment moved on seven claims.

## What I set aside, and what I could not reach

- **AMZ-C023 (Newson, epidemic fade-outs).** I could not read the text. The journal server and the PDF galley (found by web search) both failed to fetch. So did the Wayback capture of the galley, at its ordinary and raw addresses (two tries, then stopped, as the charter says). The DOI has no open copy. I did not attach AMZ-E008, from the same article, to C023: its quotation states neither the fade-out nor the late-arrival mortality. Disposition row `blocked`, with routes.
- **The comment by McMichael, Piperno and Bush** that the Clement reply answers. Without it the ledger holds the critique of the sparse-west sampling but not the answer to it. I did not seek it this session. Disposition row `blocked`, with route. E121's limitations say so.
- **Blatrix's supplementary information**, where the natural-origin hypothesis for the ponds is developed, was not read. E118 says so.
- One locator is coarser than I would like. E123 cites the Discussion and Results for the 570 BCE maize onset, and the quoted span sits in the Discussion.

## Checks

`check-quotes --fresh`: 16 records, 30 passages, 0 failures. `npm test`: 297 passed. `npm run build`: passed.

## For the next session

1. Read the McMichael–Piperno–Bush comment (Proc. R. Soc. B 2015) and enter the critics' defence of their sampling beside E121. C021 and C014 turn on it.
2. Retry Newson 2003 from another network, or find the passage in her 1995 book. C023 is the one featured claim still without a record.
3. The 2,693-word article could lose about 200 words in a polish pass. The Hancock section (two seats suggested halving it) and the transparency paragraph are the candidates.
4. Research item "Calibrate palaeoecological erasure against time since abandonment" should now name soil proxies specifically, since the lake study shows sediment keeps old signals. I did not edit the research record this session.
