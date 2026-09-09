import { parse as parseYaml } from "yaml";
/**
 * Pure logic for the constitutional arbiter (scripts/arbiter.mjs):
 * validating one seat's vote and tallying the panel's verdict. Kept
 * framework-free and unit-tested (src/domain/arbiter.test.ts), because
 * this is the code that will eventually replace the founder's merge tap —
 * the guards deserve tests more than the feature does.
 */

export const VOTE_VALUES = ["complies", "violates", "unsure"];

/**
 * What kind of violation a seat found. The first three park a change on a
 * single seat's word (AGENTS.md §3.15, founder amendment of 2026-09-09: a
 * lone objection parks only for fabrication, exposure of confidence
 * material, or an edit to the constitution); the rest park only when two
 * seats object, and a lone one becomes a review note the operator answers.
 */
export const PARADIGMS = ["fabrication", "confidence", "constitution", "check-weakening", "provenance", "other"];
export const VETO_PARADIGMS = new Set(["fabrication", "confidence", "constitution"]);

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
  const vote = {
    seat,
    vote: reply.vote,
    rules,
    reasoning: reply.reasoning.trim(),
  };
  // A violation names its kind; one that does not is "other" — recorded, answered, never a veto by omission.
  if (reply.vote === "violates") vote.paradigm = PARADIGMS.includes(reply.paradigm) ? reply.paradigm : "other";
  return vote;
}

/**
 * Tally the panel: a narrow veto and a wide voice (AGENTS.md §3.15, founder
 * amendment of 2026-09-09).
 *
 *   pass — at least ARBITER_MIN_COMPLIES seats say `complies`, no seat
 *          finds a violation of a vetoing kind (fabrication, confidence,
 *          constitution), and fewer than two seats find a violation of any
 *          kind. A lone objection of another kind does not park: it is
 *          returned in `notes`, recorded on the change as a review note the
 *          operator answers on the record (an issue), and the change may
 *          merge. One unsure (or one failed seat) is tolerated.
 *   park — a vetoing violation from any seat; two or more violations of
 *          any kind; or a panel too small to reach the threshold. Parking
 *          is the safe direction: a parked change waits in public, a
 *          wrongly merged one publishes.
 *
 * Before the amendment a single substantiated objection parked; one seat
 * parked twelve pushes in a day against four complies each time, half of
 * them on readings stricter than the site needs. No consequential change
 * publishes on one model's judgment, and none is blocked on one either,
 * except where the harm is the kind one seat may stop alone.
 *
 * Failed seats (API error, refusal, empty reply) are recorded as unsure
 * with the failure as reasoning — visible in the report, never silently
 * dropped from the denominator. A seat that never voted is counted like a
 * seat that voted unsure, but it is not described like one: when the seats
 * that did not vote were unfunded API accounts, the remedy is billing, not
 * revision, and the report says so.
 */
export function tallyVerdict(votes) {
  const counts = { complies: 0, violates: 0, unsure: 0, failed: 0 };
  for (const v of votes) {
    counts[v.vote]++;
    if (v.failed) counts.failed++;
  }
  const violating = votes.filter((v) => v.vote === "violates");
  const vetoes = violating.filter((v) => VETO_PARADIGMS.has(v.paradigm));
  const enough = counts.complies >= ARBITER_MIN_COMPLIES;
  const outcome = enough && vetoes.length === 0 && violating.length < 2 ? "pass" : "park";
  const notes = outcome === "pass" ? violating : [];
  const name = (v) => `${v.seat} (${v.rules.join(", ")}${v.paradigm ? `; ${v.paradigm}` : ""})`;
  const reasons = [];
  if (vetoes.length > 0)
    reasons.push(`${vetoes.length} seat(s) find a violation that parks on its own: ${vetoes.map(name).join("; ")}`);
  if (vetoes.length === 0 && violating.length >= 2)
    reasons.push(`${violating.length} seats find a violation: ${violating.map(name).join("; ")}`);
  if (!enough)
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
    notes,
    reason:
      outcome === "pass"
        ? notes.length
          ? `${counts.complies} of ${votes.length} seats affirm compliance; one seat's objection is a review note the operator answers on the record: ${notes.map(name).join("; ")}`
          : `${counts.complies} of ${votes.length} seats affirm compliance; no seat finds a violation`
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
 * The panel's cost, summed from the seats' metered replies: tokens always,
 * dollars only when every metered seat was priced — a null anywhere makes
 * the total null, never an underestimate. Seats that failed carry no cost
 * and are not counted as metered.
 */
export function costOf(votes) {
  const metered = votes.filter((v) => v.cost);
  const usd = metered.length && metered.every((v) => typeof v.cost.usd === "number") ? Number(metered.reduce((n, v) => n + v.cost.usd, 0).toFixed(4)) : null;
  return {
    seats: metered.length,
    inputTokens: metered.reduce((n, v) => n + (v.cost.inputTokens ?? 0), 0),
    outputTokens: metered.reduce((n, v) => n + (v.cost.outputTokens ?? 0), 0),
    usd,
  };
}

/** How much of the packet a run account may take; the diff keeps the rest. */
export const ACCOUNT_CAP = 150_000;

function clip(text, cap, label) {
  if (text.length <= cap) return text;
  return text.slice(0, cap) + `\n[… ${label}: ${text.length - cap} more characters not shown]`;
}
function addedLines(diff) {
  return diff
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
    .map((l) => l.slice(1))
    .join("\n");
}

/**
 * A content run's own account of itself, for a panel that cannot read the
 * whole diff: the run records (run.yaml, verification.md, novelty.md, the
 * intake manifest), each changed edition's header, rationale, featured
 * claims, crux order and article, the lines added to history and
 * dispositions, and each panel seat's case verdict and reasoning. A
 * mechanical extraction from the files it names at the head revision —
 * no model writes it, and the seats are told so. Working files (model
 * replies, remembered judgments, supplied text, packets) are left out and
 * stay listed under OMITTED FILES when the diff is over budget.
 *
 *   changed: paths the change touches; read(path) → text at head, or null;
 *   diffOf(path) → that path's unified diff.
 */
export function runAccount(changed, read, diffOf) {
  const files = [];
  const sections = [];
  const take = (p) => {
    const t = read(p);
    if (t != null) files.push(p);
    return t;
  };
  for (const p of changed.filter((f) => /^proposals\/[^/]+\/run\.yaml$/.test(f))) {
    const dir = p.replace(/\/run\.yaml$/, "");
    const parts = [`--- ${p}`, take(p) ?? ""];
    for (const [name, cap] of [["verification.md", 60_000], ["novelty.md", 4_000], ["manifest.yaml", 8_000]]) {
      const t = take(`${dir}/${name}`);
      if (t != null) parts.push(`--- ${dir}/${name}`, clip(t, cap, name));
    }
    sections.push(parts.join("\n"));
  }
  for (const p of changed.filter((f) => /^content\/cases\/[^/]+\/editions\/[^/]+\.ya?ml$/.test(f))) {
    const t = take(p);
    if (t == null) continue;
    let e;
    try {
      e = parseYaml(t);
    } catch {
      sections.push(`--- ${p}\n[unparseable YAML]`);
      continue;
    }
    const head = ["runId", "date", "model", "promptVersion", "previous"].map((k) => `${k}: ${e?.[k] ?? ""}`).join("\n");
    sections.push(
      [
        `--- ${p} (edition: header, rationale, featured claims, crux order, article)`,
        head,
        `rationale: ${e?.rationale ?? ""}`,
        `featuredClaimIds: ${(e?.featuredClaimIds ?? []).join(", ")}`,
        `cruxOrder: ${(e?.cruxOrder ?? []).join(", ")}`,
        `article:\n${clip(String(e?.article ?? ""), 45_000, "article")}`,
      ].join("\n"),
    );
  }
  for (const p of changed.filter((f) => /^content\/cases\/[^/]+\/(history|dispositions)\.yaml$/.test(f))) {
    const added = addedLines(diffOf(p) ?? "");
    if (!added.trim()) continue;
    files.push(p);
    sections.push(`--- ${p} (lines added)\n${clip(added, 25_000, p)}`);
  }
  for (const p of changed.filter((f) => /^content\/cases\/[^/]+\/assessments\/[^/]+\.ya?ml$/.test(f))) {
    const t = take(p);
    if (t == null) continue;
    let a;
    try {
      a = parseYaml(t);
    } catch {
      continue;
    }
    const ca = a?.caseAssessment ?? {};
    const reasoning = String(ca.reasoning ?? ca.synthesis ?? "");
    sections.push(`--- ${p}\nmodel: ${a?.model ?? ""}\nrole: ${a?.role ?? ""}\ncase verdict: ${ca.verdict ?? ""}\n${clip(reasoning, 700, "reasoning")}`);
  }
  if (sections.length === 0) return { text: "", files: [] };
  const header = `Generated by src/lib/arbiter-core.mjs (runAccount) from the ${files.length} file(s) named below, read at the head revision: the run records (run.yaml whole; verification.md to 60,000 characters; novelty.md to 4,000; manifest.yaml to 8,000), each changed edition's header, rationale, featured claims, crux order and article (article to 45,000), the lines added to history and dispositions (to 25,000 each), and each panel seat's case verdict and the first 700 characters of its reasoning; the whole account to ${ACCOUNT_CAP.toLocaleString("en-US")}. Every clip is marked in place with the count of characters not shown; an unmarked part is whole. No model wrote this section. Working files (model replies, remembered judgments, supplied text, packets) are not included and may appear under OMITTED FILES.`;
  return { text: clip([header, ...sections].join("\n\n"), ACCOUNT_CAP, "run account"), files };
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
