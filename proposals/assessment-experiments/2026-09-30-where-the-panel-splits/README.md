# Where the panels of 2026-09-30 part from the judgments they checked

A description, not an experiment: nothing was run for it and no model was
asked anything. It counts what the seven blind panels published on
2026-09-30 already say, with the site's own functions, to see where a
panel splits from the judgment it checked. The reading of it is in
`docs/DECISIONS.md` under the same date, and what is owed because of it is
in `docs/AUTOMATION.md`, "What is owed".

## What is counted

- **The panels**: each case's current checks made on 2026-09-30
  (`currentChecks` over `latestCheckPerModel`, `src/domain/standing.ts`).
  Cast, Not Carved was judged that day too; its panel is parked (#452) and
  is not on the tree, so it is not counted.
- **The claims**: each case's featured claims, as its current edition
  lists them, against the verdicts of the assessment that edition adopts.
- **An evidence record**: an admitted record that cites the claim — not
  rejected, not provisional — as the edition packet counts it
  (`src/pipeline/packet.ts`).
- **A split**: fewer than a strict majority of the seats within one step
  of the judgment's verdict on the claim (`claimConcurrence`), which is
  the rule the standing uses for a claim the case rests on.
- **A citation**: an evidence record's id in a check's reasoning on a
  claim. It is "not attached" when the ledger does not attach that record
  to that claim, and "unnamed" when the reasoning names none of the claims
  the record is attached to.

## The figures

Taken from main at `35eb721999`, with
`node proposals/assessment-experiments/2026-09-30-where-the-panel-splits/count.mts`.
The script reads the tree it is run on: once a ledger moves, its checks
are no longer current and drop out of the count, so a later tree gives
other figures.

| Case | Seats | Split, of featured claims with an evidence record | Split, of featured claims with none |
|---|---|---|---|
| The Emptied Amazon | 5 | 0 of 20 | 6 of 7 |
| The Aeon Before Ours | 5 | 1 of 19 | 0 of 0 |
| Deep Memory | 5 | 0 of 12 | 7 of 13 |
| Collapse, Not Computation | 4 | 1 of 22 | 1 of 2 |
| The Religion with No Name | 5 | 0 of 14 | 3 of 3 |
| Before Sputnik | 5 | 0 of 19 | 3 of 5 |
| State, Not Scar | 5 | 0 of 20 | 0 of 4 |
| **All** | 34 checks | **2 of 126** | **20 of 34** |

Seat verdicts more than one step from the judgment: 50 of 608 on claims with an evidence record, 75 of 168 on claims with none.

Of the 20 splits on claims with none: on 14 every seat that differs grades the claim higher than the judgment, on 0 every one grades it lower, on 6 seats differ both ways.

| Claim | The judgment | The seats |
|---|---|---|
| AMZ-C019 | unresolved | well_supported, unresolved, unresolved, provisionally_supported, provisionally_supported |
| AMZ-C023 | unresolved | well_supported, weakly_supported, unresolved, well_supported, provisionally_supported |
| AMZ-C020 | unresolved | well_supported, unresolved, unresolved, well_supported, provisionally_supported |
| AMZ-C021 | unresolved | well_supported, unresolved, unresolved, well_supported, provisionally_supported |
| AMZ-C022 | unresolved | well_supported, unresolved, unresolved, well_supported, provisionally_supported |
| AMZ-C029 | unresolved | well_supported, unresolved, unresolved, well_supported, provisionally_supported |
| DEEP-C002 (the case rests on it) | provisionally_supported | well_supported, unresolved, established, established, well_supported |
| DEEP-C034 (the case rests on it) | provisionally_supported | well_supported, unresolved, unresolved, established, provisionally_supported |
| DEEP-C035 | provisionally_supported | established, unresolved, established, established, established |
| DEEP-C026 (the case rests on it) | provisionally_supported | established, unresolved, established, established, well_supported |
| DEEP-C004 | unresolved | well_supported, unresolved, unresolved, provisionally_supported, provisionally_supported |
| DEEP-C065 | provisionally_supported | established, unresolved, established, established, well_supported |
| DEEP-C018 (the case rests on it) | provisionally_supported | well_supported, unresolved, unresolved, established, provisionally_supported |
| ORCH-C046 | unresolved | well_supported, well_supported, well_supported, well_supported |
| TIK-C029 | unresolved | established, unresolved, provisionally_supported, unresolved, provisionally_supported |
| TIK-C033 | weakly_supported | well_supported, provisionally_supported, well_supported, well_supported, provisionally_supported |
| TIK-C034 | unresolved | well_supported, unresolved, well_supported, unresolved, provisionally_supported |
| TRN-C101 (the case rests on it) | unresolved | established, well_supported, well_supported, well_supported, well_supported |
| TRN-C102 | unresolved | provisionally_supported, well_supported, provisionally_supported, provisionally_supported, provisionally_supported |
| TRN-C104 | unresolved | provisionally_supported, provisionally_supported, unresolved, weakly_supported, well_supported |

Evidence records named in the checks' claim reasonings: 465. Not attached to the claim being graded: 115. Of those, in a reasoning that names no claim the record is attached to: 113.

## What it does not show

- Why a seat graded as it did. The counts are of verdicts and of ids in
  reasonings; whether a seat leaned on a neighbouring record or on what it
  knows is read from its words, claim by claim, and was not tallied.
- That the judgment is wrong on these claims, or that the seats are. The
  edition protocol grades a claim with no evidence record `unresolved`
  unless another basis is disclosed; the check protocol has no such rule.
  The count shows where the two part. It does not say which rule is right.
- Anything about noise. One check is one measurement: asked the same
  question three times, a seat gave the same word each time on 10 to 16 of
  a case's 25 claims (the experiment of the same date, in the directory
  beside this one). A split on a claim with an evidence record may be no more than
  that; 20 splits in 34 claims is more than that.
