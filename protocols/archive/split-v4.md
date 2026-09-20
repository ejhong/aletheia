# split — one proposition per claim, one observation per evidence record, each anchored (protocol v4)

Step inside `aletheia verify`. Model: the drafter. Input: a proposed claim the
second reader judged non-atomic, with its anchor passage. Output: the
distinct propositions it bundles, each with a clear truth condition, each
still stated by the anchored passage — and, for each, the passage's own
words that state it, so the reader can judge every part on an anchor that
fits it. AGENTS.md §3.2: split compound propositions; evidence for one rung
must not silently count for another.

v4 (2026-09-20): every part carries its own `quote` — a contiguous verbatim
span of the anchoring text, 12 to 240 characters, copied exactly, that states
the part on its own — and a `locator`: the page marker (`[p. N]`), heading or
section nearest the quote in the text, or an empty string when the text
carries none. Until now a part was judged on the compound's anchor, which
fits the whole and not each part: on #372 a load-bearing claim whose two
propositions were each stated in the abstract was split, both parts failed
the Results locator the compound cited, and the claim was refused with
nothing in its place. A part whose quote is not found verbatim in the text
is judged on the compound's anchor, as before, and the run's account says so.

v3 (2026-09-09): the input carries `kind`. For `evidence`, the statement is
an evidence record's `sourceStatement` and the parts are observations —
one finding each, every part keeping (or adding) a contiguous verbatim
quote of 6–12 words from the passage, in double quotes, because the
mechanical quote check runs on each part before the reader judges it. Six
of twelve evidence records from a founder essay had been refused as
compound with no remedy.

v2 (2026-09-09): parts are propositions about the world, never about the
text. The first split round admitted parts phrased "The passage states that
if the sparks are hyperventilation, the perfusion changes are global" — a
claim about what a page says, true by inspection, gradable by no experiment.
A claim's truth condition names an observation, not a sentence.

---
A proposed record bundles more than one proposition. `kind` says which kind of record.

When `kind` is `claim`: split the statement into the distinct propositions the anchored passage actually states — one per entry, each with a reasonably clear truth condition, each a claim the same passage supports on its own. Keep the source's wording where the source is precise; do not add a proposition the passage does not state; do not merge back. Two to five parts is typical.

When `kind` is `evidence`: the statement is an evidence record's `sourceStatement`. Split it into one observation per entry — one finding, measurement, quotation or methodological fact each — written as the record was, in your words about what the source states, and each entry MUST contain at least one contiguous verbatim quote of 6–12 words from the passage, in double quotes, copied exactly (a part without a quote, or with a quote the passage does not contain, is refused). Two findings from two studies are two parts; a finding and its caveat are two parts.

Each part is a proposition about the world, stated in the source's own voice as an assertion: never "the passage states that…", "the essay proposes…", or "the author reports…". Where the source frames a proposition as a conditional prediction or a hypothesis, keep it as the conditional or hypothesis it is ("If the sparks are hyperventilation, the perfusion changes are global rather than local to the knot") — the record's origin already says who said it.

For every part, `quote` is a contiguous verbatim span of the anchoring text — 12 to 240 characters, copied exactly, punctuation and figures included — that states the part on its own; when `kind` is `evidence` it is the quote the part embeds. `locator` is the page marker (`[p. N]`), heading or section nearest the quote as the text shows it, or "" when the text carries none. Never compose a quote from words that are not adjacent in the text.

RETURN JSON only, matching the supplied schema.
