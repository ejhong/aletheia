<!-- Unverified AI research report — working material, never citable (docs/AUTOMATION.md).
     runId 2026-09-10-report-pre-columbian-amazon-183738 · seat anthropic · model claude-fable-5-1 · protocol report-v1 · 2026-09-10
     searches 14 · fetches 15 · tokens in 78 out 23618 -->

I'll start by orienting on the record's gaps and running a batch of independent searches.
# Working report — AMZ-001 "The Emptied Amazon" (bounded pass, 2026-09)

**Pass focus.** The record's single unverified, key-less source is the primary text itself (`SRC-CARVAJAL-1542`), and the featured manuscript claim `AMZ-C002` rests on one secondary anchor (`AMZ-E005`, Denevan 1996). I therefore spent this pass opening and reading the two nineteenth-century scholarly editions that carry the witnesses — Medina's 1894 Seville edition and Oviedo's *Historia general* (RAH 1855, t. IV) — and checking the featured numerical claims against them directly. A second line (collapse-timeline primary sources: Acuña 1641, Fritz 1686–1723; and the Peripato 2023 / Prümers 2022 / Rostain 2024 remote-sensing papers) was started but my retrieval budget ran out before those texts could be opened; they are recorded below as leads, not findings.

---

## 1. Findings

**F1. The Carvajal primary text is openly accessible and can be verified — `SRC-CARVAJAL-1542` should stop being "unverified".**
Opened: José Toribio Medina (ed.), *Descubrimiento del río de las Amazonas* (Sevilla, dated in the dedication "6 de Diciembre de 1894"), Harvard copy digitized by Google, full OCR text at [archive.org/details/descubrimientod00carvgoog](https://archive.org/details/descubrimientod00carvgoog). Also opened (metadata only, lending-restricted): the Heaton 1934 English translation, American Geographical Society Special Publication 17, [archive.org/details/discoveryofamazo0000carv](https://archive.org/details/discoveryofamazo0000carv). *Adds to:* `SRC-CARVAJAL-1542` (identifiers), `AMZ-R002`.

**F2. There are three witnesses, not two — and the "8,000 warriors" figure lives in only one of them.**
Medina's introduction (pp. x–xi) states that he had two manuscripts: an *incomplete* copy in the Muñoz collection at the Real Academia de la Historia, and a *complete* manuscript owned by the Duque de T'Serclaes de Tilly; he printed the Duke's text and footnoted the important variants of the Muñoz copy ("anotando las variantes de alguna importancia"). He further judged that both are "obra de una misma mano" and that the variants arise either from copying at dictation by unskilled scribes or from the author himself adding or suppressing phrases. Oviedo's version is a third, independent redaction.
Checked in the text: at Medina p. 39–40, the main (T'Serclaes) text reads only that "se habían ya juntado muchos indios"; the footnote gives the *variant* "más de ciento y treinta canoas, en que había más de ocho mil indios." So the 8,000 is a Muñoz-copy reading absent from the complete manuscript. *Corrects/refines:* `AMZ-C002` currently lumps 50,000, 10,000 and 8,000 together as "the Medina/Muñoz branch"; the 8,000 is narrower than that. *Bears on:* `AMZ-E005`, `AMZ-R002`.

**F3. Verified in the Medina main text: the 50,000, the 5,000, the 80 leagues, the five-league village, and the "a thousand men for a year" food store.**
- p. 30–31: Machiparo's settlements "juntan de pelea cincuenta mil hombres de edad de treinta años hasta setenta."
- p. 33–34: turtles in corrals, meat, fish and biscuit "para comer un real de mil hombres un año."
- p. 40–41: Machiparo's territory "duró más de ochenta leguas… todas pobladas," village to village within a crossbow shot, and "hubo pueblo que duró cinco leguas sin restañar casa de casa."
- p. 46–47: Paguana's first village "más de dos leguas de largo," with "muchos caminos la tierra adentro"; a later village "duraba más de dos leguas y media" with several *barrios* each with its own landing.
- p. 53–54: "levántanse más de cinco mil indios con sus armas."
*Supports:* `AMZ-C001` (settlement, food stores, roads), `AMZ-C002`. **Negative result:** I could not locate a "diez mil" (10,000) warriors figure anywhere in the OCR of the Relación; this may be an OCR miss or the figure may sit in a passage I did not identify. `AMZ-C002`'s "10,000" should be flagged as *not yet located in the primary text by this ledger*.

**F4. Carvajal himself says the interior was unobserved and the count was inference.**
Medina p. 41: because they went "de pasada é huyendo," they had no chance to learn "qué es lo que había en la tierra adentro," and the judgment that it "debe ser la más poblada que se ha visto" is explicitly from the *appearance* of the land and from what Aparia's people told them. *Adds to:* `AMZ-C017` and `AMZ-C016` — the source itself limits its evidence to the riverbank, which is exactly the river-distance gradient in `AMZ-C013`.

**F5. Oviedo's redaction is verifiably more restrained on the same passage — and says the villages could not be counted.**
Opened: Gonzalo Fernández de Oviedo, *Historia general y natural de las Indias*, RAH ed. 1855, t. IV, lib. L, cap. XXIV, full OCR at [archive.org/details/historiageneral04fernguat](https://archive.org/details/historiageneral04fernguat); the Machiparo passage falls between the printed page markers 552 and 558. Observed:
- Arrival "Cumplidos doce dias del mes de mayo de mill é quinientos é quarenta y dos" at Machiparo; **no warrior count** at this point (the Medina text has 50,000 here).
- "más de mill tortugas en corrales é pozos de agua."
- Pursuit by "una flota ó armada de más de cient canoas" (Medina variant: 130 canoes / 8,000 men); populated shore "más de sessenta leguas de poblado" (Medina: more than eighty).
- "No se pudieron contar todos los pueblos desta provincia de Machiparo," because some were passed at night and "en la verdad ybamos huyendo"; "La tierra adentro no se pudo ver lo que avia."
- Downstream: a village on a two-league savanna where "todo él era una calle" with well-ordered houses on both sides and "mucho mahiz"; a province with "más de ciento é cinqüenta leguas de costa."
- A regex search for "mill indios/hombres" and "cinco/ginco mill" in the chapter found no hits (OCR caveat) — I therefore could **not** independently confirm Denevan's statement that Oviedo retains a ~5,000 figure.
*Strongly supports* `AMZ-C002`'s core (the crowded world survives; the extreme numbers do not) and *adds* a primary locator; *qualifies* the "~5,000 in Oviedo" sub-claim pending a page check. Oviedo also vouches for Carvajal personally — Medina p. xiii quotes Oviedo that the friar "debe ser creído" on the strength of his two arrow wounds — which is credibility evidence, not diagnosticity.

**F6. Oviedo's redaction also preserves Carvajal's empty stretches**, e.g. "tres días sin poblado" near the start of the descent and the note that returning upstream was impossible beyond "tres leguas en un dia." Medina's text likewise: "Caminamos tres días sin poblado ninguno" (p. 8) and later "más hambre y despoblados que de antes" where "el río venía de monte á monte." *Supports* the "interspersed with stretches he reports as empty" half of `AMZ-C001` from both branches — useful for `AMZ-R001`'s corridor classification.

**F7 (lead, not finding). Collapse-timeline primary sources are digitized but were not opened.** A book review I did open ([dialnet.unirioja.es/descarga/articulo/7487240.pdf](https://dialnet.unirioja.es/descarga/articulo/7487240.pdf)) of the 2009 Arellano/Díez Borque/Santonja edition states that Acuña left Quito in 1639 with Teixeira's expedition and that the account was published in Madrid in 1641. Search results (not opened) locate Markham's 1859 Hakluyt volume containing Acuña in English at [archive.org/details/expeditionsintov00markrich](https://archive.org/details/expeditionsintov00markrich) (item page opened; full text not retrieved) and the Fritz journal (Hakluyt 1922) at HathiTrust. These are the missing middle of `AMZ-R005`: witnesses between 1560 and the eighteenth-century "silence".

---

## 2. Best account

The record's central move — trust the *kind* of world Carvajal described, discount his arithmetic — now has direct primary-text support rather than a single secondary citation. Reading the three witnesses side by side, the qualitative picture is invariant: continuous riverbank settlement for tens of leagues, villages of two to five leagues, storehouses of turtles and maize, roads running inland, organized war fleets. What varies is exactly the quantitative layer: 50,000 warriors is present only in Medina's main text; 8,000 only in the Muñoz-copy variant; Oviedo gives no warrior count at Machiparo and states outright that the villages could not be counted. The ratios are also softened in Oviedo (60 vs 80 leagues; >100 vs 130 canoes). Medina's own philological judgment — one author, variants from dictation or authorial revision — cuts two ways: it makes the 8,000 plausibly Carvajal's own later "improvement," which is a credibility mark against his numbers specifically, while leaving the shared descriptive core untouched.

Crucially, the source itself confines its evidence to the bank. Carvajal says the interior was unseen and infers its populousness from appearance and hearsay; Oviedo's redaction says the same. This is the ethnohistorical counterpart of `AMZ-C013`: the 1542 testimony is *evidence about river corridors and silent about the matrix*. The heterogeneous-Amazon thesis (`AMZ-C016`) is thus not imposed on Carvajal against his grain — it is what his text, read closely, actually licenses.

Competing readings survive. (a) *Exaggeration throughout*: even Oviedo's 60 leagues of settlement may be a flight-distorted impression; the "could not count" passage is as consistent with honest uncertainty as with inflation. (b) *Truthful but atypical*: Orellana rode the richest corridor at its richest moment; Nunes and the Ursúa accounts (`AMZ-E007`) corroborate the same reach, not the basin. (c) *Later revision*: if Medina is right that the variants are authorial, some of the "unstable" numbers are Carvajal's, not a copyist's, and `AMZ-C017`'s "textually unstable" should be read as "author-unstable," which is a stronger reservation. None of these disturbs the qualitative core; all of them bear on how much weight `AMZ-C001` can carry into demography.

What I could not advance this pass is the *disappearance* leg: the 1639 and 1686–1723 witnesses exist in accessible editions but were not read, so the record still jumps from 1560 to Newson's regional numbers (`AMZ-E008`) without river-corridor testimony in between.

---

## 3. Proposed changes

1. **Source (verify + add keys) — `SRC-CARVAJAL-1542`.** Add identifiers: `url:archive.org/details/descubrimientod00carvgoog` (Medina 1894 ed.); `url:archive.org/details/discoveryofamazo0000carv` (Heaton 1934 tr., AGS Spec. Pub. 17; lending-restricted). *Observed:* Medina's dedication dated Seville, 6 Dec 1894; edition prints the T'Serclaes MS with Muñoz-copy variants in footnotes. *Inference:* status can move from "unverified" to verified-by-edition. Bears on all `carvajal`-theme claims.

2. **Source (new) — Oviedo, *Historia general y natural de las Indias*, RAH 1855, t. IV, lib. L, cap. XXIV**, `url:archive.org/details/historiageneral04fernguat`. *Observed:* Oviedo's independent redaction of the voyage, Machiparo passage between page markers 552–558. *Inference:* this is the primary locator behind `AMZ-E005`; the ledger currently cites the branch only via Denevan. Bears on `AMZ-C002`, `AMZ-C017`, `AMZ-R002`.

3. **Evidence (new, supports/refines `AMZ-C002`) — "Medina prints 50,000 in the main text; 8,000 appears only as a Muñoz-copy variant; Oviedo gives no Machiparo count and says the villages could not be counted."** Source: items 1 and 2 above; locators Medina pp. 30–31, 39–40 (footnote), 40–41; Oviedo t. IV pp. ~553–556. *Observed:* as in F2, F3, F5. *Inference:* the extreme figures are distributed across witnesses unevenly, so "branch" is too coarse; recommend re-wording `AMZ-C002` to name the witness for each figure and to flag "10,000" as not yet located. Strength: strong (primary).

4. **Evidence (new, supports `AMZ-C001`, qualifies `AMZ-C017`) — "Carvajal states the interior was not observed; populousness inland is inferred from appearance and hearsay."** Source: Medina p. 41; Oviedo t. IV (same passage: "La tierra adentro no se pudo ver"). *Inference:* the account is riverbank evidence only, which should be written into `AMZ-C017`'s scope and into `AMZ-R001`'s design (Carvajal predicts corridors, not interfluves). Strength: strong.

5. **Evidence (new, supports `AMZ-C001` "empty stretches") — both witnesses record multi-day unpopulated reaches** (Medina p. 8 "tres días sin poblado ninguno"; Oviedo "tres días sin poblado"). *Inference:* the empty reaches are as textually stable as the populous ones, which is what makes `AMZ-R001` a real test rather than a one-sided confirmation.

6. **Claim (amend) — `AMZ-C002`.** Proposed wording: "The 50,000-warrior figure and the 80-league/five-league settlement lengths stand in the complete (T'Serclaes) manuscript printed by Medina; the 8,000-warrior/130-canoe figure appears only as a Muñoz-copy variant; Oviedo's redaction gives ~60 leagues and >100 canoes, no Machiparo warrior count, and states the villages could not be counted." Keep the "~5,000 in Oviedo" and "10,000" sub-points but mark them *unverified in this ledger's own reading*.

7. **Research (link) — `AMZ-R002` synoptic witness table.** Add the concrete three-witness structure (T'Serclaes / Muñoz / Oviedo) and Medina's authorial-variant hypothesis as the table's spine; note Medina's remark that the Muñoz copy is incomplete (so absence of a passage there is not evidence of absence).

8. **Research (link) — `AMZ-R005`.** Add Acuña 1641 (Markham 1859 English text at the archive.org item above; Spanish editions 1891, 2009) and Fritz's journal (Hakluyt 1922, HathiTrust) as the required 1639 and 1686–1723 corridor witnesses. *Not evidence yet — unopened.*

**Considered and not proposed:** the BYU *Comparative Civilizations Review* essay "Amazonian Civilization?" surfaced in search (returned as PDF bytes; not read) — a secondary synthesis, not needed given primary access. Peripato et al. 2023 (*Science*, 10.1126/science.ade2541), Prümers et al. 2022 (*Nature*, PMC9177426), Rostain et al. 2024 (*Science*) and the published reply to it: all highly relevant to `AMZ-C004`, `AMZ-C007`, `AMZ-C020`, `AMZ-C022`, but I could not open them (paywall/CAPTCHA/access error) and will not propose records from snippets. Denevan's "10,000" — I do not propose deleting it; I propose marking it unlocated pending a page-level check of Medina and Oviedo.

---

## 4. Narrative

- The article's line "his chronicle survives in two main manuscript families" should become *three witnesses*, and the sentence on the extreme numbers should place each figure with its witness (F2, F3, F5). The rhetorical payoff is stronger, not weaker: the most-quoted number (50,000) sits in one manuscript; the second (8,000) sits in a footnoted variant of an incomplete copy; the third witness says the villages could not be counted.
- Add one sentence quoting Carvajal's own admission that the interior was unseen (F4). It ties the friar directly to the "sparse Amazon" section and pre-empts the objection that the case is using a riverbank chronicle as basin evidence.
- Objects/plates: a page image of Medina 1894 p. 39–40 showing the "Variante… ocho mil indios" footnote would be the single most instructive new plate — it makes textual instability visible. Alternatively the Oviedo 1855 t. IV page carrying "No se pudieron contar todos los pueblos." Both are public-domain scans on archive.org. Existing plates `IMG-AMZ-P01`–`P04` remain apt; none illustrates the text-critical section, which is currently the only illustrated-article section without an image.

---

## 5. Next questions

1. **Locate or retire "10,000."** Page-level check of Medina (both text and footnotes) and of Oviedo for a *diez mil(l)* figure; also check whether Denevan 1996 (`SRC-DENEVAN-1996`) attributes it to a specific passage. Decisive for the wording of `AMZ-C002`.
2. **Confirm "~5,000 in Oviedo"** by reading the chapter rather than regex (OCR renders *cinco* as *ginco*, *mil* as *mill*).
3. **Muñoz copy provenance.** Medina says the copy is incomplete and its exemplar unknown. Has the RAH manuscript been re-examined since 1894 (e.g., in modern critical editions)? This determines whether "authorial revision" or "scribal inflation" is the better account of the 8,000.
4. **Corridor witnesses 1639–1723.** Read Acuña (Markham 1859 / 2009 ed.) and Fritz (Hakluyt 1922) for the Machiparo–Omagua reach specifically: population, settlement continuity, and slaving. This is the empirical core of `AMZ-R005` and the strongest available test of "a world that died between the visits" versus "a world exaggerated in 1542."
5. **Open the three remote-sensing papers** (Peripato 2023; Prümers 2022; Rostain 2024 + reply) via institutional or preprint routes; Peripato's basin-wide earthwork prediction is the natural comparator for `AMZ-C004`'s 24,000–30,000 in one region and for `AMZ-C020`.
6. Keep in the deeper record even if the article is unchanged: Medina's statement of editorial method (pp. x–xi) and Oviedo's character reference for Carvajal (Medina p. xiii) — credibility evidence that should be filed as such, separately from diagnosticity.

---

## 6. Coverage

**Searched:** Carvajal editions (Medina 1894, Heaton 1934); Oviedo t. IV; Peripato 2023; Prümers 2022; Rostain 2024; Acuña 1641; Fritz journal; Markham 1859.
**Opened and read (full OCR text):** Medina 1894 *Descubrimiento del río de las Amazonas* (archive.org, Harvard/Google scan) — introduction pp. x–xiii and the Relación passages cited by page; Oviedo *Historia general* RAH 1855 t. IV, lib. L, cap. XXIV (archive.org) — Machiparo–Omagua passages between page markers 552–558. **Opened (metadata/secondary only):** Heaton 1934 item page (lending-restricted); Markham 1859 item page (full text not retrieved); Dialnet review of the 2009 Acuña edition; etnolinguistica.org catalogue page for Acuña 1641.
**Could not reach:** Peripato 2023 (*Science*, access error); Prümers 2022 (PMC, CAPTCHA); Rostain 2024 and the ResearchGate reply (access error); Markham 1859 and Fritz 1922 full texts (retrieval budget exhausted); Acuña 1641 primary text.
**Unexamined this pass:** all archaeological sources already in `index` (not re-read); the Nunes letter and Ursúa accounts behind `AMZ-E007`; `AMZ-C018` (Hancock) and `AMZ-C025` (linguistics); Denevan 1996 itself, which I did not re-open to compare his page references against mine. OCR caveat throughout: numbers and figures were confirmed by reading the surrounding passage, but regex-based *negative* searches (no "diez mil", no "cinco mill" in Oviedo) are weaker than positive finds and are labeled as such above.
