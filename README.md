# Aletheia

**Contested claims, mapped to evidence and experiments.**

Aletheia decomposes contested hypotheses into atomic claims, maps the
evidence for and against each one with honest provenance labels, and points
at the test that would settle the dispute. It is operated by AI as a
declared experiment: an AI agent does the work, models from four other
companies review every change before it publishes, five models judge each
case blind, and the whole record — sessions, reviews, verdicts, dissents —
is public in this repository and on the site's `/operations` page.

## Read these

| | |
| --- | --- |
| `AGENTS.md` | The constitution: the epistemic rules, and what AI may and may not do. Amended only by the founder. |
| `docs/DESIGN.md` | How the site runs: the operator, the checks, the review, the panel, the money, the two sites. |
| `docs/RUNBOOK.md` | What to do when: the founder's levers, the secrets, what to check when something looks wrong. |
| `docs/DECISIONS.md` | Why things are the way they are: the decisions in force, then the log. |
| `operator/charter.md` | The operator's standing instructions. |

Narrower references: `docs/DATA_MODEL.md` (the records in prose;
`src/domain/schema.ts` is authoritative), `docs/CONTENT_POLICY.md`
(verification labels, real citations only), `docs/IMAGE_STYLE.md` (the two
image registers), `inbox/README.md` (dropping material in). The history of
the September pipeline is in `docs/archive/`.

## Commands

```bash
npm install
npm run dev                          # the site at localhost:3000
npm test && npm run build            # what CI runs (the build fails on invalid content)
node scripts/site.ts                 # the engine's command line: status, read, ids, stamp, check-quotes, panel, …
```

## Layout

| Path | |
| --- | --- |
| `content/cases/<case>/` | One case: `case.yaml`, `claims.yaml`, `evidence.yaml`, `sources.yaml`, `research.yaml`, `editions/` (the article as readers see it), `assessments/` (append-only judgments: the operator's drafts and the panel's blind checks), `history.yaml`, and optionally `studies/`, `inputs/`, `images.yaml` |
| `inbox/` | The founder's door |
| `runs/` | One directory per session, panel or review: its record and its log |
| `proposals/` | The September pipeline's runs, kept as history |
| `governance/` | The spend ledger, the reviews of every change, the kill switch (`operation.yaml`), and the September gate's record |
| `config/` | The site's identity, theme and rules for models; the models; the budget; the tariffs |
| `protocols/` | The prompts the review and the panel are given (retired ones in `archive/`) |
| `src/domain/`, `src/components/`, `app/` | The site: schemas and the loader, pure components, pages |
| `src/engine/`, `scripts/site.ts` | The engine: reading sources, the quote check, stamping editions, the review, the panel, spend |
| `research/` | The founder's own essays (founding inputs) |

Static export, served from git: a merge to `main` deploys to GitHub Pages.
Dependencies are deliberately few — Next.js, TypeScript strict, Tailwind,
Zod, yaml; vitest and pdfjs for development and the engine.
