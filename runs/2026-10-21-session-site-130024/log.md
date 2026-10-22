---
runId: 2026-10-21-session-site-130024
title: "Zero Worlds: the Wolfram program's formal quantum paper calls its derivation a conjecture, and the McQueen–Müller exchange is read in full"
cases: [zero-worlds]
panel: [zero-worlds]
---

## What I did and why

Nothing from the reviewers was waiting this session, and the founder's inbox was empty. Two cases had never been worked since they were built (`mpi` and `zero-worlds`). I chose Zero Worlds because the panel splits on one of its claims, ZW-C007, Wolfram's observer theory. The draft graded it *mixed*; four of five seats graded it *well supported*. That is where new evidence matters most. Several of the case's evidence records also characterized primary texts from their abstracts only.

## What I found

**The Wolfram program has a formal quantum paper the case had missed.** The case said the program's formal quantum results "demonstrate embedding rather than inevitability," and it cited only the ZX-calculus embedding preprint. Jonathan Gorard's "Some Quantum Mechanical Properties of the Wolfram Model" (Complex Systems 29(2), 2020, 62 pages) goes further. Its abstract claims a proof "that the geometry of the multiway evolution graph converges to that of complex projective Hilbert space in the continuum limit", and it lists derivations of the path integral and the discrete Schrödinger equation. I read the full PDF where it concerns the benchmarks this case uses. On those it falls short:
- it states "our central conjecture in this paper is that discrete forms of quantum mechanics" (and QFT) follow from multiway invariance (p. 29);
- it introduces branch states as a basis "By assumption" (p. 16) and probabilities as "given by the multiway Born rule for evolution path weights" (p. 17);
- it gets CHSH violation "in much the same way as one does for other standard deterministic and nonlocal interpretations" (p. 52), and it derives no Tsirelson cap.

Its observer is a chosen foliation of the graph, not the "computationally bounded, believes it persists" observer of Wolfram's essays. **Provenance:** the author's affiliations are Cambridge and Wolfram Research. The journal's own About page says it "was founded by Stephen Wolfram in 1987". Both facts are recorded on the source.

So the split on ZW-C007 resolves as follows. The claim reports accurately what Wolfram asserts and concedes. Its substance holds: no demonstrated inevitability. One clause understated the record: there is more than an embedding. I regraded C007 *well supported* (moderate) and said in its reasoning that the earlier *mixed* grade judged the program rather than the report. I also added a new featured observation claim, **ZW-C505**, which states precisely what the formal paper does and does not do.

**Müller's peer-reviewed paper, in his own words.** ZW-E002 had characterized Müller's 2026 *Foundations of Physics* paper from its abstract, because Springer's page was walled. The reading tool reaches the open arXiv copy (2412.02826v2) through the DOI. Its conclusions (pp. 28–29) name "two main open technical problems": forgetting, and predicting "phenomenal aspects of Quantum Theory". They also say "it is not enough to point at mathematical elements" that resemble quantum theory, and "it would be methodologically wrong to build the quantum formalism into algorithmic idealism by construction." The proponent thus sets, in a refereed paper, the same bar the case borrows from Spekkens. This is now ZW-E023, carrying C002, C502 and C504.

**The McQueen–Müller adversarial collaboration, read in full.** The case had cited it from its abstract as context only. The two authors jointly record "two valid objections":
- (O1) the framework "cannot (yet) appeal to scientific practice and experimental pragmatism", because its probabilities cannot be related to repeated, intersubjectively analyzed experiments. This is ZW-E021, supporting C503 and making C008's *presently untestable* concrete.
- (O2) its Boltzmann-brain resolution has to handle the parts of a self-state the agent cannot access. Müller calls his reply "valid intuition, but not the exact technical arguments". This is ZW-E022, which *qualifies* C004's "standard puzzles dissolve" clause.

The emergence theorems are not challenged. Funding (FQXi; Fetzer Franklin Fund; Perimeter) is recorded from the acknowledgments.

## What I wrote

- **Source:** SRC-GORARD-2020-QM (read in full; DOI resolves; independence note). Verification notes were updated on SRC-MULLER-2026 (the text read is the arXiv v2 open copy) and SRC-MCQUEEN-MULLER-2026 (full text read; funding).
- **Evidence:** ZW-E020 to E023, each quoting its source with page locators. The quote check passes: 5 records, 26 passages, 0 failures.
- **Claim:** ZW-C505 (observation rung, child of C007), anchored by a quote.
- **Research:** ZW-R007, an outside audit of the multiway quantum results. Does multiway invariance with a bounded, persistent observer force the Born form and the Tsirelson cap, or can it host other rules and stronger-than-quantum correlations?
- **Dispositions:** Gorard 2020 admitted; Sienicki's August 2026 revised reassessment of Müller (arXiv 2412.20485v2) excluded for now. It is a secondary review whose abstract restates the primary sources already in the ledger. I read only its abstract and contents, and the row says so.
- **Assessment** 2026-10-21-operator-131026. The case verdict stays *presently untestable*. C007 moves *mixed → well supported* (moderate). C505 is new: *well supported* (moderate; the Tsirelson clause rests on a full-text search, and the convergence proof was not audited). C004 stays *well supported*, but its reasoning now flags the contested Boltzmann-brain clause. The reasoning for C002, C005, C008, C009 and C010 cites the new records. The migrated header was over the reader's budget (whatIsClaimed was about 140 words) and is restated within it. A steelman is added (the migration had none).
- **Edition** edition-2026-10-21-131026: one paragraph on Müller setting his own test; the Wolfram passage rewritten around the Gorard paper; a new section on the McQueen–Müller exchange; and small changes to the steelman, crux and closing. The verdict and the article's structure are otherwise unchanged. 1,452 → 1,922 words.

## What I could not reach or did not do

- **I did not audit Gorard's convergence proof.** I searched the 62-page text for the Born rule, CHSH, Tsirelson, "conjecture" and "assumption", and read those passages. C505's "without deriving the Tsirelson bound" rests on that search finding no derivation.
- Gorard & Dannemann-Freitag 2023 (axiomatic QFT in multiway causal structure) appeared in search but was not read. A later session should check whether it, or anything later, derives the Born form or a correlation cap.
- One search found no 2025–26 Hoffman paper deriving quantum theory. That search was thin: it did not cover arXiv or Hoffman's publication page.
- I did not re-read the Jones & Müller (ZW-E004) or Müller 2020 (ZW-E001) full texts. Both records still paraphrase from abstracts, and should be quoted next.
- ZW-E002 still says the Springer text was not retrieved. That was true of its run, and ZW-E023 now carries the paper's words. I left the older record as it was rather than rewrite it.

## A need in the engine (for the founder)

The quote check reads only the first page range in a locator (`locatorPages` in `src/engine/quotecheck.ts`, a founder's file). An evidence record quoting pp. 1, 16–17, 29 and 51–52 fails unless its locator opens with a covering range. I wrote "PDF pp. 1–52, at p. 1 (abstract), 16–17 …", which is honest, and the per-quote pages are given in the sourceStatement. A check that verified each listed range would be tighter. I did not change it.

## What the next session should do

- Let the panel judge the new assessment. If seats still split on C007 or C505, the split is the next crux.
- Quote ZW-E001 (Müller 2020, Quantum, open access) and ZW-E004 (Jones & Müller, Quantum, open access) from their full texts.
- Look for responses to McQueen–Müller and for later formal Wolfram-model quantum work.
- The `mpi` case has also never been worked.

## Checks

`site.ts check-quotes`: 5 records, 26 passages, 0 failures. `npm test`: 283 passed. `npm run build`: succeeded. `site.ts stamp zero-worlds`: stamped, no budget errors.

Spend at the time of writing: about $3.60 of the $10 cap.
