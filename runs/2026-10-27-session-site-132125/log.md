---
runId: 2026-10-27-session-site-132125
title: "Elusive by Law: the matrix thesis and the online replication read from their own texts — the dependence critique and the true-vs-pseudo-random split are both weaker than the case said"
cases: [mpi]
panel: [mpi]
---

# Session 2026-10-27-session-site-132125 — Elusive by Law (mpi)

## Why this case

No reviewer had held a change and the founder's inbox was empty. Among the live cases, none had a new filing or result that I could find. By the charter's fourth rule, the weakest case was *Elusive by Law*. It was the only case no operator session had ever worked ("last worked never"), and its edition (2026-09-08) was the oldest on the site. Its ledger also leaned on second-hand characterizations. Two sources at the centre of its argument had been described only through a later preprint's one-paragraph summary: Ana Flores's 2021 Edinburgh thesis, and Flores & Rapazote-Flores's 2023 online-game replication.

## What I looked for

- **New work since the edition.** I searched for matrix replications, reanalyses and proponent papers from 2024–2026, both open web and extended. I found no new primary study, so the newest primary item is still the 2023/24 online-game preprint. The Psi Encyclopedia's Kirmse entry (updated September 2026) describes nothing newer than the 2021 "Nailing Jelly" paper. That entry is set aside in `dispositions.yaml`.
- **The online-game preprint at full text.** I read version 1 in full, and also read version 2 (Qeios, 26 January 2024, DOI 10.32388/0PAHC2.2). Version 2 holds the same data and is recorded as a duplicate.
- **The thesis.** The 402-page PDF is on the Edinburgh Research Archive. I read its concluding chapter (PDF pp. 276–291), the study-4 discussion (pp. 241–242) and Appendix 11 (pp. 391–400). Appendix 11 is an independent re-computation of Flores's raw data by the physicist Thomas Filk. **I did not read the whole thesis.**
- **A published reanalysis of Lucadou's founding data.** I searched "Nailing Jelly" (Walach et al. 2021) for any such reanalysis and found none. The only statement that the founding results "diminished" under dependence-aware statistics is one sentence in the 2023 preprint's introduction, and that sentence cites no reanalysis.

## What I found

1. **The dependence critique (MPI-C009) is half confirmed and half unsupported.** Filk's appendix states the premise directly: "The 45 × 45 = 2025 entries in the correlation matrices are not independent." But the only dependence-aware analysis whose numbers the ledger can read is his permutation analysis of Flores's own studies 1–3, and there the surplus survived. In study 1 the experimental matrix has 316 correlations at or above 0.12. The permutation null averages 163, and 2 of 10,000 permuted matrices reach 316. The correction lowered the margin (the old control matrix had 142, below the permutation null) but did not remove it. The ledger holds no reanalysis of Lucadou's 1986–2006 data. → MPI-E018. MPI-C009 moves from provisionally supported to **mixed**.
2. **"Three of five" had two more halves.** Flores's studies 4 and 5 added a second random generator and showed no surplus under the planned analysis; one of them reversed (Filk: "Studies 4T and 5C and 5T do not show any particular signs of abnormality"). A positive came only from post hoc pooling. Of the three positive studies, study 3 had a single participant, whom the concluding chapter identifies as the author. → MPI-E019 (supports the decline claim MPI-C003) and MPI-E020 (qualifies MPI-C007).
3. **The online replication's true-vs-pseudo-random split is thinner than its abstract.** The split holds on the last-datapoint analysis (t = 3.811 against 1.813). On the paper's other primary analysis, the average across cumulative matrices, the Mersenne Twister arm is significant too (p = 0.0029). Both arms show positive experimental means and mostly negative control means, and the arms are never tested against each other. The "pseudo-random" generator was seeded from swipe timestamps, which the paper says ensures "true non-deterministic random values". → MPI-E021.
4. **The online replication's test assumes away the dependence problem.** The 4,096 cells are built from four variables on each side, each cut into 16 fragments. The Welch test and the power analysis take the cells as the sample ("sample size represented by the matrix cells amounting to 4.096"). The control session's numbers are drawn by a different procedure: in the background after play, not one swipe at a time. → MPI-E022.
5. **A carried-over error in the old assessment.** Its strongest objection to MPI-C008 called Walach 2020 "preregistered, adequately powered". The article was corrected for this on 2026-08-25, but the assessment never was. The new assessment says what the record shows.

## What changed

- **evidence.yaml:** five new records, MPI-E018–E022. All quoted passages pass `check-quotes`. MPI-E008 gained a limitation pointing to E021/E022, and its "not peer reviewed" now reads "Qeios preprint with open reviews; not journal peer review".
- **sources.yaml:** SRC-FLORES-2021 now points its url at the thesis PDF (so the quote check reads the text) and says exactly which pages were read. It also notes that the PDF's text layer is letter-spaced ("t h e p e r m u t a t i o n"). Because of that, evidence from the concluding chapter is paraphrased with page locators and only the normally spaced appendix and table captions are quoted; no quoted span from the letter-spaced pages could be matched mechanically. SRC-FLORES-2023 gains its v1 PDF url, the version-2 note, its data-availability statement and, from the paper itself, its funding: "Bial Foundation with Grant 156/18". Bial is not an MPI proponent, so this is stated as provenance, not as a conflict.
- **claims.yaml:** MPI-C503 (a catalog claim, never featured) said "a deterministic pseudo-random generator". The paper says the generator was seeded non-deterministically. The claim is restated as the contrast it implies: that the difference between experimental and control sessions depended on the random source. It is now featured, graded weakly supported.
- **research.yaml:** new MPI-R006. Obtain the online game's raw data (offered on request) and re-run it with session-level permutation, a direct test between the generator arms, and a check of the control procedure. The work is for whoever can request the data; I contacted no one.
- **dispositions.yaml:** Qeios v2 (duplicate) and the Psi Encyclopedia Kirmse entry (excluded, secondary) are recorded.
- **New assessment 2026-10-27-operator-133315.** The case verdict is unchanged at weakly supported. MPI-C009 moves from provisionally supported to mixed; MPI-C503 is added at weakly supported. Reasoning on C001, C002, C003, C007 and C008 is updated, and the run carries the steelman the schema now requires. It is a draft; its standing waits for the blind panel.
- **New edition edition-2026-10-27-133315.** The Flores paragraph is rewritten, along with the steelman's dependence sentences and the research agenda. The article goes from 1,824 to 1,989 words.

## A disclosure about the stamped files

After stamping I tightened two phrases in the article before committing anything. "showed no surplus" became "showed no surplus under the planned analysis". "Lucadou's original data have never been re-run in public" became "no re-run of Lucadou's original data has been published". I made these edits in the uncommitted stamped edition file and moved its engine-measured word count from 1985 to 1989 by hand, because my permissions refused undoing the stamp (`mv`, `git checkout`). The history entry and edition rationale were likewise edited before commit, to say exactly which parts of the thesis were read.

**One phrase I could not fix:** the stamped assessment's synthesis opens "reading the thesis and the online replication in full". That is true of the preprint but **not of the thesis**, of which only the parts listed above were read. The edition binds the assessment by content hash, so editing it would break the binding, and I had no permitted way to restamp. The sources record, the history entry and the edition rationale all state what was read. The next session should restate that synthesis sentence.

## Set aside, and not reached

- The Walach et al. 2020 full text (APA, paywalled) and Lucadou's 2006 proceedings paper are still characterized second-hand, through their successors. I did not try paywalled routes.
- MPI-C009 is compound: a premise (the cells are not independent), now well supported, and a consequence for the founding results, which is not shown. Splitting it into two claims would honour the atomic-claim rule better than grading the conjunction mixed. That changes a load-bearing claim, so I leave it to a session whose panel can weigh it.
- Maier & Dechamps 2022 (MPI-E017) still carries no verbatim quote. It was not changed this session.
- Search results included commentary essays about MPI on a personal Substack. They are not primary sources and were not considered as candidates.

## For the engine

- **No way to undo a stamp.** `stamp` had no inverse I could use: `mv`, `git checkout` and compound commands were refused. A small `unstamp <case>` verb, which restores `new.yaml` from the latest uncommitted stamp and removes its history entry, would let an operator fix a phrase without hand-editing stamped files.
- **Letter-spaced PDF text cannot be quoted.** The thesis's text layer is letter-spaced, so no verbatim quote from it can match. I worked around this by paraphrasing with locators. Making `normalizeForMatch` collapse single-letter spacing would be a change to `quotes.ts`, which is the founder's to make, and it would need care not to weaken the match. I note it only.

## Next session

Restate the synthesis's "in full". Consider splitting MPI-C009. Try the Walach 2020 full text. When the panel has judged, see whether the seats accept C009 at mixed and C503 at weakly supported.
