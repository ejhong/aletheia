import { parse as parseYaml } from "yaml";
import { createHash } from "node:crypto";
import { readYamlReply } from "./yaml-reply.mjs";
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
 *
 * `capDiff` orders tier 2 further (see RECORD_TIER and CARRIED_TIER below).
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
const TIER_RESERVED_SHARE = [0.5, 0.5, 0, 0, 0];

/**
 * Within tier 2, what the panel can read nowhere else comes first. A sitting
 * that checks a case writes every seat's judgment three times — the installed
 * assessment, the run account's digest of it, and the seat's raw reply — and
 * those copies filled the packet while the harvested gate records and the
 * spend rows, which appear nowhere else, were the files cut (2026-09-30: two
 * seats could only say unsure, and the sitting parked).
 *
 *   2 — the records that exist once: everything under governance/ (the gate's
 *       harvested verdicts, the spend rows, review notes, the operation
 *       state) and inbox/; and a seat's raw reply that the run account
 *       compared and found NOT carried whole by an installed assessment —
 *       it says something the installed file does not.
 *   3 — the rest of tier 2, in the diff's own order, as before: assessment
 *       overlays, which the account digests, then a run's working files.
 *   4 — a seat's raw reply that an installed assessment carries whole, as the
 *       run account's comparison states (`replyDifferences`): cut first.
 *
 * A raw reply is sorted this way only when the caller says which replies
 * are carried; told nothing, it stays with the working files.
 */
const RECORD_TIER = 2;
const OVERLAY_TIER = 3;
const CARRIED_TIER = 4;
const TIERS = [0, 1, RECORD_TIER, OVERLAY_TIER, CARRIED_TIER];
/**
 * A run's record, wherever it is filed under proposals/. A sitting's run is at proposals/<runId>/run.yaml, which is
 * where the scheduler and the pages read (src/domain/runs.ts); a run kept out of their way — an experiment's — is
 * filed deeper. The panel's account must not depend on that choice: a run record in the change is accounted for
 * wherever it sits (review note #428: three check runs filed under an experiment's folder reached the panel as
 * "this change carries no run records").
 */
export const RUN_RECORD = /^proposals\/(?:[^/]+\/)+run\.yaml$/;
/** Whether a run record is filed where the scheduler and the pages read it. */
const isSittingRun = (p) => /^proposals\/[^/]+\/run\.yaml$/.test(p);
/** A seat's raw reply to a blind check, as the check verb names it (src/pipeline/check.ts), beside its run record. */
export const SEAT_REPLY = /^proposals\/(?:[^/]+\/)+seat-[^/]+\.ya?ml$/;

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
/**
 * @param {string} diff
 * @param {number} [maxChars]
 * @param {{ carried?: Iterable<string> }} [held] the raw seat replies the run account found carried whole by an
 *   installed assessment (`runAccount(...).carried`). Only tier-2 files are ordered by it.
 */
export function capDiff(diff, maxChars = 400_000, held = {}) {
  if (diff.length <= maxChars) return { text: diff, omitted: [] };
  const carried = held.carried === undefined ? null : new Set(held.carried);
  const tierOf = (file) => {
    const tier = diffTier(file);
    if (tier !== 2) return tier;
    if (file.startsWith("governance/") || file.startsWith("inbox/")) return RECORD_TIER;
    if (carried && SEAT_REPLY.test(file)) return carried.has(file) ? CARRIED_TIER : RECORD_TIER;
    return OVERLAY_TIER;
  };
  const sections = diff.split(/^(?=diff --git )/m).map((text, i) => {
    const m = text.match(/^diff --git a\/(\S+)/);
    return { text, i, file: m ? m[1] : null, tier: m ? tierOf(m[1]) : 0 };
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
  for (const tier of TIERS) {
    fill(tier, used + Math.floor(maxChars * TIER_RESERVED_SHARE[tier]));
  }
  // Second pass: unspent reserve goes to whatever still fits, in
  // scrutiny order — the guarantee costs nothing when tiers are small.
  for (const tier of TIERS) fill(tier, maxChars);
  return {
    text: sections.filter((s) => kept.has(s.i)).map((s) => s.text).join(""),
    omitted: sections
      .filter((s) => !kept.has(s.i))
      .map((s) => s.file ?? "(unparsed section)"),
  };
}

/**
 * The panel's cost, summed from the seats' metered replies: tokens always,
 * dollars only when every seat was metered and priced — a seat without
 * accounting (a call that never returned) makes the total incomplete and
 * the dollars null, never an underestimate. A seat whose reply would not
 * parse still carries the cost of the reply it returned.
 */
export function costOf(votes) {
  const metered = votes.filter((v) => v.cost);
  // Complete only when every seat that was asked returned accounting; otherwise the tokens are a floor
  // and no dollar total is claimed (§3.8: a bill with a hole is not a bill).
  const complete = metered.length === votes.length;
  const usd = complete && metered.length && metered.every((v) => typeof v.cost.usd === "number") ? Number(metered.reduce((n, v) => n + v.cost.usd, 0).toFixed(4)) : null;
  return {
    seats: metered.length,
    complete,
    inputTokens: metered.reduce((n, v) => n + (v.cost.inputTokens ?? 0), 0),
    outputTokens: metered.reduce((n, v) => n + (v.cost.outputTokens ?? 0), 0),
    usd,
  };
}

/** How much of the packet a run account may take; the diff keeps the rest. */
export const ACCOUNT_CAP = 250_000;

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

/** Empty as a schema default is: a value whose absence says the same thing. */
const isEmptyValue = (v) => v == null || v === "" || (Array.isArray(v) && v.length === 0) || (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0);

/**
 * The fields of an installed check the verb writes itself (src/pipeline/check.ts, validateCheckReply), whatever the
 * seat's reply put there; `basis` and `producedBy` are the verb's alone.
 */
export const REPLY_STAMPS = ["runId", "model", "date", "promptVersion", "humanReviewed", "role"];
/** A stamp the seat wrote is a short scalar the verb replaced; longer, or structured, and it is content the installed file does not carry. */
export const REPLY_STAMP_CHARS = 120;
/**
 * How much of a raw reply may lie outside what the comparison reads — a code fence and whatever follows it, trailing
 * lines that are not YAML, the YAML's own comments — before the reply is not counted as carried. A fence and a
 * sign-off fit; a paragraph does not. (The Anthropic seat's note on #422: the comparison is of parsed fields, and
 * said nothing of text that never reaches them.)
 */
export const REPLY_UNCOMPARED_CHARS = 200;

/**
 * Where a seat's raw reply to a blind check and an assessment installed from it differ. The installed file is the
 * reply, parsed and stamped: it must carry everything the reply says, exactly, and may add only the verb's stamps
 * and empty defaults. So every field of the reply is compared, at every depth, strings exact — except the six
 * stamps (REPLY_STAMPS), where the reply's own value is replaced by the verb's and need only be a scalar of at most
 * REPLY_STAMP_CHARS characters. A field the installed file adds is a difference unless it is empty or one of the
 * verb's (the stamps, `producedBy`, `basis`).
 *
 * @param {unknown} reply the raw reply, parsed
 * @param {unknown} installed the installed assessment, parsed
 * @returns {string[]} one line per difference, a claim named by its id; empty when the installed file carries the reply whole
 */
export function replyDifferences(reply, installed) {
  const out = [];
  const isMap = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  const show = (v) => clip(JSON.stringify(v) ?? "undefined", 80, "value");
  const walk = (a, b, at) => {
    if (Array.isArray(a)) {
      if (!Array.isArray(b)) return void out.push(`${at}: a list in the reply, not in the installed file`);
      if (a.length !== b.length) out.push(`${at}: ${a.length} item(s) in the reply, ${b.length} installed`);
      for (let i = 0; i < Math.min(a.length, b.length); i++) walk(a[i], b[i], `${at}[${isMap(a[i]) && typeof a[i].claimId === "string" ? a[i].claimId : i}]`);
      return;
    }
    if (isMap(a)) {
      if (!isMap(b)) return void out.push(`${at}: a mapping in the reply, not in the installed file`);
      for (const k of Object.keys(a)) {
        if (k in b) walk(a[k], b[k], `${at}.${k}`);
        else if (!isEmptyValue(a[k])) out.push(`${at}.${k}: in the reply, not installed`);
      }
      for (const k of Object.keys(b)) if (!(k in a) && !isEmptyValue(b[k])) out.push(`${at}.${k}: installed, not in the reply`);
      return;
    }
    if (a !== b) out.push(`${at}: ${show(a)} in the reply, ${show(b)} installed`);
  };
  if (!isMap(reply)) return ["the reply is not a mapping"];
  if (!isMap(installed)) return ["the installed file is not a mapping"];
  const verbs = new Set([...REPLY_STAMPS, "producedBy", "basis"]);
  for (const k of Object.keys(reply)) {
    if (REPLY_STAMPS.includes(k)) {
      const v = reply[k];
      if (v !== null && typeof v === "object") out.push(`${k}: the reply's own value for a stamped field is not a scalar`);
      else if (String(v ?? "").length > REPLY_STAMP_CHARS) out.push(`${k}: the reply's own value for a stamped field runs to ${String(v).length} characters`);
    } else if (k in installed) walk(reply[k], installed[k], k);
    else if (!isEmptyValue(reply[k])) out.push(`${k}: in the reply, not installed`);
  }
  for (const k of Object.keys(installed)) if (!(k in reply) && !verbs.has(k) && !isEmptyValue(installed[k])) out.push(`${k}: installed, not in the reply`);
  return out;
}

/**
 * A content run's own account of itself, for a panel that cannot read the
 * whole diff, assembled by importance: the head edition and the assessment
 * it adopts first and whole; a digest of the records the change adds or
 * modifies in the canon files; the run records (run.yaml, verification.md,
 * novelty.md, the intake manifest) and the lines added to history and
 * dispositions; then whatever the change supersedes within itself — an
 * assessment digested as the head's is, its verdicts marked where they
 * differ from the head's; an edition by the paragraphs the head does not
 * carry. Over its cap, whole lower sections are dropped by name, least
 * important and largest first; the head is never dropped or cut. A
 * mechanical extraction from the files it names — no model writes it, and
 * the seats are told so. Working files (model replies, remembered
 * judgments, supplied text, packets) are left out and stay listed under
 * OMITTED FILES when the diff is over budget — except that a check run's
 * raw seat replies are compared, under its run record, with the assessments
 * the run installed (`replyDifferences`), and the ones an installed file
 * carries whole are returned as `carried`, for the diff to cut first.
 *
 *   changed: paths the change touches; read(path) → text at head, or null;
 *   diffOf(path) → that path's unified diff; readBase(path) → text at the
 *   merge base, or null (without it a canon file's digest covers the
 *   records the diff adds and cannot tell a modified one).
 */
/** @type {(path: string) => string | null} */
const noBase = () => null;
export function runAccount(changed, read, diffOf, readBase = noBase) {
  const parsed = (p, reader = read) => {
    const t = reader(p);
    if (t == null) return null;
    try {
      return { text: t, data: parseYaml(t) };
    } catch {
      return { text: t, data: null };
    }
  };
  // The check assessments each run installed, by the run that produced them (the verb stamps `producedBy`).
  const installedBy = new Map();
  for (const p of changed.filter((f) => /^content\/cases\/[^/]+\/assessments\/[^/]+\.ya?ml$/.test(f))) {
    const data = parsed(p)?.data;
    if (data && typeof data.producedBy === "string") installedBy.set(data.producedBy, [...(installedBy.get(data.producedBy) ?? []), { p, data }]);
  }
  /** One run's raw seat replies against what it installed: the lines for its section, and the replies carried whole. */
  const seatReplies = (dir) => {
    const replies = changed.filter((f) => f.startsWith(`${dir}/`) && SEAT_REPLY.test(f)).sort();
    if (!replies.length) return { lines: [], carried: {} };
    const installed = installedBy.get(dir.split("/").pop()) ?? [];
    const carried = {};
    const lines = replies.map((f) => {
      const name = f.slice(dir.length + 1);
      const text = read(f);
      if (text == null) return `- ${name}: not readable at the head revision, so not compared`;
      let raw;
      try {
        raw = readYamlReply(text);
      } catch {
        return `- ${name}: not parseable as YAML, so not compared`;
      }
      if (!installed.length) return `- ${name}: this run installed no assessment to compare it with`;
      const [best] = installed.map((i) => ({ ...i, differences: replyDifferences(raw.data, i.data) })).sort((a, b) => a.differences.length - b.differences.length);
      // What the comparison cannot see: text outside the YAML, and the YAML's comments. Counted, and bounded.
      const uncompared = raw.outside.length + raw.comments.length;
      if (best.differences.length === 0 && uncompared > REPLY_UNCOMPARED_CHARS) {
        return `- ${name}: its fields are carried by ${best.p}, but ${uncompared.toLocaleString("en-US")} characters of the file lie outside what is compared (${raw.outside.length.toLocaleString("en-US")} outside its YAML, ${raw.comments.length.toLocaleString("en-US")} in comments), over the ${REPLY_UNCOMPARED_CHARS} allowed: NOT counted as carried whole`;
      }
      if (best.differences.length === 0) {
        carried[f] = best.p;
        return `- ${name}: carried whole by ${best.p}${uncompared ? ` (${uncompared} character(s) of the file lie outside what is compared)` : ""}`;
      }
      const SHOWN = 8;
      const more = best.differences.length > SHOWN ? `; and ${best.differences.length - SHOWN} more` : "";
      return `- ${name}: NOT carried whole by any assessment this run installed; the closest is ${best.p}, with ${best.differences.length} difference(s): ${best.differences.slice(0, SHOWN).join("; ")}${more}`;
    });
    return {
      lines: [
        `seat replies of this run — raw working files, each compared by this tooling with the check assessments the run installed (the changed assessment files whose producedBy is this run). Every field of the reply is compared at every depth, strings exact, except ${REPLY_STAMPS.join(", ")}: the verb writes those itself, and the reply's own value for one need only be a scalar of at most ${REPLY_STAMP_CHARS} characters. A field the installed file adds counts as a difference unless it is empty or the verb's (those six, producedBy, basis). What is compared is the reply as parsed: text outside its YAML — a code fence and whatever follows it, trailing lines that are not YAML — and the YAML's own comments are not compared, only counted, and a reply with more than ${REPLY_UNCOMPARED_CHARS} characters of them is not counted as carried. "Carried whole" means no difference, within that allowance:`,
        ...lines,
      ],
      carried,
    };
  };
  const caseOf = (p) => p.split("/").slice(0, 3).join("/");
  // Sections carry a rank: when the account is over its cap, whole sections are dropped from the lowest rank up
  // (largest first within a rank) and said to be dropped. Rank 0 — the head edition and the assessment it adopts,
  // what a seat must see to judge a regrade — is never dropped (2026-09-20: a sitting with three editions clipped
  // the account at the head edition's first line, and three seats could only say unsure).
  const sections = []; // { rank, text }

  // 1. Run records: run.yaml with novelty.md and the intake manifest as one section; verification.md — the verifier's
  //    per-row account, to 60,000 — as its own, so that over the cap it can fall alone and leave the run's header and
  //    the added history and dispositions lines standing.
  for (const p of changed.filter((f) => RUN_RECORD.test(f))) {
    const run = read(p);
    if (run == null) continue;
    const dir = p.replace(/\/run\.yaml$/, "");
    const parts = [isSittingRun(p) ? `--- ${p}` : `--- ${p} (a run record filed outside proposals/<runId>/: the scheduler and the site's pages do not read it, and it is accounted for here as any run is)`, run];
    // What the record says the run wrote, against the repository: a file it names that is not there is said.
    const wrote = parsed(p)?.data?.wrote;
    const named = Array.isArray(wrote) ? wrote.filter((w) => typeof w === "string") : [];
    const absent = named.filter((w) => read(w) == null);
    if (absent.length) parts.push(`of the ${named.length} file(s) this record says the run wrote, ${absent.length} are not in the repository at the head revision: ${absent.join(", ")}`);
    const seats = seatReplies(dir);
    parts.push(...seats.lines);
    for (const [name, cap] of [["novelty.md", 4_000], ["manifest.yaml", 8_000]]) {
      const t = read(`${dir}/${name}`);
      if (t != null) parts.push(`--- ${dir}/${name}`, clip(t, cap, name));
    }
    sections.push({ rank: 2, text: parts.join("\n"), carried: seats.carried });
    const v = read(`${dir}/verification.md`);
    if (v != null) sections.push({ rank: 2, text: `--- ${dir}/verification.md\n${clip(v, 60_000, "verification.md")}` });
  }

  // 2. Records the change adds or modifies in the canon files: id and the fields a seat checks, from the head file —
  //    the diff of a large ledger file is the first thing the size budget drops. With the base file readable, a
  //    record is added when the base lacks its id and modified when any field differs (a tombstone, a corrected
  //    direction); without it, the ids on the lines the diff adds.
  const RECORD_FILES = /^content\/cases\/[^/]+\/(evidence|claims|sources|research)\.yaml$/;
  const stable = (v) => JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
  for (const p of changed.filter((f) => RECORD_FILES.test(f))) {
    const doc = parsed(p);
    if (!doc || !Array.isArray(doc.data)) continue;
    const baseDoc = parsed(p, readBase);
    const baseById = Array.isArray(baseDoc?.data) ? new Map(baseDoc.data.filter((r) => r?.id).map((r) => [r.id, r])) : null;
    const addedIds = new Set([...addedLines(diffOf(p) ?? "").matchAll(/^- id: (\S+)/gm)].map((m) => m[1]));
    const rows = [];
    for (const r of doc.data) {
      if (!r?.id) continue;
      if (baseById) {
        const b = baseById.get(r.id);
        if (!b) rows.push({ r, base: null, fields: null });
        else {
          const fields = [...new Set([...Object.keys(b), ...Object.keys(r)])].filter((k) => stable(b[k]) !== stable(r[k]));
          if (fields.length) rows.push({ r, base: b, fields });
        }
      } else if (addedIds.has(r.id)) rows.push({ r, base: null, fields: null });
    }
    if (!rows.length) continue;
    const line = ({ r, base, fields }) => {
      // The line prints one state field, one text field and one locator field, each the first present of several;
      // a modified record's other changed fields are printed after it with their new values — a changed title
      // beside a statement, a url beside an identifier, a source anchor's sourceId — so the set of fields the line
      // shows is read from the record, not assumed (review note #378).
      const shown = new Set(["id"]);
      const stateKey = ["reviewState", "verification", "status"].find((k) => r[k] != null);
      if (stateKey) shown.add(stateKey);
      if (r.direction) shown.add("direction").add("strength");
      if (Array.isArray(r.claimIds)) shown.add("claimIds");
      if (r.sourceId) shown.add("sourceId");
      const textKey = ["statement", "sourceStatement", "summary", "title"].find((k) => r[k] != null);
      if (textKey) shown.add(textKey);
      const whereKey = ["exactLocator", "sourceAnchor.locator", "identifier", "url"].find((k) => (k === "sourceAnchor.locator" ? r.sourceAnchor?.locator : r[k]) != null);
      if (whereKey && whereKey !== "sourceAnchor.locator") shown.add(whereKey);
      // The anchor counts as shown only when every part of it that changed is one the line prints.
      if (fields?.includes("sourceAnchor")) {
        const printed = new Set([...(whereKey === "sourceAnchor.locator" ? ["locator"] : []), ...(r.sourceAnchor?.quote ? ["quote"] : [])]);
        const parts = [...new Set([...Object.keys(base?.sourceAnchor ?? {}), ...Object.keys(r.sourceAnchor ?? {})])];
        if (parts.filter((k) => stable(base?.sourceAnchor?.[k]) !== stable(r.sourceAnchor?.[k])).every((k) => printed.has(k))) shown.add("sourceAnchor");
      }
      const state = stateKey ? r[stateKey] : "";
      const bearing = r.direction ? `${r.direction}${Array.isArray(r.claimIds) ? ` → ${r.claimIds.join(", ")}` : ""} (${r.strength ?? ""})` : Array.isArray(r.claimIds) ? `→ ${r.claimIds.join(", ")}` : "";
      const text = textKey ? r[textKey] : "";
      const where = whereKey === "sourceAnchor.locator" ? r.sourceAnchor.locator : whereKey ? r[whereKey] : "";
      const quote = r.sourceAnchor?.quote ? ` | quote: ${clip(String(r.sourceAnchor.quote), 160, "quote")}` : "";
      const src = r.sourceId ? ` | source ${r.sourceId}` : "";
      const modified = fields ? ` | modified: ${fields.join(", ")}` : "";
      const now = fields ? fields.filter((k) => !shown.has(k)).map((k) => `\n  ${k} now: ${clip(typeof r[k] === "string" ? r[k] : JSON.stringify(r[k] ?? null), 240, k)}`).join("") : "";
      return `- ${r.id} [${state}] ${bearing}${src}${modified}\n  ${clip(String(text), 320, "text")}${quote}${where ? `\n  at: ${clip(String(where), 160, "locator")}` : ""}${now}`;
    };
    const added = rows.filter((x) => !x.fields).length;
    sections.push({
      rank: 1,
      text: clip([`--- ${p} (${added} record(s) added, ${rows.length - added} modified: id, state, direction → claims, statement, quote, locator; a modified record names its changed fields and the new value of each not already shown)`, ...rows.map(line)].join("\n"), 40_000, p),
    });
  }

  // 3. Editions, the head first. A candidate another edition of the same case names as `previous` is superseded: it
  //    is published in git even though the site renders only the head, so its own words stay reviewable — header,
  //    rationale, and the paragraphs of its article the head edition does not carry verbatim (the shared ones are
  //    read in the head; review note #377). The head carries its article.
  const paragraphs = (t) => String(t ?? "").split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  const editions = changed.filter((f) => /^content\/cases\/[^/]+\/editions\/[^/]+\.ya?ml$/.test(f)).map((p) => ({ p, doc: parsed(p) })).filter((x) => x.doc);
  const supersededRuns = new Set(editions.filter((x) => x.doc.data?.previous).map((x) => `${caseOf(x.p)}:${x.doc.data.previous}`));
  const isSupersededEdition = (p, e) => supersededRuns.has(`${caseOf(p)}:${e.runId}`);
  const editionHead = (e) => ["runId", "date", "model", "promptVersion", "previous"].map((k) => `${k}: ${e?.[k] ?? ""}`).join("\n");
  const headEditions = new Map(); // case dir → the head edition(s) of the change in that case
  for (const { p, doc } of editions) if (doc.data && !isSupersededEdition(p, doc.data)) headEditions.set(caseOf(p), [...(headEditions.get(caseOf(p)) ?? []), doc.data]);
  const adoptedByCase = new Map([...headEditions].map(([dir, es]) => [dir, new Set(es.map((e) => e.assessment?.runId).filter(Boolean))]));
  for (const { p, doc } of editions) {
    const e = doc.data;
    if (!e) {
      sections.push({ rank: 3, text: `--- ${p}\n[unparseable YAML]` });
      continue;
    }
    if (isSupersededEdition(p, e)) {
      const inHead = new Set((headEditions.get(caseOf(p)) ?? []).flatMap((h) => paragraphs(h.article)));
      const own = paragraphs(e.article);
      const unique = own.filter((para) => !inHead.has(para));
      sections.push({
        rank: 4,
        text: [
          `--- ${p} (edition superseded within this change by the one naming it as previous: header, rationale, and the ${unique.length} paragraph(s) of its article the head edition does not carry verbatim; ${own.length - unique.length} shared paragraph(s) read in the head)`,
          editionHead(e),
          `rationale: ${clip(String(e.rationale ?? ""), 3_000, "rationale")}`,
          `featuredClaimIds: ${(e.featuredClaimIds ?? []).join(", ")}`,
          `cruxOrder: ${(e.cruxOrder ?? []).join(", ")}`,
          `article, paragraphs the head edition does not carry:\n${unique.length ? clip(unique.join("\n\n"), 20_000, "superseded article") : "(none — every paragraph is carried by the head edition)"}`,
        ].join("\n"),
      });
      continue;
    }
    sections.push({
      rank: 0,
      text: [
        `--- ${p} (head edition: header, rationale, featured claims, crux order, article)`,
        editionHead(e),
        `rationale: ${e.rationale ?? ""}`,
        `featuredClaimIds: ${(e.featuredClaimIds ?? []).join(", ")}`,
        `cruxOrder: ${(e.cruxOrder ?? []).join(", ")}`,
        `article:\n${clip(String(e.article ?? ""), 60_000, "article")}`,
      ].join("\n"),
    });
  }

  // 4. History and dispositions: the lines added.
  for (const p of changed.filter((f) => /^content\/cases\/[^/]+\/(history|dispositions)\.yaml$/.test(f))) {
    const added = addedLines(diffOf(p) ?? "");
    if (!added.trim()) continue;
    sections.push({ rank: 2, text: `--- ${p} (lines added)\n${clip(added, 25_000, p)}` });
  }

  // 5. Assessments, each digested the same way — header, case verdict, load-bearing set, what is claimed, components,
  //    every claim's verdict with its reasoning. One is superseded within the change when it is a draft-role
  //    assessment in a case whose head edition, in this change, adopts another: it ranks below the run records and
  //    each of its claim verdicts is marked where it differs from the head's (review note #377). A check-role
  //    assessment is a seat's own reading and never superseded; a case with no head edition in the change has
  //    nothing to supersede its assessments.
  const assessments = changed.filter((f) => /^content\/cases\/[^/]+\/assessments\/[^/]+\.ya?ml$/.test(f)).map((p) => ({ p, doc: parsed(p), unchanged: false })).filter((x) => x.doc);
  // An edition may adopt an assessment this change did not touch (a re-edition under an unchanged ledger keeps the
  // previous one): the panel judges that edition against that assessment, so it is read at head all the same
  // (review note #379).
  for (const [dir, adopted] of adoptedByCase) {
    for (const runId of adopted) {
      if (assessments.some((x) => x.doc.data?.runId === runId && caseOf(x.p) === dir)) continue;
      const p = [`${dir}/assessments/${runId}.yaml`, `${dir}/assessments/${runId}.yml`].find((f) => read(f) != null);
      const doc = p ? parsed(p) : null;
      if (doc?.data) assessments.push({ p, doc, unchanged: true });
    }
  }
  const claimsOf = (a) => (Array.isArray(a?.claimAssessments) ? a.claimAssessments : []);
  const isSupersededAssessment = (p, a) => {
    const adopted = adoptedByCase.get(caseOf(p));
    return !!adopted && adopted.size > 0 && (a.role ?? "draft") === "draft" && !adopted.has(a.runId);
  };
  const headClaimsByCase = new Map(); // case dir → claimId → the adopted assessment's claim assessment
  for (const { p, doc } of assessments) {
    if (!doc.data || !adoptedByCase.get(caseOf(p))?.has(doc.data.runId)) continue;
    const m = headClaimsByCase.get(caseOf(p)) ?? new Map();
    for (const c of claimsOf(doc.data)) if (c?.claimId) m.set(c.claimId, c);
    headClaimsByCase.set(caseOf(p), m);
  }
  const differs = (c, h) => !h || h.verdict !== c?.verdict || h.confidence !== c?.confidence;
  // Every assessment not superseded within the change is protected with the head (rank 0), and its title says which
  // class it is in — adopted by the head edition (changed here or not), a check-role seat's own reading, or a draft
  // no edition in this change adopts or supersedes — so the account never claims a smaller protected set than it
  // carries (review note #379, second round).
  const classOf = (p, a, unchanged) =>
    unchanged
      ? "adopted by the head edition, unchanged in this change"
      : adoptedByCase.get(caseOf(p))?.has(a?.runId)
        ? "adopted by the head edition"
        : (a?.role ?? "draft") !== "draft"
          ? `${a.role}-role, a seat's own reading, never superseded`
          : "not adopted or superseded by an edition in this change";
  const digest = (p, a, headClaims, unchanged) => {
    const ca = a?.caseAssessment ?? {};
    const reasoning = String(ca.reasoning ?? ca.synthesis ?? "");
    const claims = claimsOf(a);
    const title = headClaims
      ? `assessment superseded within this change: header, case verdict, load-bearing set, what is claimed, components, every claim's verdict and reasoning; ${claims.filter((c) => differs(c, headClaims.get(c?.claimId))).length} claim verdict(s) differ from the assessment the head edition adopts, each marked with the head's`
      : `assessment ${classOf(p, a, unchanged)}: header, case verdict, load-bearing set, what is claimed, components, every claim's verdict`;
    const claimLine = (c, withReasoning) => {
      const h = headClaims?.get(c?.claimId);
      const mark = headClaims && differs(c, h) ? ` [head: ${h ? `${h.verdict ?? ""} (${h.confidence ?? ""})` : "not assessed"}]` : "";
      return `claim ${c?.claimId ?? ""}: ${c?.verdict ?? ""} (${c?.confidence ?? ""})${mark}${withReasoning && c?.reasoning ? ` — ${clip(String(c.reasoning), 300, "reasoning")}` : ""}`;
    };
    const build = (withReasoning) =>
      [
        `--- ${p} (${title})`,
        ["runId", "producedBy", "model", "role", "date", "promptVersion"].map((k) => `${k}: ${a?.[k] ?? ""}`).join("\n"),
        `case verdict: ${ca.verdict ?? ""}`,
        `loadBearing: ${(ca.loadBearing ?? []).join(", ")}`,
        `weakestLinks: ${(ca.weakestLinks ?? []).join(", ")}`,
        ca.whatIsClaimed ? `whatIsClaimed: ${clip(String(ca.whatIsClaimed), 1_200, "whatIsClaimed")}` : "",
        `synthesis/reasoning: ${clip(reasoning, 1_500, "reasoning")}`,
        ...(Array.isArray(ca.components) ? ca.components.map((c) => `component ${c?.label ?? ""}: ${c?.state ?? ""}${c?.note ? ` — ${clip(String(c.note), 240, "note")}` : ""}`) : []),
        ...claims.map((c) => claimLine(c, withReasoning)),
      ].filter(Boolean);
    // Every claim's verdict and confidence is kept; the reasoning is what gives way when the section is long, and
    // the section says so. Only past 60,000 — no case approaches it — is the section clipped, marked in place.
    let text = build(true).join("\n");
    if (text.length > 30_000) {
      const full = text.length;
      text = [...build(false), `[… claim reasoning not shown: with it this section would run to ${full.toLocaleString("en-US")} characters, over its 30,000; every claim's verdict and confidence is kept]`].join("\n");
    }
    return clip(text, 60_000, p);
  };
  for (const { p, doc, unchanged } of assessments) {
    const a = doc.data;
    if (!a) sections.push({ rank: 3, text: `--- ${p}\n[unparseable YAML]` });
    else if (isSupersededAssessment(p, a)) sections.push({ rank: 3, text: digest(p, a, headClaimsByCase.get(caseOf(p)) ?? new Map(), false) });
    else sections.push({ rank: 0, text: digest(p, a, null, unchanged) });
  }

  if (sections.length === 0) return { text: "", files: [], carried: {} };
  const cap = ACCOUNT_CAP.toLocaleString("en-US");
  const headerFor = (n) =>
    `Generated by src/lib/arbiter-core.mjs (runAccount) from the ${n} file(s) named below, read at the head revision (a canon file also at the merge base, to tell a modified record from an added one): the head edition's header, rationale, featured claims, crux order and article (article to 60,000 characters); the assessment the head edition adopts, read at head even when this change did not touch its file — its header, case verdict, load-bearing set and weakest links, what is claimed (to 1,200), synthesis or reasoning (to 1,500), each component's state and note (note to 240), and every claim's verdict and confidence, each with its reasoning to 300 — the reasoning left out of the claim lines, and said so, only when the section would pass 30,000, and the section clipped only past 60,000; the records the change adds or modifies in evidence, claims, sources and research (id, state, direction, statement to 320, quote to 160, locator to 160; a modified record's changed fields and their new values to 240; each file's list to 40,000); the run records, wherever under proposals/ they are filed (run.yaml whole; a line naming any file the record says the run wrote that is not in the repository at the head revision; and under a check run's the comparison of each raw seat reply with the assessments that run installed, on the terms that section states; novelty.md to 4,000; manifest.yaml to 8,000; verification.md to 60,000); the lines added to history and dispositions (to 25,000 each); an assessment superseded within the change, digested as the head's is, with every claim verdict that differs from the head's marked; and an edition superseded within the change by header, rationale (to 3,000), featured claims, crux order and the paragraphs of its article the head edition does not carry verbatim (to 20,000; the shared paragraphs are read in the head). The whole account is kept to ${cap} characters by dropping whole sections, least important first and within a rank largest first — a superseded edition's paragraphs, then a superseded assessment, then the run records and the added lines, then the records digest — and naming each dropped section. Protected from dropping, and titled by class, are the head edition, the assessment it adopts, and every other assessment of the change not superseded within it — a check-role seat's own reading, or a draft no edition in this change adopts; these are never dropped and the assembled account is never cut mid-way: if they alone exceed the cap, the account runs over it and says so. The only clipping is per field, at the lengths stated here, each marked in place with the count of characters not shown; an unmarked part is whole. No model wrote this section. Working files (model replies, remembered judgments, supplied text, packets) are not included and may appear under OMITTED FILES; a check run's raw seat replies are compared as its run record states, not reproduced.`;
  // Assemble in reading order — the protected sections (rank 0: head edition, the assessment it adopts, any other
  // assessment not superseded within the change), records digest, run records and added lines, superseded
  // candidates — then drop whole sections from the lowest rank, largest first, while over the cap. Rank 0 is never
  // dropped and the body is never cut: if the protected sections alone are over the cap, the account runs over and says so
  // (review note #377: the first loop could take rank 0 once nothing else was left, and a closing clip cut whatever
  // remained). The files named are the ones whose sections stand.
  const ordered = [...sections].sort((a, b) => a.rank - b.rank);
  const named = () => [...new Set(ordered.flatMap((s) => [...s.text.matchAll(/^--- (\S+)/gm)].map((m) => m[1])))];
  const dropped = [];
  const droppedNote = () => `[… ${dropped.length} section(s) dropped to keep the account under ${cap} characters: ${dropped.join("; ")}]`;
  const render = (tail) => [headerFor(named().length), ...ordered.map((s) => s.text), ...tail].join("\n\n");
  let body = render([]);
  while (body.length > ACCOUNT_CAP && ordered.some((s) => s.rank > 0)) {
    // The lowest rank goes first; within it, the largest section, whose loss buys the most room for the rest.
    const low = Math.max(...ordered.map((s) => s.rank));
    const idx = ordered.reduce((best, s, i) => (s.rank === low && (best < 0 || s.text.length > ordered[best].text.length) ? i : best), -1);
    const [gone] = ordered.splice(idx, 1);
    dropped.push(gone.text.split("\n")[0].replace(/^--- /, ""));
    body = render([droppedNote()]);
  }
  if (body.length > ACCOUNT_CAP) {
    body = render([...(dropped.length ? [droppedNote()] : []), `[The protected sections alone — the head edition(s), the assessment(s) they adopt, and any assessment of the change not superseded within it — run to ${body.length.toLocaleString("en-US")} characters, over the ${cap} cap; they are kept whole and nothing else is included.]`]);
  }
  // A reply counts as carried only while the section that says so stands.
  return { text: body, files: named(), carried: Object.assign({}, ...ordered.map((s) => s.carried ?? {})) };
}

/**
 * The OMITTED FILES list for the packet, each file the run account read marked so: a seat that cannot find a file
 * in the diff looks for it in the account before saying unsure (2026-09-20: three seats said unsure over files the
 * account had digested, because the list said only that they had not been seen).
 */
/**
 * @param {string[]} omitted
 * @param {string[]} accountFiles
 * @param {((path: string) => string) | null} [read]
 * @param {Record<string, string>} [carried] a seat's raw reply → the installed assessment the account found to carry it whole
 */
export function omittedNotes(omitted, accountFiles, read = null, carried = {}) {
  const inAccount = new Set(accountFiles);
  return omitted.map((f) => {
    if (inAccount.has(f)) return `${f} — read into the RUN ACCOUNT above; its section for this file says what is whole, digested or clipped`;
    if (carried[f]) {
      let size = "";
      try {
        const text = read ? read(f) : null;
        if (typeof text === "string") size = ` (${text.split("\n").length} lines, ${text.length} chars)`;
      } catch {
        size = "";
      }
      return `${f} — a seat's raw reply${size}: the RUN ACCOUNT's section for its run compared it with ${carried[f]} and found that file to carry it whole, on the terms stated there`;
    }
    const shape = read ? shapeOf(f, read) : null;
    return shape ? `${f} — ${shape}` : f;
  });
}

/**
 * The fields whose values are emitted rather than measured, so a seat can match a file against the run account:
 * verbatim up to MAX_ID_CHARS, and beyond that their length and a sha256 prefix, which matches just as well. These
 * are the only values the shape reproduces, and an omitted file can put text of its own in them.
 */
const ID_KEYS = new Set(["case", "runId", "ledgerHash", "index", "verb", "model", "promptVersion", "date", "protocol"]);

/**
 * A mechanical account of a file the diff could not carry: how big it is, and — for the JSON and YAML working files a
 * run writes — its top-level shape, on exactly the terms `shapeRule()` states, so a seat can match a file against
 * the RUN ACCOUNT's own ledger hash and runId. This says what a file is, not what it says (2026-09-23: a seat
 * could not find compliance because an omitted packet.json and two reply.json files were named but not described, so
 * it could not tell whether they carried material the constitution forbids).
 */
export function shapeOf(path, read) {
  let text;
  try {
    text = read(path);
  } catch {
    return null;
  }
  if (typeof text !== "string") return null;
  const size = `${text.split("\n").length} lines, ${text.length} chars`;
  if (!path.endsWith(".json")) return size;
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return `${size}; not parseable as JSON`;
  }
  const shape = describe(data);
  return `${size}; JSON ${shape.length > MAX_SHAPE_CHARS ? `${shape.slice(0, MAX_SHAPE_CHARS)}… (shape truncated at ${MAX_SHAPE_CHARS} chars)` : shape}`;
}

/** How deep the shape is walked before a container is reported by its size alone. */
const SHAPE_DEPTH = 2;
/**
 * The shape's own budget. Without these an over-budget file reaches the packet anyway, by putting its content in an
 * identifier value, in field names, or in a hundred thousand fields (review note #415 on #414: the first version of
 * this shape showed identifier values whole and every key, so the size bound it claimed was not one).
 */
export const SHAPE_LIMITS = { idChars: 80, keyChars: 60, fields: 24, shapeChars: 2000 };
const { idChars: MAX_ID_CHARS, keyChars: MAX_KEY_CHARS, fields: MAX_FIELDS, shapeChars: MAX_SHAPE_CHARS } = SHAPE_LIMITS;

/**
 * The one statement of what a shape exposes, written from the limits themselves so that it cannot drift from them:
 * the packet header the panel reads quotes this, and so does the decisions entry (review note #416 on #414: the
 * header, a code comment and the entry each described this rule differently, and two of the three were wrong).
 */
export const shapeRule = () =>
  `designated identifier fields (${[...ID_KEYS].join(", ")}) are emitted verbatim up to ${MAX_ID_CHARS} characters and, when longer, replaced by their length and a twelve-hex sha256 prefix; every other value is represented only by its type and length. A field name is clipped at ${MAX_KEY_CHARS} characters, an object lists at most ${MAX_FIELDS} fields and counts the rest, and the whole shape is cut at ${MAX_SHAPE_CHARS} characters; every cut says so where it happens`;

/** A long identifier is replaced by its length and a short digest: still matchable against the account, bounded. */
function idValue(v) {
  if (v.length <= MAX_ID_CHARS) return JSON.stringify(v);
  return `string(${v.length}), sha256 ${createHash("sha256").update(v).digest("hex").slice(0, 12)}`;
}

const clipKey = (k) => (k.length <= MAX_KEY_CHARS ? k : `${k.slice(0, MAX_KEY_CHARS)}…(${k.length})`);

/**
 * @param {unknown} v
 * @param {string | null} [key]
 * @param {number} [depth]
 * One value's shape: scalars by type and length, a designated identifier by its value (or, when long, its digest), containers by their members.
 */
function describe(v, key = null, depth = 0) {
  if (v === null) return "null";
  if (Array.isArray(v)) {
    if (!v.length) return "[0 item(s)]";
    return `[${v.length} item(s)${depth <= SHAPE_DEPTH ? `: ${describe(v[0], null, depth + 1)}` : ""}]`;
  }
  if (typeof v === "object") {
    const keys = Object.keys(/** @type {Record<string, unknown>} */ (v));
    if (depth > SHAPE_DEPTH) return `{${keys.length} field(s)}`;
    const shown = keys.slice(0, MAX_FIELDS);
    const rest = keys.length - shown.length;
    const fields = shown.map((k) => `${clipKey(k)}: ${describe(/** @type {Record<string, unknown>} */ (v)[k], k, depth + 1)}`);
    if (rest > 0) fields.push(`+${rest} more field(s)`);
    return `{${fields.join(", ")}}`;
  }
  if (typeof v === "string") return key && ID_KEYS.has(key) ? idValue(v) : `string(${v.length})`;
  return typeof v;
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
export function splitMergeLanes(commits, declared = new Set()) {
  const autonomous = [];
  const supervised = [];
  for (const c of commits ?? []) {
    if (!c?.hash) continue;
    // A merge is supervised when its message declares it, or when the gate's own
    // declaration list names its hash — the per-merge remedy for landings whose
    // messages, being immutable, cannot take the trailer after the fact.
    (SUPERVISED_TRAILER.test(c.message ?? "") || declared.has(c.hash) ? supervised : autonomous).push(c.hash);
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

// ---------------------------------------------------------------- budget-parked PRs

/** The data block the arbiter appends to its sticky comment, parsed; null when absent or unreadable. */
export function arbiterData(body) {
  const marker = "<!-- aletheia-arbiter-data ";
  const i = (body ?? "").indexOf(marker);
  if (i < 0) return null;
  const rest = body.slice(i + marker.length);
  const end = rest.lastIndexOf("-->");
  if (end < 0) return null;
  try {
    return JSON.parse(rest.slice(0, end).trim());
  } catch {
    return null;
  }
}

/** A PR parked on the weekly budget alone: the verdict is park and the reason names the spent budget. */
export function parkedOnBudget(body) {
  const d = arbiterData(body);
  return !!d && d.verdict === "park" && /content-merge budget is spent/.test(d.reason ?? "");
}

/** Oldest first (lowest PR number), as many as there is room for. */
export function pickForRejudge(parked, room) {
  return [...(parked ?? [])].sort((a, b) => a.number - b.number).slice(0, Math.max(0, room));
}
