# Aletheia Information Architecture

Six routes. The case page is the center of gravity; everything else supports descent from it or entry into it.

## Routes

| Route | Purpose |
|---|---|
| `/` | Mission, featured case, case list, method summary, recent changes |
| `/cases` | Case index |
| `/cases/[slug]` | **The case page** (one long page, see anatomy below) |
| `/cases/[slug]/claims` | Claim explorer: grouped by theme, collapsed by default, headline claims first |
| `/claims/[id]` | Claim detail: statement, rung, provenance, credibility vs. diagnosticity, evidence, dependencies, assessment history |
| `/sources/[id]` | Source record: bibliographic identity, verification status, connected evidence and claims |
| `/method` | Methodology: atomic claims, the ladder, evidence direction, credibility vs. diagnosticity, provenance labels, how AI is and is not used |

## Case page anatomy (top to bottom)

1. **Dossier header** (dark register): case ID, title, and three questions — *What is claimed? Where does the disagreement live? What would settle it?* — plus assessment state and last-review date.
2. **Current assessment** — the AI structural roll-up (argued synthesis over the ladder), clearly labeled with model/date/review status.
3. **Overview article** (paper register) — magazine-quality prose; consequential sentences carry claim marks that open margin notes (desktop) or inline disclosures (mobile) showing the exact claim, its credibility, and a link deeper.
4. **Argument ladder** (dark register) — the case's claims arranged observation → mechanism → attribution, showing credibility decaying up the rungs. Hand-built SVG/CSS.
5. **Evidence highlights** — strongest supporting and strongest undermining, structurally symmetric.
6. **Best conventional explanation** — steelmanned.
7. **Research agenda** — crux-directed opportunities, linked to the public ResearchHub RFP.
8. **Change history** — dated, reasoned, with AI-assistance disclosure.

## Two typographic registers

- **Paper register** (default): warm paper surfaces, ink text, editorial serif. The narrative voice.
- **Dossier register** (accent): deep ink panels, monospace ID tags and labels, stat callouts. The record voice. Used for the dossier header, ladder, and evidence machinery so a reader always knows whether they're reading narrative or examining the record.

## Navigation behavior

- Article sentences link to claims; claims link to evidence; evidence links to sources; every deep page links back to case context.
- Claim IDs (`GEO-C001`) are visible, stable, and copyable.
- Mobile: margin notes become tap-to-expand disclosures under the paragraph; the for/against comparison stacks rather than shrinking side-by-side.

## Future (not in Phase 1)

Contribute, editor workspace, sign-in, search.
