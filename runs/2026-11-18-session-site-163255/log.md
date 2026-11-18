---
runId: 2026-11-18-session-site-163255
title: "Collapse, Not Computation: the XENONnT and LISA Pathfinder bounds get their evidence, the microtubule-drug claim is split by direction, and a new judgment and edition follow"
cases: [orch-or]
panel: [orch-or]
---

## What I chose and why

No change of mine was held and the inbox was empty. The last session (2026-11-17-session-site-165722) stopped partway through Orch-OR: it added the XENONnT source and claim, but not their evidence, the claim split it planned, or a new edition. Orch-OR was also the case left longest (49 days) and the only one unratified. This session finishes that work. It uses no new searches: every passage quoted below comes from sources the reading tool already held, re-read today.

## What changed in the ledger

**The panel's two splits:**

- **ORCH-C012** (microtubule drugs change anesthetic sensitivity). Every blind seat graded it well supported; the draft graded it mixed, because the draft was really grading the *direction* of the change. I split it. The new claim **ORCH-C126** says the direction follows the drug's effect on stability, with stabilizers giving resistance. ORCH-C012 is now graded on its wording: well supported, importance lowered to supporting, diagnosticity low. The evidence records that show the direction (ORCH-E009, E011, E012 and E013) now also cite ORCH-C126.
- **ORCH-C046** (the LISA Pathfinder bound). It was unresolved only because no evidence record was attached. **ORCH-E125** quotes Helou et al. 2017 for the bound and for its method, which attributes all acceleration noise to collapse. The claim is now well supported.

**New evidence:**

- **ORCH-E126**: the XENONnT null and its bound (ORCH-C125), with a 0.2σ local significance and about five times the Majorana limit. The limitations note that two of its theorists also wrote the Gran Sasso analysis, so the three underground nulls share their theory input.
- **ORCH-E127**: XENONnT's own statement of scope, on ORCH-C030. It tested only white-noise models, leaves coloured and dissipative variants open, and uses Diósi's rate convention, which differs from Penrose's by 8π. Direction: qualifies.
- **ORCH-E128**: Emerson et al. 2013 report that propofol and isoflurane promote tubulin polymerization in vitro, "much like taxol". The authors conclude that anesthetics "may destabilize in either direction". Undermines ORCH-C126.
- **ORCH-E129**: Khan et al. 2024's published peer review. The authors agree they "haven't shown destabilization", adopt the reviewer's binding-pocket reading, and revise "all references to stability disruption". Qualifies ORCH-C126 and ORCH-C002.
- **ORCH-E130**: Li et al. 2025, where paclitaxel gave "a marginal but significant rightward shift" and only epothilone D among the epothilones crosses the blood–brain barrier. Weakly supports ORCH-C126; it gives a balancing point beside ORCH-E013.

**History:** `history.yaml` now has the entry the last session did not write (its source, claim and address changes) and one for this session's records.

## The judgment (assessment 2026-11-18-operator-164426)

- Case verdict unchanged: **unresolved**. The load-bearing claims and weakest links are also unchanged.
- **ORCH-C126: mixed.** Most stabilizer results point toward resistance. But the best-designed independent study points the other way, the main supporting study's authors dropped the stability reading, and in vitro the anesthetics act like stabilizers.
- **ORCH-C046: unresolved → well supported. ORCH-C125: well supported** (new featured claim).
- ORCH-C030 stays unresolved, now with ORCH-E127 in its reasoning.
- Component notes for anesthesia and collapse physics are updated. The synthesis's sensitivity line now points at ORCH-C126.

## The telling

I stamped two editions today, and the second replaces the first:

- **edition-2026-11-18-164426** carried the new judgment, but came out at 2,978 words.
- **edition-2026-11-18-164735** re-adopts the same assessment, told in 2,580 words. My permissions in this session do not allow deleting a stamped file, so I wrote a second edition rather than removing the first.

Changes from the 2026-09-30 article:

- The opening says the underground results ruled out the parameter-free version, not Penrose's lifetime rule (GPT-5.6 Sol's note on the last comparison).
- The xenon search is told in the physics section, and LISA Pathfinder is told as a finding.
- The anesthesia section separates "sensitivity changes" from "the direction follows stability" and tells both concessions.
- The essay cited in the Gödel section is named by its author, Eugene Jhong, instead of "the case editor's own essay" (notes from GPT-5.6 Sol and Gemini). The source record calls it the case editor's essay; I said only that he started this case.
- "What would settle it" now says what a negative result from the controls would mean (Opus's note).

## Checks

- `check-quotes --fresh`: 6 records, 14 passages, 0 failures.
- `npm test`: 297 passed.
- `npm run build`: passed.
- `status`: loads every case.

The quote check reads only a locator's first page range, so for the two XENONnT records that quote several pages I gave a covering range ("pp. 2–5", "pp. 2–8") and named each page in words. That is the limitation a reviewer raised on #468. The founder may want the checker to accept a list of pages.

## Set aside

- Grading ORCH-C126 weakly supported on the count of results (four in its favour, one against). Count is not weight: the one against is the only independent, blinded, full-curve study, and the supporting side's mechanism has weakened from both directions.
- Attaching ORCH-E128 (in-vitro polymerization) to ORCH-C011. It bears on why a drug would shift sensitivity in one direction, not on whether anesthetics bind tubulin.

## Not reached

- The Huang et al. 2026 full text, to see whether the mouse paper keeps the stability reading the rat paper dropped. ORCH-E129's limitations say so.
- The desk calculation ORCH-R013 (is the Tilloy–Diósi dynamics already excluded?). It is the cheapest remaining physics task, and it now has a xenon bound to use.
- Supplementary Figure S9 of Emerson 2013, the propofol and isoflurane polymerization data. Only the authors' summary of it was read.

## For the next session

The panel judges this case on the new ledger. If seats split on ORCH-C126, its record is short and every passage is quoted. The Huang full text is the next read.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
