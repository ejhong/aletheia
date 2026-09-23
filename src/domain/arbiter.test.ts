import { describe, expect, it } from "vitest";
import {
  ARBITER_MIN_COMPLIES,
  ACCOUNT_CAP,
  capDiff,
  CONTENT_MERGES_PER_WEEK,
  costOf,
  omittedNotes,
  runAccount,
  rateLimitGate,
  splitMergeLanes,
  tallyVerdict,
  validateVote,
} from "../lib/arbiter-core.mjs";

/**
 * This logic will eventually replace the founder's merge tap, so the tests
 * are about the failure directions: a malformed or missing vote must never
 * count toward passing, and a lone substantiated objection must park.
 */

const ok = (vote: string, rules: string[] = ["§3.8"]) => ({
  vote,
  rules,
  reasoning: "a sufficiently long concrete reasoning about the diff at hand",
});

describe("validateVote — fail closed", () => {
  it("accepts a well-formed vote", () => {
    const v = validateVote("Seat", ok("complies", []));
    expect(v.vote).toBe("complies");
  });

  it("turns garbage into an explicit unsure, never a pass", () => {
    for (const junk of [null, "yes", { vote: "approve" }, { vote: "complies" }]) {
      const v = validateVote("Seat", junk);
      expect(v.vote).toBe("unsure");
      expect(v.reasoning).toMatch(/invalid reply/);
    }
  });

  it("rejects violates-without-particulars — an unactionable accusation is unsure", () => {
    const v = validateVote("Seat", { ...ok("violates"), rules: [] });
    expect(v.vote).toBe("unsure");
  });

  it("requires non-trivial reasoning", () => {
    const v = validateVote("Seat", { ...ok("complies", []), reasoning: "ok" });
    expect(v.vote).toBe("unsure");
  });
});

describe("tallyVerdict — the asymmetric rule", () => {
  const seats = (votes: string[]) =>
    votes.map((vote, i) =>
      validateVote(`Seat${i}`, ok(vote, vote === "violates" ? ["§3.8"] : [])),
    );

  it("5 complies passes; 4 complies + 1 unsure passes", () => {
    expect(tallyVerdict(seats(["complies", "complies", "complies", "complies", "complies"])).outcome).toBe("pass");
    expect(tallyVerdict(seats(["complies", "complies", "complies", "complies", "unsure"])).outcome).toBe("pass");
  });

  it("a lone objection of an ordinary kind is a review note, not a park; a vetoing kind parks alone; two objections park", () => {
    const lone = tallyVerdict(seats(["complies", "complies", "complies", "complies", "violates"]));
    expect(lone.outcome).toBe("pass");
    expect(lone.notes.map((n: { seat: string }) => n.seat)).toEqual(["Seat4"]);
    expect(lone.reason).toMatch(/one seat's objection is a review note .* Seat4 \(§3.8; other\)/);
    for (const kind of ["fabrication", "confidence", "constitution"]) {
      const veto = [...seats(["complies", "complies", "complies", "complies"]), validateVote("Seat4", { ...ok("violates", ["§3.15"]), paradigm: kind })];
      const t = tallyVerdict(veto);
      expect(t.outcome).toBe("park");
      expect(t.reason).toMatch(new RegExp(`parks on its own: Seat4 \\(§3.15; ${kind}\\)`));
      expect(t.notes).toEqual([]);
    }
    const two = tallyVerdict(seats(["complies", "complies", "complies", "violates", "violates"]));
    expect(two.outcome).toBe("park");
    expect(two.reason).toMatch(/2 seats find a violation/);
    const kindOf = (v: unknown) => (v as { paradigm?: string }).paradigm;
    expect(kindOf(validateVote("S", { ...ok("violates", ["§3.14"]), paradigm: "provenance" }))).toBe("provenance");
    expect(kindOf(validateVote("S", { ...ok("violates", ["§3.14"]), paradigm: "nonsense" }))).toBe("other"); // an unnamed kind never vetoes by omission
    expect(kindOf(validateVote("S", ok("complies", [])))).toBeUndefined();
  });

  it("two unsures park — below the compliance threshold", () => {
    expect(tallyVerdict(seats(["complies", "complies", "complies", "unsure", "unsure"])).outcome).toBe("park");
  });

  it("a shrunken panel cannot pass", () => {
    expect(
      tallyVerdict(seats(Array(ARBITER_MIN_COMPLIES - 1).fill("complies"))).outcome,
    ).toBe("park");
  });

  it("failed seats stay in the denominator as unsure", () => {
    const votes = [
      ...seats(["complies", "complies", "complies"]),
      validateVote("Dead seat", undefined),
      validateVote("Dead seat 2", undefined),
    ];
    const t = tallyVerdict(votes);
    expect(t.outcome).toBe("park");
    expect(t.counts.unsure).toBe(2);
  });

  it("names the seats that never voted, and says the remedy is not revision", () => {
    // The live case: two vendor accounts ran out of credit, so the panel
    // could not reach four however sound the change was. "Only 3 of 5
    // affirm compliance" describes that as a divided panel, which sends
    // the reader to rewrite a diff nobody objected to.
    const t = tallyVerdict([
      ...seats(["complies", "complies", "complies"]),
      validateVote("GPT-5.1 (OpenAI)", undefined),
      validateVote("Grok 4.6 (xAI)", undefined),
    ]);
    expect(t.counts.failed).toBe(2);
    expect(t.reason).toContain("GPT-5.1 (OpenAI), Grok 4.6 (xAI)");
    expect(t.reason).toMatch(/restoring the seats is the remedy/);
  });

  it("does not offer that remedy when a seat actually objected", () => {
    const t = tallyVerdict([
      ...seats(["complies", "complies", "complies", "violates"]),
      validateVote("Dead seat", undefined),
    ]);
    expect(t.reason).toContain("Dead seat");
    expect(t.reason).not.toMatch(/restoring the seats is the remedy/);
  });

  it("says nothing about failed seats when the panel passed anyway", () => {
    const t = tallyVerdict([
      ...seats(["complies", "complies", "complies", "complies"]),
      validateVote("Dead seat", undefined),
    ]);
    expect(t.outcome).toBe("pass");
    expect(t.reason).not.toMatch(/no usable vote/);
  });
});

describe("capDiff — truncation is loud", () => {
  const section = (name: string, size: number) =>
    `diff --git a/${name} b/${name}\n` + "x".repeat(size) + "\n";

  it("small diffs pass through with an empty omission list", () => {
    const d = section("a.ts", 100);
    expect(capDiff(d)).toEqual({ text: d, omitted: [] });
  });

  it("names every file the panel will not see", () => {
    const d = section("kept.ts", 100) + section("dropped/one.ts", 900) + section("dropped/two.ts", 900);
    const { text, omitted } = capDiff(d, 500);
    expect(text).toContain("kept.ts");
    expect(omitted).toEqual(["dropped/one.ts", "dropped/two.ts"]);
  });

  it("drops mechanically-guarded files before canon content, regardless of position", () => {
    // Regression for the dry-period parks: positional truncation dropped
    // sources.yaml while keeping bulky append-only overlays.
    const d =
      section("content/cases/x/assessments/2026-01-01-check-opus.yaml", 600) +
      section("content/cases/x/sources.yaml", 300) +
      section("scripts/arbiter.mjs", 200);
    const { text, omitted } = capDiff(d, 700);
    expect(text).toContain("sources.yaml");
    expect(text).toContain("scripts/arbiter.mjs");
    expect(omitted).toEqual(["content/cases/x/assessments/2026-01-01-check-opus.yaml"]);
  });

  it("a bulky unclassified section cannot starve the content tier", () => {
    // Regression: unrecognized paths default to tier 0, and strict
    // tier-0-first filling let one large working directory spend the
    // whole budget — every content/ file landed in `omitted` and the
    // panel could only report that it had not seen the change.
    const d =
      section("working-papers/big-draft.md", 900) +
      section("content/cases/x/claims.yaml", 200) +
      section("content/cases/x/sources.yaml", 150);
    const { text, omitted } = capDiff(d, 1000);
    expect(text).toContain("content/cases/x/claims.yaml");
    expect(text).toContain("content/cases/x/sources.yaml");
    expect(omitted).toEqual(["working-papers/big-draft.md"]);
  });

  it("reserve a tier does not spend flows to the others in scrutiny order", () => {
    // Tier 0 exceeds its reserve, tier 1 leaves most of its own unspent:
    // the second pass must hand that slack to the remaining tier-0
    // section before tier 2 sees any of it.
    const d =
      section("scripts/a.mjs", 300) +
      section("scripts/b.mjs", 300) +
      section("content/cases/x/claims.yaml", 100) +
      section("inbox/z.yaml", 500);
    const { text, omitted } = capDiff(d, 900);
    expect(text).toContain("scripts/a.mjs");
    expect(text).toContain("scripts/b.mjs");
    expect(text).toContain("content/cases/x/claims.yaml");
    expect(omitted).toEqual(["inbox/z.yaml"]);
  });
});

describe("rateLimitGate", () => {
  const pass = { outcome: "pass", counts: { complies: 5, violates: 0, unsure: 0 }, reason: "5 of 5" };
  const park = { outcome: "park", counts: { complies: 2, violates: 0, unsure: 3 }, reason: "only 2 of 5" };

  it("parks a passing content change once the weekly budget is spent", () => {
    const v = rateLimitGate(pass, { touchesContent: true, mergesThisWeek: CONTENT_MERGES_PER_WEEK });
    expect(v.outcome).toBe("park");
    expect(v.rateLimited).toBe(true);
  });

  it("never throttles code/docs changes, and never upgrades a park", () => {
    expect(rateLimitGate(pass, { touchesContent: false, mergesThisWeek: 99 }).outcome).toBe("pass");
    expect(rateLimitGate(park, { touchesContent: true, mergesThisWeek: 0 }).outcome).toBe("park");
  });

  it("leaves a passing change alone under budget", () => {
    expect(rateLimitGate(pass, { touchesContent: true, mergesThisWeek: CONTENT_MERGES_PER_WEEK - 1 }).outcome).toBe("pass");
  });

  it("names the supervised exclusions in the park reason", () => {
    const v = rateLimitGate(pass, {
      touchesContent: true,
      mergesThisWeek: CONTENT_MERGES_PER_WEEK,
      supervisedExcluded: 3,
    });
    expect(v.reason).toContain("3 supervised excluded");
  });
});

/**
 * The lane split decides what the throttle is measuring, so the tests are
 * about the failure direction: an unreadable or unmarked commit must count
 * (an under-counting throttle is no throttle), and only an explicit,
 * well-formed declaration may buy an exemption.
 */
describe("splitMergeLanes", () => {
  const c = (hash: string, message: string) => ({ hash, message });

  it("counts an ordinary merge and excludes a declared supervised one", () => {
    const { autonomous, supervised } = splitMergeLanes([
      c("a1", "Content response 2026-09-02: reassessment and panels\n"),
      c("b2", "VASO-S001 collection\n\nSupervised-by: founder-directed session\n"),
    ]);
    expect(autonomous).toEqual(["a1"]);
    expect(supervised).toEqual(["b2"]);
  });

  it("counts by default: no message, empty message, or a near-miss trailer", () => {
    const { autonomous, supervised } = splitMergeLanes([
      c("a1", ""),
      { hash: "a2" } as { hash: string; message?: string },
      c("a3", "mentions Supervised-by: nothing at the line start? no — inline only"),
      c("a4", "Supervised-by:\n"),
    ]);
    expect(autonomous).toEqual(["a1", "a2", "a3", "a4"]);
    expect(supervised).toEqual([]);
  });

  it("accepts the trailer as a real trailer line, indented or not", () => {
    const { supervised } = splitMergeLanes([
      c("b1", "title\n\nSupervised-by: founder\n"),
      c("b2", "title\n\n  Supervised-by: founder\n"),
    ]);
    expect(supervised).toEqual(["b1", "b2"]);
  });

  it("drops entries with no hash and de-duplicates", () => {
    const { autonomous } = splitMergeLanes([
      c("a1", "x"),
      c("a1", "x"),
      { hash: "", message: "x" },
    ]);
    expect(autonomous).toEqual(["a1"]);
  });
});

describe("runAccount — the run's own record, for a panel that cannot read the whole diff", () => {
  const files: Record<string, string> = {
    "proposals/r1/run.yaml": "runId: r1\nverb: verify\noutcome: completed\ncost:\n  usd: 14.9\n",
    "proposals/r1/verification.md": "# Verification\n## Accepted\n- claim X-C1\n## Rejected\n- claim X-C2 (failed) — anchor page wrong\n",
    "proposals/r1/reply.json": "{\"huge\": \"working material\"}",
    "content/cases/x/editions/e2.yaml": "runId: e2\ndate: 2026-09-09\nmodel: m\npromptVersion: edition-v4\nprevious: e1\nrationale: the map changed\nfeaturedClaimIds:\n  - X-C1\ncruxOrder:\n  - X-R1\narticle: |\n  Three accounts side by side.\n",
    "content/cases/x/history.yaml": "- date: 2026-09-09\n  change: intake\n",
    "content/cases/x/assessments/2026-09-09-check-a.yaml": "model: Seat A\nrole: check\ncaseAssessment:\n  verdict: mixed\n  reasoning: The evidence cuts both ways here.\n",
    "content/cases/x/assessments/2026-09-09-edition-b.yaml": "runId: 2026-09-09-edition-b\nproducedBy: 2026-09-09-edition-x-000001\nmodel: drafter\nrole: draft\ndate: 2026-09-09\npromptVersion: edition-v12\ncaseAssessment:\n  verdict: unresolved\n  loadBearing:\n    - X-C1\n  weakestLinks:\n    - X-C2\n  whatIsClaimed: That the thing is so.\n  synthesis: The ledger's ladder is inverted.\n  components:\n    - label: dating\n      state: established\n      note: E1 on C1.\nclaimAssessments:\n  - claimId: X-C1\n    verdict: well_supported\n    confidence: high\n    reasoning: E1 quotes the excavators.\n  - claimId: X-C2\n    verdict: unresolved\n    confidence: low\n    reasoning: Held on its anchor alone.\n",
  };
  const read = (p: string) => files[p] ?? null;
  const diffOf = (p: string) => (p === "content/cases/x/history.yaml" ? "--- a\n+++ b\n-  change: old\n+- date: 2026-09-09\n+  change: intake\n" : "");
  it("draws on the run records, the edition, the added history lines and the seats — never the working files", () => {
    const { text, files: used } = runAccount(Object.keys(files), read, diffOf);
    expect(used).toContain("proposals/r1/run.yaml");
    expect(used).toContain("proposals/r1/verification.md");
    expect(used).not.toContain("proposals/r1/reply.json");
    expect(text).toMatch(/No model wrote this section/);
    // The header says how the account was made and clipped — the panel's own provenance for what it read (review note #375).
    expect(text).toMatch(/the assessment the head edition adopts, read at head even when this change did not touch its file — its header, case verdict, load-bearing set and weakest links, what is claimed \(to 1,200\), synthesis or reasoning \(to 1,500\), each component's state and note \(note to 240\), and every claim's verdict and confidence, each with its reasoning to 300 — the reasoning left out of the claim lines, and said so, only when the section would pass 30,000, and the section clipped only past 60,000;/);
    expect(text).toMatch(/an assessment superseded within the change, digested as the head's is, with every claim verdict that differs from the head's marked; and an edition superseded within the change by header, rationale \(to 3,000\), featured claims, crux order and the paragraphs of its article the head edition does not carry verbatim \(to 20,000; the shared paragraphs are read in the head\)/);
    expect(text).toMatch(/kept to 250,000 characters by dropping whole sections, least important first and within a rank largest first — a superseded edition's paragraphs, then a superseded assessment, then the run records and the added lines, then the records digest — and naming each dropped section\. Protected from dropping, and titled by class, are the head edition, the assessment it adopts, and every other assessment of the change not superseded within it — a check-role seat's own reading, or a draft no edition in this change adopts; these are never dropped and the assembled account is never cut mid-way: if they alone exceed the cap, the account runs over it and says so\. The only clipping is per field, at the lengths stated here, each marked in place/);
    expect(text).toMatch(/the records the change adds or modifies in evidence, claims, sources and research \(id, state, direction, statement to 320, quote to 160, locator to 160; a modified record's changed fields and their new values to 240; each file's list to 40,000\)/);
    expect(text).toMatch(/usd: 14\.9/);
    expect(text).toMatch(/anchor page wrong/);
    expect(text).toMatch(/rationale: the map changed/);
    expect(text).toMatch(/Three accounts side by side/);
    expect(text).toMatch(/\+?- date: 2026-09-09\n  change: intake/);
    expect(text).not.toMatch(/change: old/);
    expect(text).toMatch(/case verdict: mixed/);
    expect(text).not.toMatch(/working material/);
    // A draft assessment is digested whole: the standing, the load-bearing set, what is claimed, the components and every
    // claim's verdict — so a seat that cannot read the overlay can still confirm a regrade (2026-09-20, #372).
    // e2 carries no assessment field, so edition-b is the change's own draft, protected and titled as such.
    expect(text).toMatch(/2026-09-09-edition-b\.yaml \(assessment not adopted or superseded by an edition in this change: header, case verdict, load-bearing set, what is claimed, components, every claim's verdict\)/);
    expect(text).toMatch(/producedBy: 2026-09-09-edition-x-000001/);
    expect(text).toMatch(/case verdict: unresolved\nloadBearing: X-C1\nweakestLinks: X-C2\nwhatIsClaimed: That the thing is so\./);
    expect(text).toMatch(/component dating: established — E1 on C1\./);
    expect(text).toMatch(/claim X-C1: well_supported \(high\) — E1 quotes the excavators\./);
    expect(text).toMatch(/claim X-C2: unresolved \(low\) — Held on its anchor alone\./);
  });
  it("digests the records a change adds to the canon files from the head file, by the ids the diff adds", () => {
    const ev: Record<string, string> = {
      ...files,
      "content/cases/x/evidence.yaml": "- id: X-E001\n  title: old one\n  claimIds: [X-C1]\n  sourceId: SRC-A\n  direction: supports\n  strength: weak\n  sourceStatement: The old record.\n  reviewState: ai_extracted\n- id: X-E084\n  title: new one\n  claimIds:\n    - X-C1\n  sourceId: SRC-B\n  direction: context\n  strength: weak\n  sourceStatement: 'Active points were \"larger, stiffer, and more painful\" than latent ones.'\n  exactLocator: PMC1, Results, Table 2\n  reviewState: ai_extracted\n",
      "content/cases/x/claims.yaml": "- id: X-C9\n  statement: A new proposition with a truth condition.\n  reviewState: ai_extracted\n  sourceAnchor:\n    locator: p. 4\n    quote: was carried out by groups\n    sourceId: SRC-B\n",
    };
    const diffs: Record<string, string> = {
      "content/cases/x/evidence.yaml": "+- id: X-E084\n+  title: new one\n",
      "content/cases/x/claims.yaml": "+- id: X-C9\n+  statement: A new proposition with a truth condition.\n",
      "content/cases/x/history.yaml": diffOf("content/cases/x/history.yaml"),
    };
    const { text, files: used } = runAccount(Object.keys(ev), (p: string) => ev[p] ?? null, (p: string) => diffs[p] ?? "");
    expect(used).toContain("content/cases/x/evidence.yaml");
    expect(text).toMatch(/content\/cases\/x\/evidence\.yaml \(1 record\(s\) added, 0 modified: id, state, direction → claims, statement, quote, locator; a modified record names its changed fields and the new value of each not already shown\)/);
    expect(text).toMatch(/- X-E084 \[ai_extracted\] context → X-C1 \(weak\) \| source SRC-B\n  Active points were "larger, stiffer, and more painful" than latent ones\.\n  at: PMC1, Results, Table 2/);
    expect(text).not.toMatch(/X-E001/);
    expect(text).toMatch(/- X-C9 \[ai_extracted\] \n  A new proposition with a truth condition\. \| quote: was carried out by groups\n  at: p\. 4/);
  });
  it("tells a modified record from an added one when it can read the base file, and names the changed fields with their new values", () => {
    const base = "- id: X-E001\n  title: old one\n  claimIds: [X-C1]\n  sourceId: SRC-A\n  direction: supports\n  strength: weak\n  sourceStatement: The old record.\n  reviewState: ai_extracted\n";
    const head = base.replace("reviewState: ai_extracted\n", "reviewState: rejected\n  limitations: Refused at the answer's re-reading — the quote is not in the text.\n") + "- id: X-E002\n  title: new\n  claimIds: [X-C1]\n  sourceId: SRC-A\n  direction: undermines\n  strength: moderate\n  sourceStatement: The new record.\n  reviewState: ai_extracted\n";
    const ev: Record<string, string> = { ...files, "content/cases/x/evidence.yaml": head };
    const isEv = (p: string) => p.endsWith("evidence.yaml");
    const { text } = runAccount(Object.keys(ev), (p: string) => ev[p] ?? null, (p: string) => (isEv(p) ? "+  reviewState: rejected\n+- id: X-E002\n" : diffOf(p)), (p: string) => (isEv(p) ? base : null));
    expect(text).toMatch(/evidence\.yaml \(1 record\(s\) added, 1 modified:/);
    expect(text).toMatch(/- X-E001 \[rejected\] supports → X-C1 \(weak\) \| source SRC-A \| modified: reviewState, limitations\n  The old record\.\n  limitations now: Refused at the answer's re-reading — the quote is not in the text\./);
    expect(text).toMatch(/- X-E002 \[ai_extracted\] undermines → X-C1 \(moderate\) \| source SRC-A\n  The new record\./);
    // Without the base file the digest falls back to the ids the diff adds, and cannot tell a modified record.
    const { text: noBase } = runAccount(Object.keys(ev), (p: string) => ev[p] ?? null, (p: string) => (isEv(p) ? "+  reviewState: rejected\n+- id: X-E002\n" : diffOf(p)));
    expect(noBase).toMatch(/evidence\.yaml \(1 record\(s\) added, 0 modified:/);
    expect(noBase).not.toMatch(/X-E001/);
  });
  it("prints the new value of every changed field the line does not itself show — a title beside a statement, a url beside an identifier, a source anchor's sourceId", () => {
    const claimsBase = "- id: X-C1\n  statement: The proposition.\n  title: Old title\n  reviewState: ai_extracted\n  sourceAnchor:\n    sourceId: SRC-A\n    locator: p. 4\n    quote: the words\n- id: X-C2\n  statement: Second.\n  reviewState: ai_extracted\n  sourceAnchor:\n    locator: p. 5\n    quote: old words\n";
    const claimsHead = claimsBase.replace("title: Old title", "title: New title").replace("sourceId: SRC-A", "sourceId: SRC-Z").replace("quote: old words", "quote: new words");
    const sourcesBase = "- id: SRC-B\n  title: A paper\n  identifier: doi:10.1/x\n  url: https://old.example/x\n  verification: verified\n";
    const sourcesHead = sourcesBase.replace("https://old.example/x", "https://new.example/x");
    const head: Record<string, string> = { ...files, "content/cases/x/claims.yaml": claimsHead, "content/cases/x/sources.yaml": sourcesHead };
    const base: Record<string, string> = { "content/cases/x/claims.yaml": claimsBase, "content/cases/x/sources.yaml": sourcesBase };
    const { text } = runAccount(Object.keys(head), (p: string) => head[p] ?? null, diffOf, (p: string) => base[p] ?? null);
    expect(text).toMatch(/claims\.yaml \(0 record\(s\) added, 2 modified:/);
    // The statement is the text the line prints, so the changed title is printed after it; the anchor's sourceId is not printed by the line, so the whole anchor is.
    expect(text).toMatch(/- X-C1 \[ai_extracted\] +\| modified: title, sourceAnchor\n  The proposition\. \| quote: the words\n  at: p\. 4\n  title now: New title\n  sourceAnchor now: \{"sourceId":"SRC-Z","locator":"p\. 4","quote":"the words"\}/);
    // Only the quote changed on X-C2, and the line prints the quote: nothing more to print.
    expect(text).toMatch(/- X-C2 \[ai_extracted\] +\| modified: sourceAnchor\n  Second\. \| quote: new words\n  at: p\. 5\n(?!  sourceAnchor now)/);
    // The identifier is the locator the line prints, so the changed url is printed after it.
    expect(text).toMatch(/- SRC-B \[verified\] +\| modified: url\n  A paper\n  at: doi:10\.1\/x\n  url now: https:\/\/new\.example\/x/);
  });
  it("puts the head edition and its assessment first and whole, and shows a candidate superseded within the change by what it says that the head does not", () => {
    const two: Record<string, string> = {
      ...files,
      // e2 (superseded) shares one paragraph with the head and has one of its own; a0 (superseded) differs from b on X-C1 and agrees on X-C2.
      "content/cases/x/editions/e2.yaml": files["content/cases/x/editions/e2.yaml"].replace("  Three accounts side by side.\n", "  Three accounts side by side.\n\n  A paragraph the head dropped.\n"),
      "content/cases/x/editions/e3.yaml": "runId: e3\ndate: 2026-09-10\nmodel: m\npromptVersion: edition-v12\nprevious: e2\nassessment:\n  runId: 2026-09-09-edition-b\n  hash: h\nrationale: the objection adopted\nfeaturedClaimIds:\n  - X-C1\ncruxOrder: []\narticle: |\n  The head article.\n\n  Three accounts side by side.\n",
      "content/cases/x/assessments/2026-09-09-edition-a0.yaml": "runId: 2026-09-09-edition-a0\nmodel: drafter\nrole: draft\ncaseAssessment:\n  verdict: contradicted\n  synthesis: The one that overreached.\nclaimAssessments:\n  - claimId: X-C1\n    verdict: contradicted\n    confidence: high\n    reasoning: spent figures no record carries\n  - claimId: X-C2\n    verdict: unresolved\n    confidence: low\n    reasoning: agrees with the head\n",
    };
    const { text } = runAccount(Object.keys(two), (p: string) => two[p] ?? null, diffOf);
    // e2 is e3's previous: header, rationale and the paragraph the head does not carry; the shared paragraph is read once, in the head, which comes first.
    expect(text).toMatch(/e3\.yaml \(head edition: header, rationale, featured claims, crux order, article\)/);
    expect(text).toMatch(/The head article\./);
    expect(text).toMatch(/e2\.yaml \(edition superseded within this change by the one naming it as previous: header, rationale, and the 1 paragraph\(s\) of its article the head edition does not carry verbatim; 1 shared paragraph\(s\) read in the head\)/);
    expect(text).toMatch(/article, paragraphs the head edition does not carry:\nA paragraph the head dropped\./);
    expect(text.split("Three accounts side by side.").length - 1).toBe(1);
    expect(text.indexOf("e3.yaml (head edition")).toBeLessThan(text.indexOf("e2.yaml (edition superseded"));
    // The assessment e3 adopts is digested whole and comes before the superseded one, which is digested the same way —
    // its reasoning stays reviewable — with each claim verdict that differs from the head's marked beside the head's.
    expect(text).toMatch(/claim X-C1: well_supported \(high\) — E1 quotes the excavators\./);
    expect(text).toMatch(/edition-a0\.yaml \(assessment superseded within this change: header, case verdict, load-bearing set, what is claimed, components, every claim's verdict and reasoning; 1 claim verdict\(s\) differ from the assessment the head edition adopts, each marked with the head's\)\n(?:.*\n){6}case verdict: contradicted/);
    expect(text).toMatch(/synthesis\/reasoning: The one that overreached\./);
    expect(text).toMatch(/claim X-C1: contradicted \(high\) \[head: well_supported \(high\)\] — spent figures no record carries/);
    expect(text).toMatch(/claim X-C2: unresolved \(low\) — agrees with the head/);
    expect(text).not.toMatch(/claim X-C2: unresolved \(low\) \[head/);
    // A check-role assessment is a seat's own reading, never superseded by the head's adoption of another.
    expect(text).toMatch(/check-a\.yaml \(assessment check-role, a seat's own reading, never superseded: header, case verdict, load-bearing set, what is claimed, components, every claim's verdict\)/);
    expect(text.indexOf("edition-b.yaml (assessment adopted by the head edition:")).toBeLessThan(text.indexOf("edition-a0.yaml (assessment superseded"));
  });
  it("reads adoption per case: a changed assessment in a case with no head edition in the change is not superseded by another case's head", () => {
    const multi: Record<string, string> = {
      ...files,
      "content/cases/x/editions/e3.yaml": "runId: e3\ndate: 2026-09-10\nmodel: m\npromptVersion: edition-v12\nprevious: e2\nassessment:\n  runId: 2026-09-09-edition-b\n  hash: h\nrationale: r\nfeaturedClaimIds: []\ncruxOrder: []\narticle: |\n  The head article.\n",
      "content/cases/y/assessments/2026-09-10-edition-q.yaml": "runId: 2026-09-10-edition-q\nmodel: drafter\nrole: draft\ncaseAssessment:\n  verdict: mixed\n  synthesis: Y on its own.\nclaimAssessments:\n  - claimId: Y-C1\n    verdict: mixed\n    confidence: low\n    reasoning: Y's reasoning.\n",
    };
    const { text } = runAccount(Object.keys(multi), (p: string) => multi[p] ?? null, diffOf);
    expect(text).toMatch(/y\/assessments\/2026-09-10-edition-q\.yaml \(assessment not adopted or superseded by an edition in this change: header, case verdict/);
    expect(text).not.toMatch(/edition-q\.yaml \(assessment superseded/);
    expect(text).toMatch(/claim Y-C1: mixed \(low\) — Y's reasoning\./);
    // Case x's head adopts b, so x's own check-a is whole and only a draft x does not adopt would be superseded.
    expect(text).toMatch(/x\/assessments\/2026-09-09-edition-b\.yaml \(assessment adopted by the head edition: header/);
  });
  it("reads the assessment the head edition adopts even when the change did not touch its file", () => {
    // e3 adopts edition-b, whose file is not among the changed paths but is readable at head.
    const kept: Record<string, string> = { ...files, "content/cases/x/editions/e3.yaml": "runId: e3\ndate: 2026-09-10\nmodel: m\npromptVersion: edition-v12\nprevious: e2\nassessment:\n  runId: 2026-09-09-edition-b\n  hash: h\nrationale: r\nfeaturedClaimIds: []\ncruxOrder: []\narticle: |\n  The head article.\n" };
    const changedPaths = Object.keys(kept).filter((p) => !p.endsWith("2026-09-09-edition-b.yaml"));
    const { text, files: used } = runAccount(changedPaths, (p: string) => kept[p] ?? null, diffOf);
    expect(text).toMatch(/x\/assessments\/2026-09-09-edition-b\.yaml \(assessment adopted by the head edition, unchanged in this change: header, case verdict/);
    expect(text).toMatch(/claim X-C1: well_supported \(high\) — E1 quotes the excavators\./);
    expect(used).toContain("content/cases/x/assessments/2026-09-09-edition-b.yaml");
    expect(text.indexOf("e3.yaml (head edition")).toBeLessThan(text.indexOf("edition-b.yaml (assessment adopted"));
  });
  it("keeps every claim's verdict when an assessment is long, giving up the reasoning and saying so", () => {
    const many = Array.from({ length: 120 }, (_, i) => `  - claimId: X-C${i + 1}\n    verdict: mixed\n    confidence: low\n    reasoning: ${"r".repeat(280)}\n`).join("");
    const long: Record<string, string> = { ...files, "content/cases/x/assessments/2026-09-09-edition-b.yaml": `runId: 2026-09-09-edition-b\nrole: draft\ncaseAssessment:\n  verdict: mixed\n  synthesis: Many claims.\nclaimAssessments:\n${many}` };
    const { text } = runAccount(Object.keys(long), (p: string) => long[p] ?? null, diffOf);
    expect(text).toMatch(/claim X-C1: mixed \(low\)\n/);
    expect(text).toMatch(/claim X-C120: mixed \(low\)\n/);
    expect(text).not.toMatch(/rrrrrrrrrr/);
    expect(text).toMatch(/\[… claim reasoning not shown: with it this section would run to 3\d,\d{3} characters, over its 30,000; every claim's verdict and confidence is kept\]/);
  });
  it("never drops or cuts the head: when the head sections alone exceed the cap, the account runs over and says so", () => {
    const big = (id: string) => `runId: ${id}\ndate: 2026-09-10\nmodel: m\npromptVersion: edition-v12\nprevious: null\nrationale: r\nfeaturedClaimIds: []\ncruxOrder: []\narticle: |\n  ${"x".repeat(55_000)}\n`;
    const heads = ["x/editions/e2.yaml", "y/editions/e9.yaml", "z/editions/e8.yaml", "w/editions/e7.yaml", "v/editions/e6.yaml"];
    const over: Record<string, string> = { ...files, ...Object.fromEntries(heads.map((p, i) => [`content/cases/${p}`, big(`e${i}`)])) };
    const { text } = runAccount(Object.keys(over), (p: string) => over[p] ?? null, diffOf);
    for (const p of heads) expect(text).toMatch(new RegExp(`content/cases/${p} \\(head edition`));
    expect(text.length).toBeGreaterThan(ACCOUNT_CAP);
    // Within a rank the largest falls first: the verification file, now its own section, is named before the run header.
    expect(text).toMatch(/section\(s\) dropped to keep the account under 250,000 characters: proposals\/r1\/verification\.md; .*proposals\/r1\/run\.yaml/);
    expect(text).toMatch(/\[The protected sections alone — the head edition\(s\), the assessment\(s\) they adopt, and any assessment of the change not superseded within it — run to [\d,]+ characters, over the 250,000 cap; they are kept whole and nothing else is included\.\]/);
    expect(text).not.toMatch(/run account: \d+ more characters not shown/);
    expect(text).not.toMatch(/\[… article:/);
  });
  it("is empty for a change without runs, and clips a long article loudly", () => {
    expect(runAccount(["src/x.ts", "docs/y.md"], read, diffOf)).toEqual({ text: "", files: [] });
    const long: Record<string, string> = { ...files, "content/cases/x/editions/e2.yaml": files["content/cases/x/editions/e2.yaml"].replace("Three accounts side by side.", "x".repeat(65_000)) };
    const { text } = runAccount(Object.keys(long), (p: string) => long[p] ?? null, diffOf);
    expect(text).toMatch(/\[… article: 500\d more characters not shown\]/);
    expect(text.length).toBeLessThanOrEqual(ACCOUNT_CAP + 100);
  });
});

describe("review notes — the wide voice", () => {
  it("reads the notes from the arbiter's report and names each issue by PR and seat", async () => {
    const { notesFromReport, issueTitle, issueBody } = await import("../../scripts/review-notes.mjs");
    const note = { seat: "GPT-5.6 Sol (OpenAI)", vote: "violates", rules: ["§3.14"], paradigm: "provenance", reasoning: "The stamp names the wrong run.\nFix the origin." };
    const report = `## Constitutional arbiter — ✅ PASS\n\n<!-- aletheia-arbiter-data ${JSON.stringify({ verdict: "pass", promptVersion: "panel-v3", seats: [note], notes: [note] })} -->`;
    expect(notesFromReport(report)).toEqual([note]);
    expect(notesFromReport("no data here")).toEqual([]);
    expect(issueTitle(214, note)).toBe("Review note on #214 — GPT-5.6 Sol (OpenAI): §3.14 (provenance)");
    const body = issueBody(214, note, "panel-v3");
    expect(body).toMatch(/answers on the record/);
    expect(body).toMatch(/> The stamp names the wrong run\.\n> Fix the origin\./);
    expect(body).toMatch(/Pull request: #214/);
  });
});

describe("omittedNotes — the omitted list points at the account", () => {
  it("marks the files the run account read, and leaves the rest bare", () => {
    expect(omittedNotes(["content/cases/x/evidence.yaml", "proposals/r1/reply.json"], ["content/cases/x/evidence.yaml", "proposals/r1/run.yaml"])).toEqual([
      "content/cases/x/evidence.yaml — read into the RUN ACCOUNT above; its section for this file says what is whole, digested or clipped",
      "proposals/r1/reply.json",
    ]);
  });

  it("gives a file the diff could not carry a mechanical shape: its size, its fields, its identifiers, never its values", () => {
    // A seat that cannot see an omitted working file can at least tell what it is, and match its ledger hash and
    // runId against the account's (2026-09-23: a seat withheld compliance over an omitted packet.json it could not
    // describe).
    const packet = JSON.stringify({
      case: "vasocomputation",
      ledgerHash: "750bf702d131",
      index: "edition",
      inputs: [{ id: "VASO-E082", sourceStatement: "a quoted passage nobody outside this file should have to trust" }],
      detail: { article: "the whole draft article", nested: { deeper: { deepest: 1 } } },
    });
    const files = { "proposals/r1/packet.json": packet, "proposals/r1/notes.md": "one\ntwo\n", "proposals/r1/broken.json": "{oops" };
    const read = (p: string) => files[p as keyof typeof files];
    const [pkt, md, broken] = omittedNotes(["proposals/r1/packet.json", "proposals/r1/notes.md", "proposals/r1/broken.json"], [], read);
    expect(pkt).toContain(`${packet.length} chars`);
    expect(pkt).toContain('case: "vasocomputation"'); // identifiers whole, so the seat can match the account
    expect(pkt).toContain('ledgerHash: "750bf702d131"');
    expect(pkt).toContain("inputs: [1 item(s)");
    expect(pkt).toContain("sourceStatement: string(62)"); // the shape of a value, never the value
    expect(pkt).not.toContain("nobody outside this file");
    expect(pkt).not.toContain("the whole draft article");
    expect(pkt).toContain("nested: {deeper: {1 field(s)}}"); // depth is bounded
    expect(md).toBe("proposals/r1/notes.md — 3 lines, 8 chars"); // not JSON: size only
    expect(broken).toContain("not parseable as JSON");
    // With no reader, the list is as it was.
    expect(omittedNotes(["proposals/r1/packet.json"], [])).toEqual(["proposals/r1/packet.json"]);
  });

  it("bounds the shape itself, so an over-budget file cannot reach the packet through it", () => {
    // Review note #415 on #414: the first version showed identifier values whole and every key, so a file omitted for
    // size could have put its content in `model`, in field names, or in a hundred thousand fields.
    const big = "x".repeat(50_000);
    const file = JSON.stringify({
      model: big, // an identifier field, shown whole before this fix
      [`k${big}`]: 1, // a key
      ...Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`f${i}`, "v"])),
    });
    const [note] = omittedNotes(["proposals/r1/packet.json"], [], () => file);
    expect(note.length).toBeLessThan(2500); // the whole note stays bounded whatever the file does
    expect(note).not.toContain("x".repeat(200));
    expect(note).toMatch(/model: string\(50000\), sha256 [0-9a-f]{12}/); // matchable, not reproduced
    expect(note).toContain("…(50001)"); // the key is clipped and says how long it was
    expect(note).toContain("more field(s)"); // the field list is capped and says how many it dropped
    // A file that spends its budget on breadth at every level is cut at the total, and says so.
    const wide = Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [`group${i}`, Object.fromEntries(Array.from({ length: 30 }, (_, j) => [`field${j}`.padEnd(50, "_"), "v"]))]),
    );
    const [wideNote] = omittedNotes(["proposals/r1/wide.json"], [], () => JSON.stringify(wide));
    expect(wideNote).toContain("shape truncated at 2000 chars");
    expect(wideNote.length).toBeLessThan(2200);
    // The same long value hashes the same way, which is what makes a truncated identifier still matchable.
    const [again] = omittedNotes(["p.json"], [], () => JSON.stringify({ model: big }));
    expect(again.match(/sha256 ([0-9a-f]{12})/)![1]).toBe(note.match(/sha256 ([0-9a-f]{12})/)![1]);
  });
});

describe("costOf — the panel's own bill", () => {
  it("sums tokens across metered seats and dollars only when every metered seat was priced", () => {
    const priced = { cost: { model: "a", inputTokens: 1000, outputTokens: 100, usd: 0.5 } };
    const unpriced = { cost: { model: "b", inputTokens: 2000, outputTokens: 200, usd: null } };
    const failed = { failed: true };
    expect(costOf([priced, priced])).toEqual({ seats: 2, complete: true, inputTokens: 2000, outputTokens: 200, usd: 1 });
    expect(costOf([priced, unpriced])).toEqual({ seats: 2, complete: true, inputTokens: 3000, outputTokens: 300, usd: null });
    // A seat that never returned accounting makes the bill incomplete: the tokens are a floor, the dollars are withheld.
    expect(costOf([priced, priced, failed])).toEqual({ seats: 2, complete: false, inputTokens: 2000, outputTokens: 200, usd: null });
    // A seat whose reply would not parse still carries the cost of the reply it returned.
    const unparsable = { failed: true, cost: { model: "c", inputTokens: 500, outputTokens: 50, usd: 0.25 } };
    expect(costOf([priced, unparsable])).toEqual({ seats: 2, complete: true, inputTokens: 1500, outputTokens: 150, usd: 0.75 });
    expect(costOf([failed])).toEqual({ seats: 0, complete: false, inputTokens: 0, outputTokens: 0, usd: null });
  });
});

describe("splitMergeLanes with the gate's own declarations", () => {
  it("excludes a merge the gate declares supervised by hash, and still counts every other unmarked merge", () => {
    const commits = [
      { hash: "aaa", message: "Chain 2026-09-10: the loop's own landing" },
      { hash: "bbb", message: "A founder-directed landing without the trailer" },
      { hash: "ccc", message: "Another\n\nSupervised-by: founder (direction in session)" },
    ];
    const lanes = splitMergeLanes(commits, new Set(["bbb"]));
    expect(lanes.autonomous).toEqual(["aaa"]);
    expect(lanes.supervised).toEqual(["bbb", "ccc"]);
    // Without a declaration the default counts, as before.
    expect(splitMergeLanes(commits).autonomous).toEqual(["aaa", "bbb"]);
  });
});
