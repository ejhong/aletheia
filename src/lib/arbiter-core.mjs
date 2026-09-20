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
export const ACCOUNT_CAP = 200_000;

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
 * whole diff, assembled by importance: the head edition and the assessment
 * it adopts first and whole; a digest of the records the change adds; the
 * run records (run.yaml, verification.md, novelty.md, the intake manifest)
 * and the lines added to history and dispositions; then any edition and
 * assessment superseded within the change, by what they say that the head
 * does not. Over its cap, whole lower sections are dropped by name; the
 * head is never dropped or cut. A
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
  const take = (p) => {
    const t = read(p);
    if (t != null) files.push(p);
    return t;
  };
  const parsed = (p) => {
    const t = take(p);
    if (t == null) return null;
    try {
      return { text: t, data: parseYaml(t) };
    } catch {
      return { text: t, data: null };
    }
  };
  // Sections carry a rank: when the account is over its cap, whole sections are dropped from the lowest rank up and
  // said to be dropped, so the head edition and its assessment — what a seat must see to judge a regrade — are never
  // the part that falls off the end (2026-09-20: a sitting with three editions clipped the account at the head
  // edition's first line, and three seats could only say unsure).
  const sections = []; // { rank, text }

  // 1. Run records: run.yaml with novelty.md and the intake manifest as one section; verification.md — the verifier's
  //    per-row account, to 60,000 — as its own, so that over the cap it can fall alone (largest first) and leave the
  //    run's header and the added history and dispositions lines standing.
  for (const p of changed.filter((f) => /^proposals\/[^/]+\/run\.yaml$/.test(f))) {
    const dir = p.replace(/\/run\.yaml$/, "");
    const parts = [`--- ${p}`, take(p) ?? ""];
    for (const [name, cap] of [["novelty.md", 4_000], ["manifest.yaml", 8_000]]) {
      const t = take(`${dir}/${name}`);
      if (t != null) parts.push(`--- ${dir}/${name}`, clip(t, cap, name));
    }
    sections.push({ rank: 2, text: parts.join("\n") });
    const v = take(`${dir}/verification.md`);
    if (v != null) sections.push({ rank: 2, text: `--- ${dir}/verification.md\n${clip(v, 60_000, "verification.md")}` });
  }

  // 2. Records the change adds to the canon files: id and the fields a seat checks, from the head file — the diff
  //    of a large ledger file is the first thing the size budget drops.
  const RECORD_FILES = /^content\/cases\/[^/]+\/(evidence|claims|sources|research)\.yaml$/;
  for (const p of changed.filter((f) => RECORD_FILES.test(f))) {
    const added = new Set([...addedLines(diffOf(p) ?? "").matchAll(/^- id: (\S+)/gm)].map((m) => m[1]));
    if (!added.size) continue;
    const doc = parsed(p);
    if (!doc || !Array.isArray(doc.data)) continue;
    const rows = doc.data.filter((r) => r && added.has(r.id));
    const line = (r) => {
      const state = r.reviewState ?? r.verification ?? r.status ?? "";
      const bearing = r.direction ? `${r.direction}${Array.isArray(r.claimIds) ? ` → ${r.claimIds.join(", ")}` : ""} (${r.strength ?? ""})` : Array.isArray(r.claimIds) ? `→ ${r.claimIds.join(", ")}` : "";
      const text = r.statement ?? r.sourceStatement ?? r.summary ?? r.title ?? "";
      const where = r.exactLocator ?? r.sourceAnchor?.locator ?? r.identifier ?? r.url ?? "";
      const quote = r.sourceAnchor?.quote ? ` | quote: ${clip(String(r.sourceAnchor.quote), 160, "quote")}` : "";
      const src = r.sourceId ? ` | source ${r.sourceId}` : "";
      return `- ${r.id} [${state}] ${bearing}${src}\n  ${clip(String(text), 320, "text")}${quote}${where ? `\n  at: ${clip(String(where), 160, "locator")}` : ""}`;
    };
    sections.push({ rank: 1, text: clip([`--- ${p} (${rows.length} record(s) added: id, state, direction → claims, statement, quote, locator)`, ...rows.map(line)].join("\n"), 40_000, p) });
  }

  // 3. Editions, the head first. A candidate another edition in the change names as `previous` is superseded: it is
  //    published in git even though the site renders only the head, so its own words stay reviewable — header,
  //    rationale, and the paragraphs of its article the head edition does not carry verbatim (the shared ones are read
  //    in the head; review note #377). The head carries its article.
  const caseOf = (p) => p.split("/").slice(0, 3).join("/");
  const paragraphs = (t) => String(t ?? "").split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  const editions = changed.filter((f) => /^content\/cases\/[^/]+\/editions\/[^/]+\.ya?ml$/.test(f)).map((p) => ({ p, doc: parsed(p) })).filter((x) => x.doc);
  const supersededRuns = new Set(editions.map((x) => x.doc.data?.previous).filter(Boolean));
  const editionHead = (e) => ["runId", "date", "model", "promptVersion", "previous"].map((k) => `${k}: ${e?.[k] ?? ""}`).join("\n");
  const headEditions = new Map(); // case dir → the head edition's data
  for (const { p, doc } of editions) if (doc.data && !supersededRuns.has(doc.data.runId)) headEditions.set(caseOf(p), doc.data);
  const adoptedByHead = new Set([...headEditions.values()].map((e) => e.assessment?.runId).filter(Boolean));
  for (const { p, doc } of editions) {
    const e = doc.data;
    if (!e) {
      sections.push({ rank: 3, text: `--- ${p}\n[unparseable YAML]` });
      continue;
    }
    if (supersededRuns.has(e.runId)) {
      const inHead = new Set(paragraphs(headEditions.get(caseOf(p))?.article));
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
    files.push(p);
    sections.push({ rank: 2, text: `--- ${p} (lines added)\n${clip(added, 25_000, p)}` });
  }

  // 5. Assessments: the one the head edition adopts whole — header, case verdict, load-bearing set, what is claimed,
  //    components, every claim's verdict; a superseded one by header, case verdict, load-bearing set, weakest links and
  //    the claim verdicts that differ from the head's, each beside the head's (review note #377).
  const assessments = changed.filter((f) => /^content\/cases\/[^/]+\/assessments\/[^/]+\.ya?ml$/.test(f)).map((p) => ({ p, doc: parsed(p) })).filter((x) => x.doc?.data);
  const isHeadAssessment = (a) => adoptedByHead.size === 0 || adoptedByHead.has(a?.runId);
  const claimsOf = (a) => (Array.isArray(a?.claimAssessments) ? a.claimAssessments : []);
  const headAssessments = new Map(); // case dir → the adopted assessment's data
  for (const { p, doc } of assessments) if (isHeadAssessment(doc.data)) headAssessments.set(caseOf(p), doc.data);
  for (const { p, doc } of assessments) {
    const a = doc.data;
    const ca = a?.caseAssessment ?? {};
    const reasoning = String(ca.reasoning ?? ca.synthesis ?? "");
    const head = ["runId", "producedBy", "model", "role", "date", "promptVersion"].map((k) => `${k}: ${a?.[k] ?? ""}`).join("\n");
    if (!isHeadAssessment(a)) {
      const headClaims = new Map(claimsOf(headAssessments.get(caseOf(p))).map((c) => [c?.claimId, c]));
      const own = claimsOf(a);
      const differing = own.filter((c) => {
        const h = headClaims.get(c?.claimId);
        return !h || h.verdict !== c?.verdict || h.confidence !== c?.confidence;
      });
      const lines = [
        `--- ${p} (assessment superseded within this change: header, case verdict, load-bearing set, weakest links, and the ${differing.length} claim verdict(s) that differ from the assessment the head edition adopts; ${own.length - differing.length} agreeing read in the head)`,
        head,
        `case verdict: ${ca.verdict ?? ""}`,
        `loadBearing: ${(ca.loadBearing ?? []).join(", ")}`,
        `weakestLinks: ${(ca.weakestLinks ?? []).join(", ")}`,
        ...differing.map((c) => {
          const h = headClaims.get(c?.claimId);
          return `claim ${c?.claimId ?? ""}: ${c?.verdict ?? ""} (${c?.confidence ?? ""}) — head: ${h ? `${h.verdict ?? ""} (${h.confidence ?? ""})` : "not assessed"}`;
        }),
      ];
      sections.push({ rank: 2, text: clip(lines.join("\n"), 8_000, p) }); // small by construction: it falls with the run records, not before them
      continue;
    }
    const claims = claimsOf(a);
    const lines = [
      `--- ${p} (assessment: header, case verdict, load-bearing set, what is claimed, components, every claim's verdict)`,
      head,
      `case verdict: ${ca.verdict ?? ""}`,
      `loadBearing: ${(ca.loadBearing ?? []).join(", ")}`,
      `weakestLinks: ${(ca.weakestLinks ?? []).join(", ")}`,
      ca.whatIsClaimed ? `whatIsClaimed: ${clip(String(ca.whatIsClaimed), 1_200, "whatIsClaimed")}` : "",
      `synthesis/reasoning: ${clip(reasoning, 1_500, "reasoning")}`,
      ...(Array.isArray(ca.components) ? ca.components.map((c) => `component ${c?.label ?? ""}: ${c?.state ?? ""}${c?.note ? ` — ${clip(String(c.note), 240, "note")}` : ""}`) : []),
      ...claims.map((c) => `claim ${c?.claimId ?? ""}: ${c?.verdict ?? ""} (${c?.confidence ?? ""})${c?.reasoning ? ` — ${clip(String(c.reasoning), 300, "reasoning")}` : ""}`),
    ].filter(Boolean);
    sections.push({ rank: 0, text: clip(lines.join("\n"), 30_000, p) });
  }

  if (sections.length === 0) return { text: "", files: [] };
  const cap = ACCOUNT_CAP.toLocaleString("en-US");
  const header = `Generated by src/lib/arbiter-core.mjs (runAccount) from the ${files.length} file(s) named below, read at the head revision: the run records (run.yaml whole; verification.md to 60,000 characters; novelty.md to 4,000; manifest.yaml to 8,000); the records the change adds to evidence, claims, sources and research (id, state, direction, statement to 320, quote to 160, locator to 160; each file's list to 40,000); the head edition's header, rationale, featured claims, crux order and article (article to 60,000), and an edition superseded within the change by header, rationale (to 3,000), featured claims, crux order and the paragraphs of its article the head edition does not carry verbatim (to 20,000; the shared paragraphs are read in the head); the lines added to history and dispositions (to 25,000 each); the assessment the head edition adopts — its header, case verdict, load-bearing set and weakest links, what is claimed (to 1,200), synthesis or reasoning (to 1,500), each component's state and note (note to 240), and every claim's verdict, confidence and reasoning (reasoning to 300), the assessment's section to 30,000 — and a superseded assessment by header, case verdict, load-bearing set, weakest links and the claim verdicts that differ from the head's, each beside the head's (to 8,000); the whole account to ${cap}, kept by dropping whole sections from the least important — a superseded edition's own paragraphs; then, largest first, the run records, the added lines and a superseded assessment's differing verdicts; then the records digest — and naming each dropped section. The head edition and the assessment it adopts are never dropped and the account is never cut: if they alone exceed the cap, the account runs over it and says so. Every clip is marked in place with the count of characters not shown; an unmarked part is whole. No model wrote this section. Working files (model replies, remembered judgments, supplied text, packets) are not included and may appear under OMITTED FILES.`;
  // Assemble in reading order — head edition and assessment, records digest, run records and added lines,
  // superseded candidates — then drop whole sections from the lowest rank, largest first, while over the cap. Rank 0 (the head edition
  // and the assessment it adopts) is never dropped and the body is never cut: if the head alone is over the cap, the
  // account runs over and says so (review note #377: the first loop could take rank 0 once nothing else was left, and
  // a closing clip cut whatever remained).
  const ordered = [...sections].sort((a, b) => a.rank - b.rank);
  const dropped = [];
  const droppedNote = () => `[… ${dropped.length} section(s) dropped to keep the account under ${cap} characters: ${dropped.join("; ")}]`;
  const render = (tail) => [header, ...ordered.map((s) => s.text), ...tail].join("\n\n");
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
    body = render([...(dropped.length ? [droppedNote()] : []), `[The head edition(s) and the assessment(s) they adopt alone run to ${body.length.toLocaleString("en-US")} characters, over the ${cap} cap; they are kept whole and nothing else is included.]`]);
  }
  return { text: body, files };
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
