---
runId: 2026-10-25-session-site-123805
title: "Elusive by Law: the Flores thesis and the 2023 online replication read in full — the 'three of five' narrows and the true-vs-pseudo-random split depends on the analysis"
cases: [mpi]
panel: [mpi]
---

# Session 2026-10-25-session-site-123805 — Elusive by Law (mpi)

## What I chose and why

There was no held change and nothing in the inbox. Under the charter's order, `mpi` came first among the weakest cases. It is the only case that `status` reports as "last worked never", and its edition was 47 days old. Its ledger had built two of the case's few surviving positives on summaries of openly available texts:

- Ana Flores's 2021 Edinburgh thesis. MPI-E007 quoted the 2023 preprint's one-line summary of it, under the thesis's source id.
- The 2023 online replication (Flores & Rapazote-Flores). It was characterized from its abstract.

The article leaned on both ("three of five significant"; a "theoretically suggestive" split between a true and a pseudo-random source). I read both in full.

## What I found

**The thesis (402-page PDF, from the Edinburgh Research Archive).**
- All five studies carry preregistration protocols (Appendices 4–8).
- The three significant studies are Studies 1–3. Study 3 had a single participant: the author, who contributed all 200 sessions (Table 6-3, p. 211; p. 210). The concluding chapter also reports causal correlations in parts of Study 3's raw data.
- Study 4's preregistration predicted "no decline or small decline" (p. 333). The prediction failed. With the original generator, experimental sessions produced *fewer* significant correlations than the permutation control (a "strong negative Z"). The thesis's list of possible reasons includes the decline effect itself.
- Study 5, an exact replication of Study 4, had no significant results.
- In Chapter 5 the author concludes that "the original Z overestimates results, due to the dependency of the variables" (p. 186). That puts the dependence critique (MPI-C009) in the primary text, from inside the program.
- The thesis reports Lucadou's reply: the objection holds "only in the situations where causal signals hold". It adds that "some novelty has to be introduced in each replication" (p. 183).
- It also reports Thomas Filk's view that, once the data are permuted, the 900 "future" cells carry no special weight. The author says she sympathises with it.

**The 2023 online study (Qeios v2, 26 January 2024, read in full).**
- The abstract's split (Random.org significant; Mersenne Twister p = 0.069) is the final cumulative matrix only. The paper says it gave "particular emphasis" to two analyses: the last datapoint and the average across datapoints. On the average, the pseudo-random arm is also significant: t = 2.972, p = 0.002 (p. 12).
- The Mersenne Twister was seeded from participants' finger-swipe timestamps (p. 8). That arm was neither deterministic nor independent of participants' behaviour.
- Experimental random numbers are drawn swipe by swipe; control numbers are produced "at once" (p. 5).
- The 64×64 matrix is four psychological × four physical variables, each cut into 16 segments. The power analysis treats the 4,096 cells as the sample (pp. 9, 14).
- The Monte Carlo check used 100 shuffles of the physical variables only.
- No preregistration is described. Raw data are available on request. Funding: Bial Foundation, Grant 156/18.
- Qeios's three open reviews were brief and favourable, and none engaged the statistics. No journal version was found.

## What I wrote

- **Sources.** `SRC-FLORES-2021` now points to the thesis PDF and says that its text layer is letter-spaced on many pages. `SRC-FLORES-2023` now points to v2 and records the review status, funding, the absence of a stated preregistration, and data availability.
- **Evidence.**
  - MPI-E007 is rewritten from the thesis itself. Its earlier quotation was the preprint's words under the thesis's source id, which was a provenance mis-pointing.
  - New records:
    - MPI-E018: the founding method's Z is inflated by dependence (supports C009).
    - MPI-E019: Lucadou's reply as the thesis reports it, plus the thesis's novelty requirement (supports C010).
    - MPI-E020: the preregistered no-decline prediction fails (supports C002, C003).
    - MPI-E021: both sources significant on the average analysis (undermines C503).
    - MPI-E022: the pseudo-random arm was seeded from swipes (undermines C503).
    - MPI-E023: 4,096 dependent cells treated as the sample; different generation procedure for the control series (qualifies C007).
  - `check-quotes`: 7 records, 18 passages, 0 failures.
  - Where the thesis's pages are letter-spaced (Chapters 6, 7 and 9), the records paraphrase, name the pages, and say so in their limitations. Nothing is quoted from those pages.
- **Research.**
  - MPI-R003 now asks for a pseudo-random arm fixed before the session.
  - New MPI-R006: request the 2023 raw data and rerun the analysis with a session-level permutation null and matched control generation.
- **Dispositions.** Two Bial Foundation PDFs could not be extracted ("Invalid PDF structure"), so they are blocked, with routes. Flores's Qeios review essay is excluded (no new data).
- **Assessment** 2026-10-25-operator-125112 (draft).
  - The case verdict stays `weakly_supported`. Claim verdicts are unchanged except as follows.
  - MPI-C503 is newly featured and graded `mixed`.
  - The reasoning now cites the primary texts.
  - Error fixed: the old draft's objection to C008 called Walach 2020 "preregistered, adequately powered". The edition text had been corrected for this on 2026-08-25, but the assessment had kept the error.
- **Edition** 2026-10-25-125112. The article goes from 1,824 to 2,178 words:
  - The Flores paragraph is rewritten.
  - The online-study paragraph now says the split does not hold up in the full paper.
  - The steelman quotes the thesis's dependence concession.
  - "Not airtight" now names Flores's first two studies, not "three-of-five".
  - The crux adds the novelty argument and how the thesis read Study 4's failure.
  - "What would settle it" adds the online-data reanalysis and the fixed pseudo-random sequence.
  - "Roughly twice as many significant correlations" for the founding experiments has no record behind it. It now reads "more significant correlations … than chance or control runs gave".

## What I set aside, and could not reach

- **The 2016 Lucadou source behind the thesis's report.** I did not identify it, because the thesis's bibliography is letter-spaced. MPI-E019 is labelled second-hand.
- **The two Bial PDFs.** Neither could be read; see the dispositions.
- **Kirmse's SPR encyclopedia article.** It returned HTTP 404.
- **New work since 2023.** Searches found no new matrix-paradigm studies or reanalyses from 2024–2026, and no published response from Lucadou or Walach since 2022. That is a search that found nothing, not proof that nothing exists.
- **An unverified detail in the article.** The opening says the 2019 unblinding was at "a conference in Paris" in July. The ledger records the 2019 Parapsychological Association convention but not the city. I left the sentence as it was. A later pass should check it against Grote 2021's full text.
- **Existing quotes affected by the PDF text layer.** The v2 PDF's text layer drops the "fi" ligature ("signi cant"). Two existing quotes from it (the anchor of MPI-C503, MPI-E008) would fail if they were ever re-checked. I did not edit them.

## For the engine (the founder's call)

The reading tool returns letter-spaced text for some PDFs ("t h e d e c l i n e"), and drops "fi"/"fl" ligatures in others. The quote check cannot match verbatim passages on those pages, so records have to paraphrase sound primary text. Two small fixes in the extractor would help, without loosening the match: join single-letter runs, and map ligature gaps back to "fi"/"fl". That code (`src/engine/read.ts` / `fetch.ts`) sits beside the quote check, so I did not touch it.

## What the next session should do

- Let the panel judge. It split on MPI-C001 and MPI-C005 in August.
- Read Grote 2021's full text (DOI 10.31275/20211931) to firm up MPI-E004 and the Paris detail.
- Read Walach et al. 2020 (DOI 10.1037/cns0000199) to settle whether it was preregistered.
- If the reading tool is improved, revisit the thesis's Chapters 6–9 and quote what MPI-E007 and MPI-E020 now paraphrase.

## Checks

- `node scripts/site.ts check-quotes`: 0 failures, 0 warnings.
- `npm test`: 32 files, 283 tests passed.
- `npm run build`: passed.
- `node scripts/site.ts status`: the case loads (23 evidence, 6 open research items).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
