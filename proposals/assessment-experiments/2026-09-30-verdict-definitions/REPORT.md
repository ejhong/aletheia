# Report: written definitions of the verdict words (2026-09-30)

The design is in `DESIGN.md`, committed before the first run: the design
commit's own time is 07:54:44 UTC on 2026-09-30, and the first run began at
07:54:50. That commit reached the repository with the first arm, as the
first of the two commits of #426 (`ffff11f`). The order rests on the
commit's time, which is the operator's clock and a record, not a proof.
This file was written after the last run and revised once, to answer the
panel's notes on #426 (the section on the ledger, below). Everything in it
can be recomputed from the seats' raw replies with the three scripts beside
it.

## Result

**By the rule the design set, the definitions are not adopted.**

The rule had two conditions. Exact self-agreement had to be higher with the
definitions for at least three of the four seats: it was, for three. And no
seat's agreement within one step could fall by more than one claim: one
seat's fell by nine.

| Seat | Same word on all three runs, without (A) | with (B) | Within one step, without (A) | with (B) | Case verdict, without | with |
|---|---|---|---|---|---|---|
| OpenAI (GPT-5.6 Sol) | 13 of 25 | **23 of 25** | 17 of 25 | **25 of 25** | differed | the same |
| Google (Gemini 3.8 Flash) | 10 of 25 | 13 of 25 | 16 of 25 | 17 of 25 | differed | the same |
| xAI (Grok 4.5) | 16 of 25 | **12 of 25** | 23 of 25 | **14 of 25** | differed | differed |
| Z.ai (GLM 5.3 Flash, via Venice) | 13 of 25 | 15 of 25 | 14 of 25 | 17 of 25 | differed | differed |

Panel agreement (each seat's first run in the arm, every pair of seats,
every claim): within one step on 122 of 150 pairs without the definitions
and 98 of 150 with them; the same word on 77 and 79.

What can be said from three runs an arm:

- One seat changed a great deal. The OpenAI seat gave the same word three
  times on 23 of 25 claims with the definitions, against 13 without, and
  its three verdicts never fell more than one step apart.
- One seat got worse. The xAI seat's three verdicts fell more than one step
  apart on 11 claims with the definitions, against 2 without.
- For the Google and Venice seats the differences are two or three claims
  in 25, which this design can produce by chance. They are not evidence
  either way.

So the definitions are not a fix. They helped the one seat, did nothing
measurable for two, and unsettled the fourth.

## The baseline, which is the larger finding

The arm without definitions is the protocol the site uses. Asked the
identical question three times within half an hour today:

- each seat gave the same word all three times on 10 to 16 of 25 claims
  (12 to 15 on 2026-09-28);
- **every one of the four seats gave a different case verdict on at least
  one of its three runs** (on 2026-09-28, one of the four did).

A standing is derived from one answer per seat. These runs say how much of
that answer is the draw.

## Two things the runs show that the design did not ask (added afterwards)

These were computed after the runs and are descriptions, not tests.

**Most of the disagreement is one pair of words.** Across all three arms,
77 seat-claims had verdicts more than one step apart. In 51 of them the
seat had said "weakly supported" on one run and "provisionally supported"
on another (`describe.mts`). On the constitution's scale those two words
are two steps apart, with "unresolved" and "mixed" between them. In plain
English they are close: both say there is some evidence for the claim and
not much of it. The draft's definitions tried to separate them — thin but
favourable against weak and more likely false — and the OpenAI seat applied
that consistently. The xAI seat's count of this one confusion went from two
claims to eight.

**The standing's word held; its reason did not.** Each run's four replies
were put through the site's own rule with the Anthropic seat's one check of
the same ledger (`standing.mts`). Under the current protocol, five of six
runs give Deep Memory *contested* and one gives *ratified*. The
load-bearing claim named as splitting the panel differs from run to run:
DEEP-C002 in four runs, DEEP-C026 and DEEP-C018 in two each, DEEP-C034 in
one. The case page says today that the panel splits on DEEP-C018.

A seat's median over three runs was also compared with its median over
three others (2026-09-28 against today, current protocol). It agreed
exactly on 13 to 22 of 25 claims, against 12 to 19 for one run against one
run. That is one comparison per seat and shows no clear gain from asking
three times.

## The ledger the runs judged (added after review note #428)

The design says the runs judge "the same ledger the runs of 2026-09-28
judged; the run records carry its hash". The second half was wrong when it
was written. A check's run record carried no hash: `inputHash` is null on
every check run made before #430. The verb stamped the ledger's hash on
each assessment it installed, and this experiment removed those files
after analysing them. So nothing the six runs left in the repository names
the ledger they judged. What can be shown:

- **The ledger has one hash throughout.** Deep Memory's five ledger files
  (`case.yaml`, `claims.yaml`, `evidence.yaml`, `sources.yaml`,
  `research.yaml`) were last changed on 2026-09-19 (#365). The loader gives
  the ledger the hash `ad0e0e1147eeccd1a783e8c254a7b86813723f00edf65c8f836ab54ab34b7779`.
  The twelve checks of 2026-09-28 and the Anthropic seat's check of
  2026-09-30, all installed in the case, carry that hash.
- **What a seat is sent is those five files.** The case file a check sends
  is their bytes, in that order (`blindPacket`, `src/pipeline/check.ts`):
  113,051 characters, sha256 `af4a4eb0358c96366de3d3a43fd6831814d5e90501c471e368ed43973d7f96f1`,
  computed from the tree for this report and not recorded by the runs.
- **Each seat was sent the same number of tokens as on 2026-09-28.** The
  spend rows give the vendor's own count of what each seat received, cached
  and fresh together. Under the current protocol it is the same for every
  run of a seat, on both days. Under the draft it is larger by the
  definitions.

| Seat | Input tokens, each of the three runs of 2026-09-28 | each of arm A's three | each of arm B's three |
|---|---|---|---|
| OpenAI | 32,508 | 32,508 | 32,942 |
| Google | 38,159 | 38,159 | 38,600 |
| xAI | 34,188 | 34,188 | 34,623 |
| Z.ai, via Venice | 34,445 | 34,445 | 34,876 |

Equal token counts do not prove equal bytes. With the files unchanged since
2026-09-19 and the verb sending only those files, they are what there is.
From #430 a check's run record carries the hash of the case file it sent,
so the next experiment will not have to argue this.

## What this does and does not support

- It does not support adding these definitions to the check protocol.
- It does not show that definitions cannot help: one seat's behaviour
  changed sharply, and a different wording might carry the others. That
  would be a new experiment with its own design.
- It does show that the pair "weakly supported" / "provisionally
  supported" is where a seat's repeated answers part, and that the scale
  counts that as a dispute. Where those words sit on the scale is the
  constitution's (AGENTS.md §3.15) and the founder's to change.
- It is one case, four seats, three runs an arm, on one day. Deep Memory's
  ledger is thin (eight sources), which may make its claims harder to grade
  consistently than another case's. None of this has been measured on a
  second case.

## Cost and records

Six runs, 24 seat calls recorded, $2.06. During the second run the
operator's machine slept; three seats' calls were lost and asked again, and
the lost calls are not on the ledger. Each run's record and raw replies are
under `runs/`, as the check verb wrote them. Their `wrote:` lines name
assessment files that were analysed and then removed, not installed in the
case: nothing from this experiment is part of Deep Memory's record or
standing. Arm B's runs are stamped `check-v3`: the draft beside this file
was copied to `protocols/check-v3.md` for each of those runs and removed
after it. It was never a protocol of the site, and the name is spent: the
next version of the check protocol is `check-v4`.

| Arm | Runs |
|---|---|
| S, check-v2, 2026-09-28 | `2026-09-28-check-deep-memory-140630`, `-142201`, `-143733` (under `proposals/`) |
| A, check-v2, 2026-09-30 | `2026-09-30-check-deep-memory-075451`, `-081607`, `-082000` |
| B, draft definitions, 2026-09-30 | `2026-09-30-check-deep-memory-075732`, `-081803`, `-082215` |

```sh
node proposals/assessment-experiments/2026-09-30-verdict-definitions/analyse.mts    # the design's measures
node proposals/assessment-experiments/2026-09-30-verdict-definitions/describe.mts   # which words, and medians
node proposals/assessment-experiments/2026-09-30-verdict-definitions/standing.mts   # the standing each run would give
```
