# Report: one rule for a claim with no evidence (runs of 2026-10-03)

The design is in `DESIGN.md`, on main since #456 (merged 2026-09-30 at
13:58 UTC) and not changed since. The sixteen runs were made on 2026-10-03
between 11:47 and 12:24 UTC, alternating the arms on each case as the
design sets, Cast, Not Carved first. This file was written after the last
run. Every figure in it is printed by `analyse.mts` from the seats' raw
replies under `runs/`.

## Result

**By the rule the design set, the draft is not adopted.** Two of its three
conditions are met, and the third fails on one sentence in one run.

| Condition | Required | Found | |
|---|---|---|---|
| (a) Measure 1 in arm B | at least 90% pooled, at least 75% for each seat | 223 of 224 (100%); OpenAI 100%, Google 100%, xAI 98%, Z.ai 100% | met |
| (b) Measure 3 | arm B no worse than arm A by more than one claim a run on any case | fewer splits in arm B on every case | met |
| (c) Measure 5 | neither fault in the Google seat's reasoning in both arm-B runs on Cast, Not Carved | one fault in one run | **not met** |

The design says what follows. The two paragraphs were tested together and
are adopted together or not at all, so that a stamp names the text a seat
was given. The first paragraph met its measures, and a draft that carries
it without the second as written is a new experiment. The name `check-v4`
is spent, as `check-v3` was, and a test holds it.

## The measures

**1. Unresolved, or a basis named**, on featured claims with no evidence
record. Of every seat verdict on such a claim, the share that is
`unresolved` or whose reasoning names its basis (a record with a claim it
is attached to, or a prior called one):

| Seat | Arm S (published panels, three cases) | Arm A (`check-v2`) | Arm B (draft) |
|---|---|---|---|
| OpenAI | 17 of 25 | 31 of 56 | 56 of 56 |
| Google | 11 of 25 | 20 of 56 | 56 of 56 |
| xAI | 18 of 25 | 26 of 56 | 55 of 56 |
| Z.ai | 13 of 25 | 20 of 56 | 56 of 56 |
| **All** | 59 of 100 (59%) | 97 of 224 (43%) | **223 of 224 (100%)** |

**2. Splits on claims with no evidence record**, and **3. on claims with
one**: the claims on which fewer than a strict majority of the four seats
are within one step of the judgment, over each arm's two runs on a case.

| Case | Measure 2, arm A | arm B | Measure 3, arm A | arm B |
|---|---|---|---|---|
| Cast, Not Carved (3 and 21 claims) | 3, 3 | 2, 2 | 2, 3 | 2, 2 |
| Deep Memory (13 and 12) | 8, 8 | 7, 7 | 2, 2 | 0, 0 |
| The Emptied Amazon (7 and 20) | 6, 6 | 0, 1 | 1, 1 | 1, 0 |
| Before Sputnik (5 and 19) | 3, 2 | 0, 0 | 2, 1 | 0, 0 |
| **All** | **39 of 56** | **19 of 56** | **14 of 144** | **5 of 144** |

Measure 2 is reported and is not part of the rule. The splits on claims
with no evidence record fell by half, and on two cases they all but
vanished. On Deep Memory they barely moved, and they changed direction.
Under the current protocol most seats that differed from the judgment on
such a claim graded it higher (14 verdicts above, 10 below, in one run).
Under the draft every seat that differs grades it lower (22 below and none
above in one run, 28 and none in the other): `unresolved`, where the
judgment says provisionally supported on a prior its reasoning states as
one ("Support rests on a disclosed prior", on DEEP-C002). Both protocols
allow a stated prior as a basis. Deep Memory's judgment leans on it for
seven such claims; the seats under the draft did not. What divides them
there is how far a stated prior may carry a claim, not which rule applies.

**4. Citations.** Of the evidence records named in claim reasonings, those
the ledger does not attach to the claim being graded, and of those, the
ones whose reasoning names no claim the record is attached to: in arm A,
199 of 790 and then 191 of those 199 (96%); in arm B, 377 of 1,398 and then
127 of those 377 (34%). Under the draft the seats cite more, and mostly say
where what they cite belongs.

**5. The Google seat on Cast, Not Carved**, read by hand. Its reasoning on
GEO-C502 and GEO-C010 in each run is printed whole by `analyse.mts`; the
sentences that decide the measure are these.

- Arm A, run `…-114700`. GEO-C502: "Engelbach's 1922 monograph on the Aswan
  obelisk explicitly details his brief one-hour manual trial … (GEO-E002)."
  GEO-C010: "… (GEO-E010, GEO-E016)." **Both faults.**
- Arm A, run `…-115134`. GEO-C502: "Engelbach's 1922 monograph explicitly
  details that his experimental quarrying rate was derived from a single
  one-hour trial …" **The first fault**; GEO-C010 cites no record.
- Arm B, run `…-114914`. GEO-C502 is graded unresolved, and the reasoning
  names the claims GEO-E002 is attached to; then: "The strongest opposing
  consideration is that secondary discussions and Engelbach's published
  text consistently corroborate that his primary experimental trial lasted
  approximately one hour." That gives as the monograph's content what
  GEO-E002 marks as unchecked against it. **The first fault.** GEO-C010
  cites GEO-E016 alone.
- Arm B, run `…-115331`. GEO-C502 is graded unresolved, and the reasoning
  names the claims GEO-E002 is attached to; its last sentence attributes
  the account to "historical summaries of Engelbach (1922)", not to the
  monograph. GEO-C010 cites GEO-E016 alone. **Neither fault.**

Under the draft the seat no longer cites the natron study for furnace
temperatures, and no longer grades the Engelbach claim on GEO-E002. In one
of two runs it still states what the monograph says, as an aside. The
condition was set at both runs clean, and it is not met.

**6. Case verdicts.** Seat case verdicts more than one step from the
judgment: four in arm A (the Google seat on Cast, Not Carved twice and on
Deep Memory once, the xAI seat on Cast, Not Carved once); two in arm B (the
Google seat on Cast, Not Carved, in both runs).

**7. The two words.** Of seat verdicts more than one step from the
judgment, "weakly supported" against "provisionally supported" is 34 of 178
in arm A and 24 of 116 in arm B. A seat against itself, over its two runs on
a case: its answers are more than one step apart on 33 claims in arm A and
36 in arm B, and the two words are the whole of the distance on 11 and 10 of
those. On four cases the pair is a minority of either distance, so this does
not reopen the question the decisions entry of 2026-09-30 closed.

## What it shows

- Telling a seat the rule the judgment is held to, with the claims it
  applies to named, works on every seat: on claims with no evidence record,
  the seats either grade unresolved or say what they lean on, without
  exception. The split rate on those claims halves, and the split rate on
  claims with evidence falls too.
- The allowance for a stated prior is not read alike. Deep Memory's
  judgment grades seven claims with no evidence record provisionally
  supported on stated priors; under the draft the seats grade the same
  claims unresolved.
- Asking a seat to say where a cited record belongs works on most of what
  they cite.
- Asking a seat not to give a record's unchecked account as the source's
  own does not reliably hold on the one seat that has done it, in the one
  place it has done it.

## What it does not show

- Anything about the Anthropic seat, which was left out for cost.
- Whether the draft's effect lasts. Two runs an arm on four cases is a
  small sample; the differences in measures 1, 2 and 4 are far larger than
  the run-to-run noise the experiment on verdict definitions found, and the
  difference in measure 3 is a few claims.
- That a lower split rate is a better standing. It is a judgment and a
  panel held to one rule. Where seats now name the basis of a higher grade,
  the reconsideration or the answer step has a record to act on.

## The ledgers the runs judged

Each run record carries the hash of the case file its seats were sent, and
`analyse.mts` checks it against the tree. Each case's runs share one: Cast,
Not Carved `c64f75bb…`, Deep Memory `af4a4eb0…`, The Emptied Amazon
`fa605757…`, Before Sputnik `71947173…`. Cast, Not Carved was run before
#452 was answered, as the design required; its ledger on main is still the
one these runs judged.

## Cost and records

Sixteen runs, 65 paid calls, $7.37. One reply needed the verb's repair
round: the Z.ai seat's in run `…-deep-memory-115801`. Each run's record and
raw replies are under `runs/`, as the verb wrote them; `runs/README.md`
says what was removed and why. The spend rows are in `governance/spend/`.
