---
runId: 2026-10-23-session-site-124118
title: "Elusive by Law: the Flores thesis and online-game preprint, read in full, weigh less for the anomaly than the case had said"
cases: [mpi]
panel: [mpi]
---

# Session 2026-10-23-session-site-124118 — Elusive by Law (mpi)

## Why this case

No reviewer had held or sent back a change, and the founder's inbox was empty. The MPI case had never been worked by a session since it was built in August, and its edition was the oldest on the site (45 days). Under the charter's order that made it the weakest case. MPI is not a fast-moving case, so I first searched for new primary work, then read in full the sources the case still knew only from summaries.

## What I looked for, and did not find

I searched for new correlation-matrix experiments, MPI papers and proponent output from 2024–2026: web search, the Journal of Scientific Exploration archive, and Walach, Lucadou, Grote and Kirmse by name. I found no new matrix experiment or reanalysis published since the 2023 online preprint. The 2024–2026 hits under the name "Model of Pragmatic Information" were a company blog post (promotional, no data) and an unrelated 2026 arXiv paper on "pragmatic information" in control theory. Neither was admitted. A Qeios version 2 of the online preprint (January 2024) exists. I read it, found the same results, and recorded it as a duplicate in `dispositions.yaml`. Bryan Williams's 2022 JSE review of micro-PK research turned up in search; I did not read it and have not cited it.

## What I read, and what it changed

**Flores 2021, Edinburgh PhD thesis (402 PDF pages).** The case cited "three of five studies significant" from the successor preprint's one-line summary. It said the positives "survive her own dependence-aware analyses", and the article said they were "significant under analyses designed to be more conservative than the originals". The thesis itself says something weaker:
- The registrations reproduced in its appendices label Study 1's hypotheses *exploratory*. The permutation methods were "not pre-specified", and Study 2 is "not registered as confirmatory" (new MPI-E018, pp. 317–321).
- The registered analysis was the original Z method. Of that method the thesis says: "This Z showed to overestimate results." The permutation analysis behind the three positives "was introduced to replace the original method of control" two years later (MPI-E007, rewritten, pp. 166–167).
- Study 3, one of the three positives, had a single participant: the researcher (new MPI-E019, p. 207).
- Studies 4 and 5, which added a new generator, did not confirm the prediction; pooling them post hoc restored significance (MPI-E007, paraphrased from the conclusion chapter).
- The Study 1 registration (2016) states, before any data, that the cells are not independent. It adds that dependence "makes an outcome appear more significant than is actually the case" (new MPI-E020, p. 317). This is a primary, pre-data source for the first half of MPI-C009, which had been anchored on a later summary.

**Flores & Rapazote-Flores 2023, Qeios preprint, version 1 (17 pages).** The case described its split as "significant with a true random source, null with a deterministic pseudo-random one".
- The Mersenne Twister was seeded from participants' finger-swipe timestamps, which the authors say ensures "true non-deterministic random values" (new MPI-E021, pp. 6–7). So the arm was not a deterministic source. It also links the participant's timing to the "physical" numbers through the seed, and timing is one of the psychological variables.
- Under the paper's averaged analysis, the pseudo-random arm was also significant (p = 0.0029). The authors write: "Results from both RNGs show, on average, statistically significant outcomes". No test of the difference between arms is reported (new MPI-E022, pp. 11–14).
- The 64×64 matrix is built from four variables a side, each cut into sixteen fragments. The Welch test and the power calculation treat the 4,096 cells as independent samples, and the Monte Carlo step uses 100 shuffles reported as power (new MPI-E023, pp. 8–12). The editorial inference here is mine, from the stated methods, and the record says so.

**Grote 2021, open-access full text.** The unblinding was in Paris on 6 July 2019, which confirms the article's opening. The experiment also split its random source, concealed from participant and experimenter, between real-time bits and pre-recorded bits XOR'd with a Mersenne Twister stream. Both arms were null (p = 0.59, 0.43; new MPI-E024, context for MPI-C503). It is the design precedent for MPI-R003.

## What I changed

- **Evidence:** MPI-E007 rewritten from the thesis; it no longer quotes the preprint under the thesis's source id. Added MPI-E018 to MPI-E024. Added a limitation to MPI-E008 pointing to the new records; its passage is untouched. All 17 quoted passages pass the quote check.
- **Sources:** SRC-FLORES-2021 now points to the PDF; the note records what was read, the letter-spacing problem, Walach's role and the funding. SRC-FLORES-2023 now has the version-1 PDF URL, the version-2 note and its funding statement (Bial Foundation grant 156/18, from the paper). SRC-GROTE-2021 now has the open-access URL and the Paris date.
- **Claim MPI-C503** (catalog, not featured): "a deterministic pseudo-random generator" is now "a Mersenne Twister pseudo-random generator", and the claim is now limited to "the full-sample analysis". The anchor is unchanged.
- **Research MPI-R003:** now asks for a pseudo-random arm seeded independently of the participant, a source concealed from participant and experimenter, a test of the difference written down in advance, and permutation statistics.
- **Assessment 2026-10-23-operator-125428 (draft).** No verdict changes. The case stays weakly supported, now said to sit at the low edge of that grade; MPI-C007 stays weakly supported with confidence lowered to low. Reasons were corrected throughout. The previous judgment's strongest objection to MPI-C008 still called Walach 2020 "preregistered, adequately powered"; the article was corrected on 2026-08-25, but the judgment never was. That error is gone. The objections to MPI-C002 and MPI-C009 no longer present Flores's positives as dependence-proof. The best conventional explanation no longer speaks of a "preregistered-positive residue". I added four components and the steelman the current rules require.
- **Edition 2026-10-23-125428:** the article changes in "The record, under pressure" (Grote's split; two new paragraphs on Flores), in both steelman paragraphs, and in "What would settle it". Length went from 1,824 to 2,082 words.

## A judgment the panel should look at

The founder's review of 2026-08-22 kept the case at weakly supported because of "the preregistered-positive residue". After this reading, that residue is thin: Walach 2020 was not preregistered, and Flores's studies were registered as exploratory, with the analysis that carries their positives unspecified. I kept weakly supported, because reported positives remain that no one has shown to be artifacts. But "unresolved" is one step away and defensible. The panel's blind reading is the right place to decide that.

## Could not reach

- Walach et al. 2020 (APA, paywalled) and Lucadou 2006 (AIP proceedings) remain characterized second-hand.
- The thesis's results chapters and conclusion extract as letter-spaced characters ("t h e s i s"), which the quote check's normalization cannot match. Per-study results and the participant's identity in Study 3 are therefore paraphrased with PDF page locators, not quoted. **For the founder:** a reading-tool option to collapse single-letter spacing would let such PDFs be quoted. I did not touch `quotes.ts` or the check; that file belongs to the founder.
- The registration forms for Studies 3–5 were read only for Study 3's design.

## Oddities

Grote's paper has a section, "Trickster at work?", reporting improbable coincidences around his own analysis. It is material, not instruction, and I did not use it. My permissions refused a heredoc append, a shell `for` loop and an `awk` extraction; I used the Edit, Grep and Read tools instead.

## Next session on this case

1. Get Walach et al. 2020 in full (an author copy may exist) and check its analysis against the dependence question: was the 10,000-simulation null a permutation of the experimental data?
2. Read Williams 2022 (JSE) for any matrix-program material the case lacks, as discovery only.
3. If the panel moves the case toward unresolved, the header and the article's closing need only light changes; the evidence is in place.
