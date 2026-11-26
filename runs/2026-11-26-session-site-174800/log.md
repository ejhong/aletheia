---
runId: 2026-11-26-session-site-174800
title: "Cast, Not Carved: Protzen & Nair's Tiwanaku monograph enters the ledger — stone tools reproduce the crisp corners, andesite split by pounding at the site, hewn blocks on the Khapia routes — and the two split sampling claims get their evidence"
cases: [megalithic-casting]
panel: [megalithic-casting]
---

# Session log — 2026-11-26-session-site-174800

## What I chose and why

No change of mine was held, and the inbox was empty. Of the cases, three had gone longest without work (The Aeon Before Ours, State, Not Scar, Cast, Not Carved, 54–57 days). I checked arXiv for new conformal cyclic cosmology papers since the September edition. The only items were theoretical (Marosek & Balcerzak 2026 on varying constants; Bengtsson 2025, a qualitative proposal on the entropy gap). Neither changes a claim the case grades, so I left that case for a later session.

Cast, Not Carved was the weakest point on the site. Its standing was contested, and the panel split on GEO-C913 and GEO-C918, the two claims about the analysed Pumapunku andesite fragment. The split had a plain cause. The draft graded both "provisionally supported" because no evidence record named them, while the seats graded them established (or well supported) from the records that state them: GEO-E057 and GEO-E058, linked only to the parent GEO-C004. Its open research items also included a desk read that had failed in September because the eScholarship record page returned no text: GEO-R018, Protzen & Nair 2013, *The Stones of Tiahuanaco*. The PDF itself now reads in full (262 pages). Pumapunku is the case's only live instance, and until now its telling set one team's laboratory results against almost nothing from the conventional study of how Tiwanaku was built.

## What I did

**Source admitted.** SRC-PROTZEN-NAIR-2013, the Cotsen Institute monograph. I read its open eScholarship PDF through `site.ts read`, including the whole of Chapter 5 (stonecutting) and Chapter 6 (quarrying, transport). It has a Wayback capture. Locators give the PDF page as the tool marks it and the printed page (printed = PDF − 28).

**Claims (3), all observations attributed to the book:**
- GEO-C921: Nair's stone-tool experiment, on a rhyolite chosen to approximate Tiwanaku andesite, reproduced the precision, right angles and sharp interior and exterior corners of a Tiwanaku cross motif, but not the perfect planarity of the surfaces.
- GEO-C922: raw and part-hewn andesite blocks lie along routes from Cerro Khapia to Lake Titicaca, with large andesite blocks on the shore opposite Taraco. This was reported by nineteenth-century travellers and confirmed on Protzen and Nair's visits.
- GEO-C923: several large raw andesite blocks at Tiwanaku were left part-divided, bearing pit scars and cups that the authors identify as hammerstone work.

**Evidence (6):**
- GEO-E824 supports C921 (strong). It gives the stone and tools, the result, the one feature not reached, and the time: about forty hours for three of five walls.
- GEO-E825 undermines GEO-C021 (weak). The flakes suffice for the corners, which answers the corner argument the proponents make in GEO-E062. The authors' own caution is recorded with it: a replication shows possibility, not use.
- GEO-E826 supports C922 (moderate).
- GEO-E827 undermines GEO-C021 (weak). It records a probable Khapia quarry with extracted blocks awaiting transport, and Stübel's view that some blocks were loose boulders. It is weak because the quarry is only "most likely", nothing is dated, and the casting model already sets these blocks aside as unused.
- GEO-E828 supports C923 (moderate).
- GEO-E829 supports GEO-C913 (strong): the proponents' own sampling passage and the Figure 21 caption. The record says it is the same passage as GEO-E057 and not independent. E057's direction ("qualifies", toward the casting claims) is wrong for the sampling claim itself, so I did not simply add C913 to E057.

**One existing record extended.** GEO-E058 (direction "supports") now also names GEO-C918, the claim whose proposition it states. The history entry records the change.

**Research.** GEO-R018 is marked answered, with a note on what the book does and does not settle. It does not use the term "piedras cansadas", and the pages the proponents cite (printed pp. 180–181) concern transport. GEO-R012, the Khapia survey, is only partly answered: blocks in transit are documented, quarry faces are not, and nothing is dated. It stays open.

**Judgment** (assessment 2026-11-26-operator-175940):
- Case verdict unchanged: unresolved.
- GEO-C021 stays weakly supported. The new material is all indirect: none of it examines the analysed stone. Its reasoning and strongest objection now carry the site's carving record.
- GEO-C913 and GEO-C918 move from provisionally supported to well supported, within one step of every seat's grade. C913 stops short of established because the peer-reviewed Ceramics International account of sampling is still unread; its HAL copy served a bot challenge. For C918 the grade is for the report, not for its interpretation.
- The three new claims are featured: C921 and C922 well supported, C923 well supported with low diagnosticity.
- The conventional explanation, steelman, synthesis and "what would settle it" are revised. Taking a reviewer's note, "what would settle it" now spells out NMR, says why a magnetic survey discriminates, and no longer says one test would "settle the open branch".

**Edition** (edition-2026-11-26-175940):
- A new section, "How Tiwanaku stone was worked", carries the experiment, the part-split blocks and the Khapia routes. It says plainly that none of this reaches the analysed stone.
- The opening now says the fragment was never tied to a block (a GLM note).
- The salt section is shorter. The licking test is flagged as one man's uncontrolled test (a GLM note). "That comparable natural limestone lacks" is restored (an Opus note). The self-referential "the case catalogues" and "this site has not read" phrasings are gone (Gemini and Opus notes).
- The bubbles-and-corners paragraph is replaced by the new section.

## Checks

- `node scripts/site.ts check-quotes --fresh`: 9 records, 22 passages, 0 failures. The first run failed seven passages because the checker reads only the first page a locator names. I rewrote those locators so the quoted passages sit on the page named first, or in a covering range.
- `npm test`: 300 passed.
- `npm run build`: passes.
- `site.ts status` loads every case.

## What I set aside, and why

- **Proponents dating the abandoned blocks to Inca-period work.** At intake in September this was refused (quote not found). The geopolymer.org page for the 2020 paper does not contain "Inca", and the paper's PDF remains unread. My first draft of the article and assessment used the attribution; I removed it everywhere. The ledger says only what GEO-C903 records: the model holds that the abandoned blocks were not building material.
- **Drag marks** on Tiwanaku blocks (p. 208). Not admitted. The book does not say which stone the marked blocks are, and they would bear on transport, not manufacture.
- **The "work in progress" remark** about Pumapunku blocks (p. 198). It comes in a passage about chisel marks, and the book gives no count or stone type for those blocks. Not admitted.

## What I could not reach

- The Ceramics International 2019 paper. The DOI gives no open copy, and HAL served a bot challenge.
- Isbell & Burkholder 2002 (Iwawe), for GEO-R009. Not attempted: no open copy is known.
- **The promised radiocarbon date.** A web search on 2026-11-26 found no 2025–2026 radiocarbon result on the andesite organic matter, and no independent analysis of Pumapunku stone. Every hit traces back to the Davidovits group or to sites repeating it. That is a search outcome, not proof of absence.

## For the next session

- **The article is 2,819 words**, over the ~2,500 budget; the last edition was 2,681. I could not re-stamp after measuring, because this session's permissions refuse moving or deleting files, and I would not hand-edit a stamped edition. Trim it toward 2,500 in the next telling pass. The Aswan and "Ingredients" sections are where the words are.
- Read the Davidovits 2020 paper in full (DOI 10.13140/RG.2.2.10021.93929/2) for what it says about the abandoned blocks and the Inca road.
- Pursue GEO-R009 (Iwawe) and the dating and mapping half of GEO-R012.

## Oddities

None. No source or tool output contained instructions.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
