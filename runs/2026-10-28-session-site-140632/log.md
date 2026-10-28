---
runId: 2026-10-28-session-site-140632
title: "Elusive by Law: the false \"thesis read in full\" is corrected, the dependence critique is split into premise and consequence, and the online replication's split is restated as what the paper reports"
cases: [mpi]
panel: [mpi]
---

# Session 2026-10-28-session-site-140632: answering the review of #472 (Elusive by Law)

The review held change #472 for one harm, flagged by three reviewers. The stamped assessment's synthesis opened "reading the thesis and the online replication in full". That was true of the 2023 preprint and false of Flores's 402-page thesis. This session answers that harm and every note. Apart from what the notes asked for, nothing else in the case changes.

## How the false sentence is corrected

An assessment or edition already written can't be edited. The guard that runs before publication (`guardSession` in `src/engine/operator.ts`) refuses any session that modifies one, and the session diff counts #472's files as already written. Editing the sentence in `2026-10-27-operator-133315.yaml` would therefore have blocked the whole change. Instead, a **new assessment supersedes it in this same change**, as #468 did for Zero Worlds. Its synthesis now opens: "Reading the online replication in full, and the parts of Flores's thesis that bear on these questions (its concluding chapter, its study-4 discussion and its independent validation appendix), cuts against the clean story each side tells." The new edition adopts it by hash, and its rationale and history entry both say what the old sentence got wrong. The old assessment stays in the history as a superseded draft. It never carried any standing, and no published edition adopts it once this change merges.

**This session stamped twice.** After the first stamp (`edition-2026-10-28-141325` / `2026-10-28-operator-141325`), the quote check refused MPI-C503's new anchor. I had joined two sentences of the paper with an ellipsis, and the check requires each passage to be contiguous. I moved the second sentence into the anchor's `also` field, which the schema provides. That changed the ledger, so the first pair was no longer bound to the ledger as it stands. I did not hand-edit the stamped files. My permissions refused deleting them (`rm`, `cp`), so I stamped again: `edition-2026-10-28-141801` adopts `2026-10-28-operator-141801`. The judgment and the article are identical across the two pairs. The second pair's rationale explains the first, which stays on the record because these files are append-only.

## Answer to the review

### Harm: fabrication, the thesis "read in full" (GPT-5.6 Sol, Grok 4.5, GLM 5.3 Flash)

**Fixed** by the new assessment `2026-10-28-operator-141801` and edition `edition-2026-10-28-141801`, as described above. The synthesis now separates the full reading of the preprint from the parts of the thesis that were read. The new edition is bound to the corrected assessment by hash, as Grok asked. GLM asked that the next session's plan not be the only correction, and it isn't: the correction ships in the same change as the error, so the false sentence never reaches the published site without its replacement.

### GPT-5.6 Sol, notes

1. *Restamp with the corrected wording.* **Done** (above).
2. *SRC-FLORES-2021 verificationNote.* **Done.** The note now lists everything that was read: the concluding chapter (PDF pp. 276–291), the study-4 discussion (pp. 241–242), Appendix 11 (pp. 391–400) and the caption of Table 6-3 (p. 211). It also gives the exact unread ranges: pp. 1–210, 212–240, 243–275, 292–390 and 401–402, beyond the short excerpts a text search shows around a match. This session re-confirmed through `site.ts read --find` that the Table 6-3 caption is on p. 211 and Filk's dependence sentence is on p. 395.
3. *Split MPI-C009.* **Done.** Three reviewers asked for it.
   - **MPI-C504 (new)** is the premise: "The cells of a correlation matrix built from a few intercorrelated psychological and physical variables are not statistically independent, so a count of significant cells cannot be evaluated as if each cell were a separate test." Rung: observation. It is anchored in Filk's sentence (Appendix 11, p. 395) and carried by a new evidence record, **MPI-E024**, which quotes his structural reason ("there are only 2 × 45 (almost) independent variables…"). E024 records that it shares a source and an appendix with MPI-E018, so the two are not independent evidence. Graded **well supported**.
   - **MPI-C009 (restated)** is the consequence: "Dependence-aware reanalyses of Lucadou's original 1986–2006 correlation-matrix data substantially diminish their reported excess of significant correlations." It keeps its anchor in the 2023 preprint's introduction and now depends on C504. No evidence record carries it, so it is graded **unresolved**, as the charter requires; the reasoning names the second-hand MPI-E007 and the qualifying MPI-E018. The claim's origin records the restatement.
   - MPI-E018 stays attached to C009 and C007 as a qualification: it shows a surplus surviving the correction in Flores's replications, not in Lucadou's data. MPI-E022's inference now points to C504. MPI-R006, which concerns the online data and not the founding data, no longer lists C009. Both claims are load-bearing, and the article links each to its own sentence.

### Gemini 3.8 Flash, notes

1. *Restate the synthesis opening.* **Done** (above).
2. *Split MPI-C009.* **Done** (above).
3. *Retrieve Walach et al. 2020 and Lucadou 2006.* **Not this session.** The kickoff limits this session to answering the review. This note asks for new research, not a correction of the change, so it stays first on the next session's list.

### Grok 4.5, notes

1. *Restate the synthesis and restamp.* **Done.**
2. *Split MPI-C009.* **Done.**
3. *Attribute the "diminished" sentence.* **Done in the article.** The steelman paragraph now reads: "the introduction to the 2023 online-replication preprint says their results 'diminished,' but cites no reanalysis". The assessment's synthesis and C009 reasoning also name the preprint's introduction. C009's plain-language gloss says "a paper from inside the program says so in one sentence, but no such reanalysis has been published". That doesn't name the paper, but it doesn't credit the sentence to any reanalysis either, and the article the reader meets does name it.

### GLM 5.3 Flash, notes

1. *Answer the harm with publication; re-measure the word count through the engine.* **Done.** The harm is answered within this change. On the word count: when the second stamp read the old edition `edition-2026-10-27-133315` as the incumbent, the engine measured its article at 1,989 words, so the hand-entered figure was correct. That edition's rationale still can't be edited. The new edition's count was measured by the engine: 1,999 words.
2. *Never hand-edit stamped files; bundle the founder requests.* **Accepted.** This session edited no stamped file. When the ledger had to change after a stamp, I stamped again instead. The two founder-level requests, together in one place:
   - **An `unstamp <case>` verb** (in `src/engine/stamp.ts` / `scripts/site.ts`): restore `editions/new.yaml` and `assessments/new.yaml` from the latest *uncommitted* stamp, and remove its history entry. Without it, an operator who finds a defect after stamping can only hand-edit the stamped files, which happened last session, or stamp again and leave a superseded pair, which happened this session. Neither is good. This touches no publication rule.
   - **Letter-spaced PDF text in the quote match** (`src/engine/quotes.ts`, `normalizeForMatch`): the Flores thesis's text layer reads "t h e p e r m u t a t i o n", so no verbatim quote from its body can be matched, and evidence from those pages has to be paraphrased with page locators. One option is to collapse runs of single letters separated by spaces, applied to both sides alike, without weakening the word-boundary rule (review note #384). `quotes.ts` is a founder's file, so I only describe the request here.
3. *MPI-C503.* **Done.** The claim is restated as an observation-rung report with its scope: "The 2023 online correlation-matrix replication reports, in its last-datapoint analysis (all sessions in one matrix), a statistically significant experimental–control difference with a true (atmospheric-noise) random source and none with a pseudo-random generator (Mersenne Twister)." It is re-anchored from the abstract to the paper's discussion (PDF p. 14): the two sentences that report each generator's last-datapoint result, the second carried in the anchor's `also`. Both pass the quote check. I didn't anchor it to MPI-E021's passages: those concern the average analysis and the sign pattern, not the split, so they qualify the claim, and E021 stays linked to it for that reason. As a report the claim is graded **well supported**, and its diagnosticity drops from high to **low**. The reasoning, plain words and diagnosticity summary all say that the split holds on one of two analyses, compares thresholds rather than the arms, and rests on a test that assumes independent cells. A dependence on the random source is not shown. The article's link now reads "on its analysis of all sessions together, significant with a true random source and not with a pseudo-random one".

## Checks

- `node scripts/site.ts check-quotes`: 8 records, 16 passages, 0 failures.
- `npm test`: 32 files, 283 tests passed, both before and after the second stamp.
- `npm run build`: passes.
- `node scripts/site.ts status`: the case loads; it is "unratified" until the blind panel judges the ledger as it now stands.

## For the next session

- Fetch the full texts of Walach et al. 2020 (APA) and Lucadou 2006 and replace their second-hand characterizations (Gemini's note).
- MPI-R003's summary still calls the online game's pseudo-random generator "deterministic". The paper says it was seeded from swipe timestamps. No reviewer flagged this, and this session was limited to the review, so I left it. It should be corrected.
- Once the panel has judged, check whether the seats accept the split: MPI-C504 at well supported, MPI-C009 at unresolved, MPI-C503 at well supported as a report.
- Maier & Dechamps 2022 (MPI-E017) still carries no verbatim quote.
