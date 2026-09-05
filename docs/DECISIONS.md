# Decisions log

Append-only. Record every material product, design, or architecture decision with a date. Strike through rather than delete.

- **2026-08-22 — Name: Aletheia.** Replaces the working title "Athanatos Evidence Atlas." Greek for "truth as unconcealment" (lit. "un-forgetting"); sister construction to "Athanatos" ("un-dying"). Name remains a single config value so it can change cheaply.
- **2026-08-22 — Visual direction: paper-toned editorial base with a dark "dossier" register as an accent.** Synthesis of two references: athanatosfoundation.org (editorial serif, museum gravitas) for the reading layer, and followtheepicenter.com (numbered sections, monospace ID tags, stat callouts, forensic-exhibit cards) for the claims/evidence layer. Two typographic voices on one page: narrative vs. record.
- **2026-08-22 — Article-first architecture.** The signature interaction is the annotated overview article: claim-marked sentences open the exact claim in a margin note (desktop) or sheet (mobile). The claim graph is machinery under the article, not a co-equal destination. Three signature elements get the polish budget: inline claim margin-notes, the argument ladder (credibility-decay diagram across a claim chain), and the case dossier header (what's claimed / where the disagreement lives / what would settle it).
- **2026-08-22 — Scope: one deeply-realized case plus light stubs**, not five cases across thirteen routes. Simplified route set: home, case page (one long page: article + ladder + evidence + crux + research + changelog), claim explorer, claim detail, source detail, method.
- **2026-08-22 — Content format: folder-of-files per case** (case metadata, overview article in markdown with inline claim references, claims/evidence/sources in structured files), validated loudly at build time, hot-reloadable. No CMS or database in Phase 1; layout chosen to map cleanly onto Git-backed content in Phase 2.
- **2026-08-22 — Confirmed: geopolymer is case #1 (deep).** Seeded from the prior work in `~/prj/geo` (95-topic catalog, AI-verified citations, ResearchHub RFP draft). Vasocomputation is case #2 (medium depth, built later from the "Knots of Existence" Substack article in `research/vasocomputation/` plus Michael Johnson's published QRI works). Real citations may be used — superseding the starter kit's placeholder-only demo-content rules, which were written for invented content. See `docs/CONTENT_POLICY.md`.
- **2026-08-22 — Provenance correction: the geo catalog is AI-extracted, not human-verified canon.** The T-number catalog was extracted chapter-by-chapter by an AI agent (Fable) with no human hand-checking of individual claims; Eugene edited only the RFP after AI prioritization. Consequence: every claim carries a review-state provenance field (`ai_extracted` | `human_reviewed` | `disputed` | `rejected`) displayed honestly in the UI. Geo-derived claims enter as `ai_extracted`. Rejected claims keep their record with status `rejected` plus a reason (a tombstone, so future extraction runs don't re-propose them). Geo's "verified citations" batch was also AI-performed verification — sources from it are labeled `ai_verified`, distinct from `verified` (held in the project library) and `unverified`.
- **2026-08-22 — Static site served from git.** Next.js static export (`output: 'export'`), deployed to GitHub Pages via GitHub Actions. Zero servers. Base path is injected by the deploy workflow so the site works both at a repo subpath and on a custom domain.
- **2026-08-22 — Layered, reversible content.** Human/canon content and AI-generated overlays live in separate files. Every AI-generated record carries a `runId` stamp. AI assessments are append-only overlay records (`{claimId, model, date, promptVersion, verdict, reasoning, confidence}`) in `assessments/<run>.yaml`, never mutations of claims. The UI shows the latest assessment with history available.
- **2026-08-22 — Overall case assessment is a structural roll-up, not a score.** The AI reasons over the claim dependency ladder — which rungs are load-bearing, where the weakest links are — and produces an argued synthesis. Modeled as a case-level assessment record with reasoning fields. The initial layer is one illustrative Fable-generated draft, labeled as such, with no human review claimed.
- **2026-08-22 — Claim organization at scale: theme + rung.** Every claim has a theme/group field and a ladder rung (`observation` → `mechanism` → `attribution`). The UI shows grouped/collapsed views with headline claims first; no flat overwhelming lists.
- **2026-08-22 — Solo-maintainer code rules.** Minimal dependencies: Next + TypeScript strict + Tailwind + Zod (plus `yaml` for the content format and vitest as a dev-only test runner); hand-built SVG/CSS for the argument ladder; no chart or UI libraries. Three zones with one-way flow: content files → domain loader (Zod validation, failing loudly on dangling IDs) → pure UI components. One component per domain concept. Build-time validation so malformed content fails the deploy. Small tests only for the schema validator/loader. CI runs typecheck + lint + test + build.
- **2026-08-22 — Research agenda links out to the public ResearchHub RFP.** The case research section uses the public framing from geo's `rfp.md`. Nothing from geo's `arc/` or `notes.txt` may surface. Hawke-derived topics (T-089–T-093) stay neutrally framed ("test whether method X discriminates cast from natural") with no citation of confidential papers. The RFP URL is a config value, rendered only once the RFP is live.
- **2026-08-22 — Image system: two registers, one hard rule.** Editorial artwork is AI-generated in a single house style — 19th-century expedition lithograph / copperplate engraving, palette locked to the site tokens (paper/ink/copper), versioned as `style-v1` in `docs/IMAGE_STYLE.md` — and always credited "AI-generated editorial artwork." Evidence imagery ("plates") is always real photography with provenance and verified license (Wikimedia Commons or user-owned), presented as numbered museum plates with a non-destructive CSS duotone (hover restores the original). **Hard rule, enforced in the schema and loader: AI-generated images may never be plates or depict evidence.** Every image lives in a validated manifest (`content/images.yaml`, `content/cases/<slug>/images.yaml`); missing license/credit or a missing file fails the build. Plates embed in articles via `{plate:IMG-...}` blocks and appear automatically on the claim pages listed in their `claimIds`.
- **2026-08-22 — Image automation.** `scripts/add-commons-image.mjs` ingests a Commons file by title: verifies the license permits reuse, downloads a 1600px rendition, and emits a manifest entry with license/credit/provenance auto-filled from the Commons API. The `generate-case-art` workflow (workflow_dispatch) generates cover candidates for a case slug in the house style via the OpenAI Images API and opens a PR for human selection; it fails with clear instructions until the `IMAGE_API_KEY` repository secret is added. Principle: adding beauty to a new case = one workflow trigger + one PR review.
- **2026-08-22 — Next workstream after this build: the extraction pipeline.** Its first test is re-running the Fóti and Davidovits books through extraction and diffing the output against the geo catalog as ground truth. See `docs/ROADMAP.md`.
- **2026-08-22 — Maintenance model: commentator-in-chief.** The user confirmed the operating model in `docs/MAINTENANCE.md`: an `inbox/` directory takes documents, link lists, and freeform commentary notes; a weekly (+ on-demand) Maintain workflow routes them — commentary becomes proposed editorial actions with the editor's verbatim text preserved as the authoritative human record, links become verified source-record proposals, documents go through the extraction pipeline — and refreshes append-only AI assessment overlays for cases whose evidence changed since the last run. All output is runId-stamped and lands in `proposals/` or PR branches, never directly in content. PRs carry plain-language digest bodies and a **tiered, fail-closed merge policy**: `auto:low-risk` (proposals, inbox moves, new append-only overlays, append-only catalog/source additions) auto-merges when CI is green; `needs-approval` (featured claims, article text, review states, human-attributed content, code) requests review for a one-tap phone merge. `scripts/classify-pr-risk.mjs` re-derives the class from the actual diff on every PR and fails a mislabeled low-risk PR, blocking auto-merge.
- **2026-08-22 — Hancock meta-case dropped; YDIH confirmed definite.** Supersedes the meta-case entry in the slate below: there will be no Hancock category or meta-case. Its constituent questions are split into standalone cases, and case #8 is now the **Younger Dryas Impact Hypothesis** — a cosmic impact/airburst ~12,800 years ago as the trigger for the Younger Dryas cooling, megafaunal extinctions, and cultural disruption. Chosen for its research richness on both sides (Comet Research Group evidence lines: platinum anomalies, nanodiamonds, black mat stratigraphy; comprehensive critiques, e.g. Holliday et al. 2023's "requiem" paper) and because it is an Athanatos Foundation–funded research area (UofSC/UCSB). Other formerly-Hancock-adjacent questions (e.g. cultural motif transmission) may become future standalone cases as warranted.
- **2026-08-22 — Confirmed case slate: eight cases.** The full slate (see `docs/ROADMAP.md` for detail and research-document filenames): geopolymer (live), vasocomputation (in flight), Orch OR, VASCO transients, Lucadou's Model of Pragmatic Information, **Zero Worlds** (confirmed as a standalone case: observer-first theories of reality — Hoffman, Müller, Wolfram — based on the user's "Zero Worlds" essay plus a forthcoming research report), **CCC** (Penrose's Conformal Cyclic Cosmology: low-variance CMB circles, Hawking points, and the disputed null-model statistics of the rebuttals), and the Graham Hancock pre-Ice-Age meta-case (sub-cases referenced rather than rebuilt; scoping deferred pending a dedicated discussion).
- **2026-08-22 — Claim tiers: `featured` vs `catalog`.** The claim schema gains a `tier` discriminator. Featured = the existing full treatment (plain-language gloss, credibility/diagnosticity, objections, relationships); all pre-existing claims became `tier: featured`. Catalog = a lightweight, honestly-unreviewed backlog record: one atomic statement + theme + rung + a required source anchor (locator, optional verbatim quote) + provenance (reviewState, origin/runId) + optional independence group for near-duplicate extractions. Validation deliberately does not demand featured richness for catalog claims. **Promotion is a one-field edit**: flipping `tier` to `featured` makes the build fail loudly listing exactly the editorial fields still missing — the failure is the promotion checklist. Bulk imports live in a per-case `claims-catalog.yaml` (same schema) so a whole import stays one reversible file. The claim explorer shows featured claims prominently and the catalog beneath, grouped by theme, collapsed by default, client-side searchable, and labeled as unreviewed; catalog claim detail pages render an explicit honest empty state inviting promotion.
- **2026-08-22 — Literature watch + resources pages.** Two additions. (1) Weekly literature watch: each case may declare search queries in an optional `content/cases/<case>/watch.yaml` (Zod-validated at build time); the Maintain workflow runs them against arXiv and Crossref (OpenAlex optional) via `scripts/watch-literature.mjs` and emits **discovery-only**, runId-stamped proposals under `proposals/watch/<runId>/` — every item `unverified`, recorded exactly as the APIs returned it, deduplicated against `sources.yaml` (DOI/arXiv id) and prior runs (cursor + seen-list state in `proposals/watch/state.yaml`, kept under `proposals/` so watch-only weekly PRs stay `auto:low-risk`). Promotion to a real source goes through the inbox link-list route or an agent with verification; optional LLM relevance notes are labeled AI-generated and the script degrades gracefully without a key. (2) Case resources pages: `/cases/<slug>/resources/` (linked from each case's section nav) render a reading guide **derived** from that case's `sources.yaml` (grouped: primary literature / critiques — derived from evidence direction — / books / datasets / web; honest verification badges; DOI/URL link-outs) plus an optional hand-curated `resources.yaml` shelf (real, fetch-verified links only; learning material, not evidence). No global resources index.
- **2026-08-23 — v1.1: two outputs per case, component verdicts, display governance, conjectures.** After eight cases, one external model review, and a multi-model assessment experiment (5 judges / 4 vendors, 15/18 exact claim-level agreement on Orch OR), four structural changes: (1) every case carries a **research priority** (level + reason) alongside its evidence state — "weak evidence, strong reason to investigate" is the site's signature category and needs its own axis; (2) cases whose single verdict would mislead by compression carry **component verdicts** (2–4 labeled rows: e.g. CCC's claimed detections are contradicted while the framework is merely untested); (3) **display governance**: only a `humanReviewed: true` assessment run may present as the editorial assessment — unreviewed AI runs render as labeled drafts and their disagreement is a review alert, closing the hole where an auto-merged overlay silently changed the public verdict; (4) **editorial conjectures** (`conjectures.yaml`): named, dated, falsifiable bets with required disconfirmers, carrying no evidential weight — the founder's casting conjecture (GEO-J001) is the first. Also: new claim types `theory_description` and `mathematical` with badge captions so "well supported" can never be read as empirical confirmation of a theory that was merely described accurately (applied to CCC-C006/7/8, ZW-C001/4/7/10); ORCH-C003 split (narrow receptor claim keeps the grade; the universal negative becomes ORCH-C004, unresolved). Deliberately rejected for now, from the same review: typed argument graphs, per-type vocabularies, verification matrices, AI committees, fine-tuning, case splits, and any chat interface — the experiment showed judgment is stable across vendors, so complexity goes to wording, curation, and display, not machinery.
- **2026-08-23 — Cross-model checks are ordinary assessment runs, formalized.** An assessment run gains an optional `role`: `draft` (default; the house narrative) or `check` (an independent judge — another vendor's model re-assessing the case blind to all prior assessments). One command produces them: `node scripts/cross-model-check.mjs <case-slug>` calls every vendor with a configured key (Anthropic/OpenAI/Google/xAI), validates fail-closed, and installs passing replies as append-only `<date>-check-<vendor>.yaml` overlays. Check runs never display as the case narrative (displayAssessment skips them; reassess-changed ignores them); instead a concurrence panel on the case page reports agreement with the displayed assessment (case-verdict tally, exact/within-one-step/split claim counts, split claims named as review entry points), and claim pages list each model's per-claim verdict. First published check: Orch OR (4 vendors, unanimous case verdict, 15/18 exact). Also decided: researcher feedback gets NO special pipeline — it is ordinary inbox intake used as pointers to verify against primary sources, with the `from:` field only when their words are quoted; the earlier ExpertResponse/approval-loop idea is dropped as overbuilt. Advocate (steelman/critic) runs remain an experiment tool, not part of the standard check.
- **2026-08-24 — Dossier header shows last update, not last review.** `lastReviewed` on the case record is a hand-set date for human editorial review of the framing (what is claimed / disagreement / settle). Inbox intake, new sources, and assessment overlays do not touch it — which made the header look stale after real ledger changes. The header now shows `lastContentUpdate()`: the newest content-bearing `history.yaml` entry (housekeeping such as cover art does not count), as a link to `#history`. Human review of the *assessment* remains the separate badge ("editorial assessment · human-reviewed" vs "AI-drafted assessment · awaiting human review").
- **2026-08-24 — Plate provenance has two admissible forms; "no public URL" is no longer a bar.** The plate schema previously required a public `sourceUrl`, which meant a figure a researcher sends the editor directly could never be published no matter how well documented. The schema now requires exactly one of two forms: `sourceUrl` (published material a reader can go check), or `suppliedBy` **and** `permission` together (who supplied it, in what capacity, by what route, on what date; and that publication permission was actually given, by whom, when). Enforced in `ImageSchema.superRefine`; provenance may still never be blank. Supplied plates name the supplier in the visible credit line so the reader knows the figure came from a party to the dispute. Rationale: the old rule excluded material not for having unknown provenance but for having *direct* provenance, which quietly selects for whatever the publication pipeline has already processed — the opposite of this project's purpose. First use: IMG-TRN-P03, the POSS-I copy-chain figure supplied by Beatriz Villarroel, placed beside the copy-ancestry argument (TRN-C007) that the whole transients case turns on.
- **2026-08-24 — The editorial layer is corrected automatically, not flagged.** The assessment layer re-derives from the ledger on every maintenance run; the overview article and research agenda never did, so an article could keep telling readers "nobody has ever examined the originals" months after a record said someone had. The first design for this was a reviewer checklist. That was wrong, and it was rejected for a specific reason: a checklist leaves the false sentence on the public page until a human gets to it, and the thing that makes automated editing dangerous elsewhere — that it publishes itself — is already prevented here by the risk classifier, which routes any diff touching featured content to human approval. So `scripts/reassess-changed.mjs` gained a second pass that **makes the correction**. It corrects only factual conflicts with the current records (never style, tone, or additions; silence is the expected output most weeks), and its safety is structural rather than a matter of restraint: exact string replacement with `find` spans rejected when missing, ambiguous, or under 60 characters; the article's `{claim=...}` annotations and `{plate:...}` placements must survive or every narrative edit for that case reverts; research edits splice a single YAML scalar's source span and are verified by re-parse (any other field moving = revert), keeping diffs reviewable instead of reflowing the file; only prose fields are editable; every applied edit appends a `history.yaml` entry naming the model and run and marking it pending approval. `--dry-run` prints the proposed prose as a before/after diff. The primitives live in `scripts/lib/editorial-edits.mjs` with tests, because this is the most invasive automation in the project and the guards deserve tests more than the feature does.
- **2026-08-24 — Literature watch: concept groups, arXiv-first sourcing, and advisory near-duplicate labels.** The 2026-08-24 run surfaced 42 items of which roughly 30 were noise, and the diagnosis was specific: 27 of the 42 came from Crossref, which ranks by loose relevance over everything ever published, and the keyword filter was a flat OR matched as a substring — so one broad term carried an entire query. `anesthe` alone surfaced seven clinical nerve-block papers under Orch OR; `nanodiamond` surfaced contact lenses under YDIH; `ancient` surfaced a Robert Harris novel review under geopolymer; common surnames (`Hoffman`, `Meissner`) defeated the author filters, which Crossref treats as fuzzy relevance rather than a filter. Three changes: (1) `keywordGroups` on the watch query schema — an AND of ORs, so a query can require "about anaesthesia AND about microtubules", which a flat list cannot express; (2) terms match at a word boundary, keeping deliberate stems (`archaeolog`) working while stopping `psi` from matching inside `epsilon`; (3) Crossref dropped entirely where the literature is arXiv-native (CCC, transients, Zero Worlds, Orch OR's physics queries) and kept only where it genuinely is not (YDIH, geopolymer, MPI, vasocomputation). Replaying the same 42 items through the new configs keeps 12 and drops 30, losing no real hit. Separately, a preprint later published under a different title defeats identifier dedup (the Bruehl transient-ML paper is filed under its Scientific Reports DOI but was surfaced from arXiv); such items are now **labeled** `possibleDuplicateOf` and still surfaced, never dropped — a wrong title-similarity guess would be invisible suppression of new work, which is the one failure a discovery tool must not have. Matching primitives live in `scripts/lib/watch-matching.mjs` with tests built from that run's real junk.
- **2026-08-25 — Aletheia becomes an AI-operated experiment; the human final-approver rule is retired, not hidden.** The founder's decision, made explicitly: he will not hand-edit the site, and its continued operation by AI is itself the experiment — "people are trusting AI more and it is useful to see how it arbiters something." What changes is *who vouches*: §3.15 is rewritten from "a named human remains accountable" to AI operation under the constitution, with consequential judgment gated by **multi-model concurrence** (independent vendors judging a change against the epistemic rules) instead of a human tap, and contested changes parked and displayed as contested rather than resolved by fiat. What does not change is everything that makes vouching worth anything: §3.1–3.14 verbatim, fail-closed CI, append-only overlays, provenance labels, real-citations-only, the confidentiality line on unpublished material. The founder retains exactly two powers — the kill switch and the constitution file — and moves otherwise to *contributor*: his inbox drops and conjectures flow through the same intake, attribution, and arbitration as anyone else's. Reader-facing honesty ships in the same change: the method page opens with who runs the site and how to flag an error, the footer declares the experiment site-wide, and "awaiting human review" wording (a promise no one will keep) becomes "not yet independently ratified" (a fact). Staged rollout recorded here: Stages 1–2 (constitution + labeling, this entry) change no behavior; Stage 3 will replace the `humanReviewed` display gate with ratification-by-concurrence; Stage 4 defines the interim merge policy; Stage 5 re-frames the founder's role in content. Full automation (scheduled runner, on-site chat, reader evidence loop) remains deferred. Historical human-review records keep their labels forever — endorsements are append-only too.
- **2026-08-25 — Stage 3: ratification-by-concurrence replaces the humanReviewed display gate.** The displayed assessment is now always the latest draft, stamped with a **derived standing** — computed at build time from the independent check runs, never stored: `ratified` (a panel of ≥4 independent models judging the current content blind, at most one dissenter on the case verdict, and no load-bearing claim contested — a load-bearing claim is contested when fewer than a strict majority of judging models land within one step of the draft's verdict), `contested` (sufficient current panel, but it disagrees — displayed prominently, never resolved by hiding it), `unratified` (panel too small, absent, or the content moved after it judged). The design property that makes auto-merged overlays safe is that **standing only fails down**: nothing can raise it except fresh concurrence from separate vendors, and any new draft or new evidence automatically demotes the case until re-checked. The retired `humanReviewed` gate had never fired — no run ever carried the flag — so no historical endorsement was displaced; the schema field remains and would display if ever set. First derivation over the live site: transients and YDIH ratified 5/5; MPI contested (2 dissenters + load-bearing MPI-C001 split); vasocomputation contested (unanimous case verdict but the panel splits on load-bearing VASO-C004); Zero Worlds contested 1/5; CCC, Orch OR and geopolymer unratified because their panels predate 2026-08-24 content — the pending ratification sweep re-checks those. The old "newer unreviewed draft" review alert is replaced by the standing strip, which states the reason (who dissents, which claims split, what went stale) in plain language on the case page.
- **2026-08-25 — Source intake goes restrictive-by-construction: ledger admission rule, watch triage, proposal expiry.** The founder's concern, stated directly: the weekly sweep brings noise, genuinely significant developments in these fields are rare and loud, and the site should present the key material rather than accumulate relevant-looking references. Three mechanisms, all structural rather than a matter of agent restraint. (1) **Ledger admission rule** (`sourceAdmissionErrors` in `src/domain/load.ts`, build-time, fail-closed): a source may sit in `sources.yaml` only if an evidence record or claim anchor cites it — *load-bearing, not merely relevant* (§3.6: sources are not evidence by themselves) — or if it is explicitly marked `background: true`, the new honest label for reading-guide material; the label fails in both directions (uncited+unmarked fails, cited+marked fails). The 14 existing uncited sources (Penrose's *Cycles of Time*, canonical statements, review papers) were flagged `background` rather than deleted. (2) **Watch triage** (`scripts/triage-watch.mjs`, one model call per case, prompt `watch-triage-v1`): every surfaced item gets `import` / `shelf` / `archive` with a recorded reason, default archive — "when uncertain, archive: significant developments recur and get discussed; a padded ledger quietly rots." Imports queue verification requests as machine-attributed inbox link drops consumed by the existing inbox pipeline — no new intake machinery, nothing touches `sources.yaml` directly. Fail-closed guards live in code, not the prompt (`scripts/lib/triage.mjs`, tested): a malformed reply triages nothing for that case, and a watch-flagged `possibleDuplicateOf` item can never be imported (§3.10 — the same work under a second identifier would double-count). Notably *rejected*: a multi-model concurrence vote on triage decisions — Stage 3's pattern makes it redundant, since an import adds evidence, which automatically demotes the case's standing to unratified until the full panel re-judges the result in context; the panel checks what the evidence *does*, which is stronger than a pre-vote on whether it looked significant. (3) **Proposal expiry with a surviving omission ledger**: watch runs older than 60 days are deleted by the next run (the seen-list dedup survives), so no triage queue accumulates for anyone, human or agent — but expiry alone would make the design's accepted asymmetry permanent and silent: import mistakes are caught downstream (standing fails down, the panel re-judges), while an archive mistake is judged once, by one model, and then the evidence of the judgment evaporates ("git history technically keeps everything, but nobody reads deleted directories"). So every archived item is also appended, one line each and deduped by DOI/arXiv/title, to `proposals/watch/archive-ledger.yaml`, which survives expiry and exists precisely to be reviewed — periodically, by a second model or a human — so omissions stay auditable without a queue.
- **2026-08-25 — Maintenance drafting model reverts to Claude Opus 5 (reverses the 2026-08-22 decision to default to Fable 5).** Not a quality judgment — a documented incompatibility: claude-fable-5's safety filter refuses plain pharmacology statements about anesthetic mechanisms, returning stop_reason "refusal" with zero content on 11 of Orch OR's 18 claims when probed individually (as tame as "general anesthetics bind tubulin and alter the electronic and optical behavior of microtubules"). This is what caused the Orch OR reassessment to fail three times with empty replies, and is almost certainly what the founder observed weeks earlier as the case "triggering" the assistant. claude-opus-5 answers the identical prompts. The check panel was never affected — its Anthropic seat already ran Opus, which is why Orch OR's cross-model checks succeeded while its Fable-drafted reassessments died. Evidence recorded in a comment at the switch site in `scripts/lib/llm.mjs`; revisit if a later Fable revision stops refusing. Same sweep also hardened both reply parsers (JSON: tolerate preambles/fences/trailers; YAML: drop-one-trailing-line retry after an otherwise-valid Anthropic reply twice arrived with a stray scoring footer) — both still fail closed on genuinely malformed replies, with the quarantined originals kept in `proposals/cross-model-failures/`.
- **2026-08-25 — Stage 4 (dry period): the constitutional arbiter.** Five independent vendor seats (the same five that ratify assessments) judge every `needs-approval` PR against `AGENTS.md` and vote complies/violates/unsure; **pass** = ≥4 complies and zero violates. The rule is asymmetric on purpose: one unsure or failed seat is tolerated, one *substantiated* objection parks — and a violates vote must name the rule it invokes or it degrades to unsure, so no seat can park a change without an actionable accusation. Structural properties: the constitution is read from the base revision (a change is judged by the constitution it tries to amend); diff/title/body are fenced as untrusted data; truncated diffs list their omissions to the panel with instructions to vote unsure about what was not shown; failed seats stay in the denominator. During the dry period the check is advisory and the founder's tap still decides; retiring the tap is a branch-protection flip. The trial run earned its keep immediately: judging the already-merged microscopy PR (#47), the panel **parked it 3–2** — GPT-5.1 and Gemini independently converged on a real gap (the ledger cites a privately supplied unpublished manuscript with supply provenance recorded but *permission to cite* never recorded), and Gemini explicitly rejected the diff's own claim of human direction as untrusted data, demonstrating the injection fence. So the arbiter's first vote (a) disagreed with the human tap it will replace, (b) was substantively right about a provenance gap two reviewers missed, and (c) is itself the argument for the dry-period comparison. Follow-ups: record citation permission on SRC-YANG-VILLARROEL-2026 (content fix), weekly digest, rate limit, and harvesting arbiter reports into `governance/` for the planned `/panel` page.
- **2026-08-25 — Case #9: The Immortality Key (TIK-001, "The Religion with No Name?").** Extends the eight-case slate with Muraresku's psychedelic-sacrament thesis: an ergotized kykeon at Eleusis, inherited by the earliest Christians as the original Eucharist. Chosen because the controversy is a textbook ladder — the bottom rung (ancient ritual psychoactive use) was settled by residue chemistry in 2020–2024, a middle rung (lye detoxification of ergot to LSA/iso-LSA) moved in February 2026, and the decisive tests for the upper rungs have simply never been run: no vessel from Eleusis and no early-Christian liturgical vessel has ever been chemically analyzed. Built from two AI deep-research briefs supplied by the founder (kept out of the repo per the casework convention adopted the same day); every load-bearing citation independently verified before import; the one unobtainable primary (Juan-Tresserras 2002, the Mas Castellar ergot find) is carried `unverified` with retrieval logged as research item TIK-R004. The ladder splits the Greek half from the Christian half so they fail or survive separately. **A founder-level conflict of interest is disclosed rather than avoided:** the Luke & Koh 2025 funding statement names E. Jhong — Aletheia's founder — among the supporters of the Yale Ancient Pharmacology Program, alongside Muraresku and his Athanatos Foundation; the disclosure appears on the source records, in the evidence ledger (TIK-E027), and in the overview article itself, and any future YAPP result entering the ledger carries the interest-network flag. The pro-hypothesis research strand (Road to Eleusis → "Mixing the Kykeon" → the 2026 experiment → YAPP) is treated as one interest network for independence accounting, never as mutual corroboration.
- **2026-08-25 — Stage-4 tail: governance becomes repository data; the observer loop closes.** Four pieces. (1) `scripts/harvest-governance.mjs` copies each settled PR's arbiter verdict into `governance/arbiter/pr-<n>.yaml` — machine blob when present, fail-closed legacy markdown parse for the first dry-period reports — append-only, harvested post-settlement only, low-risk classified because a harvested record cannot mint standing. The first harvest already contains the dry period's defining datum: PR #55 (Immortality Key), panel PARKED, founder merged anyway. (2) The weekly Maintain run opens a digest issue: what settled, what the panel said, anything merged against a park, what is open. (3) `CONTENT_MERGES_PER_WEEK = 10`: an otherwise-passing content change parks when the trailing week's budget is spent — never upgrades, never throttles code/docs. (4) Prioritized diff delivery for the panel (budget 400k chars, kept by scrutiny tier: governance surface → content canon → mechanically-guarded records), fixing the tooling gap Cursor's agent correctly diagnosed: the first parks were partly "unsure because I could not see sources.yaml" while append-only overlays filled a positional budget. Also: the Immortality Key panel convened same day — house draft `unresolved`, all five judges dispute it (spread mixed→contradicted), case displays contested 0/5; with geopolymer this is the second live case of the panel rejecting a house verdict, both now visible data for the dry-period comparison.
- **2026-08-25 — /panel: the governance made visible, one page.** The design question was global page vs per-judge pages vs per-case pages; the answer is one anchor-addressable page (`/panel#<case>`, `/panel#seat-<name>`, `/panel#operations`) plus enrichment of existing surfaces, because per-judge pages fail the empty-museum test at ~10 votes per seat and §7 warns against making personalities (model or human) the protagonists. Four sections, all derived at build time, nothing authored: **Standings** (contested-first, five seat-dots plus the hollow house-draft ring per case); **Where the models disagree** (every currently-split claim with each seat's verdict and reasoning — the site's most honest content); **The seats** (per-seat record: cases judged, agreement with house, claim-level exactness, closest/furthest pairwise ally — the table that will be first to say so if model diversity ever stops doing work); **Operations log** (the machine's metabolism: panels convened, arbiter verdicts including #55's park-but-merged, content changes, quarantined replies, with a link out to live Actions runs). The founder also asked whether operational monitoring should be its own page: same page, fourth section — judgment above, metabolism below — until data density earns a split, at which point the anchors migrate to routes. Linking map: footer "AI-operated" → /panel (the site-wide declaration becomes a door to the evidence); nav gains Panel; CaseCard standing chips → /panel#case; CrossModelPanel header → /panel; the method page's who-runs section points here. VerdictDot is the one new primitive: five dots on a line say more, faster, than five badges.
- **2026-08-25 — The gate is live; operations go event-driven.** The dry period closes after five arbiter verdicts (three passes, two parks, both parks substantively defensible and one of them catching this project's own mistake): `arbiter` is now a required check on main, and a passing verdict on a needs-approval PR auto-merges via the maintenance PAT (Actions-token merges would not trigger the deploy or the ripple). A parked PR cannot merge and waits publicly; the founder's admin override survives as the kill switch (admin enforcement deliberately off). Operations become event-driven rather than polled, per the founder's request with one upgrade — the inbox lives in git, so a drop IS a push event and no cron is needed: pushes touching `inbox/` dispatch Maintain in a new `inbox` mode within seconds (moves into `inbox/processed/` excluded, so the pipeline's own tidying does not retrigger); pushes touching canon content trigger `content-response.yml` — reassessment, panels for stale cases (`scripts/stale-checks.mjs`), results PR'd through the normal gates — with overlay-only merges outside the path filter so the ripple terminates by construction; the weekly cron keeps the slow metabolism (watch, triage, harvest, digest). The digest issue is now created with the Actions bot token and cc-s the founder, because GitHub suppresses notifications for one's own PAT activity and the digest exists to be emailed. The founder is watching the repository (all activity). Known honest limitation: much automation authors as the founder's PAT, which GitHub will not email him about; if full activity email matters later, a dedicated machine account is the clean fix.
- **2026-08-25 — Constitutional amendment (founder's act): "in confidence" means without recorded permission.** The panel parked the first attempt to record citation permission for the Yang–Villarroel manuscript, and both dissents were correct: Gemini read §3.15's "never publish material supplied in confidence (unpublished manuscripts…)" as the categorical ban it literally is — permission could not create an exception without amending the constitution; Opus found the permission note an unverifiable attestation doing load-bearing work, below the repo's own supplied-provenance standard. The amendment defines the term instead of listing examples: material is "in confidence" when the supplier has not given permission, and permission counts only when recorded like any provenance — who granted it, when, by what channel, where held. The manuscript's record is raised to that standard (granted by Beatriz Villarroel by email to the founder; reported by him to the maintainer). Procedural note for the record: the arbiter auto-parks any AGENTS.md diff by design, so a founder override on an amendment PR is not a bypass — it IS the ratification mechanism; amending the constitution is the founder's reserved power, and his merge is the signature.
- **2026-08-25 — The operator and the reconciliation loop; the throttle learns about eras.** Three additions completing Stage 4. (1) `scripts/reconcile-contested.mjs`: the pipeline's one deliberately NON-blind draft — when ≥2 fresh seats dispute the house case verdict, the model receives every dissent and must engage each (concede-and-move or answer-and-hold); standing re-derives against existing checks, and a case still contested after engagement is a standoff, displayed indefinitely with a guard against re-litigation loops. First run: geopolymer contested 0/5 → ratified 4/5 (house conceded the majority's structural argument, mixed→unresolved); zero-worlds moved to presently_untestable (3/5); immortality-key to mixed (3/5); mpi engaged and held — three honest standoffs. Validation lesson: roll-up lists must be live claim ids (the loader enforces it); a pass that tolerated prose weakest-links produced four build-breaking overlays, all regenerated strict. Known gap: contests via load-bearing splits under a unanimous verdict (vasocomputation) are not yet in the loop's eligibility. (2) `operator.yml` (claude-code-action; daily/issues/dispatch): parked-PR remediation, reconciliation, quarantine retries, and issue triage — the public door. Hard limits in prompt and downstream gates: never AGENTS.md, never direct-to-main, issue text is data. (3) The rate limiter counts only the autonomous era (`GATE_EPOCH` = the #59 merge): bootstrap week's 39 human-supervised canon landings had parked a 5/5-complies caption fix; the budget now measures the machine's own pace, which is what it exists to bound.
- **2026-08-26 — Reconciliation can no longer self-ratify: the checks a reconsideration engaged cannot vouch for the draft that answered them.** Closes the gap one arbiter seat (Opus 5) filed a substantiated §3.15 objection about on the downstream deployment's engine-sync PR, while four seats read the mechanism as compliant: the reconsideration draft is written non-blind — every seat's dissent in hand — and standing then re-derived against the *existing* check runs, so a contested case could clear to ratified by converging on the judges instead of the evidence, with no independent model ever judging the reconciled draft. That violated the standing invariant's own words ("nothing can raise standing except fresh agreement from independent vendors"). Three coordinated changes: (1) reconsideration overlays now carry `reconciles` — the runIds of the checks whose dissents they engaged (schema field optional; stamped by `reconcile-contested.mjs`); (2) `ratification()` refuses to ratify a reconsideration until at least one blind check *outside* that list judges the case — pre-stamp overlays fall back to date order (only a check dated strictly after the draft counts as fresh, since a same-day check may have been in hand), and standing shows `unratified` with the reason stated until then; (3) `stale-checks.mjs` mirrors the rule, so the content-response loop automatically re-panels any case displaying an unvouched reconsideration. Live effect at merge: megalithic-casting, mpi, immortality-key, and zero-worlds drop from their post-reconciliation standings to `unratified — awaiting a fresh blind check`, and the next content-response run re-panels all four; blind-drafted cases are untouched. The reconciliation loop itself is unchanged — engagement with dissent remains required and non-blind by design; what changed is that engagement alone can no longer mint concurrence.
- **2026-08-26 — The arbiter gets eyes for existence checks: mechanical citation verification feeds the seats.** Recorded on the downstream deployment (its PR #10 panel): seats judge a diff against the constitution but cannot browse, so an honest seat facing citation-heavy content had to vote "unsure" — parking the PR regardless of its quality, with "unsure because unverifiable" masquerading as editorial doubt. The fix separates the mechanical question from the editorial one. `scripts/lib/citation-check.mjs` extracts every DOI, arXiv id, and URL the diff ADDS under `content/` (added lines only; doi.org/arxiv.org URLs classified as their identifier kind so each citation is checked once, by the strongest method) and resolves them live: DOIs via Crossref with a doi.org fallback (DataCite registrations are not Crossref's absence), arXiv via its API, URLs via HEAD-then-GET. The arbiter (prompt v3) shows the results as a trusted tool-output packet section and instructs seats: RESOLVES means the identifier exists and points at the metadata shown — judge whether it is used honestly (§3.7, §3.8) instead of voting unsure for lack of a browser; FAILS is positive evidence for violates/unsure; UNCHECKED (registry unreachable, or beyond the 40-item budget — reported, never silently dropped) is weighed as before. Deliberate limits: verification informs votes but never gates (any tooling failure reports itself as unchecked rather than failing the run), and it says nothing about quotations, page-level locators, or whether a source supports a claim — those remain the seats' judgment. Quoted titles inside verification notes are external data and the prompt says so.
- **2026-08-26 — The Study: pre-registered desk workpapers become a first-class domain object.** Desk research (base-rate tabulations, replication tables, discrepancy ledgers) produces working datasets whose epistemic unit is the study, not the row — and until now the output had no honest home: an aggregate evidence record would be a summary substituting for primary evidence (§2's prohibition), per-row records would bloat the ledger, and outside artifacts carry no §3.8 provenance and rot. Several research items are desk-executable today with nowhere to put their output (TRN-R007's copy-defect census, YDIH-R001's evidence matrix). The design (developed and ratified on the downstream deployment, adopted here as engine): one YAML per study under `content/cases/<case>/studies/`, Zod-validated fail-closed, with **frozen inclusion criteria made structural** (§3.12 as mechanism): `criteriaHash` is stamped at freeze (`scripts/stamp-study.mjs`) and recomputed by the loader on every build, so any post-freeze criteria edit fails the build; `knownCandidates` pre-commits every candidate the author already knew with its disposition, so post-freeze discoveries are visibly discoveries. Studies land in **two PRs** — freeze (criteria only; the arbiter panel judges the protocol before anyone knows what the data will say) then collection (rows with per-row inline citations in the source-anchor shape, so mechanical citation verification covers them; findings; limitations, both required once rows exist and forbidden before). **Render-from-freeze is the anti-file-drawer rule:** the study page publishes as "pre-registered — collection pending" from the freeze onward, and the weekly digest lists pre-registrations pending over 30 days — pre-registration means committing to publish, not just to method. Boundaries: secondary synthesis of published material only; a study never grades a claim or carries standing — influence flows solely through aggregate-finding Evidence records citing the study's `workpaper` Source (new source kind, honestly labeled, `studyId` validated in both directions), riding the ordinary gates (needs-approval tier, standing demotion, blind re-panel). Studies are append-only: corrections are a new study with `supersedes`, and evidence citing a superseded study's workpaper fails the build until re-pointed. Non-goals, deliberate: no per-study standing, no study-level panels, no new verification vocabulary, no execution machinery (v1 studies are drafted by agent sessions by hand; discovery practice — multi-searcher deep-research union run only after the freeze, output treated as an uncitable brief — lives in each study's frozen protocol, not in tooling).
- **2026-08-26 — Zero-content bootstrap support, upstreamed from the downstream deployment.** The engine assumed content exists: `output: export` refuses a dynamic route whose `generateStaticParams()` returns zero params, and the homepage/case-index rendered silently empty lists — so a fresh deployment could not even build until it had a published case. The downstream deployment solved both at its bootstrap and carried the fix as allowlisted divergences (its upstreaming-queue items 1 and 4); this adopts them upstream so the loans can be retired. (1) `src/domain/staticExport.ts`: each of the six dynamic routes emits one reserved placeholder param (`not-yet-published`) when it has no records, and renders `notFound()` for it — the exported placeholder document is the 404 page, the honest answer for a record that does not exist. Unknown ids across all six routes now 404 instead of throwing. (2) The homepage and case index render an explicit empty state ("no cases published yet", pointing at the method page's publication standards) instead of empty grids. Validated by building with `content/cases/` emptied: the export succeeds (12 pages, all internal links resolve, empty states render) — the state every fresh deployment starts in.
- **2026-08-26 — The content-response ripple batches hourly (founder direction).** The per-push trigger reacted to every canon merge individually: a same-day burst produced two respond PRs forty minutes apart (#87, #89), the second superseding the first — duplicate panel spend, and a stale PR left open that could conflict if merged after its successor. Three changes to `content-response.yml`: (1) the push trigger is replaced by an hourly schedule (`17 * * * *`, off the top of the hour where GitHub sheds cron load) — the underlying scripts already detect change mechanically (content commit dates vs. overlay dates), so an idle hour exits without a model call and the batch window costs nothing when quiet; (2) `cancel-in-progress` flips to false, because cancelling an in-flight run discards paid panel calls — the next run queues instead; (3) each run, after opening its PR, closes any older still-open respond PR as superseded (with a comment and branch cleanup), since the new run re-derives all judgments from current main — except a PR the arbiter has parked, which is a live disagreement and stays open and visible (§3.15: disagreement does not publish, or vanish, silently; the exclusion was added on the arbiter panel's own objection to this PR). Worst-case latency for the judgment ripple is now one hour, which it never needed to beat; the inbox response stays event-driven because a founder drop deserves immediate processing. `workflow_dispatch` remains for on-demand runs. Log-integrity note: the first revision of this entry accidentally overwrote the heading of the Villarroel-permission entry below and absorbed its body, which two arbiter seats caught and parked; the entry below is restored intact.
- **2026-08-26 — Villarroel permission recorded; the history rewrite drops from urgent to optional.** After the removal below, Beatriz Villarroel told the founder it is fine for her email to be in the repository. Recorded per the §3.15 standard (granted to the founder 2026-08-26, relayed to the maintainer the same day, grant correspondence held by the founder) in the transients case history and the tombstone README. Consequences, stated precisely: the files stay out of the tree — the email also carries a third party's personal address and remarks about colleagues, whose permission has not been sought, and nothing cites it — but her correspondence sitting in the *old commits* is no longer a §3.15 violation on her account, which was the urgent driver for rewriting this repository's history. What remains in history without her correspondence elevating it: the third-party page captures under `research/` (redistribution-gray, also still in HEAD pending founder review) and the third party's cc address inside the old blobs. On that residue the rewrite is a judgment call, not an obligation; it stays available with the downstream deployment's runbook if the founder wants it.
- **2026-08-26 — Private correspondence found committed in the public repo; removed from HEAD, history rewrite pending founder authorization.** A provenance audit (run while preparing the downstream deployment's public migration, which shares this repo's pre-split history) found the raw Villarroel correspondence committed under `inbox/processed/trn-villarroel-2026-08-24/` — a private email with personal addresses, informal remarks about colleagues, and a pointer to the unpublished microscopy manuscript — in direct conflict with §3.15 and with the case history's own 2026-08-24 statement that the correspondence "is not published." Corrected the same day, before other maintenance, per the correction-first principle: files removed from the tree, tombstone README in their place (following the trn-microscopy precedent), append-only history entry on the transients case. **What removal from HEAD does not do:** the files remain in git history and in GitHub's cached PR views, and this repo is public. Full removal requires a history rewrite (`git filter-repo`) plus a GitHub Support request to purge cached views and unreachable objects — a force-push of `main` that invalidates open branches and is therefore reserved to the founder's explicit authorization. The downstream deployment's migration runbook documents the identical procedure it just executed. Also flagged for founder review, same audit: the third-party page captures under `research/` (PubPeer thread capture, saved web pages) are redistribution-gray; the founder's own essays and commissioned deep-research reports there are his to publish and are not at issue. The reconciliation loop engaged only cases where two or more seats dispute the case verdict — but a standing is also contested when the panel splits on a load-bearing claim under a unanimous verdict, and that shape could never be reconciled: vasocomputation sat contested indefinitely (all five seats endorse `unresolved`; four of five grade VASO-C004 `weakly_supported` against the house's open verdict) with the house never obliged to answer. Eligibility now mirrors the full contested rule via `scripts/lib/reconcile-core.mjs` (tested), which is the plain-node mirror of `ratification()`'s graded-scale/strict-majority rule; the dissent packet gains `claimDissents` — each split claim with the house verdict beside every seat's verdict and reasoning — and the prompt requires engaging each split claim by id in that claim's reasoning field, concede-and-regrade or hold-and-say-why. The standoff guard is unchanged and now also covers claim-level standoffs. Dry-run on the live case: the draft conceded C004 to the four seats (`unresolved` → `weakly_supported`, the exhale-specific attribution flagged as unsupported per the Opus dissent), answered GPT-5.1's dissent-by-agreement as targeting C011/C020 content rather than C004, and held the unanimous case verdict. Because reconsiderations are stamped `reconciles` (2026-08-26 entry above), the eventual real run cannot self-ratify: the regraded draft waits for a fresh blind panel like any other reconciliation.
- **2026-08-26 — History rewrite executed: supplied and third-party material purged from the public history.** The founder authorized the rewrite explicitly and it was executed the same day with `git filter-repo --invert-paths`, following the runbook already executed on the downstream deployment's public migration. Scope, three groups: (1) the raw Villarroel correspondence (the Gmail PDF and its attached image, at both their `inbox/` and `inbox/processed/trn-villarroel-2026-08-24/` paths) — removed despite Beatriz Villarroel's recorded permission, because the email also carries a cc'd third party's personal address and informal remarks about colleagues whose permission has never been sought, and nothing cites it; (2) the founder-supplied deep-research briefs committed before the casework convention existed (the Charlie Kirk brief PDF/JSON/MD plus its addendum, and the Immortality Key brief PDF); (3) the two third-party page captures under `research/` (the PubPeer thread capture and the Erdős unit-distance page capture) — redistribution-gray material, whose removal from HEAD by this rewrite is the resolution of the founder review flagged in the exposure entry above. Verification on the rewritten history: zero objects remain for any purged path across the full object graph; the nine PDFs still in history are all the founder's own documents; and the HEAD file-list delta against pre-rewrite `main` is exactly the two research captures. The two open automated PRs (#87, #89) were preserved by recreating their `respond/` branches from patches on the rewritten `main` and pushing them before the switch. Landing the force-push of `main` requires a temporary lift of its branch protection — the required status checks reject any direct push — and that lift and restore are the founder's act, recorded here as part of the procedure rather than a bypass of it. What the rewrite cannot reach: GitHub's `refs/pull` residue still serves the old objects (enumerable, as demonstrated on the downstream deployment), so the necessary follow-up is a GitHub Support sensitive-data-removal request for this repository, to be filed by the founder. The pre-rewrite history is retained as a private backup by the operating session until the Support purge completes.

## 2026-08-26 — Operator duty 4: the narrative gap

The ledger now moves autonomously (hourly content-response, self-merging
overlays, standing derivation on merge) while featured articles moved
only when someone remembered to ask an agent. That asymmetry produced
same-day drift: cases holding ledger-bearing study findings their
articles never mentioned. The operator's daily run gains duty 4 —
detect ledger-bearing findings absent from the featured article, draft
the smallest addition in the case's register with every finding's
qualifying half in the same paragraph, and open it needs-approval. The
gate structure is unchanged by design: article prose is never
auto:low-risk and the operator never arms auto-merge on it — the panel
and the founder keep the pen; the operator only guarantees the noticing
and drafting no longer depend on human memory. (Founder-directed,
2026-08-26 session.)

## 2026-08-26 — Maintenance gains agenda generation (proposals only)

Every genuinely new framing in the record so far — new claims, new
studies, new cruxes — originated as a human seed; the machinery
executed but never asked. The weekly maintenance run gains a
propose-agenda step (scripts/propose-agenda.mjs): one model call per
case asks what claim, research item, or study the current ledger
implies but does not contain, validated fail-closed (anchored to real
existing IDs, no culpability proposals, at most three per case, empty
answers welcomed) and written under proposals/agenda/ — proposals
only, low-risk by construction, surfacing in the weekly digest.
Proposals are inputs to the existing pipeline, nothing more: anything
adopted travels the same gates as any other change (freeze discipline
where applicable, classifier, arbiter, and the tiered merge policy) —
no new power is created for anyone, and ignoring a proposal is the
default outcome, not a decision. The validator checks well-formedness,
not interestingness — editorial taste remains with the humans and
panels the gates already empower. (This entry was written by the
editorial AI recording a founder instruction from the 2026-08-26
session, per §3.15's requirement that AI records be labeled as such.)

## 2026-08-27 — Budget epoch 2: the throttle's era accounting, applied again

The weekly content-merge budget exists to bound the machine's
autonomous pace (see the 2026-08-25 entry: "the budget now measures
the machine's own pace, which is what it exists to bound"). The
founder-supervised studies sprint of 2026-08-26/27 — the studies
feature, seven studies across both sites, and the article updates,
nearly all landed by founder tap — recreated the bootstrap-week
condition: supervised construction spending the autonomous budget
(34/10), freezing the lane the throttle was never meant to govern.
GATE_EPOCH advances to 2026-08-27T10:00Z, resetting the autonomous
count to zero from that moment. The limit itself stays at 10 per
week: the number was never the problem, and the weekly digest reports
parks, so raising it can be a data-driven decision later. (This entry
was written by the editorial AI recording a founder instruction from
the 2026-08-27 session, per §3.15's requirement that AI records be
labeled as such.)

## 2026-08-27 — The proposals shelf: agenda generation gets a page

The weekly proposals were repository files only; a reader (and the
founder) had no surface for them. /proposals renders every run's
proposals grouped by case — kind and effort badges, the question with
its truth condition, the closest-existing anchors and their gap, what
either answer would settle — headed by the standing disclaimer that a
proposal is not a claim, grade, or agenda item until adopted through
the gates, with ignoring as the stated default. The page parses the
generator's own format (roundtrip pinned by tests) and skips malformed
blocks visibly rather than guessing or failing the build. Header nav
gains the link on both sites. (AI record of a founder instruction,
2026-08-27 session.)

## 2026-08-27 — Model policy in code: Fable-first, loud Opus fallback, truthful stamps

Decision #15's reversal (Opus as the extraction default) existed
because Fable's safety filter refuses plain pharmacology statements on
cases like orch-or. The default returns to claude-fable-5, with the
refusal path redesigned after the panel rejected a first draft for
silent substitution: a refusal now throws a typed RefusalError — never
a quiet model swap — and callers that want the fallback use
callWithRefusalFallback, which retries exactly once on claude-opus-5
and returns the model that actually produced the text, which is what
every record must stamp. Model policy thereby lives in the engine (no
per-repo EXTRACT_MODEL variable to drift; the variable still overrides
when deliberately set), refusal handling is visible in run reports,
and provenance stamps stay true under §3.15. (This entry was written
by the editorial AI recording a founder instruction from the
2026-08-27 session, per §3.15's requirement that AI records be labeled
as such.)

## 2026-08-28 — Claim genealogy, derivative sources, and two honest states

For contested public events, tracing where an allegation began is half
the analytical work: it exposes claims born from identity conflation or
source fusion, and stops fifty derivative retellings from reading as
fifty independent reports. Three small structural additions, all
optional, none migrating existing content: (1) claims may carry a
`genealogy` block — earliest known public appearance (partial dates
allowed), an origin account, and an optional loader-checked source, kept
strictly separate from record provenance (`origin`) and counted as a
citing use by the source-admission rule; (2) sources may declare
`derivedFrom` — the ledger's structural answer to wire-copy duplication
(§3.10 at the source grain), loader-checked and rendered with an
explicit no-independent-weight note; (3) the assessment vocabulary gains
`misframed` (the proposition fuses separate claims or has no truth
condition as written — grading it would launder the framing error) and
`provenance_failure` (the material the claim rests on cannot be
authenticated — which is not the same as being shown false). Both map
to the open family and carry in-place captions. Assessment-run scripts
keep their narrower evidence-grading vocabulary deliberately: the new
states are editorial framing judgments, not overlay verdicts. Motivated
by the chat-derived research-brief workflow (2026-08-28 session), whose
central findings were genealogical. (AI record of a founder
instruction, 2026-08-28 session.)

## 2026-09-01 — The metabolism: full-automation design confirmed (docs/AUTOMATION.md)

The founder's direction, after a design session reviewing every existing
update mechanism: the site should run itself toward sharper, better-lit
cases — "present the very best of what AI can suss out and organize in a
beautiful way" — with the founder's role compressed to the kill switch,
the constitution, taste, and a weekly digest. The confirmed design is
recorded in docs/AUTOMATION.md: five loops on one gate (Watch, Expedition,
Bench, Tribunal, Atelier), attention allocated by measured yield,
saturation redefined as a per-case counter over verified-novelty impact
rather than a feeling, studies automated end-to-end (panel-scored
selection, auto-drafted freezes, a collection runner on the
refusal-fallback path), and a rewrite tournament for presentation that
ratchets prose the way standing already ratchets judgment.

Two design principles got names. **The ledger grows; the presentation
converges** — evidence accumulates monotonically and only the compression
ratchets, so unbounded discovery stops being a threat and becomes the
input. **Prose dies; records survive** — founder editorial angles and
banked corrections are reified as pins (per-case append-only pins.yaml,
public, mechanically checked where possible) that any rewrite must honor,
so nothing hard-won is lost to a beautiful redraft. Pins bind
presentation, never verdicts.

Rationale for sequencing (yield metric first, pins second, Bench third,
collection runner fourth, Expedition fifth, researcher surface anywhere,
Atelier last as a one-case experiment): safety and measurement before
autonomy; every later loop assumes the earlier ones' floors. Constraints
carried from the from-scratch review the same night: no new services;
machine artifacts declare lifecycle at birth; supplied material never
enters git; the engine-as-package refactor is deliberately deferred until
a third deployment exists.

## 2026-09-01 — Metabolism build 1+2: yield measurement, pins, the regression exam

The first two mechanisms of docs/AUTOMATION.md, shipped together because
everything later stands on them. (1) **Yield**: scripts/lib/yield-core.mjs
derives each case's verdict-moving events (assessment runs that changed a
verdict, content-kind history entries, collected studies, new featured
claims — blind checks deliberately excluded: judgment about a case is not
movement of it) and classifies hot/warm/cool bands; scripts/yield-report.mjs
prints the table and JSON; Maintain now measures yield each run, surfaces
the table in the weekly digest, and visits only due cases with the agenda
generator (the cheap identifier-based watch stays weekly for everyone —
a missed discovery costs more than a cheap query). Cadence is stateless:
warm and cool recurrence derive from the date, so there is no scheduler
state to rot. (2) **Pins**: per-case append-only pins.yaml (PinSchema),
kinds correction and directive, each with optional mechanical checks
(claim stays featured; exact text present or absent, whitespace-
insensitive so YAML folding cannot break a commitment that is intact
word-for-word). The loader enforces every check fail-closed on every
build — the regression exam: a rewrite that loses a banked correction or
a founder directive fails before any judge votes. Pins render publicly in
the case history section. Directive pins are recognized by a §7 amendment
in the same PR (the founder's reserved act; his merge ratifies it), per
the design PR's own panel review. Seeded: the Nunes-dating correction and
the Hancock-genealogy directive (pre-columbian-amazon), the
microscopist's against-interest quote and the permission-provenance
history (transients). The exam caught its own first bug in development —
a raw-substring check broke on YAML line folding — which is the level of
pettiness a regression harness is for.

## 2026-09-01 — Narrative inputs: rewrites anchor to the founding texts (founder direction)

Addition to the Atelier design (docs/AUTOMATION.md), closing a drift
failure mode the founder spotted: iterative rewriting compounds — each
cycle seeing only its predecessor erodes the founding voice without ever
tripping a pin. Cases may now carry committed founding texts (per-case
inputs/ with a licensing manifest; the founder's own essays qualify,
third-party briefs never do), and every rewrite candidate drafts from
ledger + pins + narrative inputs + incumbent. Inputs are presentation
references, never evidence: voice and framing may be drawn from them,
facts may not, unless independently in the ledger. Implementation lands
with the Atelier; the manifest schema may land earlier if input texts
are committed ahead of it.

## 2026-09-01 — Founding inputs frozen: the current tellings become the source texts (founder direction)

The founder's call, extending the narrative-inputs design the same
night: since the current site is the founder-approved state, every
case's present overview is snapshotted verbatim as its founding
narrative (inputs/founding-narrative-2026-09-01.md), and the founder's
own essays and commissioned reports already committed under research/
are mapped to their cases as founding research (manifest per case,
NarrativeInputSchema, loader-validated fail-closed so inputs cannot rot
into dangling references). Third-party captures are excluded by rule —
inputs must be the founder's to license — and the two gray captures
formerly under research/ were removed by the founder before this landed.
Two rewrite laws recorded with it, to be carried into the Atelier
rubric: the first-edition rule (a revision reads as the first telling —
founding texts and current ledger digested seamlessly, no narration of
the article's own revision history, which lives in the changelog) and
the plates-survive rule (every plate placed in the incumbent appears in
the candidate — it may move to a better seat, it may not be lost — with
unseated new plates marking a candidate incomplete before judging).

## 2026-09-01 — Pins removed the same day they landed: the founder simplifies

Hours after ratifying pins, the founder examined them and found the
design partly redundant, and the redundancy is recorded because it was
correct: most correction pins duplicated protection the gated ledger
already provides (a banked correction lives in the claim or evidence
record it corrected, where any panel judging a later diff sees it in
context), and a registry of string checks is a second, half-parallel
memory bolted beside the one the ledger already is — a maintenance tax
on a site that must stay convergent. The pins machinery (schema, loader
enforcement, display, the four seeded pins, the same-day §7 amendment)
is removed in full. What replaces it is deliberately lighter: revision
prompts consider the founding narrative inputs for aesthetic portions —
following them where they serve the reader, free to expand beyond —
with judgment calls settled by candidate competition and the panel, per
the founder's words. Banked corrections stay where they always were:
in the records and the append-only changelog. The §7 bullet is
superseded by a narrative-guidance bullet (founder's reserved act,
ratified by this merge). The prior entries recording the pins design
stand above, per this log's append-only rule — the reversal is the
record, not an erasure.

## 2026-09-01 — The outside review: the metabolism judged, corrected, and re-ordered

Another agent read the full design record and the workflows and returned
the sharpest external critique the project has had. Its findings, and
what the founder decided: (1) **The broken pipe** — verified import
proposals died in proposals/ on a 60-day timer because no stage authors
the evidence records the admission rule requires; the judging half of
the automation was strong while the producing half starved, and the new
yield decay would have amplified the starvation into fossilization. The
promotion pipe moves to the front of the build order. (2) **Genesis is
absent** — nothing authors a case from scratch; every case was built in
an interactive session. Made explicit as the deliberately-last build
step: the founder keeps commissioning cases manually (the least frequent
job) until everything upstream has a track record. (3) **Three quality
risks recorded with mitigations queued**: vendor-independence is not
epistemic independence (five seats share training-corpus priors, and
ratification pressure runs toward the mainstream consensus on exactly
the hypotheses this site exists to examine without pre-dismissal) — every
check run will gain a required strongest-unanswered-pro-hypothesis
field; no judge re-reads sources (existence-checking is not
content-checking; a subtly wrong gloss can ratify 5/5) — a sampling
gloss audit is queued and the limitation gets stated on /method; the
arbiter is weakest gating code — the tests-over-mechanisms doctrine is
now written into the design constraints. Also fixed on its note:
MAINTENANCE.md's stale EXTRACT_MODEL line. The review's framing worth
keeping: "trustworthy but not alive" is the failure mode the build order
now exists to prevent.



## 2026-09-01 — Build step 1 ships: the promotion pipe

The pipe the outside review found missing now exists.
scripts/promote-imports.mjs consumes verified import proposals from
proposals/inbox/, dedupes them against the ledger (identifier match plus
the title-similarity guard the Bruehl arXiv-versus-journal aliasing
taught), fetches each genuinely new source, and drafts its ledger entry
with the evidence records the admission rule requires — under mechanical
fail-closed checks: every quoted span in a drafted sourceStatement is
verified verbatim (whitespace- and hyphenation-insensitive) against the
fetched text, directions and strengths are enum-checked, claim anchors
must exist, budgets cap the pace (3 promotions per run), and a proposal
with no surviving verified evidence record is not promoted but recorded
as failed with reasons in proposals/promotions-ledger.yaml — the
auditable dispositions trail, in the archive-ledger tradition. The
Maintain workflow gains a separate `promote` job on a fresh checkout of
main (one-cycle latency by design: promotions never ride the auto-tier
maintenance PR), opening its own needs-approval PR into the classifier,
the citation-checking arbiter, the founder tap, and the content-response
ripple. First dry run against live proposals, same day: both
already-carried arXiv items correctly deduped (one via the title guard —
the exact aliasing that fooled the watch in August), and the one new
source drafted with a verified evidence record. The pipe's first real
consumer is queued: the Villarroel VASCO-blog drop of this morning.

## 2026-09-01 — Bench v2 ships, with the backfill: no good proposal dies of silence unscored

Build step 2, plus the founder's direction on the backlog ("I don't want
to lose them"). The five-vendor panel now scores every agenda proposal
for expected information gain (scripts/score-agenda.mjs, one batched
call per seat), and the advancement rule from the thresholds decision
applies: four of five seats high, zero constitutional concerns, thin
panels never advance. Advancing STUDY proposals are drafted into their
freeze files — plus the research item each executes — by
scripts/draft-freeze.mjs (mechanical id assignment, schema-shape
validation, hash stamping, budgets: two freezes per run, two uncollected
studies per case), landing as one gated needs-approval PR judged by the
panel before any data exists. The backfill is the standing rule rather
than an exception: the scorer visits every agenda run directory lacking
a scores.yaml, so its first run sweeps the entire un-adopted backlog —
the transients alignment pair, the pizzagate provenance study, the
xenon-isotope regression among them — and ignored-is-retired resumes
afterward with five recorded opinions per retirement instead of silence.
One-cycle latency between scoring and drafting (the bench job reads
merged scores on main), the same clean-tier pattern as the promotion
pipe. The scoring digest rides the weekly issue.

## 2026-09-01 — The refusal fallback generalizes to every house-drafting call — and is banned from panel seats

The founder's direction, after the editorial audit joined the
refusal-fallback path this morning: apply the mechanism everywhere
appropriate, once, rather than chasing the next biology refusal
pipeline by pipeline. The audit of every LLM call site in scripts/ and
its outcome:

**Gained the fallback** (house-drafting calls — single-provider work
whose output is a draft that rides the gates): triage-watch.mjs (watch
triage decisions), process-inbox.mjs (commentary→proposal translation),
reconcile-contested.mjs (reconsideration drafts), extract-claims.mjs
(both the extraction and the adversarial-verification passes),
watch-literature.mjs (relevance notes). **Already covered**:
propose-agenda.mjs, promote-imports.mjs, draft-freeze.mjs (which landed
with bench v2 mid-audit — its study stamp, which had interpolated the
provider object rather than any model name, now carries the model that
answered), and — earlier on this same branch — reassess-changed.mjs
(assessment + editorial audit).
**Exempt, now marked in code**: the panel seats — cross-model-check.mjs,
arbiter.mjs, score-agenda.mjs (the bench's five-seat scorer), and the
shared seat caller in scripts/lib/vendors.mjs. A
seat's identity as a specific vendor/model is the point of the panel
(§3.15 vendor-independence): a refusing seat counts as a FAILED seat,
never a silently swapped one, and each seat call site now carries a
comment saying so, so no future agent "fixes" it. **Out of scope**:
generate-case-art.mjs calls an image API, not the drafting path.

The stamping rule rides along everywhere the fallback landed: every
record that names a model — assessment overlays, triage run files and
inbox drop headers, commentary-proposal files, reconsideration overlays,
extracted claims' origin.extractedBy, watch relevance notes, promoted
evidence origins, run.yaml model fields — carries the model that
actually answered (the { model } the fallback returns), never the
configured model when it refused. Where one run makes many calls
(extraction sections, relevance notes, triage cases), per-record stamps
carry that record's model and the run file carries the set of models
used. A stamp a reader cannot trust to name the model that did the work
would break the reconstruction guarantee the constitution stakes
accountability on.

## 2026-09-01 — The shelf shows its verdicts; duplicates stop eating the budget; /panel gains vitals

Three refinements after watching the first full metabolism run. (1) The
proposals page now renders what the Bench decided: a five-seat glyph
strip per proposal, its derived fate (pre-registered with a link,
advancing, retired with the tally, blocked with the concern verbatim),
and a summary strip of totals — the page had been underselling the
system, showing "ideas under review" when every idea now carries five
recorded opinions. Unscored runs render exactly as before; fates are
derived, never stored. (2) The promotion pipe dispositions duplicates
BEFORE budget selection: the first run's two known duplicates consumed
promotion slots and deferred two genuinely new sources by a cycle —
cheap dispositions no longer crowd out real promotions. (3) /panel gains
a Metabolism section (KISS by founder direction): one row of totals —
proposals scored, advanced, studies pre-registered and collected,
sources promoted, duplicates refused — each derived live from the same
ledgers the loops write, nothing stored, everything inspectable.

## 2026-09-01 — The endorsement drafter: endorsed proposals stop waiting for a human to write YAML

The gap #151 surfaced, closed. A claim or research-item proposal four of
five seats scored high-gain with no constitutional concern was
"endorsed — awaiting adoption": the panel had told the editor to adopt
it, and nothing drafted it — studies got a freeze drafter, everything
else got a waiting room. Now an `adopt` job (after `bench`, same
clean-tier pattern: fresh main, merged scores only) drafts endorsed
proposals into ledger records and opens ONE gated needs-approval PR
(scripts/draft-endorsements.mjs, core logic unit-tested in
scripts/lib/adopt-core.mjs).

The lines held while closing it: adopted claims enter at **catalog
tier** — never featured content — and may anchor **only to evidence
already in the ledger**: the model names an anchoring evidence record,
the script copies that record's sourceId and locator, and a draft that
cannot anchor in-ledger is dropped with the reason (it stays endorsed
for the promotion pipe or a manual adoption; it never gains an invented
locator). Ids are mechanical; provenance is stamped in `origin.ref`
(ResearchOpportunity gains an optional `origin` for exactly this),
which doubles as the adoption registry — the repo is the state, no side
files. Budgets keep each diff arbiter-sized: three adoptions per run,
two per case; deferred candidates stay endorsed and sweep next run. The
proposals page now renders the terminal fate ("adopted · <id>") and
counts adopted separately from endorsed-awaiting. With this, every
proposal fate is closed-loop: pre-registered, adopted, retired, or
blocked — nothing good dies in a queue, and nothing publishes on the
drafter's own judgment.

## 2026-09-03 — The steelman field: every judgment must disclose the strongest argument it does not answer

Epistemic counterweight #1 (docs/AUTOMATION.md, Tribunal section). The
system's real failure mode on contested cases is not fabrication (CI
catches it) or sloppiness (the panel catches it) but convergent
dismissal: five models from the same handful of vendors, sharing
roughly the same mainstream priors, each finding the featured
hypothesis wanting for the same reasons — none ever stating its best
case. The constitution forbids the obvious fix (seating an advocate:
§2, not a believer-versus-skeptic arena), so the counterweight is a
disclosure obligation on the assessor itself: every assessment run —
house draft, blind check, reconsideration — must fill
`caseAssessment.steelman` with the strongest argument FOR the featured
hypothesis that the assessment does not answer. A limitations section,
not a rebuttal: it never moves a verdict.

Mechanics: required from 2026-09-04, enforced fail-closed in the
loader (`steelmanRequirementError`); append-only history before the
cutoff is exempt, never rewritten. All three drafting prompts bump
(assess/check/reconsider → v3) and validate the field fail-closed —
"some people disagree" length fails. Displayed beside the verdict on
the case page and inside each check run's expansion on the concurrence
panel, so a lazy steelman is publicly visible and every ratification
diff carries it. Excluded from the reassessment no-change comparison:
rephrasing the disclosure is not a change of judgment and must not
mint churn overlays. The accumulation effect is the point: a steelman
that stands unanswered across runs is a research crux the Bench should
pick up — the field turns the panel's shared blind spots into visible,
queryable records instead of silent priors.

## 2026-09-02 — Three faults behind one conflicted PR: unique runIds, no duplicate panels, a throttle that counts the right thing

PR #156 (an hourly content-response batch) arrived conflicted, and the
three faults behind it turned out to be one causal chain rather than
three coincidences. Tracing it: the PR **parked on the rate limit**;
parked respond PRs are deliberately exempt from supersede-close, because
a park is a substantiated objection and disagreement must not vanish
silently (§3.15, added in #99); so it stayed open while the next hourly
run re-derived **the same** 2026-09-01 Orch OR panels; and those collided
because check overlays were named `<date>-check-<seat>`. The park caused
the conflict.

**1. Overlay runIds are unique across branches and monotonic in time.**
`cross-model-check.mjs` avoided collisions by probing `fs.existsSync` and
suffixing `-r2`, `-r3`. That checks the working tree, but the namespace
that must be unique is the merged history: two runs branching off the same
`main` each saw no file and each took the unsuffixed name. Worse, `runId`
*is* that string, so two distinct panel runs were minted with one runId —
breaking revert-by-runId (docs/MAINTENANCE.md) and the §3.15 guarantee
that a reader can reconstruct which model did what. It was fail-closed
(the loader's `assertUnique` on runId, plus git itself), which is why it
surfaced as a conflict rather than as silent corruption. Both check and
`auto-` overlays now suffix a UTC `HHMMSS`. The suffix has to be
*monotonic*, not merely unique: `latestCheckPerModel` breaks same-date ties
by string-comparing runIds, so the random token the `auto-` overlays used
could rank the morning's draft above the afternoon's. A timestamp sorts
chronologically, needs no filesystem probe (so concurrent runs cannot
agree on it), and still sorts after a legacy unsuffixed id sharing its
prefix, so existing overlays keep their order. This also dissolves the
fear recorded in `content-response.yml` that leaving two respond PRs open
"invites merging both, which conflicts" — append-only overlays with
distinct runIds now simply coexist.

**2. The hourly loop stops paying twice for the same panel.** With
collisions gone, the remaining cost of a long-lived parked PR is that
every later hour re-panels the same cases — five vendors, real money, for
a case-day already sitting in an open PR. The re-panel step now skips any
case a still-open `respond/` PR has already panelled today. The park
exemption is untouched: parks stay open and visible, they just stop
generating duplicate work while they wait.

**3. The throttle counts the autonomous lane, not everything.** The budget
exists to bound *the machine's* unattended pace (2026-08-25). It was
counting every canon-touching merge regardless of who directed it, so
founder-supervised construction spent it — twice refunded by hand with a
`GATE_EPOCH` bump (bootstrap week; the studies sprint), and a third time
on 2026-09-02 at 14/10, parking a 5-of-5-complies batch. A throttle whose
documented remedy is a recurring manual override is miscounting. Merges
now declare supervision with a `Supervised-by:` trailer in the squash
commit message and are excluded per-merge. Three properties keep that from
being a loophole, and they were chosen over the alternatives deliberately:
**default counts**, because autonomous lanes opting *in* would fail silent
the day a new lane forgot to stamp itself, and an under-counting throttle
is no throttle, whereas a forgotten trailer merely parks something;
**it cannot self-apply**, because only merges already on `main` are
counted, so any trailer was panel-reviewed inside its own PR, and the PR
under judgment never exempts itself — its body is untrusted input and must
not steer a gate; **it is visible**, printed on every content verdict, so
drift toward blanket exemption shows up continuously. A per-commit
`gh`-API lookup of each merge's branch was considered and rejected: it
would put an authenticated network call inside the gate itself, and the
house rule since 2026-08-26 is that verification informs votes but never
gates. `GATE_EPOCH` stays as the coarse remedy of last resort and should
not need bumping again. The change is forward-looking — it cannot refund
the 14 merges already on `main`, so the current park clears when the
trailing week rolls past the 2026-09-01/02 burst.

(AI record of a founder instruction, 2026-09-02 session: "pick what you
think will make the site run reliably and is cleanest.")

## 2026-09-03 — Correction: the supervised-lane trailer goes in a commit message, not the PR body

The lane-aware throttle that landed yesterday (#160) shipped with a wrong
instruction, caught on the first inspection of its own effect. `docs/
MAINTENANCE.md` said to declare a supervised merge by putting a
`Supervised-by:` trailer in the **PR body**, "which GitHub carries into
the squash commit message". It does not. This repo squash-merges, and
GitHub composes a squash message from the PR **title plus the branch's
commit messages** — the body is never included. Evidence from merged
history: #153's squash body is its two commit messages verbatim, #160's
is its single commit message verbatim, and no squash commit on `main`
contains text that appeared only in a PR body. #160's own declaration was
written in its PR body and duly vanished.

The mechanism itself is sound and needed no change: the counting, the
regex, and the report are all correct, and the failure was safe in the
designed direction — a lost trailer means the merge counts, which parks
something rather than disarming the gate. Only the instruction was wrong,
and it is now corrected to a commit-message trailer, with the squash
behaviour stated so the next reader does not have to rediscover it. Worth
recording rather than quietly editing: a governance mechanism whose
documented trigger does not fire is indistinguishable from one nobody
uses, and the distinction only surfaced because the throttle was checked
against reality instead of assumed to work.

Also measured while confirming this, and the reason the lane fix was
worth making: of the 15 canon merges in the current window, **5 are
autonomous** (two content responses, one promotion, two maintenance runs)
and **10 are founder-directed construction** (the four study freeze/
collection PRs, the pins simplification, founding inputs, metabolism 1+2,
the transients adoption, and the two Amazon PRs). The machine's lane is
frozen at 15/10 entirely on supervised work — the miscount the fix
removes going forward, but cannot retroactively refund, since merged
commit messages are immutable.

(AI record, 2026-09-03 session, reporting a defect in the author's own
prior change.)

## 2026-09-03 — Epoch 3, the overlay-id invariant gets tests, and the observed cron cadence

Follow-through on the three faults behind #156, after checking what the
fixes actually did rather than assuming.

**The overlay-id invariants are now enforced, not commented.** #160's
central fix was a property of a generated string, and it shipped with no
test — the tests it added covered the throttle's lane split instead. The
id logic was also duplicated inline in the two scripts that mint it. Both
now call `scripts/lib/overlay-ids.mjs`, whose seven tests state the two
invariants as the failure modes that produced #156: an id must be unique
across concurrent runs that cannot see each other's files (the #156
scenario, written out literally), and it must be *monotonic*, because
`latestCheckPerModel` breaks same-date ties by string-comparing runIds, so
a merely-unique random token could rank the morning's overlay above the
evening's. Also pinned: the date stays the first ten characters, a
suffixed id sorts after a legacy unsuffixed one sharing its prefix, the
`-r2`/`-r3` fallback fires only for a same-second collision in one tree,
and the timestamp is UTC so two runners in different zones stay
comparable. Verified separately that nothing parses the old id shapes —
the only `runId` slicing in the tree is on agenda and inbox ids.

**Epoch 3 (2026-09-03T13:00Z), the last one this should need.** The
per-merge supervised exclusion cannot refund merges already on `main`,
because their commit messages are immutable, so the miscount it fixes was
still frozen into the window at 15/10. Classified: five autonomous (#156,
#158 content responses; #148 promotion; #147, #144 maintenance) against
ten founder-directed construction (#125/#129 and #152/#153, the two study
freeze/collection pairs; #135 pins; #132 founding inputs; #128
metabolism; #124 transients adoption; #113/#118 Amazon). The autonomous
lane's true usage was **5 of 10** while the lane sat frozen. Unlike epochs
1 and 2 this bump rests on a per-merge classification rather than an
impression, and it is a one-time clearing rather than the mechanism.

**The hourly metabolism is not hourly.** Twelve content-response runs
across 2026-09-01/03 landed every three to five hours — about five a day
against twenty-four requested. GitHub drops most scheduled crons even off
the top of the hour, which the existing comment half-anticipated for :00.
Nothing downstream breaks, since the loop is idempotent and exits free
when nothing is stale, but worst-case latency for a canon change is a few
hours rather than one, and the workflow now records the observed figure so
anyone reasoning about cadence uses it. Asking for hourly stays right: it
is the cheapest way to actually get five.

(AI record of a founder instruction, 2026-09-03 session: "any fixes you
need to do — please let's do them.")
## 2026-09-05 — The low-risk lane belongs to the diff, not to whoever opened the PR

An inbox drop (#164, a Penrose-co-authored interferometer paper for
Orch OR) sat open and green for nine hours with nothing moving it, which
surfaced a gap between the tiered merge policy and its mechanism. The
policy is a statement about diffs: reversible-by-runId material that
touches no featured content may merge without a human tap. The mechanism
was a statement about processes: `maintain.yml` and `content-response.yml`
armed auto-merge in the same breath as `gh pr create`, so the lane was
granted at birth by the creating workflow and never afterwards. A PR
opened any other way — an agent session, the founder's own branch — was
outside the only place that could grant it, and the arbiter, the one thing
that arms a PR after creation, deliberately skips low-risk PRs because
they are governed by the classifier and CI rather than the panel. Nothing
was watching them.

The cost was not only latency. Intake is event-driven: `inbox-response.yml`
fires on a push to `inbox/**` on `main`. An unmerged inbox drop is not a
queued item, it is a file on a branch, so the drop was not late — it was
absent from the pipeline entirely, and would have stayed absent until
someone noticed the PR.

`pr-risk-check.yml` now grants the lane it was already enforcing, on the
same classification, extended to fire on `ready_for_review` as well as
open/push/label. The guard is the security boundary and is stated as one:
non-draft, same-repo, author with write access, classifier says low-risk,
no `needs-approval` label (an explicit hold outranks a favorable
reclassification). Fork PRs are excluded twice over — by the guard, and by
`pull_request` events from forks carrying no secrets, so the maintenance
PAT would be empty. `src/domain/mergeLane.test.ts` reads the workflow as
data and asserts each condition, because every condition dropped from that
guard widens who may merge to `main` and nothing else in the repository
would notice.

Two details worth recording because both were wrong first. The step needs
an explicit `success()` in its `if`, since a custom condition replaces the
implicit one and the step would otherwise arm after the mislabel
enforcement above it had failed. And GitHub refuses to arm auto-merge on a
PR in "clean status" — nothing left to wait for — which is precisely the
state of a PR classified after its checks already passed, so that error
falls through to a direct squash merge, gated on no check having failed.
Reading that gate from `.conclusion` alone scores a still-running check run
as not-passing (its conclusion is null until it completes) and refuses a
merge GitHub has already called clean, which is the sitting PR again by
another route; the chain reads `.conclusion // .state // .status` and
tolerates the pending states, while an unrecognized shape still counts as
failing.

Creation-time arming stays in the maintenance workflows. It is redundant
now but it is the fast path, and `gh pr merge --auto` is idempotent.

(AI record of a founder question, 2026-09-05 session: "the pr is just
sitting there — should something happen to it automatically?")

## 2026-09-05 — Two unfunded seats stop every merge, and the report has to say so

Opening the low-risk-lane fix for judgment surfaced something larger. The
panel parked it 3/5 — and two of the five seats had not voted at all:
OpenAI returned `429 You have no credits remaining`, xAI returned `403 …
used all available credits or reached its monthly spending limit`. Three
seats judged, all three said complies, none objected. Quorum is four, so
the change could not pass. The `arbiter` check is required on `main`
(confirmed: `mergeStateStatus` BLOCKED with CI and the risk check green),
which means that while two seats are unfunded **nothing classified
needs-approval can merge at all** — content, code, or constitution. The
last panel with five live seats was #163 on 2026-09-03.

The park is correct and stays. An unfunded panel must not degrade into a
smaller panel that still passes things; that is precisely the check
§3.15 forbids weakening, and the tally has always kept failed seats in the
denominator for that reason.

What was wrong is what the report *said*. "Only 3 of 5 seats affirm
compliance (4 required)" is true and describes a divided panel, sending
the reader to revise a diff nobody objected to, when the operative fact
was two unpaid invoices. The tally now counts seats that cast no usable
vote (API failure, and equally a malformed reply — both are seats that did
not judge), names them in the verdict, and, when no seat objected and the
affirming seats plus the dead ones would have reached quorum, states that
restoring the seats rather than revising the change is the remedy. It
never alters the outcome. Presenting an operational fault as an editorial
judgment is the same class of error as presenting an unratified draft as a
ratified one.

Also corrected: the report's footer still called itself advisory "while
the founder's merge tap remains", language from before the dry period
ended on 2026-08-25. It told every reader the opposite of what branch
protection was doing. The footer now says the verdict is binding and names
both escapes — revise, or restore a failed seat.

Only the founder can clear this one: the two accounts need credit. Until
then the low-risk lane still flows (the arbiter skips it by design), so
inbox drops, proposals and overlays keep moving while judged content does
not.

## 2026-09-05 — The weekly digest was never posted: a missing `issues: write`

The digest is the founder's one observer artifact (docs/AUTOMATION.md, "The
founder's role"); every loop reports into it — arbiter parks, Bench scores,
yield bands, pre-registrations pending, the archive ledger. It has never
existed. Every scheduled Maintain run since 2026-08-25 wrote
`weekly-digest.md` and then logged `could not open the digest issue`,
swallowed by the step's `|| echo ::warning` fallback. Neither repository has
ever had an issue created by the machine. Cause: the digest step
deliberately uses `GITHUB_TOKEN` rather than the maintenance PAT (GitHub
suppresses notifications for one's own PAT activity, and the digest exists
to be emailed), but the workflow's `permissions:` block granted `contents`
and `pull-requests` only — `gh issue create` had no `issues` scope. One
line fixes it. Recorded because the failure mode is the one this project
keeps meeting: a mechanism whose documented trigger does not fire is
indistinguishable from one nobody reads, and the only reason it surfaced
is that someone asked why the founder had never received a digest. The
same fix applies to the downstream deployment on its next engine sync.

(AI record, 2026-09-05 session, in response to the founder's question
about what to focus on next.)
