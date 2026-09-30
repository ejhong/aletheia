# Do written definitions of the verdict words make a seat agree with itself? (2026-09-30)

Written before any run of this experiment. The results are in `REPORT.md`
beside this file; this file is not edited after the first run starts.

## Why

The blind check gives a seat eight verdict tokens and no definition of any
of them (protocols/check-v2.md). On 2026-09-28 a fault in the scheduler
asked four seats the identical question three times within half an hour
(runs 2026-09-28-check-deep-memory-140630, -142201, -143733; one ledger,
hash ad0e0e11…). Each seat gave the same word all three times on only 12 to
15 of 25 claims, and one seat's case verdict read contradicted, weakly
supported, contradicted. A standing derived from one such answer per seat
inherits that noise.

One candidate cause is the vocabulary itself. "Weakly supported" sits one
step *below* "unresolved" on the constitution's scale (AGENTS.md §3.15),
and nothing tells a seat so: it can be read as "supported, a little" or as
"argued for, and the argument does not carry it". "Mixed" can be read as
"uncertain".

## The question

Does giving each seat a one-sentence definition of each verdict word, in
the scale's order, raise the rate at which a seat gives the same verdict
to the same claim when asked the same question again?

## Design

- **Case and ledger.** Deep Memory, the ledger as it stands on main (the
  same ledger the runs of 2026-09-28 judged; the run records carry its
  hash, and the report states whether it is unchanged).
- **Seats.** The four that answered on 2026-09-28: OpenAI, Google, xAI,
  Z.ai (via Venice), as the roster names them. The Anthropic seat is left
  out for cost: at its pinned effort one check of this ledger cost $2.33,
  against about $0.40 for the other four together.
- **Arms.** A: `check-v2`, unchanged. B: `check-v3-draft`, which is v2 with
  the definitions added after the vocabulary line and nothing else changed
  (the file is beside this one).
- **Runs.** Three per arm, today, alternating A, B, A, B, A, B, so that
  neither arm is systematically earlier. Each run asks the four seats at
  once, as the check verb does, with its one repair round. The three runs
  of 2026-09-28 are reported beside arm A as an earlier sample of the same
  arm; they are not pooled with it.
- **Nothing is installed.** The runs are made in a separate working tree.
  Their assessments are analysed and not committed to the case; their run
  records and spend rows are committed, because the money is spent.

## Measures (per seat, over the 25 featured claims)

1. **Exact self-agreement**: the share of claims on which the seat's three
   verdicts in an arm are the same word.
2. **Self-agreement within one step**: the share of claims on which the
   seat's three verdicts in an arm lie within one step of each other on the
   constitution's scale (src/domain/standing.ts, `withinOneStep`).
3. **Case verdict**: whether the seat's three case verdicts in an arm are
   the same word.

Across seats, per arm:

4. **Panel agreement**: over all pairs of seats and all claims, using each
   seat's first run in the arm, the share of pairs within one step.

## What would count

- The definitions are **adopted** into the check protocol, and the same
  sentences into the edition protocol, if measure 1 is higher in arm B than
  in arm A for at least three of the four seats, and measure 2 is not lower
  in arm B for any seat by more than one claim (4 percentage points).
- Otherwise they are **not adopted**, and the report says what the noise
  does track, as far as these runs show.

Three runs per arm on one case is a small sample. Whatever the outcome, the
report states it as that: a difference of one or two claims in 25 is within
what this design can produce by chance, and is called so.

## Cost

Six runs of four seats: about $2.50 at the rates of 2026-09-28. Every call
goes through the metered transport and is on the spend ledger.
