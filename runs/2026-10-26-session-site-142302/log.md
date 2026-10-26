---
runId: 2026-10-26-session-site-142302
title: "Elusive by Law: answering the review — Grote's own paper confirms the Paris unblinding, and three wordings on the online study and the steelman are tightened"
cases: [mpi]
panel: [mpi]
---

# Answering the review of #471 (mpi, Elusive by Law)

This session answers the single review round on #471. One harm was held (GPT-5.6 Sol) and there were eleven improvement notes across four reviewers. I changed nothing beyond what the round raised.

## What I did

- **Read Grote 2021 in its open full text** (`site.ts read 10.31275/20211931 --find "Paris"`, through the OpenAlex open-access copy of the JSE PDF). The results section says the pre-registered analysis "was unblinded live during a presentation at the PA convention in Paris on July 6, 2019" (p. 12). The abstract (p. 1) and the discussion (p. 19) also name Paris.
- **MPI-E004** now quotes that sentence with its page and cites the abstract's wording as the PDF gives it ("found not to be statistically significant"; the old record had "found to be not", taken from the journal page, and the rest of that sentence is now paraphrased). Locator: `pp. 1–12`, with both pages named. **SRC-GROTE-2021** gains `url: https://doi.org/10.31275/20211931` so the quote check can find its text (without it the check refused the record: "no URL and no DOI to read"), and its verification note now records the full-text search.
- **MPI-E022** (the swipe seed): the inference is rewritten. The Mersenne Twister is deterministic given its seed. Seeding it from swipe timestamps means the sequence was not fixed before the session and is causally linked to the participant's behaviour. That does not by itself show statistical dependence, and it does not erase the difference between an algorithm and an atmospheric-noise source. The record now says so, adds a limitation that the authors' phrase "true non-deterministic random values" is their description and is not endorsed here, and points to MPI-E021's analysis-dependence as the stronger point.
- **MPI-E023** (the 4,096 cells): the record now also quotes the paper's description of its main test (p. 9: "a comparison between the distribution of correlations derived from experimental and control sessions using Welch’s T-test"). The inference is narrowed. The power analysis counts the cells as its sample, and the main test compares distributions of cell correlations. The paper does not discuss whether the cells are independent. Their possible dependence is a suspected weakness, not a demonstrated error. A new limitation says it is unclear whether the paper's Monte Carlo step (which shuffles only the physical variables) was used to calibrate the test against dependence.
- **MPI-R006**: the same narrowing ("take its 4,096 cells as their observations, without discussing whether they are independent … whether that dependence changes the result is untested").
- **A new draft assessment** (`2026-10-26-operator-142844`) restates the 2026-10-25 judgment with the same verdicts throughout: case weakly supported, every claim verdict unchanged. Only these wordings change: the synthesis and the MPI-C007 and MPI-C503 reasoning (the seed and cell-independence points as above), and the steelman and the MPI-C002 and MPI-C008 strongest objections. Those three now add that the thesis reports, with sympathy, the view that the permuted upper-right-block p-values carry no special weight. The assessment already written was not edited; it is append-only. Because a new assessment was written, the log names `mpi` under `panel:`.
- **A new edition** (`edition-2026-10-26-142844`) is the 2026-10-25 article with three changes: the online-study paragraph (seed and cell wording), and one clause added to the steelman's Flores sentence. The opening is unchanged, because the Paris detail is now carried by the ledger.

Checks: `check-quotes` 8 records, 21 passages, 0 failures; `npm test` 283 passed; `npm run build` succeeded.

One procedural note. I stamped before adding the source's DOI URL and fixing E004's locator, which the quote check then asked for. So the stamped edition and assessment record a ledger hash one step behind the final ledger: the difference is that URL field and that locator string. My permissions refused undoing and restamping (`git checkout`, `mv`). As far as I can find in the code, nothing displays or gates on a draft's or edition's ledger hash beyond the rule for rejected claims (`load.ts:379`), and no claim is rejected here. The panel convened on this case will judge the final ledger. A later session that re-tells the case will rebind it.

## Answer to the review

**Harm (GPT-5.6 Sol, living_person): "In July 2019, at a conference in Paris" stated without a ledger record.** Fixed, by verification rather than deletion. Grote 2021 states the venue and date in its own words: "unblinded live during a presentation at the PA convention in Paris on July 6, 2019" (p. 12). MPI-E004 now quotes that sentence, and the quote check finds it. The opening sentence is now supported by the ledger and stands. The statement is about Grote's own published account of his own public presentation.

**Note (GPT-5.6 Sol): MPI-E023 and the online-study paragraph should limit the independence point to the power analysis unless the Welch test's unit is established, and distinguish suspected dependence from demonstrated error.** Taken. The paper does establish the Welch test's unit: it compares "the distribution of correlations derived from experimental and control sessions" (p. 9), so the cells are its observations. The paper never discusses their independence, and I have not shown that dependence changes the result. MPI-E023, MPI-R006, the assessment and the article now say exactly that, and call it a suspected weakness, not yet shown to matter. The article mentions only the power analysis, as the reviewer suggested.

**Note (GPT-5.6 Sol): MPI-E022, MPI-C503 and the article should say the Mersenne Twister stays deterministic given its seed, and that swipe seeding creates causal linkage, not proven dependence.** Taken in MPI-E022, the MPI-C503 reasoning and the article ("deterministic once seeded … its sequence was not fixed before the session … though that alone does not show that its output tracked what the player did"). The stronger point, that the split depends on the analysis, stays the lead. I left the claim statement of MPI-C503 as it is: it already calls the generator a deterministic pseudo-random generator, which is accurate in the reviewer's sense.

**Note (GPT-5.6 Sol; GLM 5.3 Flash): three seats said contradicted against the draft's weakly supported, so the standing should be marked contested.** Declined, with the reason. On the graded scale in AGENTS.md §3.15 (implemented in `src/domain/standing.ts:431–454`), contradicted and weakly supported are adjacent steps (1 and 2). A seat one step away concurs, so five of five seats concur, which is what `status` reports ("ratified (5 of 5)"). The constitution's remedy for neighbouring words is display, not a contested label: "every seat's own word is displayed beside the standing, neighbours included". The case page's standing panel does this; `src/components/StandingPanel.tsx` prints each seat's verdict word beside its relation to the draft. The reviewers are right that the split leans toward contradicted, and the assessment's sensitivity line already says the thesis would fall to contradicted if the in-house positives were set aside. The scale and its display are the founder's to change, not mine. The panel convened on this case after this session will judge again.

**Note (Gemini, Grok, GLM): verify Grote 2021 for the Paris detail.** Done (above).

**Note (GLM 5.3 Flash): the steelman's "stayed significant under her stricter analysis" is stronger than MPI-E018's own limitation.** Taken. The article now adds "though her thesis reports, with some sympathy, the objection that one part of that analysis carries no special weight". The same clause is added in the assessment's steelman and in the MPI-C002 and MPI-C008 objections.

**Note (Gemini): read Walach et al. 2020 in full to check whether it was preregistered.** Not done this session, because this session is limited to answering the round. It remains queued for the next session on this case. The assessment already says "no preregistration is recorded" rather than that there was none.

**Note (Gemini; Grok): repair the PDF-extraction limits (letter-spacing, the dropped "fi"/"fl" ligatures) and the two older 2023-PDF quotes that break on the ligature (MPI-C503's anchor, MPI-E008).** Not done. This is engine work, and `src/engine/quotecheck.ts` is a founder's file. The founder should know that the quote check passes only on records it re-checks; the unchanged MPI-C503 anchor and MPI-E008 were not re-checked this session. Their wording is on record as quoting text whose "fi" the text layer drops ("signi cant"). For the next engine session: a ligature map in the reading tool's normaliser (not in the check's rule) would let these pass without weakening anything.

**Note (Grok): identify and read the Lucadou 2016 source behind MPI-E019.** Not done this session, for the same scope reason. MPI-E019 already says it is second-hand. Queued.

## What the next session should do

- Read Walach et al. 2020 (DOI 10.1037/cns0000199) for a preregistration statement, and find and read Lucadou 2016.
- Read the rest of Grote 2021 for MPI-E004 beyond the two quoted passages.
- The image caption on IMG-MPI-P01 still reports the 2023 true-versus-pseudo split as the abstract gives it, "a null with a deterministic pseudo-random one". That is accurate as a report but now reads short beside the article. Re-word it when the case is next re-told. It was not in #471 and was not raised, so it was left.
- The founder may wish to look at the ligature handling noted above.
