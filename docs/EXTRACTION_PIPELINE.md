# Extraction pipeline v1

Turns a source document into **proposed catalog-tier claims** in the Aletheia
YAML format — append-only, human-reviewed, never published directly.

## Usage

```bash
node scripts/extract-claims.mjs <source-file> <case-slug> \
  --source-id SRC-FOTI-2023 \
  [--source-title "The Natron Theory"] \
  [--start-number 700] \
  [--only "Chapter Five"] \
  [--max-sections 3] \
  [--provider anthropic|openai]
```

Or trigger the **Extract claims** GitHub workflow (`workflow_dispatch`) with a
source path, case slug, and source id — it runs the pipeline and opens a PR
with the proposals.

### Environment

The pipeline calls an LLM API and **fails early with instructions** if no key
is configured:

| Variable            | Meaning                                            |
| ------------------- | -------------------------------------------------- |
| `ANTHROPIC_API_KEY` | Anthropic Messages API key (preferred provider)    |
| `OPENAI_API_KEY`    | OpenAI Chat Completions API key (fallback)         |
| `EXTRACT_MODEL`     | Optional model override for whichever provider ran |

In CI these come from repository secrets (GitHub → Settings → Secrets and
variables → Actions).

## What a run produces

Everything lands under `proposals/<case-slug>/<runId>/` — deliberately
**outside `content/`**, so nothing reaches the published site until a human
moves it:

| File            | Contents                                                        |
| --------------- | --------------------------------------------------------------- |
| `claims.yaml`   | Proposed catalog-tier claims (schema-shaped, ids `PREFIX-C7xx`) |
| `sources.yaml`  | Source record skeleton (`verification: unverified`)             |
| `rejected.yaml` | Every dropped candidate, with the reason                        |
| `coverage.yaml` | Per-section counts: extracted / anchor-failed / verified / proposed |
| `run.yaml`      | Run provenance: runId, model, prompt versions, date, stats      |

## Pipeline stages

1. **Sectioning.** Markdown headings and book-style `Chapter N:` lines split
   the document (table-of-contents lines are ignored); documents without
   structure fall back to ~6k-char paragraph chunks. Locators are
   `<file> — <section title>`.
2. **Extraction pass** (`extract-v1`). Evidence-only, per the bias protocol:
   what the source states — no verdicts, no extractor judgment. Atomic claims
   with clear truth conditions, one rung each
   (`observation | mechanism | attribution`), a theme chosen from the case's
   own theme keys, and an **exact verbatim quote**.
3. **Mechanical anchor check.** The quote must occur verbatim in the section
   (after whitespace/typographic normalization). A quote the source never
   said is rejected outright — never repaired.
4. **Adversarial verification pass** (`verify-v1`). A second LLM call is
   prompted to *reject*: does the quote actually support the statement? Is
   the claim atomic? Does it have a truth condition? Failures go to
   `rejected.yaml` with reasons. If the verification call itself errors, the
   run **fails closed** — unverified candidates are rejected, not proposed.
5. **Tombstone-aware dedupe.** Candidates near-duplicating an existing claim
   (token-Jaccard > 0.55 against `claims.yaml` + `claims-catalog.yaml`,
   including `rejected` tombstones) are suppressed with the existing id named
   in the reason. This is why tombstones are kept forever.
6. **Independence grouping.** Near-duplicate proposals (Jaccard > 0.5) share
   an `independenceGroup` so they can never be counted as independent
   evidence downstream.
7. **runId stamping.** One runId (`extract-<slug>-<date>-<rand>`) on every
   record, plus model and prompt versions in `run.yaml`.

## Human review contract

A pipeline PR is a proposal, not content. The reviewer:

1. reads `coverage.yaml` — sections with zero claims or errors need manual
   attention;
2. spot-checks quotes against the source;
3. reads `rejected.yaml` for wrong rejections (the adversarial pass is
   deliberately strict);
4. completes the source record and sets an honest verification label;
5. moves accepted claims into `content/cases/<slug>/claims-catalog.yaml`,
   renumbering ids if they collide, and records the run in the case history.

## The geo-benchmark test

The geopolymer case gives us ground truth: ~95 T-numbered topics were
extracted manually/semi-manually from the **Fóti** (The Natron Theory) and
**Davidovits** books and now live as featured claims + the imported catalog
(`runId geo-catalog-import-2026-08-22`).

**The benchmark:** re-run the pipeline over both full books and diff the
output against that catalog.

- **Recall** — how many of the ~95 known topics does the pipeline rediscover?
  (Match by statement similarity, not id.)
- **Precision** — how many proposals are hallucinated, non-atomic, or
  anchor-failed? The mechanical anchor check should hold this near zero for
  quotes; the interesting failures are statement-level overreach.
- **Stability** — run twice; how much wording/segmentation churn between
  runs? High churn means the extraction prompt needs tightening.
- **Tombstone suppression** — the numerology cluster (GEO-C900) and killed
  topics must NOT be re-proposed. Any re-proposal is a hard failure.

Record benchmark results in `docs/` when run; the numbers become the
regression baseline for prompt/model changes (`promptVersion` bumps).

Full-book runs cost real API money — run the benchmark deliberately, not in
CI. A one-chapter smoke test (`--only "Chapter Five"`) is the cheap
confidence check.

## Design constraints carried from AGENTS.md

- Observation before interpretation; atomic claims; no verdicts.
- Exact provenance — a locator is never invented; an unanchorable quote is
  rejected, not repaired.
- AI must not silently create authoritative evidence: everything lands as
  `ai_extracted`, `unverified`, in `proposals/`, behind a human PR review.
