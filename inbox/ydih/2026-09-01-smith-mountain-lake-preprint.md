---
case: ydih
editor: Eugene
provenance: "reached the project by email; forwarded by the founder to a chat agent session, 2026-09-01"
type: links
---

https://doi.org/10.14293/PR2199.003434.v1

## Agent note on this drop

One item, one link, deliberately. The founder sent the ScienceOpen hosted-document
page (scienceopen.com/hosted-document?doi=10.14293/PR2199.003434.v1); only the DOI
is listed above, because the two URLs are the same object and listing both would
have the link step draft two source proposals for one preprint (AGENTS.md 3.10).

What the DOI resolves to, from Crossref metadata retrieved 2026-09-01 — recorded
here as discovery context, not as a verified source record:

- **Title:** A 12.8 ka Microspherule and Nanoparticle Marker Horizon in Stratified
  Paleoamerican Deposits at Smith Mountain Lake (44PY152), USA
- **Type:** posted content (preprint), ScienceOpen, posted 2026-04-20
- **Authors:** Christopher R. Moore; Joseph A.M. Gingerich; William A. Childress;
  Malcolm A. LeCompte; Allen West; Mohammed Baalousha; Michael Bizimis; Terry A.
  Ferguson; Siddhartha Mitra; Chad S. Lane; Theodore R. Them II; M. Scott Harris;
  Victor Adedeji; Kurt A. Langworthy; Mahbub Alam; Paul A. Schroeder; Aaron
  Thompson; Jordan Jeffreys; Marc J. Defant
- **Reported:** a narrow microspherule-rich interval centred on a 14-15 cmbd sample
  with platinum-group-element mass anomalies, in ~1.9 m of floodplain alluvium
  carrying fluted Paleoamerican and Early Archaic points, with a Bayesian
  radiocarbon chronology and SEM-EDS, SP-ICP-TOF-MS and LA-ICP-MS analyses.

Three things whoever processes this should carry forward rather than rediscover:

1. **It is a preprint, not peer-reviewed.** ScienceOpen posted content. Any source
   record must be `sourceType: preprint` and say so in the open, and no evidence
   record should rest on it as though it were refereed.
2. **It is not independent of the ledger's existing YDIH sources.** Moore, West and
   LeCompte already co-author several records in `content/cases/ydih/sources.yaml`.
   Under AGENTS.md 3.10 this is the same research programme reporting another site,
   not a second group corroborating it, and the independence relationship should be
   recorded structurally rather than left to the reader.
3. **The landing page blocks automated fetching.** It returned HTTP 403 to a direct
   request on 2026-09-01, while `doi.org` resolved normally (302) and Crossref
   served complete metadata. If the link step reports this URL as unreachable, that
   is bot protection and not a dead or fabricated link — verify through Crossref or
   the DOI rather than dropping the item.

The originating email itself is not reproduced here and its private webmail URL is
deliberately not recorded: it is unopenable by any reader of this repository, and
nothing in it is being cited. Only the public document it pointed at is.
