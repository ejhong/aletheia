/**
 * Pure logic for the constitutional arbiter (scripts/arbiter.mjs):
 * validating one seat's vote and tallying the panel's verdict. Kept
 * framework-free and unit-tested (src/domain/arbiter.test.ts), because
 * this is the code that will eventually replace the founder's merge tap —
 * the guards deserve tests more than the feature does.
 */

export const VOTE_VALUES = ["complies", "violates", "unsure"];

/** Panel threshold: a change passes only with this many `complies` votes. */
export const ARBITER_MIN_COMPLIES = 4;

/**
 * Validate one seat's parsed reply, fail-closed.
 *
 * A malformed reply becomes an explicit `unsure` with the defect recorded —
 * never a silent pass, never a dropped seat. `violates` additionally
 * requires at least one named rule: "violates, no particulars" is an
 * unactionable accusation and counts as unsure, so a seat cannot park a
 * change without saying which rule it broke.
 */
export function validateVote(seat, reply) {
  const bad = (why) => ({
    seat,
    vote: "unsure",
    rules: [],
    reasoning: `invalid reply treated as unsure: ${why}`,
  });
  if (typeof reply !== "object" || reply === null) return bad("not an object");
  if (!VOTE_VALUES.includes(reply.vote)) return bad(`unknown vote "${reply.vote}"`);
  if (typeof reply.reasoning !== "string" || reply.reasoning.trim().length < 20)
    return bad("missing or trivial reasoning");
  const rules = Array.isArray(reply.rules)
    ? reply.rules.filter((r) => typeof r === "string" && r.trim().length > 0)
    : [];
  if (reply.vote === "violates" && rules.length === 0)
    return bad("violates without naming any rule");
  return {
    seat,
    vote: reply.vote,
    rules,
    reasoning: reply.reasoning.trim(),
  };
}

/**
 * Tally the panel. The rule is asymmetric on purpose:
 *
 *   pass — at least ARBITER_MIN_COMPLIES seats say `complies` AND no seat
 *          says `violates`. One unsure (or one failed seat) is tolerated;
 *          a single substantiated objection is not.
 *   park — everything else, including a panel too small to reach the
 *          threshold. Parking is the safe direction: a parked change waits
 *          in public, a wrongly merged one publishes.
 *
 * Failed seats (API error, refusal, empty reply) are recorded as unsure
 * with the failure as reasoning — visible in the report, never silently
 * dropped from the denominator.
 */
export function tallyVerdict(votes) {
  const counts = { complies: 0, violates: 0, unsure: 0 };
  for (const v of votes) counts[v.vote]++;
  const outcome =
    counts.complies >= ARBITER_MIN_COMPLIES && counts.violates === 0
      ? "pass"
      : "park";
  const reasons = [];
  if (counts.violates > 0)
    reasons.push(
      `${counts.violates} seat(s) find a violation: ${votes
        .filter((v) => v.vote === "violates")
        .map((v) => `${v.seat} (${v.rules.join(", ")})`)
        .join("; ")}`,
    );
  if (counts.complies < ARBITER_MIN_COMPLIES)
    reasons.push(
      `only ${counts.complies} of ${votes.length} seats affirm compliance (${ARBITER_MIN_COMPLIES} required)`,
    );
  return {
    outcome,
    counts,
    reason:
      outcome === "pass"
        ? `${counts.complies} of ${votes.length} seats affirm compliance; no seat finds a violation`
        : reasons.join("; "),
  };
}

/**
 * Cap an untrusted diff for the panel packet. When over budget, whole-file
 * sections are dropped from the end and replaced by an explicit omission
 * list — voters are told exactly which files they have not seen, because a
 * silently truncated diff judged as complete would be the arbiter passing
 * changes it never read.
 */
export function capDiff(diff, maxChars = 120_000) {
  if (diff.length <= maxChars) return { text: diff, omitted: [] };
  const sections = diff.split(/^(?=diff --git )/m);
  const kept = [];
  const omitted = [];
  let used = 0;
  for (const s of sections) {
    if (used + s.length <= maxChars) {
      kept.push(s);
      used += s.length;
    } else {
      const m = s.match(/^diff --git a\/(\S+)/);
      omitted.push(m ? m[1] : "(unparsed section)");
    }
  }
  return { text: kept.join(""), omitted };
}
