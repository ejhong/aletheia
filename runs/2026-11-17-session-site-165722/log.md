---
runId: 2026-11-17-session-site-165722
title: "Collapse, Not Computation: the 2026 XENONnT collapse bound enters the ledger as a source and claim; the session stopped before its evidence and edition"
cases: [orch-or]
---

## What I chose and why

No change of mine was held and the inbox was empty, so I worked on the case left longest since anyone touched it. Orch-OR had gone 48 days, and the panel split on two of its claims:

- **ORCH-C012** (microtubule drugs change anesthetic susceptibility). All four blind seats graded it well supported. The draft graded it mixed. The claim as worded says only that susceptibility *changes*, which every study shows; the draft's "mixed" was about *direction*. The fix I planned was to split off the directional claim (stabilizers consistently give resistance) and grade each part separately.
- **ORCH-C046** (the LISA Pathfinder bound). It is unresolved only because no evidence record is attached to it.

## What I found

- **XENONnT, Phys. Rev. Lett. 136, 120201 (27 March 2026)**, arXiv:2506.05507v2, read in full. It finds no collapse radiation in 1.16 tonne-years of xenon electronic-recoil data. It sets R0 > 4.9 × 10⁻¹⁰ m at 90% confidence for the Markovian Diósi–Penrose model, about five times the Majorana bound. The authors say coloured and dissipative extensions remain open. The supplement says their rate follows Diósi's convention, which differs from Penrose's by 8π. Two of the authors (Curceanu, Piscicchia) also wrote the Gran Sasso paper already in the case, so the two results are not fully independent on the theory side. The ledger did not have this paper.
- **Khan et al. 2024 (eNeuro), published review history.** The authors agreed with a reviewer that they had not shown destabilization. They adopted the reviewer's reading that epothilone B probably blocks isoflurane's binding pocket, and removed their references to stability disruption.
- **Emerson et al. 2013**, full text (the PMC author manuscript). The discussion reports in-vitro data that propofol and isoflurane promote tubulin polymerization, much like taxol. The authors conclude that "anesthetics may destabilize in either direction".
- **Li et al. 2025**, full text. Epothilone D (a stabilizer that reaches the brain) and vinblastine made mice more sensitive; paclitaxel made them slightly more resistant. The authors note that paclitaxel and vinblastine cross the blood–brain barrier poorly.

## What this change contains

- `sources.yaml`: a new source, SRC-APRILE-2026 (the XENONnT paper), read in full on 2026-11-17. SRC-LI-2025's address now points at its PMC full text, with a Wayback capture as `archivedUrl`, because the DOI's open-copy route returns a download placeholder instead of the text. A note on SRC-EMERSON-2013 says which copy was read.
- `claims.yaml`: a new claim, ORCH-C125 (the XENONnT bound), anchored on the abstract.
- `research.yaml`: ORCH-R013 (the desk audit of the dynamics behind Penrose's rate) now names ORCH-C125 among its claims.

No evidence record, assessment or edition is in this change. The case's verdicts and its article are unchanged, so no panel is named.

## What was not done, and why

I was writing the evidence records (for ORCH-C046 from Helou 2017, for ORCH-C125 and ORCH-C030 from XENONnT, and for the split-off directional claim) when the session's output was stopped. I did not try to write them again. The split-off claim had no record left citing it, so I removed it to keep the ledger loadable. This session added no history entries for the ledger edits above; the next session should add them along with the records.

## What the next session should do

1. Write the evidence records described above from the sources already read (the reading tool has them cached). Add the history entries for this session's source, claim and research changes.
2. Split ORCH-C012 as planned. Grade the "changes" claim on its wording, and the directional claim on Emerson (both directions), Khan (and its own retreat from stability), Li (epothilone D against, paclitaxel weakly for) and Huang.
3. Write a new assessment and edition: ORCH-C046 graded from its record, ORCH-C125 entered, and the physics paragraph updated (the radiation bounds are now far tighter than LISA's, and LISA matters for its channel, not its size). Then name the case for the panel.
4. Run `check-quotes --fresh`, `npm test` and `npm run build`. None was run this session beyond a status load, which passed.
