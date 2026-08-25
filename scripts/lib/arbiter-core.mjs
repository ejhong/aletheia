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
 * Scrutiny tier for one changed file — what the panel must see first when
 * a diff exceeds the budget. Lower is more important.
 *
 *   0 — the governance surface: constitution, workflows, scripts, app code.
 *       A violation here is the dangerous kind.
 *   1 — content canon: claims, evidence, sources, narrative, research,
 *       history, docs. Where fabrication or provenance loss would live.
 *   2 — mechanically-guarded records: assessment overlays (append-only,
 *       enforced by the risk classifier), proposals, harvested governance,
 *       inbox. Dropped first, because other machinery already checks them.
 */
export function diffTier(file) {
  if (
    /^content\/cases\/[^/]+\/assessments\//.test(file) ||
    file.startsWith("proposals/") ||
    file.startsWith("governance/") ||
    file.startsWith("inbox/")
  )
    return 2;
  if (file.startsWith("content/") || file.startsWith("docs/") || file.startsWith("public/"))
    return 1;
  return 0;
}

/**
 * Cap an untrusted diff for the panel packet, by scrutiny priority.
 *
 * The first dry-period parks were partly "unsure because I could not see
 * sources.yaml" — positional truncation had dropped canon content while
 * keeping bulky append-only overlays. Sections are now kept tier by tier
 * (stable order within a tier) so what gets omitted is what other
 * machinery already guards. Omissions stay loud: voters are told exactly
 * which files they have not seen, because a silently truncated diff judged
 * as complete would be the arbiter passing changes it never read.
 */
export function capDiff(diff, maxChars = 400_000) {
  if (diff.length <= maxChars) return { text: diff, omitted: [] };
  const sections = diff.split(/^(?=diff --git )/m).map((text, i) => {
    const m = text.match(/^diff --git a\/(\S+)/);
    return { text, i, file: m ? m[1] : null, tier: m ? diffTier(m[1]) : 0 };
  });
  const kept = new Set();
  let used = 0;
  for (const tier of [0, 1, 2]) {
    for (const s of sections) {
      if (s.tier !== tier) continue;
      if (used + s.text.length <= maxChars) {
        kept.add(s.i);
        used += s.text.length;
      }
    }
  }
  return {
    text: sections.filter((s) => kept.has(s.i)).map((s) => s.text).join(""),
    omitted: sections
      .filter((s) => !kept.has(s.i))
      .map((s) => s.file ?? "(unparsed section)"),
  };
}

/**
 * The weekly throttle. An unattended system needs a structural bound on
 * how fast published content can change; this gate parks an otherwise
 * passing content change once the week's merge budget is spent. It never
 * upgrades a verdict, and non-content changes (code, docs, proposals)
 * are not throttled — the limit protects readers, not the repo.
 */
export const CONTENT_MERGES_PER_WEEK = 10;

export function rateLimitGate(verdict, { touchesContent, mergesThisWeek }) {
  if (
    verdict.outcome !== "pass" ||
    !touchesContent ||
    mergesThisWeek < CONTENT_MERGES_PER_WEEK
  )
    return verdict;
  return {
    ...verdict,
    outcome: "park",
    reason: `${verdict.reason} — but the weekly content-merge budget is spent (${mergesThisWeek}/${CONTENT_MERGES_PER_WEEK}); parked until the window rolls`,
    rateLimited: true,
  };
}
