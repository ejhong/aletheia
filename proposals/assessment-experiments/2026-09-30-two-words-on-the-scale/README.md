# Two verdict words and the step between them (2026-09-30)

A description for a decision, not an experiment: no model was asked
anything. The decision and its reasons are in `docs/DECISIONS.md` under
this date.

## The question

The constitution's scale sets "weakly supported" and "provisionally
supported" two steps apart, with "mixed" between them (AGENTS.md §3.15),
and a seat's verdict two steps from the judgment's disputes it. The
experiment on verdict definitions (`../2026-09-30-verdict-definitions/`)
found that a seat asked the same question again moves between those two
words more than between any other two. The site's own one-sentence
meanings for them are close: "the evidence leans this way, but it is
thin, from few sources, or not yet replicated", and "some evidence, but
weak: small, indirect, or from interested parties".

Should the two words be one step apart? Moving them is an amendment to
the constitution, which is the founder's act. On 2026-09-30 the founder
left the judgment to the operator ("fix the verdict if you think that's
best"). This is what the operator counted before answering.

## What is counted

1. **Every panel on the tree that can speak** (four current seats or
   more), against the judgment it checks: the standing, and the featured
   claims that split, under the rule as it is and under the rule with that
   one pair brought within a step. Nothing else about the scale is
   changed in the second reading.
2. **The nine runs of the experiment on verdict definitions**, in which
   four seats were each asked about Deep Memory three times under each of
   three arms: for each seat, the claims where its three answers are all
   within one step of each other; and the standing each run would give
   against the judgment as it now stands, with the Anthropic seat's check
   of the same ledger. (The experiment's own report computed standings
   against the judgment of that morning; Deep Memory was re-told later
   that day, so these differ from its table.)

## The figures

From main at `15b16e7a25`, with
`node proposals/assessment-experiments/2026-09-30-two-words-on-the-scale/count.mts`.
The script reads the tree it is run on.

## 1. The panels on the tree

| Case | Standing as the rule is | With the two words one step apart | Claims split: now, then |
|---|---|---|---|
| The Emptied Amazon | ratified 5 of 5 | ratified 5 of 5 | 6, 6 |
| The Aeon Before Ours | ratified 5 of 5 | ratified 5 of 5 | 1, 1 |
| Deep Memory | contested (DEEP-C002, DEEP-C034, DEEP-C026, DEEP-C018) | contested (DEEP-C002, DEEP-C034, DEEP-C026, DEEP-C018) | 7, 7 |
| Elusive by Law | ratified 5 of 5 | ratified 5 of 5 | 0, 0 |
| Collapse, Not Computation | ratified 3 of 4 | ratified 3 of 4 | 2, 2 |
| The Religion with No Name | contested (on the case verdict) | contested (on the case verdict) | 3, 3 |
| Before Sputnik | contested (TRN-C101) | contested (TRN-C101) | 3, 3 |
| State, Not Scar | ratified 5 of 5 | ratified 5 of 5 | 0, 0 |
| Fire From the Sky | ratified 5 of 5 | ratified 5 of 5 | 0, 0 |
| Zero Worlds | ratified 4 of 5 | ratified 4 of 5 | 1, 1 |

Featured claims compared: 199. Split as the rule is: 23. Split with the two words one step apart: 23.
Seat verdicts on those claims: 971. More than one step from the judgment: 129. Of those, one word of the pair against the other: 19.
The kinds of verdict more than one step from the judgment, most frequent first, each with how many fall on claims that have no evidence record: provisionally_supported / unresolved 28 (28); unresolved / well_supported 25 (25); established / provisionally_supported 22 (14); provisionally_supported / weakly_supported 19 (3); mixed / well_supported 13 (0); weakly_supported / well_supported 10 (3); contradicted / unresolved 6 (0); contradicted / well_supported 2 (0); established / unresolved 2 (2); established / mixed 1 (0); contradicted / mixed 1 (0).

## 2. The experiment's runs on Deep Memory, read under both rules

Against the judgment as it stands (2026-09-30-edition-091201), with the Anthropic seat's check of the same ledger (2026-09-30-check-opus-103112).

| Arm | Seat | Claims where its three answers are within one step of each other: now | then |
|---|---|---|---|
| S | openai | 19 of 25 | 25 of 25 |
| S | gemini | 19 of 25 | 23 of 25 |
| S | xai | 23 of 25 | 24 of 25 |
| S | venice | 19 of 25 | 25 of 25 |
| A | openai | 17 of 25 | 22 of 25 |
| A | gemini | 16 of 25 | 18 of 25 |
| A | xai | 23 of 25 | 24 of 25 |
| A | venice | 14 of 25 | 15 of 25 |
| B | openai | 25 of 25 | 25 of 25 |
| B | gemini | 17 of 25 | 22 of 25 |
| B | xai | 14 of 25 | 22 of 25 |
| B | venice | 17 of 25 | 23 of 25 |

| Arm | Run | Standing the run would give, as the rule is | With the two words one step apart |
|---|---|---|---|
| S | 140630 | contested (DEEP-C002, DEEP-C034, DEEP-C026, DEEP-C018) | contested (DEEP-C002, DEEP-C026) |
| S | 142201 | contested (DEEP-C002) | ratified 5 of 5 |
| S | 143733 | contested (DEEP-C018) | contested (DEEP-C018) |
| A | 075451 | ratified 4 of 5 | ratified 4 of 5 |
| A | 081607 | contested (DEEP-C002) | contested (DEEP-C002) |
| A | 082000 | contested (DEEP-C002, DEEP-C026) | contested (DEEP-C002, DEEP-C026) |
| B | 075732 | contested (DEEP-C002, DEEP-C034, DEEP-C026, DEEP-C018) | contested (DEEP-C002, DEEP-C034, DEEP-C026, DEEP-C018) |
| B | 081803 | contested (DEEP-C026, DEEP-C018) | contested (DEEP-C026, DEEP-C018) |
| B | 082215 | contested (DEEP-C002, DEEP-C026, DEEP-C018) | contested (DEEP-C002, DEEP-C026, DEEP-C018) |

## What it shows

- **On the panels the site shows, the move would change nothing.** No
  standing changes and no claim stops being split.
- **The pair is a small part of the distance between a panel and a
  judgment**: 19 of the 129 seat verdicts that are more than one step from
  the judgment. The three kinds ahead of it come to 75 verdicts, and 67
  of those fall on claims with no evidence record, which is another
  question (`../2026-09-30-where-the-panel-splits/`). Of the pair's 19,
  three do.
- **It is a larger part of the distance between a seat and itself.** With
  the two words one step apart, a seat's three answers fall within one
  step of each other on more claims in eleven of the twelve seat-and-arm
  rows, by one to eight claims of 25.
- **It would have changed one standing in nine** on those runs, from
  contested to ratified, and named fewer claims as splitting in one other.

## What it does not show

- Anything beyond one case for a seat against itself. Deep Memory's
  ledger is thin, and no other case has been asked twice.
- Whether the two words *mean* neighbouring things to a seat or whether a
  seat simply cannot hold the line between them. The count cannot tell
  those apart, and they call for different remedies.
