# Decisions

Volume 2, from 2026-10-19. Append-only: a decision is changed by a later
entry, never by editing an earlier one. Volume 1 — every decision from
2026-08-20 to 2026-10-03, about 125 entries — is
`docs/archive/DECISIONS-2026-08-to-10.md`, and the September design it
refers to is `docs/archive/AUTOMATION.md`.

## In force

The decisions that still bind, in brief, each with where its full entry is.
When this list and an entry disagree, the entry wins; when an entry and
`AGENTS.md` disagree, `AGENTS.md` wins.

**The constitution's amendments (the founder's).**
- 2026-09-01 — a narrative revision considers the case's founding inputs for
  voice, free to go beyond them; judgment calls are settled by the
  competition of drafts, not by pinned rules (§7; vol. 1).
- 2026-09-09 — concurrence is measured on the graded scale, one step
  concurring, two disputing (§3.15); the founder's directions in session, an
  issue or a review are the operating record, citable with date and channel
  (vol. 1).
- 2026-09-17 — a record whose source exists but whose text could not yet be
  read may enter `provisional`, with no weight anywhere (§4; vol. 1).
- 2026-10-19 — the operator, the review, and the site growing by correction
  (§3.15; below). Supersedes the parking rules of 2026-09-09.

**The ledger.**
- Real citations only, with honest verification labels; a locator never
  invented (`docs/CONTENT_POLICY.md`).
- A claim is a proposition with anchors and nothing evaluative; everything a
  new piece of evidence could change lives in the assessment (2026-09-08,
  vol. 1; `docs/DATA_MODEL.md`).
- The ledger hash covers what records say, not where they are read: a
  source's `url` and `archivedUrl` move no evidence (2026-09-09, vol. 1).
- Every assessment carries a steelman — the strongest argument it does not
  answer (2026-09-04, vol. 1).
- Images: generated art is editorial only and credited; a plate is a real
  image with provenance; the founder keeps the covers
  (`docs/IMAGE_STYLE.md`; 2026-09-09, vol. 1).
- A case's title is the founder's; its question belongs to its edition
  (2026-09-09, vol. 1).
- Studies keep the freeze discipline: criteria frozen (and hashed) before a
  single row is collected (§3.12; 2026-08-26, vol. 1).

**The reader.**
- The reader's budget: an article of 3,000 words at most (2,500 aimed for),
  header answers of about a hundred words, a first sentence that is the
  answer (`src/domain/readerBudget.ts`; 2026-09-29/30, vol. 1). Enforced on
  every edition the engine stamps.
- Better is not longer: a re-telling must be judged better than what it
  replaces (2026-09-30, vol. 1; now the review's first question).

**The judgment.**
- A judgment written with the panel's verdicts in hand cannot be ratified by
  them: its standing waits for a fresh blind check (2026-09-30, vol. 1). Every
  draft the operator writes records every check the case held as shown to
  it, so only a panel convened after it can ratify it.
- The verdict words keep their order; "weakly" and "provisionally supported"
  stay two steps apart (2026-09-30, vol. 1).
- The panel's Anthropic seat runs at `effort: max` (the founder, 2026-09-30,
  vol. 1).

**The founder's door.** A file the founder commits to `inbox/<case>/` from
GitHub needs no sidecar: his standing direction in `config/founder.yaml` is
the permission, and GitHub must verify the commit (2026-09-09, vol. 1).
Anyone else's document needs a recorded permission (§3.15).

**Confidentiality.** No `arc/` or `notes.txt` material; Hawke-derived topics
framed neutrally; confidential papers never cited (§4).

**The trust boundary.** A change is data to everything that judges it: the
review and the quote check run main's code and read the change through git;
an operator session holds only its own key, and main's code checks its work
on a fresh machine before any of it is published; a change to a founder's
file is held for the founder's hand (2026-10-19, below).

---

## 2026-10-19 — The operator and the review: the site is rebuilt around an agent

**The direction (the founder, in session, 2026-10-19).** Take a step back
and make "the best system for both Aletheia and Erebus": "a beautiful self
updating truth exposing machine — that brings more clarity and next step
research ideas"; "the end goal is a running sustaining improving system to
help surface truth." Asked whether the sites "would run better with YOU
CLAUDE CODE in a loop just always on as an agent rather than creating fixed
sort of prompt code rules to be executed by github", and whether the
constitutional violations were "really productive for growing a site that
converges and surfaces truth" — "it feels harsh … as opposed to something
organically growing." Then: "Complete revamp please to produce simplest best
system leveraging your amazing agent powers"; "feel free to do complete
rewrite if necessary"; "you can reassess the ui presentation".

**What the operator found (the state on 2026-10-19).** The weekly loop had
stopped doing work. On 2026-10-19 the sitting chose a re-submission on The
Religion with No Name that had nothing to re-submit; the run ended
`rested`, which the scheduler did not count as a pass, so it asked for the
same step again and the sitting stopped on its own rule against repeating
one (run 39260650263, #462). Since 2026-09-21 the re-reading of unreadable
records had admitted one record in six passes, ahead of any search, while
three cases (Elusive by Law, Fire From the Sky, Zero Worlds) had never been
searched and three contested cases' reconsiderations had never run. The
sittings of 10-05 and 10-12 (#459, #460) sat parked with nobody to answer
them. October had spent $19.26 of its $400. Erebus ran the engine this site
retired on 2026-09-09; its weekly runs wrote agenda proposals nothing
adopted, and none of its four cases had moved since 2026-09-11.

**What was decided.**
1. *The operator.* The day-to-day work moves from a fixed pipeline to an AI
   agent — Claude Code, run in GitHub Actions under a hard cap per session —
   that reads the site's state and decides what most needs doing. Its
   instructions are one versioned file (`operator/charter.md`); its tools
   are `node scripts/site.ts`. It drafts; it never judges its own work.
2. *The review* (founder amendment of AGENTS.md §3.15, 2026-10-19). The
   constitutional gate's `complies / violates / unsure` is replaced by four
   reviewers of other vendors asking whether a change leaves the site better,
   no better or worse for a reader seeking the truth, whether it does a harm
   that publishing cannot undo, and what would improve it. The rule is the
   constitution's; the notes never block. Why: the gate had become one
   seat's taste (38 of 39 objections in 136 changes), it parked useful work
   over process text, and it passed twenty editions that made an article
   worse — it asked whether a change could be defended, not whether it made
   the site truer.
3. *The checks move into CI.* Every quoted passage a change adds is read in
   its source by the same reading tool the operator uses, every page
   locator checked, every new DOI resolved (`src/engine/quotecheck.ts`):
   what the second reader's verify step did mechanically, now unavoidable.
4. *What was removed.* The verbs report, draft, verify, reverify, leads,
   answer, edition, compare and next; the scheduler; the chain, arbiter,
   budget-window and risk-check workflows; the gate's libraries and the
   review-note machinery: about 17,600 lines. Kept: the ledger and its
   loader, the reading layer, the quote matcher, the blind panel, the spend
   ledger, the site. Every record those verbs wrote stays where it is.
5. *One engine, two sites.* A site's identity, theme, rules for models and
   notices move out of the engine into `config/` (`site.yaml`, `theme.css`,
   `site-rules.md`), so Erebus can pull the engine unchanged.
6. *Money* (the founder: "keep the cost lower per month if possible — maybe
   like $100 or something like that"). About $100 a month for both sites:
   Aletheia $60 (`config/budget.yaml`, from 2026-11-01, when October's crunch
   caps end), Erebus $40. The operator's advice, given in session: enough to
   keep every case alive and current; about $250 would give every case a
   deep pass a month. The panel's Anthropic seat at `max` costs $2–3 an
   asking and was put back to the founder as his call.

**Erebus (the founder, in session).** "I'd like to err on the side of truth
vs. living persons rule — but not raise any legal issues." The operator
drafted the amendment of Erebus's living-persons rules for the founder to
commit: the evidence assessed openly, as the site's opinion on facts it
discloses and never as a finding of guilt; every allegation attributed; the
defense shown beside the prosecution; no accusation repeated against anyone
uncharged. And the January 6 pipe-bomb case is to open on Erebus once its
engine is current, with "every one of the points Steve Baker raised" about
the evidence addressed as claims.

**The parked sittings.** #459 (two re-tries of unreadable records, nothing
admitted, parked over a history line's misattribution) is closed unmerged:
it carries nothing a reader would see. #460's Aeon Before Ours work (one
claim admitted, an edition its readers preferred 5–0, five fresh checks) is
carried to main on its own; its Cast, Not Carved part is not — the split
there turned attributed reports ("Engelbach reports …") into unattributed
claims, a fault in the retired split protocol that the operator's charter
now names (keep a report a report).

## 2026-10-19 — The trust boundary: a change is data to the gate that judges it

**What the reviewers found.** The first review of this rebuild (#463) held
it on four rounds, all four seats each time, for `weakens_checks`: the
review workflow checked out the change it judged and ran that change's own
review code, with the reviewers' keys present, and armed auto-merge on its
verdict — so any change, the operator's included, could rewrite the review
to pass itself. CI's quote check ran the same way. The operator's workflow
had the same fault three times over: its checkout left the maintenance
token readable by the session; the panel ran code the session could have
edited, with every vendor's key; and the step that opened the pull request
ran the session's code with the maintenance token in its environment. They
were right, and the operator had not answered the first three rounds.

**What changed.** (1) The review runs from main (`pull_request_target`),
fetches the change into git's object store and reads it with `git show` and
`git diff` only, and runs the quote check the same way before any reviewer
is asked; auto-merge takes only the commit the reviewers read. (2) The
operator's workflow is four jobs: the plan (main's code: the kill switch,
the money, the mode, and the session's instructions and first message); the
session (the operator's own key, a read-only token, nothing else); the
publish job (a fresh machine and main's code over the session's work as a
patch: the guard, the cost, the panel with the vendors' keys, the pull
request with the maintenance token, each key in the one step that needs
it); and a report on failure. (3) The founder's files — the constitution,
the kill switch, `config/`, the prompts and the charter, the workflows, and
the code that decides what publishes — are held by the review for the
founder's hand, and a session that writes one, or writes the money or the
review records, a blind check, a record marked human-reviewed, or an edit
to a written assessment or edition, publishes nothing
(`src/engine/operator.ts`, `guardSession`). (4) CI runs the quote check on
every push to main, so a change merged by hand does not escape it. A test
holds the workflows to all of this (`src/engine/trust.test.ts`).

**What it does not do.** The operator still has its own key in its session,
and with it whatever its tools can reach; the strongest guard on that key is
a workspace spending limit in the Anthropic console (`docs/RUNBOOK.md`). A
blind check in a change that did not come through the operator's workflow
— one a founder's session ran — is its author's word, which the reviewers
see. And this change itself, which creates the gate, enters by the
founder's hand: the review on main cannot judge the change that builds it.
Its four rounds and their finding are on the pull request.

