# Aletheia

**Contested claims, mapped to evidence and experiments.**

Aletheia decomposes controversial hypotheses into atomic claims, maps the evidence for and against each one with honest provenance labels, and points at the experiment that would settle the dispute. First case: **Cast, Not Carved?** — the megalithic casting hypothesis, curated from the [geo research project](https://github.com/ejhong/geo)'s AI-extracted catalog.

## Commands

```bash
npm install        # once
npm run dev        # dev server at localhost:3000
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm test           # vitest (schema/loader/parser tests)
npm run build      # static export to out/ (fails loudly on invalid content)
```

## Architecture

Three zones, one-way flow — see `docs/DATA_MODEL.md` and `docs/DECISIONS.md`:

1. **Content** (`content/cases/<case>/`) — plain YAML + markdown per case: `case.yaml`, `overview.md` (article with `[text]{claim=GEO-C001}` refs), `claims.yaml`, `evidence.yaml`, `sources.yaml`, `research.yaml`, `history.yaml`, and append-only AI assessment overlays in `assessments/<runId>.yaml`.
2. **Domain** (`src/domain/`) — Zod schemas, the loader (fails the build on dangling IDs or unresolved claim refs), and the constrained article parser.
3. **UI** (`src/components/`, `app/`) — pure components, one per domain concept; six routes (home, cases, case page, claim explorer, claim detail, source record, method).

Dependencies are deliberately minimal: Next.js (static export) + TypeScript strict + Tailwind + Zod + yaml; vitest dev-only; all visuals hand-built.

## Deployment

Static export served from git: pushing to `main` runs CI and deploys to GitHub Pages (`.github/workflows/deploy.yml`). The base path is injected by the workflow; remove the `PAGES_BASE_PATH` env there when moving to a custom domain.

## Images

Two registers, never confused (full rules in `docs/IMAGE_STYLE.md`):

- **Editorial artwork** — AI-generated in the house engraving style (`style-v1`), always credited, never depicting evidence. Generate candidates for a case with the **generate-case-art** workflow (Actions → Generate case art → enter the case slug); it opens a PR with candidates to pick from. Requires the `IMAGE_API_KEY` repository secret (an OpenAI API key); without it the workflow fails with instructions.
- **Plates** — real photographs with provenance, shown as numbered museum plates with a CSS duotone (originals untouched). Add one from Wikimedia Commons with `node scripts/add-commons-image.mjs "File:..." <case-slug>` — license, credit, and provenance are auto-filled from the Commons API; you write `alt`, `depicts`, `plateNumber`, and `claimIds`.

Every image needs a manifest entry with license and credit or the build fails. AI-generated images can never be plates — enforced by the schema.

## Editing content

Edit files under `content/`, run `npm run dev`, and reload. Malformed records, dangling IDs, or article references to unknown claims fail loudly at build time. Provenance rules — what may be labeled `verified` vs `ai_verified` vs `unverified`, tombstones for rejected claims, confidentiality constraints — are in `docs/CONTENT_POLICY.md`.

## Layout

| Path | Role |
|---|---|
| `AGENTS.md` | Rules for coding/research agents (epistemic rules, code rules, workflow) |
| `docs/DECISIONS.md` | Append-only decisions log — read first for current direction |
| `docs/` | Product spec, data model, IA, content policy, roadmap |
| `content/cases/geopolymer/` | Case GEO-001, "Cast, Not Carved?" |
| `research/` | Source material for future cases (vasocomputation is next) |
