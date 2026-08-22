# Aletheia Image Style Guide

Current style version: **style-v1** (2026-08-22). Bump the version when the
canonical prompt changes, so regenerated art stays consistent within a version
and diffs between versions are deliberate.

## The two image registers — never confused

1. **Editorial artwork (AI-generated).** Covers, hero/brand art, textures,
   dividers. One signature style (below), always credited "AI-generated
   editorial artwork," always stylized enough that no one could mistake it
   for a photograph or for evidence.
2. **Plates (real imagery).** Photographs of sites, artifacts, murals,
   samples, micrographs, documents, data. Always real, always with
   provenance (photographer, date, source URL) and a verified license.
   Presented as numbered museum plates with a CSS duotone treatment —
   originals are never destructively edited, and hovering a plate restores
   the original color.

## The hard rule

**AI-generated images must never depict evidence.** No generated "photos" of
sites, artifacts, tool marks, chambers, lab results, micrographs, or
documents. Anything a reader could read as the record must be real imagery
with provenance. This is enforced in code: the image schema rejects
`source: generated` + `role: plate`, and the loader rejects generated images
embedded in the article's plate position. Do not weaken these checks.

Corollaries:

- Generated covers depict *ideas* (an allegorical wall, light through
  strata), not specific reconstructable scenes presented as documentation.
- If a generated image accidentally reads as a photograph, regenerate it
  with stronger engraving cues or discard it.
- Diagrams (ladder, timelines) stay hand-built SVG/CSS — never raster,
  never generated.

## House style: expedition lithograph (style-v1)

The signature is a 19th-century scientific expedition lithograph /
copperplate engraving — the visual language of Darwin-era journals: patient,
exact, beautiful because it is careful. It says "we looked closely" in a way
no stock photo can.

### Canonical prompt template (style-v1)

> 19th-century scientific expedition lithograph, copperplate engraving.
> **[SUBJECT — one or two sentences, allegorical or typological, never a
> specific evidence scene].** Fine cross-hatching and stipple shading,
> hand-engraved linework. Monochrome deep warm-black ink (#201b12) on aged
> warm cream paper (#f6f1e8), with one restrained oxidized-copper (#9a5b33)
> accent: **[WHERE THE SINGLE COPPER ACCENT GOES]**. Darwin-era
> natural-history journal plate aesthetic, generous plain paper margins,
> quiet composition. Absolutely no text, no labels, no captions, no border
> frame lines. Unmistakably an engraving — stylized editorial artwork, not
> photorealistic, no photograph.

Rules of thumb:

- **Palette is locked to the site tokens**: paper `#f6f1e8`, ink `#201b12`,
  copper `#9a5b33`. Exactly one copper accent per piece; everything else
  monochrome.
- Ban text in the image (models garble it; captions belong in HTML).
- Covers at 16:9; textures use large plain-paper fields so they crop well.
- Post-process: resize to ≤1600 px wide, JPEG quality ~75
  (`sips -s format jpeg -s formatOptions 75 -Z 1600 in.png --out out.jpg`).

### Existing style-v1 pieces

| id | role | subject |
|---|---|---|
| `IMG-SITE-HERO` | brand | parted strata, light, standing stone (unconcealment) |
| `IMG-SITE-DIVIDER-STRATA` | texture | sedimentary strata band with copper seam |
| `IMG-SITE-TAILPIECE` | texture | balance scale weighing stone against feather |
| `IMG-GEO-COVER` | cover | polygonal megalithic wall, copper keystone |

## Plates: sourcing and treatment

- Source from Wikimedia Commons (or user-owned photography). Run
  `node scripts/add-commons-image.mjs "File:..." <case-slug>` — it verifies
  the license permits reuse, downloads a 1600 px rendition, and emits a
  manifest entry with license/credit/provenance pre-filled. You write `alt`,
  `depicts` (observation language, not interpretation), `plateNumber`, and
  `claimIds`.
- Acceptable licenses: public domain, CC0, CC BY, CC BY-SA (the site credits
  and links the license; BY-SA imposes no obligation on surrounding
  content). Anything else: don't use it.
- The duotone unification lives in CSS (`.plate-img`), keeping originals
  pristine. Never bake the treatment into the file.
- Plates appear in the article via a `{plate:IMG-...}` block on its own
  line, and automatically on the detail pages of any claims listed in the
  plate's `claimIds`.

## Manifest requirements (enforced at build time)

Every image — generated or real — must have `license` and `credit`, or the
build fails. Generated images must also record `prompt`, `styleVersion`, and
`model`. Plates must also record `plateNumber`, `depicts`, and `provenance`.
An image file missing from `public/` fails the build.
