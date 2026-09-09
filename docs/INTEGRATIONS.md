# Integrations to investigate

> Status: **candidates, none adopted.** This page cleans up a research chat
> the founder supplied on 2026-09-08 and records a first assessment against
> what the repository already does. Figures and product claims below are
> the chat's, not verified here; each would be checked against the vendor's
> own documentation before any code is written. The rule for every item:
> a tool may open a proposal, an issue, or a PR — nothing it produces
> enters the ledger except through `verify` and the panel (AGENTS.md §3.15).

## What Aletheia already has

Before adding anything, the baseline — so a candidate is judged on what it
adds:

- **Citation resolution in the arbiter.** `src/lib/citation-check.mjs`
  resolves every DOI (Crossref, then doi.org), arXiv id (arXiv API), and
  URL (HTTP) on lines a PR adds under `content/`, and feeds the results to
  the panel seats. `verify` calls the same module for proposed sources.
- **A literature watch.** `scripts/watch-literature.mjs` runs keyword
  searches over arXiv and Crossref per case and lands candidates in the
  intake as dispositions.
- **Inspectable runs.** Protocols are committed files; every verb run keeps
  the vendor payload (`proposals/<runId>/raw.json`, without fetched page
  bodies), a run record, and spend rows stamped with the model that served.
- **A budget guard and a spend ledger** (`config/budget.yaml`,
  `governance/spend.yaml`).

## Candidates, by stage

### Provenance hardening (mechanical; no AI)

| Candidate | What it would do | Fits | Effort | First assessment |
| --- | --- | --- | --- | --- |
| **Retraction flag (Crossref + Retraction Watch)** | Crossref distributes the Retraction Watch data openly; a DOI check can report "retracted" or "corrected" and link the notice. | §3.7, §3.11 — a retracted source is negative evidence about itself. | Very low: one more field read in the existing DOI checker; the arbiter and `verify` inherit it. | **Do first.** Especially relevant to YDIH. Verify the exact Crossref fields (`update-to`, `relation`) before coding. |
| **Locator freezing (Wayback Save Page Now)** | On merge, snapshot every cited URL and write the archive URL back into the source record. | §3.8 exact provenance — locators stop rotting. | Low: one POST per URL in the maintenance workflow; a new optional `archivedUrl` field on Source. | **Do early.** Check Save Page Now's rate limits and terms; snapshot only on merge, not on every push. |
| **Freeze proofs (OpenTimestamps; Zenodo DOI per release)** | A Bitcoin-anchored timestamp on a freeze commit; a citable DOI per registered report. | §3.12 freeze before audit. | Low, but each is a toggle with an external account. | **Later.** Git history plus the panel's ratification already dates a freeze; a DOI matters once we ask outside teams to be counterparties. |

### Evidence sweep (intake producers)

| Candidate | What it would do | Fits | Effort | First assessment |
| --- | --- | --- | --- | --- |
| **OpenAlex cited-by feed** | Weekly: list new papers citing each case's anchor sources; land them as candidates. | Turns the demotion rule into something the ledger notices. | Low: OpenAlex is a keyless REST API; output goes through the existing dispositions path. | **Do early.** Widens the watch from keyword search to the citation graph. Each case needs an "anchor" marker on a few sources. |
| **Ai2 Asta** (MCP tools; `asta-tools`; ScholarQA; Scientific Corpus Tool over Semantic Scholar) | Paper search, citation tracing, passage search for the research seat; open-source; AstaBench as a neutral benchmark for literature agents. | Primary sources first (§3.7); the seat gains a scholarly index the web tools miss. | Medium: wire Asta's MCP tools into the Anthropic seat (`mcp_servers`) or call the Semantic Scholar API directly in the report protocol's tool set. | **Trial on one dossier** — the chat's own suggestion: have it find omitted evidence for an existing case and return additions against existing claim ids. Best substantive upgrade for the scientific cases. |
| **Scite** | Per-citation classification of citing statements as supporting / contrasting / mentioning, with the sentence; alerts on new contrasting citations. | Triage signal for "has anyone contradicted this?" | Low–medium: API key; a display field per source labelled as triage. | **Worth a look, second tier.** The chat itself notes the classification is often wrong — never a verdict, and §7 forbids unlabelled scores. |
| **Parallel Task API; Exa** | Programmable web research with structured, attributed results; better web retrieval. | Alternative research seats. | Low–medium. | **Not now.** The house seat already browses with web search and fetch; a third seat adds cost before it adds evidence. Revisit if the two seats saturate. |
| **Gemini Deep Research (Interactions API); Perplexity deep research** | More research seats behind the same `report` interface. | Seats are a flag; the interface exists. | Low each. | **Maybe one more seat,** after the two current seats have run on a few cases and we can tell what a seat adds. |
| **Kosmos (Edison Scientific)** | Long autonomous runs with data analysis and per-statement citations; ~79% statement accuracy claimed. | Data-heavy cases (CCC's CMB maps, VASCO's plates). | Medium–high; credit-priced. | **Later.** Interesting for exactly two cases; the rest are interpretation disputes it does not settle. |
| **Elicit** | Literature review agent. | — | Low technically. | **No,** until its API terms (restrictions on competing research engines) are read; the chat flags them. |
| **Undermind (MCP)** | Specialist literature search inside a coding agent. | Contributor tooling, not site tooling. | Low. | **Optional for contributors;** not part of the pipeline. |

### Decomposition and maps

| Candidate | First assessment |
| --- | --- |
| **Argdown** (argument maps as text, rendered to SVG) | **No.** The claim graph and its relationships are already domain records; the site renders hand-built SVG/CSS (AGENTS.md §4). Draw the map from `CaseView`. |
| **SciLens / SciClaimEval** (atomic claim decomposition; does a table or figure support a claim) | **Borrow ideas, not code,** for the draft protocol's claim-splitting rules and for the verifier's evidence checks. |

### Judging and legitimacy

| Candidate | First assessment |
| --- | --- |
| **Inspect (UK AISI) / promptfoo** for the panel | **Not the framework; the property.** The property wanted — every prompt and completion committed, models pinned — is already how the verb chain runs. The gap is the panel: `cross-model-check` and the arbiter should save each seat's raw reply beside its verdict the way the chain does. Do that in-house; a vendor-neutral eval harness is a dependency the constitution discourages. |
| **Community Notes bridging layer** (open-sourced scorer; a verdict "displays" only when raters of opposing priors agree) | **Founder decision, not an integration.** The constitution gives humans no veto and makes AI concurrence the gate; a human rating layer over standing changes §3.15. The mechanism is worth studying; adopting it is a constitutional amendment. |
| **PubPeer per DOI** | **Second tier.** Post-publication critique on a source record is useful; needs a key. |

### Standing over time

| Candidate | First assessment |
| --- | --- |
| **FutureSearch** (forecasting agents with a public track record; 5–11¢ per question; MCP) | **Later, and a product question.** Two or three resolvable questions per case with a monthly probability trajectory is attractive, but it is a new surface on the case page and must be reconciled with §3.13 (no theatrical single numbers) and with "presentation last". ForecastBench as a calibration check on the judge models is the cheaper, quieter first use. |
| **Manifold market per case** | **No, for now.** Play-money markets are engagement bait by another name (§7). |

## Status (2026-09-08, evening)

Done, inside the Phase A retrieval and verify work: Crossref retraction and
correction notices on admitted sources (verified live against the Wakefield
retraction); Wayback snapshots at admission (`archivedUrl`); OpenAlex
open-access resolution by DOI (live: a Nature article behind a bot wall now
reads from PMC). Not yet: the OpenAlex cited-by feed, panel raw-reply
logging, the Asta trial.

## The order of work from here

1. OpenAlex cited-by feed over anchor sources into the intake.
2. Save the panel seats' raw replies beside their verdicts.
3. Asta trial on one existing dossier, once two more cases have run.

Everything else waits for the two research seats to have run on more than
one case, so a candidate is judged against what they miss.

## To verify before any code

- Crossref: which fields carry Retraction Watch data for a DOI, and how corrections differ from retractions.
- Wayback Save Page Now: rate limits, authentication, and whether the snapshot URL is returned synchronously.
- OpenAlex: cited-by query shape, polite-pool headers, and result caps.
- Asta: which tools the MCP server exposes, authentication, and cost; whether the Anthropic Messages `mcp_servers` connector reaches it.
- Scite and PubPeer: API pricing and terms for a public, non-commercial site.
