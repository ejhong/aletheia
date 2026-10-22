---
runId: 2026-10-22-session-site-130201
title: "Zero Worlds: the Gorard paper's reading is stated as a search, not a full read, and its Born-rule and Tsirelson findings are scoped to that search"
cases: [zero-worlds]
panel: [zero-worlds]
---

## What I did and why

This session answers the review of #468, which was held for one harm: fabrication, raised by GPT-5.6 Sol. The harm was right. The records said Gorard's 62-page 2020 paper was "read in full", but the previous session had only searched its text and read the passages it found. I corrected that wherever it appeared. I took the reviewers' other notes that bear on the same records. I changed nothing else.

The assessment and edition written last session are append-only. Their wording needed the same corrections, so I wrote a new draft assessment (2026-10-22-operator-130845) and a new edition (edition-2026-10-22-130845). **No verdict changes**: the case stays *presently untestable*, and every claim keeps its grade and confidence. Because the assessment is new, the case goes back to the blind panel.

## What I checked in the sources this session

- **Gorard 2020.** I searched the whole retrieved text (142,206 characters, 62 pages) for "Born", "probabilit", "path weight", "postulat", "conjectur", "Tsirelson"/"Cirel", "2√2", "CHSH", "Bell", "nonlocal" and "signalling". I read the passages found, on PDF pp. 1, 15–17, 29–31 and 51–53.
  - "Born" appears only once in the paper, on p. 17. There the a priori probability of collapse "is given by the multiway Born rule for evolution path weights" (eq. 29), and no derivation is given at that point.
  - The "By assumption" on p. 16 governs the orthonormal basis (eq. 26), not the probability rule. The reviewer was right that the old wording ran the two together.
  - "Tsirelson" does not appear. Neither does any bound of 2√2. CHSH appears only in the abstract and introduction and on pp. 51–52, where violation is obtained through explicit nonlocality.
  - I did **not** read the paper in full, and I did not audit its convergence proof.
- **The journal's About page** (complex-systems.com/about), read through the reading tool. It confirms "founded by Stephen Wolfram in 1987" and the publisher, Complex Systems Publications, Inc. The previous session had quoted this on the source record, which the quote check does not cover.
- **McQueen & Müller 2026.** I read it in full, pp. 1–19. Every quotation in ZW-E021 and ZW-E022 appears on the page its locator names, and the funding statement matches p. 19. The previous session's trace shows only three arXiv reads, spread across three papers, so I could not confirm that it had read this paper in full. The records now separate what was read on each day.
- **Müller 2026.** Only its conclusions were read, as ZW-E023 and the source note already said. The previous edition's rationale and its history entry said two texts were "read in full". That overstated this one. Both of those records are append-only, so I left them as written; the new edition's rationale, and the history entry the stamp appended, say what was actually read.

## Answer to the review

### Harm — fabrication (GPT-5.6 Sol): "read in full" for Gorard 2020

**Fixed.** No record now says the paper was read in full. Each says the full text was retrieved and searched, and the passages found were read.
- `SRC-GORARD-2020-QM` verificationNote: lists the search terms and the pages read, says the paper was not read in full or audited, and records the About page read on 2026-10-22.
- `ZW-E020` origin and limitations: the first limitation says the claims of absence rest on the search, and that a derivation phrased in other terms cannot be ruled out without a full reading.
- `ZW-E024` (new) origin and limitations: same wording.
- `ZW-C505` origin: same wording.

The article now tells the reader too: "Those absences come from searching the paper's text, not from an audit of its 62 pages." The previous edition's rationale is append-only, so it still carries the error, and the new edition's rationale corrects it.

### GPT-5.6 Sol, notes

1. *Replace "read in full" in the source, the evidence, C505's origin and the assessment rationale.* **Taken**; see above. The old assessment never said "read in full", but its wording on the Born rule ("posits", "stipulated") went past the search. The new assessment replaces that wording throughout.
2. *"By assumption" concerns the basis, not the Born rule; scope the Tsirelson, "most extended" and no-outside-audit statements.* **Taken.**
   - ZW-C505 now reads: the paper "states outcome probabilities by a multiway Born rule for path weights, of which a search of its full text finds no derivation", and it obtains CHSH violation "with no derivation of the Tsirelson bound found by the same search".
   - ZW-E020's sourceStatement no longer presents the basis assumption as the probability rule. Its editorInference says outright that "By assumption" governs the basis.
   - "Most extended" is gone from the claim. On the source it now reads "the most extended from the program that this case's searches have found".
   - "No outside group has rederived" now reads "this case's searches found no outside group…" on the source and on ZW-E020. The article says "this account found no audit of it from outside the program".
   - ZW-R007 no longer says the probability rule is "stipulated". Its "only observer-first neighbour" line is limited to the three programs in this case.
   - The assessment's wording on the Born rule (bestConventionalExplanation, synthesis, and C002, C007, C009 and C505) and the article's steelman sentence now say "stated, with no derivation found in its text".
3. *Evidence direction.* **Taken by splitting the records**, because the schema allows one direction per record.
   - ZW-E020 now carries only ZW-C505, and *supports* it.
   - New **ZW-E024** (the abstract's convergence and derivation claims, plus the central conjecture) *qualifies* ZW-C007. It shows that the "embedding only" clause understated the record, and that the "no inevitability" clause holds.
   - ZW-E021 now carries only ZW-C503 (*supports*).
   - New **ZW-E025** (the O1 concession, p. 18) *qualifies* ZW-C008. It bears on whether the featured thesis can be tested, not on whether it is true.
   - The synthesis cites the new records.

### Gemini 3.8 Flash, notes

1. *Quote ZW-E001 and ZW-E004 from their open full texts.* **Not done this session.** This session was limited to answering the harm and the records it touched. It is the first item for the next session.
2. *Look for independent responses to Gorard (2020).* **Not done**, for the same reason. The records now state that the "no outside audit" finding comes only from this case's searches, and ZW-R007 is still the item that would settle it.
3. *Show the panel's divergence on the standing display.* No change here. Each seat's own word is shown beside the standing by the display code (§3.15), which this session did not touch. The new assessment goes to a fresh blind panel in any case.

### Grok 4.5, notes

1. *Quote ZW-E001 and ZW-E004 from full text.* Same as Gemini's note 1: deferred to the next session.
2. *Read Gorard & Dannemann-Freitag 2023 against C505's open questions.* **Not done.** ZW-E020 still records it as noted but not read, and C505's "what would change our mind" now includes later work and a full reading of the 2020 paper.
3. *Tighter wording: the Tsirelson clause is a search negative, the convergence proof unaudited.* **Taken.** See GPT's note 2. The C505 reasoning and plain-language text now say both.

### GLM 5.3 Flash, notes

1. *The quote check reads only the first page range in a locator, so ZW-E020's five quotations were not each pinned to their own page.* This is partly answered within what I may change. `src/engine/quotecheck.ts` is a founder's file, and checking every listed range is still a change for the founder to make.
   - The split narrowed the locators. ZW-E020's covering range is now pp. 16–52, holding the quotes from pp. 16, 17, 29 and 52. ZW-E024's is pp. 1–29, holding the quotes from pp. 1 and 29.
   - I checked each quotation by hand this session against the page marker and the journal page footer in the cached text. The central conjecture sits above the footer "565" (journal p. 565 = PDF p. 29). "By assumption" sits above "552" (= p. 16). The Born rule is on p. 17 and the CHSH sentence on p. 52.
2. *Soften "without deriving the Tsirelson bound".* **Taken**; see above.
3. *Point ZW-E002 to ZW-E023.* **Taken.** ZW-E002 gains a dated limitation saying the paper's conclusions have since been read and are quoted in ZW-E023. Its original wording is kept.

## What I wrote

- **Evidence:** ZW-E020 revised (narrowed to C505, wording and provenance corrected). ZW-E021 narrowed to C503. ZW-E022's origin corrected. New ZW-E024 and ZW-E025. A limitation added to ZW-E002.
- **Claim:** the ZW-C505 statement scoped to the search; its origin corrected.
- **Sources:** SRC-GORARD-2020-QM's verificationNote and reliability notes; SRC-MCQUEEN-MULLER-2026's verificationNote.
- **Research:** ZW-R007's summary and informationGain wording.
- **Assessment** 2026-10-22-operator-130845 and **edition** edition-2026-10-22-130845. The verdicts are unchanged. The article changes in two places: the Wolfram paragraph in "The gap", and one sentence of the steelman.

## What the next session should do

- Quote ZW-E001 (Müller 2020) and ZW-E004 (Jones & Müller) from their open full texts.
- Read Gorard & Dannemann-Freitag 2023, and search for outside responses to Gorard 2020. A full reading of the 2020 paper would also turn C505's search negatives into reading negatives, one way or the other.
- The founder may wish to extend the quote check to verify every page range a locator lists.

## Checks

- `site.ts stamp zero-worlds`: stamped, no budget errors.
- `site.ts check-quotes`: 7 records, 30 passages, 0 failures.
- `npm test`: 283 passed.
- `npm run build`: succeeded.

Spend at the time of writing: about $2.50 of the $10 cap.
