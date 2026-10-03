# Report: the rule alone, and with a tighter provenance sentence (runs of 2026-10-03)

The design is in `DESIGN.md`, committed and pushed at 12:28:52 UTC on
2026-10-03 (commit `9121443` on the branch `exp/run-rule-for-unevidenced-claims`), before
the first run started at 12:29. The sixteen runs were made between 12:29 and
13:08 UTC, B5 and B6 alternating on each case, Cast, Not Carved first. Every
figure here is printed by `analyse.mts` from the seats' raw replies. The
analysis was run on the tree the runs judged. Cast, Not Carved's ledger
changed on main at 12:37 when #452 merged, and these runs, like the arm-A
runs they are compared with, judged it as it stood before; every run's case
file hash is the same as its arm-A counterpart's.

## Result

**By the rule the design set, neither draft is adopted.**

| Condition | `check-v6` (B6) | `check-v5` (B5) |
|---|---|---|
| (a) Measure 1: at least 90% pooled, 75% per seat | 210 of 211; met | 223 of 224; met |
| (b) Measure 3: no case worse than arm A by more than one claim a run | met (Before Sputnik exactly one worse) | **not met**: Deep Memory 4.5 a run against 2 |
| (c) Measure 5: the Google seat clean in both runs on Cast, Not Carved | **not met**: one fault in one run | not a condition for B5 |

`check-v6` fails (c), and `check-v5` fails (b), so neither is adopted. The
names `check-v5` and `check-v6` are spent, as `check-v3` and `check-v4` are,
and the test that holds spent names holds them too.

## The measures

**1. Unresolved, or a basis named**, on claims with no evidence record: arm
A 97 of 224 (43%); B5 223 of 224; B6 210 of 211 (one B6 run had three seats,
below). Every seat in both drafts is at 98% or above.

**2 and 3. Splits**, over each arm's two runs on a case:

| Case | M2 A | M2 B5 | M2 B6 | M3 A | M3 B5 | M3 B6 |
|---|---|---|---|---|---|---|
| Cast, Not Carved (3; 21 claims) | 3, 3 | 2, 2 | 2, 2 | 2, 3 | 2, 2 | 3, 2 |
| Deep Memory (13; 12) | 8, 8 | 7, 7 | 7, 7 | 2, 2 | **4, 5** | 5, 0 |
| The Emptied Amazon (7; 20) | 6, 6 | 0, 1 | 1, 1 | 1, 1 | 2, 1 | 0, 0 |
| Before Sputnik (5; 19) | 3, 2 | 0, 0 | 1, 1 | 2, 1 | 1, 0 | 2, 3 |
| **All** | 39 of 56 | 19 of 56 | 22 of 56 | 14 of 144 | 17 of 144 | 15 of 144 |

The splits on claims with no evidence record fall by about half under both
drafts, as they did under the draft of the experiment before. Measure 3,
which guards claims that have evidence, moves around run to run: Deep
Memory's splits on its twelve evidenced claims were 0 and 0 under the
earlier draft, 4 and 5 under B5 and 5 and 0 under B6, against 2 and 2 under
`check-v2`. The three drafts share the first paragraph word for word, and
over their six runs on Deep Memory the mean is 2.3 against 2. Pooling is not
the rule, and the rule is applied as written: B5 fails (b).

**4. Citations.** Records cited off their claim without naming a claim they
are attached to: arm A 191 of 199 (96%); B5 101 of 307 (33%); B6 109 of 355
(31%). B5 has no provenance paragraph and still names the attachment for
two thirds: the first paragraph asks for a record to be named "together
with the claim it is attached to", and that is enough.

**5. The Google seat on Cast, Not Carved**, read by hand (all its words are
printed by `analyse.mts`):

- B6, run `…-123233`: GEO-C502 is unresolved, and the reasoning says the
  details "derive from Fóti's secondary summary and remain unverified
  against the primary 1922 text". It then closes: "The strongest opposing
  consideration is that GEO-E002 explicitly confirms Engelbach (1922) as
  the origin of the brief one-hour working trial." That is the overstatement
  the gate parked #452 for ("GEO-E002 confirms that Engelbach's monograph
  contained a brief personal pounding trial"): the first fault. GEO-C010
  cites GEO-E016 alone.
- B6, run `…-123852`: GEO-C502 unresolved, with the record's limitation
  carried whole; GEO-C010 cites GEO-E016 alone. Neither fault.
- B5 (not a condition): in both runs GEO-C502 is unresolved and GEO-C010
  cites GEO-E016 alone, but each run states in an aside what the monograph
  contains: "the specific experimental setup and workforce heuristics
  described in Engelbach's 1922 monograph"; "a public, verifiable historical
  document whose text directly contains the described passage".

The sentence added in B6, that what a seat knows of a source from outside
the ledger is a prior and is never written as what the source says, did not
stop the overstatement in one run of two.

**6. Case verdicts** more than one step from the judgment: arm A four; B5
four (the Google seat on Cast, Not Carved twice and on Deep Memory once, the
xAI seat on Cast, Not Carved once); B6 three (the Google seat on Cast, Not
Carved once and on Before Sputnik twice).

**7. The two words**: of the seat verdicts more than one step from the
judgment, 34 of 178 under `check-v2`, 34 of 133 under B5, 35 of 137 under
B6. A seat against itself: its answers are more than one step apart on 33,
32 and 36 claims, and the two words are the whole of the distance on 11, 19
and 20 of those. By case (claims where the pair is the whole of the
distance, of the claims where a seat's answers are more than one step
apart):

| Case | `check-v2` | B5 | B6 |
|---|---|---|---|
| Cast, Not Carved | 1 of 4 | 0 of 6 | 5 of 13 |
| Deep Memory | 4 of 20 | 15 of 16 | 12 of 13 |
| The Emptied Amazon | 1 of 3 | 1 of 6 | 0 of 3 |
| Before Sputnik | 5 of 6 | 3 of 4 | 3 of 7 |

The entry of 2026-09-30 set the condition for reopening the question of
those two words as "most of it on more than one case". Under `check-v2`,
the protocol in use, it is most of it on one case (Before Sputnik), so the
condition is not met. Under the rule-alone draft it would be met, on Deep
Memory and Before Sputnik: if the rule is adopted, the question comes back
with it.

## What the two experiments show together

- **The rule works, every time.** Three drafts carry the first paragraph
  word for word. Under every one, every seat grades a claim with no
  evidence record unresolved or names its basis (98 to 100%, against 43%),
  and the splits on those claims fall by about half.
- **The guard is too noisy at two runs a case to decide the question.**
  Deep Memory's twelve evidenced claims swing from 0 to 5 splits a run under
  the same paragraph. A design that can answer whether the rule costs
  anything on claims with evidence needs more runs, and the control run
  alongside.
- **No sentence tried has stopped the Google seat from writing what a
  source says that the ledger has not checked**, in one run of two, on the
  one case where a record invites it. On Cast, Not Carved the record that
  invited it, GEO-E002, has been refused (#452), which removes the occasion
  there. The gate caught it each time it was published.

## Cost and records

Sixteen runs, 68 paid calls, $7.29. The Z.ai seat's reply needed the repair
round in four runs. The xAI seat failed in run `…-deep-memory-124727`
("empty reply"), so that run has three seats; B6's measure 1 is over 211
verdicts, not 224, and that run's splits are over three seats. Each run's
record and raw replies are under `runs/`; the spend rows are in
`governance/spend/`.
