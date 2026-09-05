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
    failed: true,
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
 *
 * A seat that never voted is counted like a seat that voted unsure, but it
 * is not described like one. "Only 3 of 5 affirm compliance" reads as a
 * divided panel; when two of those seats were unfunded API accounts, the
 * remedy is billing, not revision, and a report that does not say so
 * presents an operational fault as a judgment on the change.
 */
export function tallyVerdict(votes) {
  const counts = { complies: 0, violates: 0, unsure: 0, failed: 0 };
  for (const v of votes) {
    counts[v.vote]++;
    if (v.failed) counts.failed++;
  }
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
  if (counts.failed > 0 && outcome === "park")
    reasons.push(
      `${counts.failed} seat(s) cast no usable vote: ${votes
        .filter((v) => v.failed)
        .map((v) => v.seat)
        .join(", ")}${
        counts.violates === 0 &&
        counts.complies + counts.failed >= ARBITER_MIN_COMPLIES
          ? " — no seat objected, so restoring the seats is the remedy, not revising the change"
          : ""
      }`,
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
 * Reserved share of the packet budget per tier, first pass only. Strict
 * tier-0-first filling had its own failure mode: tier 0 is also the
 * default for paths diffTier does not recognize, so one bulky
 * unclassified directory could spend the entire budget and push every
 * content/ file into the omission list — at which point every honest
 * seat votes unsure on a change it cannot see, and the panel reports
 * blindness instead of judgment. Tiers 0 and 1 each hold half the
 * budget in reserve; tier 2 holds none because it is the tier designed
 * to be dropped first. Reserve a tier does not spend flows to the
 * others, in scrutiny order, in the second pass.
 */
const TIER_RESERVED_SHARE = [0.5, 0.5, 0];

/**
 * Cap an untrusted diff for the panel packet, by scrutiny priority.
 *
 * The first dry-period parks were partly "unsure because I could not see
 * sources.yaml" — positional truncation had dropped canon content while
 * keeping bulky append-only overlays. Sections are now kept tier by tier
 * (stable order within a tier), with a reserved slice per tier (see
 * TIER_RESERVED_SHARE) so no tier can starve the ones below it. Omissions
 * stay loud: voters are told exactly which files they have not seen,
 * because a silently truncated diff judged as complete would be the
 * arbiter passing changes it never read.
 */
export function capDiff(diff, maxChars = 400_000) {
  if (diff.length <= maxChars) return { text: diff, omitted: [] };
  const sections = diff.split(/^(?=diff --git )/m).map((text, i) => {
    const m = text.match(/^diff --git a\/(\S+)/);
    return { text, i, file: m ? m[1] : null, tier: m ? diffTier(m[1]) : 0 };
  });
  const kept = new Set();
  let used = 0;
  const fill = (tier, cap) => {
    for (const s of sections) {
      if (s.tier !== tier || kept.has(s.i)) continue;
      if (used + s.text.length <= cap) {
        kept.add(s.i);
        used += s.text.length;
      }
    }
  };
  // First pass: each tier fills only within its own reserve, so an
  // oversized tier 0 cannot spend tier 1's slice.
  for (const tier of [0, 1, 2]) {
    fill(tier, used + Math.floor(maxChars * TIER_RESERVED_SHARE[tier]));
  }
  // Second pass: unspent reserve goes to whatever still fits, in
  // scrutiny order — the guarantee costs nothing when tiers are small.
  for (const tier of [0, 1, 2]) fill(tier, maxChars);
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

/**
 * The budget bounds the MACHINE'S unattended pace — that is what the
 * 2026-08-25 decision said it was for, and twice since (bootstrap week,
 * the studies sprint) founder-directed construction spent it instead and
 * had to be refunded by hand with a GATE_EPOCH bump. A throttle whose
 * documented remedy is a recurring manual override is miscounting, so
 * the count now excludes merges that declare themselves supervised.
 *
 * The declaration is a `Supervised-by:` trailer in the squash commit
 * message. Three properties make that safe rather than a loophole:
 *
 * 1. DEFAULT COUNTS. Exemption takes an affirmative, permanent, greppable
 *    act. The opposite arrangement — autonomous lanes opting IN — would
 *    fail silently the day a new unattended lane forgot to stamp itself,
 *    and an under-counting throttle is no throttle. Forgetting the
 *    trailer merely parks something, which announces itself.
 * 2. IT CANNOT SELF-APPLY. Only merges ALREADY on main are counted, and a
 *    trailer got there inside a PR the panel had already approved. The
 *    PR under judgment never exempts itself: its own body is untrusted
 *    input (it is fenced as such for the seats) and must not steer a gate.
 *    A supervised PR can still park behind a hot autonomous week — correct,
 *    and the founder's override remains the release valve.
 * 3. IT IS VISIBLE. The arbiter report prints the exclusions with every
 *    verdict, so a drift toward blanket exemption shows up continuously
 *    rather than in an audit nobody runs. Using the trailer to dodge the
 *    throttle is reclassifying a change to evade a check, which AGENTS.md
 *    §3.15 forbids outright.
 */
export const SUPERVISED_TRAILER = /^[ \t]*Supervised-by:[ \t]*\S/im;

/**
 * Split canon-touching merges into the lane the budget governs and the
 * supervised lane it does not. `commits` are `{ hash, message }`; a commit
 * whose message cannot be read counts, per the default-counts rule.
 */
export function splitMergeLanes(commits) {
  const autonomous = [];
  const supervised = [];
  for (const c of commits ?? []) {
    if (!c?.hash) continue;
    (SUPERVISED_TRAILER.test(c.message ?? "") ? supervised : autonomous).push(c.hash);
  }
  return {
    autonomous: [...new Set(autonomous)],
    supervised: [...new Set(supervised)],
  };
}

export function rateLimitGate(
  verdict,
  { touchesContent, mergesThisWeek, supervisedExcluded = 0 },
) {
  if (
    verdict.outcome !== "pass" ||
    !touchesContent ||
    mergesThisWeek < CONTENT_MERGES_PER_WEEK
  )
    return verdict;
  const excluded =
    supervisedExcluded > 0 ? `, ${supervisedExcluded} supervised excluded` : "";
  return {
    ...verdict,
    outcome: "park",
    reason: `${verdict.reason} — but the weekly autonomous content-merge budget is spent (${mergesThisWeek}/${CONTENT_MERGES_PER_WEEK}${excluded}); parked until the window rolls`,
    rateLimited: true,
  };
}
