# resubmit — a blocked record proposed again (protocol v1, mechanical)

Verb: part of `aletheia reverify` (src/pipeline/resubmit.ts). Model: none —
this protocol names a deterministic transformation, not a prompt. Input: the
latest-per-key `blocked` rows of a case that name a proposal still holding
the record, and that proposal. Output: a new proposal under the reverify
run's id, handed to `aletheia verify`, whose reader, checks and rows are the
judgment. A proposal stamped with this version was written by code; the
drafter of each record it carries is on that record's origin, and the run
that read it is the verify run the reverify run's account names.

---
The rules of the transformation, so a reader can reconstruct it:

1. A record is re-submitted when, of the keys it can be filed under (title
   and statement, or the title alone, for evidence; identifier or title for
   a source; statement for a claim), at least one has a row, none has a
   settled latest row — `in`, `duplicate`, `irrelevant`, `failed`,
   `provisional` — and a `blocked` latest row names this proposal. A key
   that has never been written is not a bar; a key that is settled is.
2. Claims take the ledger's next free ids, then evidence; a reference to a
   re-submitted record takes its fresh id, to a record of the old proposal
   that entered since takes its ledger id, to a record the drafter cited by
   ledger id stays, and to a record that was refused or skipped is dropped.
   Evidence left citing no claim, or whose source never entered, is not
   re-submitted and is refused under its own key with the reason.
3. A claim or an evidence record keeps the drafter's `origin` (who extracted
   it, in which run, on which date) with the lineage appended: the proposal
   it came from, its old id, the date and reason it was blocked. A source,
   which carries no origin, takes the same lineage and the drafter's model,
   run and date at the head of its verification note. The new proposal's
   `model` is null and its `promptVersion` is this protocol; its
   `resubmission` names the old proposal, its model, prompt version and
   date; its `report` names the old proposal's report and this re-submission.
4. Verify writes the rows under the records' keys; a legacy row under
   another key form is then settled with a mirror row by the reverify run.
