# Aletheia

**Contested claims, mapped to evidence and experiments.**

Aletheia decomposes contested hypotheses into atomic claims, maps the evidence for and against each one with honest provenance labels, and points at the test that would settle the dispute. It is operated by AI as a declared experiment: every consequential change is judged by a panel of independent models against the constitution in `AGENTS.md`, and the whole record — verdicts, dissents, reverts — is public in this repository and on the site's `/panel` page.

Ten cases are live (`content/cases/`): megalithic casting, vasocomputation, Orch OR, VASCO transients, the Model of Pragmatic Information, Zero Worlds, Conformal Cyclic Cosmology, the Younger Dryas impact hypothesis, the Immortality Key, and the pre-Columbian Amazon.

## Three documents

| Read this | For |
| --- | --- |
| `AGENTS.md` | The constitution: epistemic rules, code rules, what AI may and may not do. Amended only by the founder. |
| `docs/AUTOMATION.md` | The design of the self-running site (the five loops) **and its current status** — what is built, what is working, what is next. |
| `docs/MAINTENANCE.md` | The runbook: what runs when, what each run produces, how to feed the inbox, and what to check when something looks wrong. |

`docs/DECISIONS.md` is the append-only history of why things are the way they are. Read it when a rule seems odd; it is not a manual.

Narrower references: `docs/CONTENT_POLICY.md` (verification labels, real-citations-only), `docs/DATA_MODEL.md` (the domain objects in prose; `src/domain/schema.ts` is authoritative), `docs/IMAGE_STYLE.md` (the two image registers), `docs/EXTRACTION_PIPELINE.md` (document → catalog claims), `docs/CHAT_BRIEFS.md` (chat-seeded case construction), `inbox/README.md` (the drop conventions).

## Commands

```bash
npm install        # once
npm run dev        # dev server at localhost:3000
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm test           # vitest
npm run build      # static export to out/ (fails loudly on invalid content)
node scripts/yield-report.mjs   # which cases moved, and when
```

## Architecture

Three zones, one-way flow:

1. **Content** (`content/cases/<case>/`) — YAML + markdown per case: `case.yaml`, `overview.md` (article with `[text]{claim=GEO-C001}` refs), `claims.yaml`, `evidence.yaml`, `sources.yaml`, `research.yaml`, `history.yaml`, optional `studies/`, `inputs/`, `watch.yaml`, `resources.yaml`, `conjectures.yaml`, and append-only AI assessment overlays in `assessments/<runId>.yaml`.
2. **Domain** (`src/domain/`) — Zod schemas, the loader (fails the build on dangling IDs, uncited sources, or unresolved claim refs), derived standing and governance.
3. **UI** (`src/components/`, `app/`) — pure components, one per domain concept. Routes: home, cases, case page, claim explorer, claim detail, source record, study, resources, proposals, panel, method.

Dependencies are deliberately minimal: Next.js (static export) + TypeScript strict + Tailwind + Zod + yaml; vitest dev-only; all visuals hand-built.

## Deployment

Static export served from git: pushing to `main` runs CI and deploys to GitHub Pages (`.github/workflows/deploy.yml`). The base path is injected by the workflow.

## Images

Two registers, never confused (full rules in `docs/IMAGE_STYLE.md`): AI-generated editorial artwork in the house style, always credited, never depicting evidence; and **plates** — real photographs with provenance, shown as numbered museum plates. Add a plate from Wikimedia Commons with `node scripts/add-commons-image.mjs "File:..." <case-slug>`. Every image needs a manifest entry with license and credit or the build fails; AI-generated images can never be plates — enforced by the schema.

## Layout

| Path | Role |
| --- | --- |
| `content/cases/<slug>/` | One published case |
| `inbox/` | Drop zone: notes, link lists, documents (see `inbox/README.md`) |
| `proposals/` | Machine output awaiting adoption: watch hits, triage, agenda, import proposals, ledgers |
| `governance/arbiter/` | Harvested panel verdicts, one per settled PR |
| `research/` | The founder's own essays and commissioned reports (founding inputs for cases) |
| `briefs/` | Chat-seeded case briefs in progress (never citable) |
| `scripts/` | The loops; shared, tested logic in `scripts/lib/` |
