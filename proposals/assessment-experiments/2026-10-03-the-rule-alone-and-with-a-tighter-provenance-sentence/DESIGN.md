# The rule alone, and the rule with a tighter provenance sentence (designed 2026-10-03)

Written before any run of this experiment, on 2026-10-03, after the report
of the experiment before it (`../2026-09-30-a-rule-for-claims-with-no-evidence/REPORT.md`)
and before #452 is merged. It is not edited after its first run starts.

## Why

The experiment before this one tested a check protocol that added two
paragraphs to `check-v2`. The first gave the seats the edition protocol's
rule for a claim no admitted evidence record cites, with the claims named.
It met its measures: every seat graded such claims `unresolved` or named
its basis (223 of 224 verdicts), the splits on such claims halved, and the
splits on claims with evidence fell. The second asked a seat to say which
claim a cited record is attached to and to carry a record's limitation. It
mostly worked, but in one of two runs the Google seat still wrote, as an
aside, what Engelbach's monograph says, which the ledger had not checked.
The rule of that design adopted both paragraphs or neither, and it adopted
neither.

That leaves two questions, and this design asks both at once: whether the
first paragraph should be adopted alone, and whether a second paragraph
that names the fault outright prevents it.

## Arms

- **A (control): `check-v2`.** The eight runs of 2026-10-03 made in the
  experiment before this one, on the same four cases, under the same
  protocol, on the same day. They are not run again. This design is only
  valid while the four ledgers are the ones those runs judged; every run
  record carries the hash of the case file it sent, and the report states
  whether each run of this experiment matches.
- **B5: `check-v5-draft.md`** — `check-v2` with the first paragraph alone,
  word for word as it was tested, and nothing else changed.
- **B6: `check-v6-draft.md`** — `check-v2` with the first paragraph and a
  second paragraph that adds one sentence to the one tested: "What you know
  of a source from outside the ledger is a prior. If you use it, call it a
  prior, and never write it as what the source says or shows."

`diff` each draft against `protocols/check-v2.md` to see the whole of the
change.

## Cases, seats, runs

- The same four cases, in the same order: Cast, Not Carved first, then Deep
  Memory, The Emptied Amazon, Before Sputnik.
- The same four seats: OpenAI, Google, xAI, Z.ai (via Venice). The
  Anthropic seat is left out for cost, as before.
- Two runs per arm per case, alternating B5, B6, B5, B6: sixteen runs. For
  a run of B5 the draft is copied to `protocols/check-v5.md`, and for B6 to
  `protocols/check-v6.md`, and removed after the run, so the runs are
  stamped `check-v5` and `check-v6`.
- Nothing is installed. Run records, raw replies and spend rows are
  committed.

## Measures

The seven measures of the design before this one, computed by `analyse.mts`
in this directory, which is that design's script with its arms replaced.

## What would count

- **`check-v6` is adopted**, byte for byte, if all three hold for B6:
  - (a) measure 1 at least 90% pooled and at least 75% for each seat;
  - (b) measure 3 no worse than arm A by more than one claim per run on any
    case (mean over the arm's two runs on that case);
  - (c) in both B6 runs of Cast, Not Carved, measure 5 finds neither fault
    in the Google seat's reasoning on GEO-C502 and GEO-C010, as the design
    before this one defines them.
- **Otherwise `check-v5` is adopted**, byte for byte, if (a) and (b) hold
  for B5.
- **Otherwise neither.**

A name not adopted is spent, as `check-v3` and `check-v4` are, and a test
holds it. Adoption is a change to the check protocol in a pull request of
its own, judged by the panel, which carries this design's report.

## What adoption would and would not do

- It would give the seats the rule the judgment is held to. It would not
  change how a standing is derived.
- It would not evidence a claim. Where seats name the records they lean
  on, attaching them is the answer step's work.
- After adoption, the cases contested on claims with no evidence record are
  owed a fresh check under it: Deep Memory and Before Sputnik.

## Cost

Sixteen runs of four seats: about $7, as the runs before this one cost.

## How to run it

As before, in a working tree of its own on main, with the arm and the draft
for each run:

```sh
D=proposals/assessment-experiments/2026-10-03-the-rule-alone-and-with-a-tighter-provenance-sentence
for c in megalithic-casting deep-memory pre-columbian-amazon transients; do
  for v in 5 6 5 6; do
    rm -f protocols/check-v5.md protocols/check-v6.md
    cp "$D/check-v$v-draft.md" "protocols/check-v$v.md"
    node scripts/aletheia.ts check "$c" --seats openai,gemini,xai,venice
    # then: move the run's proposals/<runId>/ into $D/runs/, set aside what it installed,
    # and add the run id to arms.json under B5 or B6
  done
done
rm -f protocols/check-v5.md protocols/check-v6.md
node "$D/analyse.mts"
```
