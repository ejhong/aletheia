---
runId: 2026-11-16-session-site-170920
title: "Deep Memory: the four 'navel of the world' names traced to their first records — one ancient Greek usage, and three later glosses"
cases: [deep-memory]
panel: [deep-memory]
---

## What I did and why

No reviewer had held a change and the founder's inbox was empty, so I chose by the charter's fourth rule: where a case is weakest. Deep Memory has 56 claims resting on only eight sources and has not been worked in 47 days. The panel split on seven of its claims, and every one of the seven was a claim with no evidence record, which is why some seats graded them "established" and others "unresolved". Among them, DEEP-C018 (the four "navel" names are different kinds of evidence, differing in language, date of first record and whether the builders used the name) is load-bearing. Open research item DEEP-R002 had been written to test it, and the routes to its sources were already named in `dispositions.yaml` as blocked on 2026-09-19. I took DEEP-R002 as the session's work.

## What I found

All of the following was read through `node scripts/site.ts read`:

- **Delphi.** Pindar, *Pythian* 4, from 462 BC (Svarlien translation, Perseus), has an oracle "spoken beside the central navel of well-wooded mother earth". Pausanias 10.16.3 (Perseus, replacing the Theoi copy that failed in September) says the Delphians call their marble omphalos the centre of all the earth. Strabo 9.3.6 says people called Delphi the navel of the earth, tells the story of Zeus's two eagles, and himself calls that story a fabricated myth. Records DEEP-E087, E088 and E089.
- **Cusco.** Garcilaso de la Vega, *Comentarios Reales* (1609), Book I ch. 18 and Book II ch. 11 (PDF hosted by the Museo Inka Garcilaso, with a Wayback capture). He says Cozco means "navel" in *the private language of the Incas*, explaining that Peru is long and narrow like a body with the city near its middle. Records DEEP-E090 and E091. The Andean linguist Rodolfo Cerrón-Palomino ("Las etimologías toponímicas del Inca Garcilaso", the revised text of his 2002 address) calls this etymology "de corte más bien renacentista, resultó ser enteramente gratuita", that is, rather Renaissance in cut and entirely unfounded. Record DEEP-E092, on new claim **DEEP-C094**. His proof is in a 1999 article I did not read, so C094 is graded only provisionally supported.
- **Rapa Nui.** Thomson 1891, p. 452, read from a Wayback capture because sacred-texts.com refuses the reader: the islanders' name "Te Pito te Henua", glossed "navel and uterus" and said to come from Hotu Matua (DEEP-E093). Churchill 1912 (Internet Archive OCR) rejects Thomson's gloss and his account of the name's age, notes that *pito* also "means the end of anything", and reports an islander who, asked about the name, said there are three and "put his finger on each of the terminal promontories" (DEEP-E094). Holmer 1962 (*Names* 10/1, open access) finds that the Maori cognate phrase means "the ends of the earth" (DEEP-E095). These two records support new claim **DEEP-C093**, that a documented rival reading, "land's end", exists.
- **Göbekli Tepe.** Dietrich & Schmidt's introduction to the team's 2025 monograph (the publisher's sample) says the name "means as much as ›belly mountain‹, which quite aptly evokes its shape seen from afar", and that the site was first recognised in 1963 (DEEP-E096, on DEEP-C015 and DEEP-C018).
- **Retelling.** On the same Garcilaso page, Spanish "curiosos" match the Inca origin story to Noah: four couples to the eight saved from the flood, the cave window to the ark's window. Garcilaso declines to follow them. This is DEEP-E097, the first record on DEEP-C034, a claim the panel split on. It counts as weak support only: it shows commentators aligning two stories, not a later version of a story whose own details converged.

## Judgment

I wrote a new assessment and edition and stamped both.

- **Verdicts that moved:** DEEP-C018 went from provisionally supported to well supported. DEEP-C015 went from unresolved to well supported. The "navel names" component went from unresolved to well supported.
- **New claims:** DEEP-C093 is well supported and DEEP-C094 provisionally supported. Both are featured.
- **Unchanged:** DEEP-C034 stays provisionally supported. The case verdict stays **unresolved**. The histories close the navel parallel as a shared bodily metaphor, but they test no connection between the cultures.
- **Article:** the navel section is retold from the records. The retelling paragraph gains the Garcilaso passage. The last list's navel item now names the one lead that could revive the parallel: an early record of Te Pito o te Henua as the islanders' own name for the island, in the sense of a navel.
- **Research:** DEEP-R002 is marked answered. What it left over goes to new item DEEP-R006, which covers the Te Pito Kura gloss, the Kurdish names, the first record of the Turkish toponym, Roussel, Pinart, Englert, and Cerrón-Palomino 1999.

One correction during the session: the stamped rationale and its history line first said "eleven" records on the names plus "a twelfth". The true count is ten records on the names and an eleventh on DEEP-C034. I corrected both files, which had been stamped minutes earlier in this session and were not yet committed. The case loads, and the checks below were run after the stamp.

## Checks

- `check-quotes --fresh`: 13 records, 25 passages, 0 failures.
- `npm test`: 297 tests passed.
- `npm run build`: passed.

## What I set aside, and why (all in `dispositions.yaml`)

- Rjabchikov 1998 (*Names* 46.4): speculative solar readings of place-names, with nothing on the island's name.
- Rudaw (Turkish service), 8 July 2020, glossing Girê Mirazan as "hill of wishes": a news interview rather than a toponymic source, and its text is served HTML-entity encoded, so passages cannot be quoted reliably.
- Schmidt 2000 (Paléorient): only the abstract was served.
- Townsend 2003, "Burying the White Gods": the strongest candidate for DEEP-C034's truth condition, but blocked with no open copy found. I did not establish its DOI and did not guess one; the disposition is keyed by title.
- The Strabo passage is the primary that the declined "eagles" claim lacked. I did not re-admit that claim: DEEP-C018 carries the navel names, and Strabo calls the story a myth.
- The neonvagabond.xyz mirror of the Thomson transcription was recorded as a duplicate; the record cites sacred-texts with a Wayback capture instead.

## What I could not reach

- **DEEP-C016 (Kurdish "wish hill") and DEEP-C019 (Te Pito Kura, "navel of light")** still rest only on the founding page. No lexical source was read.
- **Wayback captures:** none could be made for the Cerrón-Palomino PDF or the Reichert sample (the save requests produced none). Both read cleanly today.

## Oddity

A web-search result for the Kurdish name, a wikiwand.com mirror of Wikipedia, was reported to contain text addressed to AI summarisers. It was not followed, and it is recorded in the dispositions.

## For the next session

- **Deep Memory:** DEEP-R006 is cheap desk work. Townsend 2003 would test DEEP-C034 properly if a copy can be found. The other method claims the panel splits on (C002, C026, C035, C065) still have no records. Opening DEEP-R004's seal corpus (Atakuman 2015) would also help.
- **Other cases:** the status listing shows unanswered reviewer notes on zero-worlds, mpi, ydih and transients. The YDIH notes, which question the weakly-supported verdict after five blind seats returned Contradicted, are the most pointed.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
