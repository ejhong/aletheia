# Multi-model assessment experiment: Orch OR (2026-08-23)

## Purpose

Measure whether the site's AI-generated verdicts are one model's opinion or
a stable property of the evidence. Every existing assessment overlay was
produced by one model family (Fable); this experiment re-ran the Orch OR
assessment with independent judges from four vendors, plus two
role-conditioned advocate runs that bound the honest disagreement band.

## Method

- **Input**: a single case packet — `case.yaml`, `overview.md`,
  `claims.yaml`, `evidence.yaml`, `sources.yaml`, `research.yaml` — with
  the existing assessment overlay and `history.yaml` **excluded**, so no
  judge saw Fable's verdicts or any prior verdict language.
- **Instructions**: `instructions.txt` (promptVersion
  `aletheia-assess-v0-mm`), identical for all runs: weigh only the evidence
  records; consensus is not proof and outsider status is not evidence;
  middle verdicts are findings, not safe defaults; output the standard
  overlay schema over all 18 featured claims.
- **Judges (5)**: Fable 5 (baseline, the published 2026-08-22 overlay),
  GPT-5.1 (OpenAI), Gemini 3.1 Pro (Google), Grok 4.6 (xAI), Opus 5
  (Anthropic). The three non-Anthropic judges ran via their vendors' APIs;
  Opus ran as a fresh agent forbidden to read the repo.
- **Advocates (2)**: Opus 5 conditioned as strongest-honest-proponent and
  strongest-honest-critic — instructed to argue the best evidentially
  grounded case for their side without misstating evidence, to bound how
  far honest advocacy can move each verdict.

## Results

| claim | Fable | GPT-5.1 | Gemini-3.1 | Grok-4.6 | Opus-5 | Adv-PRO | Adv-CRIT |
|---|---|---|---|---|---|---|---|
| **CASE** | **unresolved** | **unresolved** | **unresolved** | **unresolved** | **unresolved** | **unresolved** | **weakly_supported** |
| ORCH-C001 | unresolved | unresolved | unresolved | unresolved | unresolved | unresolved | weakly_supported |
| ORCH-C002 | weakly_supported | weakly_supported | weakly_supported | weakly_supported | weakly_supported | weakly_supported | contradicted |
| ORCH-C003 | well_supported | well_supported | well_supported | provisionally_supported | provisionally_supported | mixed | provisionally_supported |
| ORCH-C030 | unresolved | unresolved | unresolved | unresolved | unresolved | unresolved | unresolved |
| ORCH-C040 | unresolved | unresolved | unresolved | unresolved | unresolved | unresolved | presently_untestable |
| ORCH-C010 | unresolved | unresolved | unresolved | unresolved | unresolved | unresolved | unresolved |
| ORCH-C011 | provisionally_supported | provisionally_supported | provisionally_supported | provisionally_supported | provisionally_supported | well_supported | provisionally_supported |
| ORCH-C012 | mixed | mixed | mixed | mixed | mixed | well_supported | well_supported |
| ORCH-C013 | well_supported | well_supported | well_supported | well_supported | provisionally_supported | well_supported | provisionally_supported |
| ORCH-C020 | well_supported | well_supported | well_supported | well_supported | provisionally_supported | well_supported | provisionally_supported |
| ORCH-C021 | provisionally_supported | provisionally_supported | provisionally_supported | provisionally_supported | provisionally_supported | provisionally_supported | weakly_supported |
| ORCH-C022 | unresolved | unresolved | unresolved | unresolved | unresolved | weakly_supported | weakly_supported |
| ORCH-C023 | provisionally_supported | provisionally_supported | provisionally_supported | provisionally_supported | provisionally_supported | provisionally_supported | weakly_supported |
| ORCH-C024 | well_supported | well_supported | well_supported | well_supported | well_supported | well_supported | well_supported |
| ORCH-C025 | provisionally_supported | provisionally_supported | provisionally_supported | provisionally_supported | provisionally_supported | provisionally_supported | weakly_supported |
| ORCH-C026 | mixed | mixed | mixed | mixed | mixed | provisionally_supported | weakly_supported |
| ORCH-C031 | well_supported | well_supported | well_supported | well_supported | well_supported | well_supported | well_supported |
| ORCH-C041 | well_supported | well_supported | well_supported | well_supported | well_supported | well_supported | well_supported |

**Judge agreement over 18 claims (5 judges, 4 vendors): 15 exact, 3
adjacent (one step on the ordinal scale: C003, C013, C020 — all Opus or
Grok reading one notch more conservatively), 0 splits.** All five judges
independently chose the case verdict `unresolved`.

**Advocate band**: on most claims the distance between the strongest
honest proponent and the strongest honest critic is one to two steps.
The proponent run could not honestly raise the case verdict above
`unresolved`; the critic run could not honestly lower it below
`weakly_supported` (its own reasoning: "contradicted" would overclaim
because the load-bearing coherence quantity, ORCH-C010, has never been
measured in either direction).

## Interpretation

1. **The published verdicts are not a Fable idiosyncrasy.** Four vendors'
   flagship models, given the same evidence and blinded to prior verdicts,
   reproduce the claim-level assessments almost exactly. Within-corpus
   judgment is highly stable.
2. **The honest disagreement band is narrow.** When strong models are
   *instructed* to be maximally partisan without lying, they can move most
   verdicts at most one or two steps, and cannot move the case verdict
   materially. The case file's evidence records constrain judgment tightly.
3. **What this does and does not show.** Convergence does not prove absence
   of shared bias: all judges share overlapping training corpora, and all
   judged the same curated case file. The experiment relocates the open
   bias question from "is the judge idiosyncratic?" (answered: no) to two
   sharper questions: *is the evidence curation complete?* (testable by a
   missing-evidence audit — an independent run whose only brief is to find
   the strongest evidence not currently in the case, in either direction)
   and *are shared corpus priors distorting claim-level readings?*
   (testable by adversarial expert review — e.g. the planned Hameroff
   intake on the anesthesia claims).
4. **A substantive convergence worth recording**: every run, including
   both advocates, independently identified ORCH-C010 (microtubule
   coherence times) as unresolved-because-unmeasured and load-bearing.
   The whole dispute compresses onto a quantity nobody has measured —
   which is exactly the case's stated crux and research agenda.

## Status and limitations

- These files are **proposals, not published overlays**. Publishing any of
  them into `content/cases/orch-or/assessments/` is an editorial decision
  (it would change the "latest assessment" shown on the case page).
- One case, one run per model, default sampling settings; no
  repeat-sampling stability check.
- The three vendor judges ran through their public APIs with no tools; the
  Anthropic runs used fresh agents with repo access forbidden.
- Raw API responses and the comparison script are in the session archive;
  the run inputs (`instructions.txt`) are preserved here.
