# Does telling a seat the edition's rule for a claim with no evidence end the splits on such claims? (designed 2026-09-30)

Written before any run of this experiment. No run has been made: the day's
spending cap was spent when this was written. The results will be in
`REPORT.md` beside this file. This file may be revised until the first run
starts and is not edited after it; the commit that carries the first run
says which revision it ran.

## Why

On the seven blind panels published on 2026-09-30 the panel splits from
the judgment on 2 of 126 featured claims that have an admitted evidence
record, and on 20 of 34 that have none
(`../2026-09-30-where-the-panel-splits/`). Two of the three contested
standings are splits on such claims.

The two protocols grade such a claim by different rules. The edition
protocol, since its v8 (2026-09-16): a claim no admitted evidence record
cites is held on its source alone, a source is not evidence (AGENTS.md
§3.6), and its verdict is `unresolved` unless the reasoning names another
disclosed basis. `check-v2` has no such rule, and the blind packet does not
mark such a claim. A seat grades it from records attached to neighbouring
claims, or from what it knows, and mostly without saying which.

On the same day the gate twice refused checks of Cast, Not Carved that
gave as a source's own text what a ledger record marks as unchecked
against that text (`docs/DECISIONS.md`, 2026-09-30).

## The question

Does a check protocol that (1) states the edition protocol's rule and
names the claims it applies to, and (2) asks a seat to say which claim a
cited record is attached to and to carry a record's stated limitation,
make the seats either grade such claims `unresolved` or name the basis
they grade them on — without moving what they say about claims that do
have evidence?

## Design

- **Arms.** A: `check-v2`, unchanged. B: `check-v4-draft.md`, beside this
  file, which is `check-v2` with two paragraphs added after the one on
  provisional records and nothing else changed (`diff` the two). The list
  of claims the first paragraph names is filled by the verb
  (`unevidencedClaims`, `src/pipeline/check.ts`): the claims a seat is
  asked to grade that no admitted evidence record cites, counted as the
  edition packet counts them.
- **Cases and ledgers.** Four, as their ledgers stand on main when the
  first run starts: Deep Memory (13 of its 25 featured claims have no
  evidence record), The Emptied Amazon (7 of 27), Before Sputnik (5 of
  24), and Cast, Not Carved (3 of 24), which is there for measure 5. Cast,
  Not Carved is run first, and before #452 is answered: the answer moves
  its ledger. Every run record carries the hash of the case file it sent
  (since #430); the report states each and says whether any differs.
- **Seats.** Four: OpenAI, Google, xAI, Z.ai (via Venice), as the roster
  names them. The Anthropic seat is left out for cost, as in the
  experiment of the same date on verdict definitions: at its pinned effort
  one check cost $1.90 to $2.96 on 2026-09-30, against $0.35 to $0.65 for
  the other four together.
- **Runs.** Two per arm per case, alternating A, B, A, B on each case, so
  that neither arm is systematically earlier: sixteen runs. Each asks the
  four seats at once, as the check verb does, with its one repair round.
  For an arm-B run the draft is copied to `protocols/check-v4.md` and
  removed after it, so those runs are stamped `check-v4`.
- **An earlier sample.** The published panels of 2026-09-30 on three of
  the cases (arm S in `arms.json`), read for the same four seats, are
  reported beside arm A as an earlier sample of the same arm. They are not
  pooled with it. Their figures, computed when this design was written,
  are under "The baseline" below.
- **Nothing is installed.** The runs are made in a separate working tree.
  Their assessments are analysed and not committed to any case; their run
  records, raw replies and spend rows are committed, because the money is
  spent.

## Measures

Computed by `analyse.mts`, which was written with this design and is not
changed after the first run except to fix a fault, said in the report.

1. **Unresolved, or a basis named** (the question's first half). Over
   every seat verdict on a featured claim with no evidence record: the
   share where the verdict is `unresolved`, or the reasoning names an
   evidence record together with a claim the ledger attaches it to, or the
   reasoning uses the word "prior" or "priors" (not "prior to").
2. **Splits on claims with no evidence record.** Per run: the number of
   such claims on which fewer than a strict majority of the four seats are
   within one step of the judgment (`claimConcurrence`, the rule the
   standing uses).
3. **Splits on claims with an evidence record** (the guard). The same
   count over the other featured claims.
4. **Citations.** Over every claim reasoning: evidence records named; of
   those, not attached to the claim being graded; of those, in a reasoning
   that names no claim the record is attached to.
5. **The Google seat on Cast, Not Carved**, read by hand. In each run, its
   reasoning on GEO-C502 and on GEO-C010, printed whole by the script. For
   each the report says whether it gives as the content of Engelbach's
   1922 monograph what GEO-E002 marks as unchecked against that text, or
   cites GEO-E010 or its source for furnace temperatures, and quotes the
   sentence.
6. **Case verdicts**, per seat and run, with those more than one step from
   the judgment marked. Reported, not tested: the experiment on verdict
   definitions found every seat's case verdict differing between runs of
   one protocol.

## What would count

The draft is **adopted as `check-v4`**, byte for byte, if all three hold:

- **(a)** Measure 1 in arm B, pooled over its runs, is at least 90%, and
  at least 75% for each of the four seats.
- **(b)** Measure 3 in arm B is not worse than in arm A by more than one
  claim per run on any case (mean over the arm's two runs on that case).
- **(c)** In both arm-B runs of Cast, Not Carved, measure 5 finds neither
  fault in the Google seat's reasoning on either claim.

If (a) and (b) hold and (c) does not, the draft is **not adopted**: the two
paragraphs were tested together and are adopted together or not at all,
so that a stamp names the text a seat was given. The report then says the
first paragraph met its measures, and a draft with that paragraph alone
is a new experiment. If (a) or (b) fails, it is not adopted. Either way
the name `check-v4` is then spent, as `check-v3` was, and a test is added
that holds it.

Measure 2 is reported and is not part of the rule. A seat that names
records attached to a neighbouring claim may still grade the claim higher
than the judgment, and that is a split worth having: it says which records
the judgment did not weigh, which the reconsideration or the answer step
can then act on.

Two runs an arm on four cases is a small sample. A seat's repeated answers
differ (the experiment on verdict definitions), so a difference of a claim
or two between arms is within what this design can produce by chance, and
the report calls it so. Measure 1's threshold is set well above the
baseline for that reason.

## The baseline

From `analyse.mts` on main at `35eb721999`, arm S, the four seats:

| Case | Splits, of claims with no evidence record | Splits, of claims with one |
|---|---|---|
| Deep Memory | 8 of 13 | 0 of 12 |
| The Emptied Amazon | 6 of 7 | 0 of 20 |
| Before Sputnik | 3 of 5 | 1 of 19 |

Measure 1: 59 of 100 seat verdicts (OpenAI 17 of 25, Google 11 of 25, xAI
18 of 25, Z.ai 13 of 25). Measure 4: 256 evidence records named, 84 not
attached to the claim being graded, 82 of those naming no claim the record
is attached to.

These counts are of four seats, so they differ from those of the five-seat
panels in `../2026-09-30-where-the-panel-splits/`.

## What adoption would and would not do

- It would give the seats the rule the judgment is already held to. It
  would not change how a standing is derived: a split on a claim the case
  rests on contests the case, under either protocol.
- It would not evidence a single claim. 34 featured claims in seven cases
  have no admitted evidence record; where seats name the records they lean
  on, attaching them is the answer step's work, record by record.
- After adoption the cases it bears on are owed a fresh check: Deep Memory
  and Before Sputnik first, as the two contested on such claims.

## Cost

Sixteen runs of four seats: about $9 at the rates of 2026-09-30 (a
four-seat check of these cases cost $0.35 to $0.65). Every call goes
through the metered transport and is on the spend ledger.

## How to run it

In a working tree of its own, on main:

```sh
D=proposals/assessment-experiments/2026-09-30-a-rule-for-claims-with-no-evidence
for c in megalithic-casting deep-memory pre-columbian-amazon transients; do
  for arm in A B A B; do
    if [ "$arm" = B ]; then cp "$D/check-v4-draft.md" protocols/check-v4.md; else rm -f protocols/check-v4.md; fi
    node scripts/aletheia.ts check "$c" --seats openai,gemini,xai,venice
    # then: move what the run installed under content/cases/<dir>/assessments/ and its proposals/<runId>/ into $D/runs/,
    # and add the run id to arms.json under its arm and case
  done
done
rm -f protocols/check-v4.md
node "$D/analyse.mts"
```
