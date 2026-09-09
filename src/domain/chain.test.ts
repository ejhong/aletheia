import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getCaseBySlug, loadAllCases } from "./load.ts";
import { caseAccounts, caseQuestion, questionRestatedBy } from "./editions.ts";
import { capsFor, loadBudget, assertWithinBudget, BudgetExceeded, estimateUsd, tokensFromChars } from "../pipeline/budget.ts";
import { assembleProposal, urlsInReport, type DraftReply } from "../pipeline/draft.ts";
import { assembleEdition, type EditionReply } from "../pipeline/edition.ts";
import { stripHtml } from "../pipeline/fetch.ts";
import { quoteOccurs, quotedSpans, unverifiedQuotes } from "../pipeline/quotes.ts";
import { runReport } from "../pipeline/report.ts";
import { recordSpend } from "../pipeline/spend.ts";
import { readRuns } from "../pipeline/store.ts";
import { judgeProposal, type VerifyReply } from "../pipeline/verify.ts";
import type { FetchedSource } from "../pipeline/fetch.ts";

// The guard's tests carry their own ceiling: the committed one has a crunch and exemptions that move.
const FIXTURE_BUDGET = `usd:\n  perRun: 20\n  perDay: 50\n  perMonth: 150\nexemptions:\n  - date: "2026-09-08"\n    perDay: 100\n    reason: "fixture: the first-runs day"\n    by: "test"\n`;
const tmpRoot = (budget = FIXTURE_BUDGET) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aletheia-chain-"));
  fs.mkdirSync(path.join(root, "config"));
  fs.writeFileSync(path.join(root, "config", "budget.yaml"), budget);
  fs.copyFileSync(path.join(process.cwd(), "config", "tariffs.yaml"), path.join(root, "config", "tariffs.yaml"));
  return root;
};
const tariffs = { models: { m: { inputPerMTok: 10, outputPerMTok: 40, source: "x", checked: "2026-09-08" } }, tools: { "v:web_search": { perCallUsd: 0.01, source: "x", checked: "2026-09-08" } } };

describe("the budget guard", () => {
  it("estimates conservatively and refuses an unpriced model", () => {
    expect(tokensFromChars(3500)).toBe(1000);
    expect(estimateUsd({ model: "m", inputChars: 35_000, maxOutputTokens: 10_000 }, tariffs)).toBe(0.5); // 10k in × $10 + 10k out × $40
    // Ten searches: ten results of 4k tokens written once ($0.40 at the base rate, no cache rates in this tariff),
    // re-read across the passes that follow (0+4k+…+36k = 180k tokens, $1.80), plus ten $0.01 fees.
    expect(estimateUsd({ model: "m", inputChars: 0, maxOutputTokens: 0, searches: { count: 10, toolKey: "v:web_search" } }, tariffs)).toBe(2.3);
    // With cache rates the re-reads are cheap: the same call on a model that reads at $0.25 and writes at $12.5.
    const cached = { models: { c: { inputPerMTok: 10, outputPerMTok: 50, cachedInputPerMTok: 0.25, cacheWritePerMTok: 12.5, source: "x", checked: "2026-09-08" } }, tools: tariffs.tools };
    expect(estimateUsd({ model: "c", inputChars: 0, maxOutputTokens: 0, searches: { count: 10, toolKey: "v:web_search" } }, cached)).toBe(0.645); // 40k × 12.5 + 180k × 0.25 (per MTok) + $0.10
    // The first paid run's shape — a 39k-token prompt, 30 searches, 15 fetches of up to 30k tokens — estimates under the $20 ceiling only because of caching.
    const shape = { model: "c", inputChars: 136_500, maxOutputTokens: 32_000, searches: { count: 30, toolKey: "v:web_search" }, fetches: { count: 15, maxContentTokens: 30_000 } };
    expect(estimateUsd(shape, cached)!).toBeGreaterThan(10);
    expect(estimateUsd(shape, cached)!).toBeLessThan(20);
    expect(estimateUsd(shape, { ...cached, models: { c: { ...cached.models.c, cachedInputPerMTok: undefined, cacheWritePerMTok: undefined } } })!).toBeGreaterThan(100); // uncached, the same call is ruinous
    expect(estimateUsd({ model: "nope", inputChars: 10, maxOutputTokens: 10 }, tariffs)).toBeNull();
    expect(estimateUsd({ model: "m", inputChars: 10, maxOutputTokens: 10, searches: { count: 1, toolKey: "missing" } }, tariffs)).toBeNull();
    const root = tmpRoot();
    expect(() => assertWithinBudget(null, { runId: "r", verb: "report", root })).toThrow(BudgetExceeded);
    // A dated exemption lifts the daily cap on its date only; the committed file carries one for 2026-09-08.
    for (let i = 0; i < 5; i++) recordSpend({ date: "2026-09-08", runId: `x${i}`, verb: "report", case: "c", model: "m", calls: 1, inputTokens: 1, outputTokens: 1, usd: 9.5 }, root);
    expect(assertWithinBudget(10, { runId: "r", verb: "report", root, today: "2026-09-08" })).toBe(10); // $47.50 + $10 under the $100 exemption
    for (let i = 0; i < 5; i++) recordSpend({ date: "2026-09-10", runId: `y${i}`, verb: "report", case: "c", model: "m", calls: 1, inputTokens: 1, outputTokens: 1, usd: 9.5 }, root);
    expect(() => assertWithinBudget(10, { runId: "r", verb: "report", root, today: "2026-09-10" })).toThrow(/per-day cap/);
  });

  it("refuses a call that would pass the per-run, per-day, or per-month cap, and says which", () => {
    const root = tmpRoot();
    expect(assertWithinBudget(5, { runId: "r1", verb: "report", root, today: "2026-09-21" })).toBe(5);
    recordSpend({ date: "2026-09-21", runId: "r1", verb: "report", case: "x", model: "m", calls: 1, inputTokens: 1, outputTokens: 1, usd: 18 }, root);
    expect(() => assertWithinBudget(5, { runId: "r1", verb: "report", root, today: "2026-09-21" })).toThrow(/per-run cap/);
    expect(assertWithinBudget(5, { runId: "r2", verb: "report", root, today: "2026-09-21" })).toBe(5);
    recordSpend({ date: "2026-09-21", runId: "r2", verb: "report", case: "x", model: "m", calls: 1, inputTokens: 1, outputTokens: 1, usd: 30 }, root);
    expect(() => assertWithinBudget(5, { runId: "r3", verb: "report", root, today: "2026-09-21" })).toThrow(/per-day cap/);
    expect(assertWithinBudget(5, { runId: "r3", verb: "report", root, today: "2026-09-22" })).toBe(5);
    for (let i = 0; i < 6; i++) {
      recordSpend({ date: `2026-09-1${i}`, runId: `m${i}`, verb: "report", case: "x", model: "m", calls: 1, inputTokens: 1, outputTokens: 1, usd: 19 }, root);
    }
    expect(() => assertWithinBudget(5, { runId: "r9", verb: "report", root, today: "2026-09-20" })).toThrow(/per-month cap/);
  });

  it("the crunch lifts the caps until its date, the standing caps return after, and a refusal names the phase", () => {
    const root = tmpRoot(FIXTURE_BUDGET.replace("exemptions:", 'crunch:\n  until: "2026-09-30"\n  perDay: 80\n  perMonth: 400\n  reason: "fixture bootstrap"\n  by: "test"\nexemptions:'));
    for (let i = 0; i < 6; i++) recordSpend({ date: "2026-09-21", runId: `c${i}`, verb: "report", case: "x", model: "m", calls: 1, inputTokens: 1, outputTokens: 1, usd: 10 }, root);
    expect(assertWithinBudget(15, { runId: "r", verb: "report", root, today: "2026-09-21" })).toBe(15); // $60 + $15 under the crunch's $80
    recordSpend({ date: "2026-09-21", runId: "c6", verb: "report", case: "x", model: "m", calls: 1, inputTokens: 1, outputTokens: 1, usd: 10 }, root);
    expect(() => assertWithinBudget(15, { runId: "r", verb: "report", root, today: "2026-09-21" })).toThrow(/per-day cap.*crunch caps/); // $70 + $15 over it
    for (let i = 0; i < 6; i++) recordSpend({ date: "2026-10-02", runId: `d${i}`, verb: "report", case: "x", model: "m", calls: 1, inputTokens: 1, outputTokens: 1, usd: 8 }, root);
    expect(() => assertWithinBudget(5, { runId: "r", verb: "report", root, today: "2026-10-02" })).toThrow(/per-day cap.*standing caps/); // $48 + $5 over the standing $50
    const budget = loadBudget(root);
    expect(capsFor(budget, "2026-09-30").phase).toBe("crunch");
    expect(capsFor(budget, "2026-10-01").phase).toBe("standing");
    expect(capsFor(budget, "2026-09-08")).toMatchObject({ phase: "exemption", perDay: 100, perMonth: 400 }); // a day's grant inside the crunch keeps the crunch's month
  });
});

describe("mechanical text checks", () => {
  it("quotes match across whitespace, hyphenation, curly quotes, and case — and words must be exact", () => {
    const source = "The measured rate was roughly 216 cm³ per hour at eighty-\nfive strikes per minute, the authors report.";
    expect(quoteOccurs("216 cm³ per hour at eighty-five strikes", source)).toBe(true);
    expect(quoteOccurs("“216 CM³ PER HOUR”", source)).toBe(true);
    expect(quoteOccurs("216 cm³ per minute", source)).toBe(false);
    expect(quotedSpans('He said "this is a long enough quote" and "short" and “another long quoted span”')).toEqual([
      "this is a long enough quote",
      "another long quoted span",
    ]);
    expect(unverifiedQuotes('The paper states "216 cm³ per hour at eighty-five strikes" and "a claim the source never made".', source)).toEqual([
      "a claim the source never made",
    ]);
  });

  it("HTML becomes text with paragraph breaks and decoded entities", () => {
    const text = stripHtml("<html><head><style>p{}</style><script>x()</script></head><body><h1>T&amp;C</h1><p>One&nbsp;two &#8212; three.</p><p>Four.</p></body></html>");
    expect(text).toBe("T&C\nOne two — three.\nFour.");
  });

  it("URLs in a report are canonicalised, deduplicated, and capped", () => {
    const md = "See [a](https://Example.org/x?utm_source=chatgpt.com) and https://example.org/x/ and https://doi.org/10.1038/s40494-026-02315-y. Also (https://other.org/p).";
    expect(urlsInReport(md)).toEqual(["https://Example.org/x?utm_source=chatgpt.com", "https://doi.org/10.1038/s40494-026-02315-y", "https://other.org/p"]);
    expect(urlsInReport(md, 1)).toHaveLength(1);
  });
});

const geo = () => getCaseBySlug("megalithic-casting");

const draftReply = (over: Partial<DraftReply> = {}): DraftReply => ({
  rationale: "a test draft from a fixture report",
  sources: [
    {
      provisionalId: "S1",
      url: "https://doi.org/10.1038/s40494-026-02315-y",
      title: "Sodium carbonate treatment of granite: an experimental study",
      authors: ["Yi, X."],
      year: "2026",
      sourceType: "paper",
      identifier: "npj Heritage Science 14: 315. DOI: 10.1038/s40494-026-02315-y",
      verification: "ai_verified",
      reliabilityNotes: ["Peer-reviewed; single laboratory."],
    },
    {
      // Already in the ledger by DOI — must become a duplicate, and E2 must point at the existing record.
      provisionalId: "S2",
      url: "https://doi.org/10.1016/j.jas.2005.09.011",
      title: "Natron as a flux (reprint)",
      authors: ["Shortland, A."],
      year: "2006",
      sourceType: "paper",
      identifier: null,
      verification: "unverified",
      reliabilityNotes: [],
    },
  ],
  evidence: [
    {
      provisionalId: "E1",
      title: "Molten sodium carbonate fragments granite after five blows",
      claimRefs: ["C1"],
      sourceRef: "S1",
      direction: "supports",
      strength: "moderate",
      sourceStatement: 'The authors report that "only five blows with a wooden handle fragmented the specimen" after treatment.',
      editorInference: "A proof of principle for the mechanism, not evidence that it was used.",
      exactLocator: "Results, para. 3",
      limitations: ["One laboratory; small specimens."],
    },
    {
      provisionalId: "E2",
      title: "Natron availability in the Bronze Age",
      claimRefs: ["GEO-C001"],
      sourceRef: "S2",
      direction: "context",
      strength: "weak",
      sourceStatement: 'Natron "was the flux of choice" for early glass.',
      editorInference: null,
      exactLocator: null,
      limitations: [],
    },
    {
      provisionalId: "E3",
      title: "Orphan evidence with an unknown source",
      claimRefs: ["GEO-C001"],
      sourceRef: "S9",
      direction: "supports",
      strength: "weak",
      sourceStatement: "whatever",
      editorInference: null,
      exactLocator: null,
      limitations: [],
    },
  ],
  claims: [
    {
      provisionalId: "C1",
      statement: "Molten sodium carbonate at 900 °C disintegrates granite specimens within fifteen minutes.",
      theme: "replication",
      rung: "observation",
      claimType: "measurement",
      sourceAnchor: { sourceRef: "S1", locator: "Results", quote: "completely disintegrated the granite" },
      parentClaimRefs: [],
      dependsOnClaimRefs: [],
      alternativeToRefs: [],
      contradictsRefs: [],
    },
    {
      provisionalId: "C2",
      statement: "A claim with an unknown theme that should fail validation.",
      theme: "not-a-theme",
      rung: "observation",
      claimType: null,
      sourceAnchor: null,
      parentClaimRefs: [],
      dependsOnClaimRefs: [],
      alternativeToRefs: [],
      contradictsRefs: [],
    },
  ],
  research: [
    {
      provisionalId: "R1",
      title: "Replicate the molten natron granite experiment with monument-matched granite",
      summary: "Repeat the 2026 protocol on Aswan granite with blinded controls.",
      claimRefs: ["C1"],
      track: "small_grant",
      effortTier: "lab",
      informationGain: "Direct test of the mechanism on the relevant rock.",
    },
  ],
  corrections: [],
  dispositions: [
    { kind: "source", disposition: "irrelevant", as: null, reason: "modern cement paper with no bearing on any claim", reopenIf: null, observed: "Slag cements today", url: "https://example.org/slag", route: null },
  ],
  edition: null,
  ...over,
});

describe("assembling a proposal", () => {
  it("assigns ids, stamps provenance, dispositions duplicates and failures, and re-points evidence at existing records", () => {
    const c = geo();
    const fetched: FetchedSource[] = [{ url: "https://doi.org/10.1038/s40494-026-02315-y", ok: true, status: 200, contentType: "text/html", text: "…" }];
    const { proposal, novelty } = assembleProposal(draftReply(), {
      loaded: c,
      reportRunId: "2026-09-08-report-megalithic-casting-100000",
      runId: "2026-09-08-draft-megalithic-casting-110000",
      model: "claude-opus-5",
      promptVersion: "draft-v1",
      date: "2026-09-08",
      fetched,
    });
    // One new source, ids in the case's own scheme.
    expect(proposal.adds.sources.map((s) => s.id)).toEqual(["SRC-YI-2026"]);
    expect(proposal.adds.sources[0].verification).toBe("ai_verified");
    expect(proposal.adds.claims.map((k) => k.id)).toEqual(["GEO-C" + String(Math.max(...c.claims.map((k) => Number(k.id.slice(5)))) + 1).padStart(3, "0")]);
    expect(proposal.adds.claims[0].origin.runId).toBe("2026-09-08-draft-megalithic-casting-110000");
    expect(proposal.adds.claims[0].sourceAnchor?.sourceId).toBe("SRC-YI-2026");
    // The duplicate source: a disposition, and E2 re-pointed to the ledger record.
    const dup = proposal.dispositions.find((d) => d.disposition === "duplicate" && d.kind === "source");
    expect(dup?.as).toBe("SRC-SHORTLAND-2006");
    expect(proposal.adds.evidence.find((e) => e.title.startsWith("Natron availability"))?.sourceId).toBe("SRC-SHORTLAND-2006");
    // The orphan evidence and the bad-theme claim failed, with reasons.
    const failed = proposal.dispositions.filter((d) => d.disposition === "failed");
    expect(failed.some((d) => d.kind === "evidence" && /S9/.test(d.reason ?? ""))).toBe(true);
    expect(failed.some((d) => d.kind === "claim" && /unknown theme/.test(d.reason ?? ""))).toBe(true);
    // The drafter's own disposition got a mechanical key and the run's stamp.
    const irr = proposal.dispositions.find((d) => d.disposition === "irrelevant");
    expect(irr?.key).toBe("url:example.org/slag");
    expect(irr?.by).toBe("2026-09-08-draft-megalithic-casting-110000");
    expect(proposal.adds.research[0].claimIds).toEqual([proposal.adds.claims[0].id]);
    expect(novelty).toMatch(/proposed: 1 sources, 2 evidence records, 1 claims, 1 research items/);
  });
});

describe("judging a proposal", () => {
  const ctx = () => {
    const c = geo();
    const { proposal } = assembleProposal(draftReply(), {
      loaded: c,
      reportRunId: "rep",
      runId: "2026-09-08-draft-megalithic-casting-110000",
      model: "m",
      promptVersion: "draft-v1",
      date: "2026-09-08",
      fetched: [],
    });
    const yes: VerifyReply = { quoteInContext: true, statementSupported: true, locatorSupported: true, directionRight: true, independenceNoted: true, relevant: true, reason: "holds" };
    const meter = { runId: "v", verb: "verify" as const, case: c.record.slug };
    return { c, proposal, yes, meter };
  };
  const yiText = "Methods. Results: after treatment, only five blows with a wooden handle fragmented the specimen. In the second run the salt completely disintegrated the granite within fifteen minutes.";
  const shortlandText = "Natron was the flux of choice for early glass production in Egypt.";

  it("accepts records whose quotes occur and whose second reading holds; rejects the rest with reasons", async () => {
    const { c, proposal, yes, meter } = ctx();
    const texts = new Map<string, FetchedSource>([
      ["https://doi.org/10.1038/s40494-026-02315-y", { url: "u1", ok: true, status: 200, contentType: "text/html", text: yiText }],
      ["https://doi.org/10.1016/j.jas.2005.09.011", { url: "u2", ok: true, status: 200, contentType: "text/html", text: shortlandText }],
    ]);
    // The ledger's Shortland record has its own URL; alias it to the same text.
    const shortland = c.sources.find((s) => s.id === "SRC-SHORTLAND-2006")!;
    if (shortland.url) texts.set(shortland.url, texts.get("https://doi.org/10.1016/j.jas.2005.09.011")!);
    const resolved = new Map([["doi:10.1038/s40494-026-02315-y", { status: "resolves", note: "ok" }]]);
    const v = await judgeProposal(proposal, c, texts, resolved, async () => yes, meter);
    expect(v.accepted.sources.map((s) => s.id)).toEqual(["SRC-YI-2026"]);
    expect(v.accepted.claims).toHaveLength(1);
    expect(v.accepted.evidence.map((e) => e.title)).toContain("Molten sodium carbonate fragments granite after five blows");
    expect(v.accepted.research).toHaveLength(1);
    expect(v.notes.filter((n) => n.startsWith("prospective ledger:"))).toEqual([]);
  });

  it("a quote the source never said fails mechanically before any model is asked; an unresolvable DOI fails the source and its dependents", async () => {
    const { c, proposal, yes, meter } = ctx();
    let judged = 0;
    const texts = new Map<string, FetchedSource>([
      ["https://doi.org/10.1038/s40494-026-02315-y", { url: "u1", ok: true, status: 200, contentType: "text/html", text: "A page about something else entirely." }],
    ]);
    const v = await judgeProposal(proposal, c, texts, new Map(), async () => (judged++, yes), meter);
    expect(judged).toBe(0); // nothing reached the second reader: the mechanical check stopped it
    expect(v.accepted.evidence.find((e) => e.title.startsWith("Molten"))).toBeUndefined();
    expect(v.rejected.some((r) => r.kind === "evidence" && /not found verbatim/.test(r.reason))).toBe(true);
    expect(v.rejected.some((r) => r.kind === "claim" && /anchor quote not found/.test(r.reason))).toBe(true);
    // Nothing accepted cites the new source, so it is rejected too.
    expect(v.rejected.some((r) => r.id === "SRC-YI-2026" && /nothing accepted cites it/.test(r.reason))).toBe(true);
    const failing = await judgeProposal(proposal, c, texts, new Map([["doi:10.1038/s40494-026-02315-y", { status: "fails", note: "Crossref 404" }]]), async () => yes, meter);
    expect(failing.rejected.some((r) => r.id === "SRC-YI-2026" && /does not resolve/.test(r.reason))).toBe(true);
    expect(failing.rejected.some((r) => r.kind === "evidence" && /source SRC-YI-2026 was rejected/.test(r.reason))).toBe(true);
  });

  it("the second reader's no is final, and a source that cannot be fetched blocks its evidence with a route", async () => {
    const { c, proposal, meter } = ctx();
    const texts = new Map<string, FetchedSource>([
      ["https://doi.org/10.1038/s40494-026-02315-y", { url: "u1", ok: true, status: 200, contentType: "text/html", text: yiText }],
    ]);
    const no: VerifyReply = { quoteInContext: true, statementSupported: false, locatorSupported: true, directionRight: true, independenceNoted: true, relevant: true, reason: "the passage describes a different specimen" };
    const v = await judgeProposal(proposal, c, texts, new Map(), async () => no, meter);
    expect(v.rejected.some((r) => r.kind === "evidence" && /second reader rejected \(statementSupported\)/.test(r.reason))).toBe(true);
    // Shortland's URL is not in `texts`, so E2 is blocked with a route.
    const blocked = v.rejected.find((r) => r.disposition === "blocked");
    expect(blocked?.route).toMatch(/re-run verify/);
  });
});

describe("assembling an edition", () => {
  const editionReply = (over: Partial<EditionReply> = {}): EditionReply => {
    const c = geo();
    const ed = c.editions.at(-1)!;
    return { rationale: "a test edition that re-adopts the incumbent's judgment", question: null, accounts: [], featuredClaimIds: ed.featuredClaimIds, cruxOrder: ed.cruxOrder, article: ed.article, assessment: null, ...over };
  };
  const ctx = { model: "claude-opus-5", promptVersion: "edition-v1", now: new Date("2026-09-09T12:00:00Z"), root: process.cwd() };

  it("the question and the accounts are the edition's: restated when given, inherited when not", () => {
    const c = geo();
    const restated = assembleEdition(c, editionReply({ question: "Were the hardest stones cast, carved, or both — and by whom?", accounts: ["The blocks were cast from a geopolymer", "The blocks were carved and dressed by hand"] }), ctx);
    expect(restated.errors).toEqual([]);
    expect(restated.edition.question).toBe("Were the hardest stones cast, carved, or both — and by whom?");
    expect(restated.edition.accounts).toHaveLength(2);
    // A later candidate that says nothing keeps them.
    const later = { ...c, editions: [...c.editions, restated.edition] } as typeof c;
    const kept = assembleEdition(later, editionReply({ article: restated.edition.article + "\n\nA closing paragraph." }), ctx);
    expect(kept.errors).toEqual([]);
    expect(kept.edition.question).toBe(restated.edition.question);
    expect(kept.edition.accounts).toEqual(restated.edition.accounts);
    // The question as it stands: the edition's, else the case file's founding subtitle.
    expect(caseQuestion(later)).toBe(restated.edition.question);
    expect(caseQuestion(c)).toBe(c.record.subtitle);
    expect(caseAccounts(c)).toEqual([]);
    // The page credits the edition that restated the question, not the one that inherited it (§3.14).
    const kept2 = { ...later, editions: [...later.editions, kept.edition] } as typeof c;
    expect(questionRestatedBy(kept2)?.runId).toBe(restated.edition.runId);
    expect(questionRestatedBy(c)).toBeNull();
  });

  it("a candidate that changes only prose re-adopts the incumbent's assessment and passes the loader's rules", () => {
    const c = geo();
    const { edition, assessment, errors } = assembleEdition(c, editionReply({ article: c.editions.at(-1)!.article + "\n\nA closing paragraph the panel can judge." }), ctx);
    expect(errors).toEqual([]);
    expect(assessment).toBeNull();
    expect(edition.assessment?.runId).toBe(c.editions.at(-1)!.assessment?.runId);
    expect(edition.previous).toBe(c.editions.at(-1)!.runId);
    expect(edition.basis.ledgerHash).toBe(c.ledgerHash);
  });

  // Three edition assemblies read every founding input, the essay extraction included; CI runners are slow.
  it("dropping a plate, featuring an unknown claim, or unfeaturing a load-bearing claim is refused", { timeout: 60_000 }, () => {
    const c = geo();
    const incumbent = c.editions.at(-1)!;
    const noPlates = assembleEdition(c, editionReply({ article: incumbent.article.replace(/^\{plate:[^}]+\}$/gm, "") }), ctx);
    expect(noPlates.errors.some((e) => /drops plate/.test(e))).toBe(true);
    const unknown = assembleEdition(c, editionReply({ featuredClaimIds: [...incumbent.featuredClaimIds, "GEO-C000"] }), ctx);
    expect(unknown.errors.some((e) => /unknown or rejected claim GEO-C000/.test(e))).toBe(true);
    const run = c.assessmentRuns.find((r) => r.runId === incumbent.assessment?.runId)!;
    const dropLB = assembleEdition(c, editionReply({ featuredClaimIds: incumbent.featuredClaimIds.filter((id) => id !== run.caseAssessment.loadBearing[0]) }), ctx);
    expect(dropLB.errors.some((e) => /load-bearing claim .* is not featured/.test(e))).toBe(true);
  });

  it("a new assessment is stamped, hashed, and must carry a steelman and a treatment for every featured claim", () => {
    const c = geo();
    const incumbent = c.editions.at(-1)!;
    const run = c.assessmentRuns.find((r) => r.runId === incumbent.assessment?.runId)!;
    const treatments = run.claimAssessments.map((ca) => ({
      claimId: ca.claimId,
      verdict: ca.verdict,
      confidence: ca.confidence,
      reasoning: ca.reasoning,
      treatment: ca.treatment!,
    }));
    const reply = editionReply({
      assessment: {
        verdict: run.caseAssessment.verdict,
        loadBearing: run.caseAssessment.loadBearing,
        weakestLinks: run.caseAssessment.weakestLinks,
        synthesis: run.caseAssessment.synthesis,
        steelman: "The Egyptian negatives tested an alkali recipe; the calcium-silicate binder of GEO-E017 has never been tested on provenance-secure casing stone.",
        whatIsClaimed: run.caseAssessment.whatIsClaimed!,
        whereDisagreementLives: run.caseAssessment.whereDisagreementLives!,
        whatWouldSettleIt: run.caseAssessment.whatWouldSettleIt!,
        bestConventionalExplanation: run.caseAssessment.bestConventionalExplanation!,
        components: run.caseAssessment.components.map((k) => ({ label: k.label, state: k.state, note: k.note ?? null })),
        researchPriority: run.caseAssessment.researchPriority!,
        claimAssessments: treatments,
      },
    });
    const ok = assembleEdition(c, reply, ctx);
    expect(ok.errors).toEqual([]);
    expect(ok.assessment?.runId).toBe("2026-09-09-edition-120000");
    expect(ok.assessment?.basis?.ledgerHash).toBe(c.ledgerHash);
    expect(ok.edition.assessment?.runId).toBe("2026-09-09-edition-120000");
    const thin = assembleEdition(c, { ...reply, assessment: { ...reply.assessment!, steelman: "people disagree" } }, ctx);
    expect(thin.errors.some((e) => /steelman/.test(e))).toBe(true);
    const missing = assembleEdition(c, { ...reply, assessment: { ...reply.assessment!, claimAssessments: treatments.slice(1) } }, ctx);
    expect(missing.errors.some((e) => /carries no treatment/.test(e))).toBe(true);
  });
});

describe("the report verb", () => {
  it("dry-runs write the packet and instructions and send nothing; unchanged inputs rest", { timeout: 60_000 }, async () => {
    const root = tmpRoot();
    const now = () => new Date("2026-09-08T12:00:00Z");
    // Load the cases once; each run would otherwise reload all ten (slow on CI).
    const loaded = loadAllCases();
    const cases = () => loaded;
    let calls = 0;
    const research = async () => {
      calls++;
      return { text: "# Findings\n\nnothing", model: "fake", usage: { inputTokens: 1, outputTokens: 1 }, searches: 0, fetches: 0, citations: [], raw: [] };
    };
    const dry = await runReport("megalithic-casting", { seat: "openai", dryRun: true, root, deps: { now, cases } });
    expect(dry.outcome).toBe("dry-run");
    expect(fs.existsSync(path.join(root, "proposals", dry.runId, "packet.json"))).toBe(true);
    expect(calls).toBe(0);
    const first = await runReport("megalithic-casting", { seat: "openai", root, deps: { research, cases, now: () => new Date("2026-09-08T12:01:00Z") } });
    expect(first.outcome).toBe("completed");
    expect(calls).toBe(1);
    expect(fs.readFileSync(path.join(root, "proposals", first.runId, "report.md"), "utf8")).toMatch(/Unverified AI research report/);
    const again = await runReport("megalithic-casting", { seat: "openai", root, deps: { research, cases, now: () => new Date("2026-09-08T12:02:00Z") } });
    expect(again.outcome).toBe("rested");
    expect(calls).toBe(1);
    const other = await runReport("megalithic-casting", { seat: "anthropic", root, deps: { research, cases, now: () => new Date("2026-09-08T12:03:00Z") } });
    expect(other.outcome).toBe("completed"); // a different seat is a different input
    const forced = await runReport("megalithic-casting", { seat: "openai", reconsider: "the founder asked for a second pass", root, deps: { research, cases, now: () => new Date("2026-09-08T12:04:00Z") } });
    expect(forced.outcome).toBe("completed");
    expect(readRuns(root).map((r) => r.outcome)).toEqual(["dry-run", "completed", "rested", "completed", "completed"]);
  });
});

describe("verify v5: the reader's finding on direction and bearing is applied; a dissent without a direction is recorded, not fatal", () => {
  it("admits a record whose only fault is the direction label, with the dissent in its limitations when the reader names no direction", async () => {
    const { judgeProposal } = await import("../pipeline/verify.ts");
    const c = geo();
    const src = c.sources.find((s) => s.url)!;
    const proposal = {
      runId: "2026-09-08-draft-megalithic-casting-000001",
      case: c.record.slug,
      report: null,
      date: "2026-09-08",
      model: "m",
      promptVersion: "draft-v2",
      basis: { ledgerHash: c.ledgerHash },
      rationale: "test",
      adds: {
        sources: [],
        evidence: [
          {
            id: "GEO-E900",
            title: "A test record",
            sourceId: src.id,
            claimIds: [c.claims[0].id],
            direction: "qualifies",
            strength: "weak",
            sourceStatement: 'The page says "twelve words that certainly do occur in this text" here.',
            exactLocator: "p. 1",
            limitations: [],
            reviewState: "ai_extracted",
            origin: { ref: "test", extractedBy: "m", runId: "r", date: "2026-09-08" },
          },
        ],
        claims: [],
        research: [],
        images: [],
      },
      corrections: [],
      dispositions: [],
      edition: null,
    } as never;
    const texts = new Map([[src.url!, { url: src.url!, ok: true, status: 200, contentType: "text/html", text: "… twelve words that certainly do occur in this text …" }]]);
    const dissent = { quoteInContext: true, statementSupported: true, locatorSupported: true, directionRight: false, independenceNoted: true, relevant: true, reason: "it plainly supports the claim" };
    const v = await judgeProposal(proposal, c, texts, new Map(), async () => dissent, { runId: "r", verb: "verify", case: c.record.slug }, { model: "reader-x", date: "2026-09-08" });
    expect(v.accepted.evidence).toHaveLength(1);
    expect(v.accepted.evidence[0].limitations.at(-1)).toBe("Second reader (reader-x, 2026-09-08, run r, verify-v5) disputes the stated direction: it plainly supports the claim");
    expect(v.accepted.evidence[0].readerActs).toBeUndefined(); // a dissent changes nothing, so it is no act
    expect(v.rejected).toHaveLength(0);
    // Any other fault still gates.
    const bad = await judgeProposal(proposal, c, texts, new Map(), async () => ({ ...dissent, relevant: false }), { runId: "r", verb: "verify", case: c.record.slug });
    expect(bad.accepted.evidence).toHaveLength(0);
    expect(bad.rejected[0].reason).toMatch(/relevant/);
    // v5: a direction the reader names is written on the record, stamped as the reader's act (review note #248).
    const named = await judgeProposal(proposal, c, texts, new Map(), async () => ({ ...dissent, direction: "supports" }), { runId: "r", verb: "verify", case: c.record.slug }, { model: "reader-x", date: "2026-09-09" });
    expect(named.accepted.evidence[0].direction).toBe("supports");
    expect(named.accepted.evidence[0].limitations.at(-1)).toBe('Direction set to "supports" (from "qualifies") by the second reader (reader-x, 2026-09-09, run r, verify-v5) at intake: it plainly supports the claim');
    expect(named.notes).toContain("GEO-E900: direction set to supports by the second reader");
    // The change is stamped on the record as structured provenance: field, from, to, model, run, protocol, date, reason (review note #253).
    expect(named.accepted.evidence[0].readerActs).toEqual([{ field: "direction", from: "qualifies", to: "supports", model: "reader-x", runId: "r", promptVersion: "verify-v5", date: "2026-09-09", reason: "it plainly supports the claim" }]);
    // A named direction equal to the record's is no change and no note.
    const same = await judgeProposal(proposal, c, texts, new Map(), async () => ({ ...dissent, direction: "qualifies" }), { runId: "r", verb: "verify", case: c.record.slug }, { model: "reader-x", date: "2026-09-09" });
    expect(same.accepted.evidence[0].direction).toBe("qualifies");
    expect(same.accepted.evidence[0].limitations.at(-1)).toMatch(/^Second reader .* disputes the stated direction/);
  });

  it("keeps only the claims the reader finds the passage bears on, and refuses a record that bears on none", async () => {
    const { judgeProposal } = await import("../pipeline/verify.ts");
    const c = geo();
    const src = c.sources.find((s) => s.url)!;
    const [a, b] = [c.claims[0].id, c.claims[1].id];
    const proposal = {
      runId: "2026-09-09-draft-megalithic-casting-000002",
      case: c.record.slug,
      report: null,
      date: "2026-09-09",
      model: "m",
      promptVersion: "draft-v6",
      basis: { ledgerHash: c.ledgerHash },
      rationale: "test",
      adds: {
        sources: [],
        evidence: [
          {
            id: "GEO-E901",
            title: "A record naming two claims",
            sourceId: src.id,
            claimIds: [a, b],
            direction: "supports",
            strength: "weak",
            sourceStatement: 'The page says "twelve words that certainly do occur in this text" here.',
            exactLocator: "p. 1",
            limitations: [],
            reviewState: "ai_extracted",
            origin: { ref: "test", extractedBy: "m", runId: "r", date: "2026-09-09" },
          },
        ],
        claims: [],
        research: [],
        images: [],
      },
      corrections: [],
      dispositions: [],
      edition: null,
    } as never;
    const texts = new Map([[src.url!, { url: src.url!, ok: true, status: 200, contentType: "text/html", text: "… twelve words that certainly do occur in this text …" }]]);
    const fine = { quoteInContext: true, statementSupported: true, locatorSupported: true, directionRight: true, independenceNoted: true, relevant: true, atomic: true, reason: "bears on the second claim only" };
    const narrowed = await judgeProposal(proposal, c, texts, new Map(), async () => ({ ...fine, bearsOn: [b] }), { runId: "r", verb: "verify", case: c.record.slug }, { model: "reader-x", date: "2026-09-09" });
    expect(narrowed.accepted.evidence).toHaveLength(1);
    expect(narrowed.accepted.evidence[0].claimIds).toEqual([b]);
    expect(narrowed.accepted.evidence[0].limitations.at(-1)).toBe(`Second reader (reader-x, 2026-09-09, run r, verify-v5) found the passage bears on ${b} and not on ${a}; the link dropped at intake: bears on the second claim only`);
    expect(narrowed.notes).toContain(`GEO-E901: link to ${a} dropped by the second reader`);
    expect(narrowed.accepted.evidence[0].readerActs).toEqual([{ field: "claimIds", from: [a, b], to: [b], model: "reader-x", runId: "r", promptVersion: "verify-v5", date: "2026-09-09", reason: "bears on the second claim only" }]);
    // Null keeps every link; an unknown id in the list keeps only the known ones.
    const all = await judgeProposal(proposal, c, texts, new Map(), async () => ({ ...fine, bearsOn: null }), { runId: "r", verb: "verify", case: c.record.slug });
    expect(all.accepted.evidence[0].claimIds).toEqual([a, b]);
    // An empty list refuses the record with the reader's reason.
    const none = await judgeProposal(proposal, c, texts, new Map(), async () => ({ ...fine, bearsOn: [] }), { runId: "r", verb: "verify", case: c.record.slug });
    expect(none.accepted.evidence).toHaveLength(0);
    expect(none.rejected[0].reason).toMatch(/bears on none of the claims the record names: bears on the second claim only/);
  });
});

describe("reopening a blocked source", () => {
  // Cooperson's chapter: blocked in the case's rows (a login wall), and not in the ledger. The URL is rebuilt from the row's own key.
  const blockedRow = geo().dispositions.find((d) => d.disposition === "blocked" && d.kind === "source" && /Cooperson/i.test(`${d.observed} ${d.reason ?? ""}`) && d.key.startsWith("url:"))!;
  const nemoy = `https://${blockedRow.key.slice(4)}`;
  const reply = () =>
    draftReply({
      sources: [
        { provisionalId: "S1", url: nemoy, title: "Early Abbasid Antiquarianism: al-Maʾmūn and the Pyramid of Cheops", authors: ["Cooperson, M."], year: "2010", sourceType: "book", identifier: null, verification: "ai_verified", reliabilityNotes: [] },
      ],
      evidence: [],
      claims: [],
      research: [],
      corrections: [],
      dispositions: [],
      edition: null,
    });
  const ctx = (fetched: FetchedSource[]) => ({ loaded: geo(), reportRunId: "2026-09-08-report-megalithic-casting-100000", runId: "2026-09-09-draft-megalithic-casting-110000", model: "m", promptVersion: "draft-v2", date: "2026-09-09", fetched });

  it("a source blocked for want of its text goes forward once the text is retrieved", () => {
    // The case carries a `blocked` row for this URL from the first pass.
    expect(blockedRow).toBeDefined();
    const { proposal } = assembleProposal(reply(), ctx([{ url: nemoy, ok: true, status: 200, contentType: "text/html", text: "Early Abbasid Antiquarianism … the caliph's stay in Egypt in early 832 …" }]));
    expect(proposal.adds.sources).toHaveLength(1);
    expect(proposal.adds.sources[0].verification).toBe("ai_verified");
    expect(proposal.dispositions.filter((d) => d.kind === "source")).toHaveLength(0);
  });

  it("…and stays blocked while it is not", () => {
    const { proposal } = assembleProposal(reply(), ctx([{ url: nemoy, ok: false, status: 403, contentType: null, text: null, reason: "HTTP 403" }]));
    expect(proposal.adds.sources).toHaveLength(0);
    expect(proposal.dispositions[0].disposition).toBe("blocked");
    expect(proposal.dispositions[0].reason).toMatch(/previously blocked/);
  });
});

describe("dispositions may only point at records that exist", () => {
  it("a duplicate-of-nothing becomes failed, keeping the drafter's reason", () => {
    const c = geo();
    const { proposal, novelty } = assembleProposal(
      draftReply({
        sources: [], evidence: [], claims: [], research: [], corrections: [], edition: null,
        dispositions: [
          { kind: "claim", observed: "Mark the salt attribution unsourced", disposition: "duplicate", as: "GEO-E603", reason: "recorded as evidence GEO-E603", url: null, reopenIf: null, route: null },
          { kind: "research", observed: "Iwawe Stratum V", disposition: "duplicate", as: c.research[0].id, reason: "already an item", url: null, reopenIf: null, route: null },
        ],
      }),
      { loaded: c, reportRunId: "2026-09-08-report-megalithic-casting-100000", runId: "2026-09-09-draft-megalithic-casting-120000", model: "m", promptVersion: "draft-v2", date: "2026-09-09", fetched: [] },
    );
    const bad = proposal.dispositions.find((d) => d.observed.startsWith("Mark the salt"))!;
    expect(bad.disposition).toBe("failed");
    expect(bad.as).toBeUndefined();
    expect(bad.reason).toMatch(/named GEO-E603 .* does not hold/);
    const good = proposal.dispositions.find((d) => d.observed === "Iwawe Stratum V")!;
    expect(good.disposition).toBe("duplicate");
    expect(good.as).toBe(c.research[0].id);
    expect(novelty).toMatch(/is not a record/);
  });
});

describe("urls in a report", () => {
  it("keeps balanced parentheses inside a DOI and drops sentence punctuation", () => {
    const urls = urlsInReport("see (https://doi.org/10.1016/s0305-7372(96)90023-7) and https://x.test/a). Also https://y.test/b, then https://doi.org/10.1000/plain.");
    expect(urls).toEqual(["https://doi.org/10.1016/s0305-7372(96)90023-7", "https://x.test/a", "https://y.test/b", "https://doi.org/10.1000/plain"]);
  });
});

describe("verify: links to rejected claims", () => {
  it("an admitted claim loses a parent the reader rejected, and says so", async () => {
    const { judgeProposal } = await import("../pipeline/verify.ts");
    const c = geo();
    const src = c.sources.find((s) => s.url)!;
    const claim = (id: string, statement: string, parents: string[]) => ({
      id, statement, theme: Object.keys(c.record.themes)[0], rung: "observation", claimType: null, sourceAnchor: { sourceId: src.id, locator: "p. 1", quote: "twelve words that certainly do occur in this text" },
      parentClaimIds: parents, dependsOnClaimIds: [], reviewState: "ai_extracted", origin: { ref: "test", extractedBy: "m", runId: "r", date: "2026-09-08" },
    });
    const proposal = {
      runId: "2026-09-09-draft-megalithic-casting-000002", case: c.record.slug, report: null, date: "2026-09-09", model: "m", promptVersion: "draft-v4",
      basis: { ledgerHash: c.ledgerHash }, rationale: "test",
      adds: { sources: [], evidence: [], claims: [claim("GEO-C990", "A parent the reader will reject.", []), claim("GEO-C991", "A child whose parent falls.", ["GEO-C990"])], research: [], images: [] },
      corrections: [], dispositions: [], edition: null,
    } as never;
    const texts = new Map([[src.url!, { url: src.url!, ok: true, status: 200, contentType: "text/html", text: "… twelve words that certainly do occur in this text …" }]]);
    const yes = { quoteInContext: true, statementSupported: true, locatorSupported: true, directionRight: true, independenceNoted: true, relevant: true, reason: "fine" };
    let n = 0;
    const judge = async () => (n++ === 0 ? { ...yes, relevant: false, reason: "not this case" } : yes); // the first anchor judged (GEO-C990) is refused
    const v = await judgeProposal(proposal, c, texts, new Map(), judge, { runId: "r", verb: "verify", case: c.record.slug });
    expect(v.rejected.map((r) => r.id)).toEqual(["GEO-C990"]);
    expect(v.accepted.claims.map((k) => k.id)).toEqual(["GEO-C991"]);
    expect(v.accepted.claims[0].parentClaimIds).toEqual([]);
    expect(v.notes.some((x) => /GEO-C991: names GEO-C990 .* dropped/.test(x))).toBe(true);
  });
});

describe("verify v3: atomicity", () => {
  it("a compound claim is split by the drafter, each part judged on the same anchor, and evidence judged part by part", async () => {
    const { judgeProposal } = await import("../pipeline/verify.ts");
    const c = geo();
    const src = c.sources.find((s) => s.url)!;
    const compound = {
      id: "GEO-C990", statement: "Salt is halite and it re-forms within two years of cleaning.", theme: Object.keys(c.record.themes)[0], rung: "observation", claimType: null,
      sourceAnchor: { sourceId: src.id, locator: "p. 1", quote: "twelve words that certainly do occur in this text" },
      parentClaimIds: [], dependsOnClaimIds: [c.claims[0].id], alternativeToClaimIds: [], contradictsClaimIds: [], reviewState: "ai_extracted", origin: { ref: "test", extractedBy: "m", runId: "r", date: "2026-09-09" },
    };
    const evidence = {
      id: "GEO-E990", title: "cites the compound claim", sourceId: src.id, claimIds: ["GEO-C990"], direction: "supports", strength: "weak",
      sourceStatement: 'The page says "twelve words that certainly do occur in this text" here.', exactLocator: "p. 1", limitations: [], reviewState: "ai_extracted", origin: { ref: "test", extractedBy: "m", runId: "r", date: "2026-09-09" },
    };
    const proposal = { runId: "2026-09-09-draft-megalithic-casting-000003", case: c.record.slug, report: null, date: "2026-09-09", model: "m", promptVersion: "draft-v5", basis: { ledgerHash: c.ledgerHash }, rationale: "test",
      adds: { sources: [], evidence: [evidence], claims: [compound], research: [], images: [] }, corrections: [], dispositions: [], edition: null } as never;
    const texts = new Map([[src.url!, { url: src.url!, ok: true, status: 200, contentType: "text/html", text: "… twelve words that certainly do occur in this text …" }]]);
    const yes = { quoteInContext: true, statementSupported: true, locatorSupported: true, directionRight: true, independenceNoted: true, relevant: true, atomic: true, reason: "fine" };
    const judge = async (record: unknown, _text: string, context: string) => {
      if ((record as { statement?: string }).statement?.includes(" and ")) return { ...yes, atomic: false, reason: "two propositions" };
      // The evidence bears on the first part only; the reader says so when asked about the second.
      if (context.includes("judge whether the record bears on this one part") && context.includes("re-forms")) return { ...yes, relevant: false, reason: "about halite, not re-formation" };
      return yes;
    };
    const split = async (statement: string) => statement.split(" and ").map((s) => s.replace(/\.$/, "") + ".");
    const v = await judgeProposal(proposal, c, texts, new Map(), judge, { runId: "r", verb: "verify", case: c.record.slug }, { model: "reader", date: "2026-09-09" }, split, { model: "splitter", runId: "verify-run" });
    expect(v.rejected.map((r) => r.id)).toEqual(["GEO-C990"]);
    expect(v.rejected[0].reason).toMatch(/not atomic .* split into GEO-C\d+, GEO-C\d+/);
    expect(v.accepted.claims.map((k) => k.statement)).toEqual(["Salt is halite.", "it re-forms within two years of cleaning."]);
    expect(v.accepted.claims.every((k) => k.sourceAnchor?.quote === compound.sourceAnchor.quote)).toBe(true);
    // Each part's wording is the splitter's: its origin names the splitter and the verify run, and points back at the compound.
    expect(v.accepted.claims.map((k) => k.origin)).toEqual(v.accepted.claims.map(() => ({ ref: "split of GEO-C990 (test)", extractedBy: "splitter", runId: "verify-run", date: "2026-09-09" })));
    // The compound's dependency is the compound's: the parts start without it, and the dropping is said aloud.
    expect(v.accepted.claims.every((k) => k.dependsOnClaimIds.length === 0)).toBe(true);
    expect(v.notes.join("\n")).toMatch(new RegExp(`GEO-C990: its relations \\(dependsOn ${c.claims[0].id}\\) were not carried to its parts`));
    // The evidence cites only the part it bears on; the part it does not is said aloud.
    expect(v.accepted.evidence[0].claimIds).toEqual([v.accepted.claims[0].id]);
    expect(v.notes.join("\n")).toMatch(/GEO-E990 does not bear on GEO-C\d+ \(part of GEO-C990\): about halite/);
  });
});

describe("verify remembers its judgments", () => {
  it("an evidence record judged compound is split into one observation each, every part with its verbatim quote, and each part judged", async () => {
    const { judgeProposal } = await import("../pipeline/verify.ts");
    const c = geo();
    const src = c.sources.find((s) => s.url)!;
    const claim = c.claims[0];
    const compound = {
      id: "GEO-E990", title: "two findings in one record", sourceId: src.id, claimIds: [claim.id], direction: "supports", strength: "weak",
      sourceStatement: 'The page says "twelve words that certainly do occur in this text" and also "a second span that also occurs here" about the same site.', exactLocator: "p. 1", limitations: [], reviewState: "ai_extracted", origin: { ref: "test", extractedBy: "m", runId: "r", date: "2026-09-09" },
    };
    const proposal = { runId: "2026-09-09-draft-megalithic-casting-000004", case: c.record.slug, report: null, date: "2026-09-09", model: "m", promptVersion: "draft-v6", basis: { ledgerHash: c.ledgerHash }, rationale: "test",
      adds: { sources: [], evidence: [compound], claims: [], research: [], images: [] }, corrections: [], dispositions: [], edition: null } as never;
    const texts = new Map([[src.url!, { url: src.url!, ok: true, status: 200, contentType: "text/html", text: "… twelve words that certainly do occur in this text … a second span that also occurs here …" }]]);
    const yes = { quoteInContext: true, statementSupported: true, locatorSupported: true, directionRight: true, independenceNoted: true, relevant: true, atomic: true, reason: "fine" };
    const judge = async (record: unknown) => ((record as { sourceStatement?: string }).sourceStatement?.includes(" and also ") ? { ...yes, atomic: false, reason: "two findings" } : yes);
    const kinds: string[] = [];
    const split = async (statement: string, _t: string, _m: unknown, kind?: string) => {
      kinds.push(kind ?? "?");
      return ['The page says "twelve words that certainly do occur in this text".', 'It also says "a second span that also occurs here" about the same site.', "A part with no quote at all."];
    };
    const v = await judgeProposal(proposal, c, texts, new Map(), judge, { runId: "r", verb: "verify", case: c.record.slug }, { model: "reader", date: "2026-09-09" }, split, { model: "splitter", runId: "verify-run" });
    expect(kinds).toEqual(["evidence"]);
    expect(v.rejected.map((r) => r.id)).toEqual(["GEO-E990"]);
    expect(v.rejected[0].reason).toMatch(/not one observation .* split into GEO-E\d+, GEO-E\d+/);
    expect(v.accepted.evidence.map((e) => e.sourceStatement)).toEqual(['The page says "twelve words that certainly do occur in this text".', 'It also says "a second span that also occurs here" about the same site.']);
    expect(v.accepted.evidence.every((e) => e.claimIds[0] === claim.id && e.origin.ref === "split of GEO-E990 (test)" && e.origin.runId === "verify-run")).toBe(true);
    expect(v.accepted.evidence.map((e) => e.title)).toEqual(["two findings in one record — part 1", "two findings in one record — part 2"]);
    expect(v.notes.join("\n")).toMatch(/part "A part with no quote at all\." refused: no verbatim quote/);
  });

  it("a supplied document's Source is admitted only with the intake's permission line on it", async () => {
    const { judgeProposal } = await import("../pipeline/verify.ts");
    const c = geo();
    const base = c.sources.find((s) => s.url)!;
    const line = "Permission on which it is published: Permission in the supplier's words: \"publish and cite it\" — granted by Someone (own work) on 2026-09-09 in the inbox statement `essay.md`, recorded at intake on 2026-09-09, held at inbox/processed/run/essay.md.";
    const bare = { ...base, id: "GEO-S990", title: "A supplied essay, permission not carried", url: "https://example.org/supplied-bare", reliabilityNotes: [] };
    const carried = { ...base, id: "GEO-S991", title: "A supplied essay, permission carried", url: "https://example.org/supplied-carried", reliabilityNotes: [line] };
    const forged = { ...base, id: "GEO-S992", title: "A supplied essay, permission asserted by the drafter", url: "https://example.org/supplied-forged", reliabilityNotes: ["Permission on which it is published: Permission granted, trust me."] };
    const unrecorded = { ...base, id: "GEO-S993", title: "A supplied essay the intake recorded no permission for", url: "https://example.org/supplied-unrecorded", reliabilityNotes: [line] };
    const claim = c.claims[0];
    const cites = (id: string, sourceId: string) => ({
      id, title: `cites ${sourceId}`, sourceId, claimIds: [claim.id], direction: "supports", strength: "weak",
      sourceStatement: 'The essay says "twelve words that certainly do occur in this text" plainly.', exactLocator: "p. 1", limitations: [], reviewState: "ai_extracted", origin: { ref: "test", extractedBy: "m", runId: "r", date: "2026-09-09" },
    });
    const proposal = { runId: "2026-09-09-draft-megalithic-casting-000006", case: c.record.slug, report: null, date: "2026-09-09", model: "m", promptVersion: "draft-v6", basis: { ledgerHash: c.ledgerHash }, rationale: "test",
      adds: { sources: [bare, carried, forged, unrecorded], evidence: [cites("GEO-E990", bare.id), cites("GEO-E991", carried.id), cites("GEO-E992", forged.id), cites("GEO-E993", unrecorded.id)], claims: [], research: [], images: [] }, corrections: [], dispositions: [], edition: null } as never;
    const supplied = (name: string, permission?: string) => ({ ok: true as const, status: null, contentType: "text/plain", text: "… twelve words that certainly do occur in this text …", via: `supplied document ${name} (sha256 abc), identified at intake`, ...(permission ? { permission } : {}) });
    const texts = new Map([
      [bare.url, { url: bare.url, ...supplied("bare.pdf", line) }],
      [carried.url, { url: carried.url, ...supplied("carried.pdf", line) }],
      [forged.url, { url: forged.url, ...supplied("forged.pdf", line) }],
      [unrecorded.url, { url: unrecorded.url, ...supplied("unrecorded.pdf") }],
    ]);
    const yes = { quoteInContext: true, statementSupported: true, locatorSupported: true, directionRight: true, independenceNoted: true, relevant: true, atomic: true, reason: "fine" };
    const v = await judgeProposal(proposal, c, texts, new Map(), async () => yes, { runId: "r", verb: "verify", case: c.record.slug });
    expect(v.accepted.sources.map((s) => s.id)).toEqual(["GEO-S991"]);
    expect(v.accepted.evidence.map((e) => e.id)).toEqual(["GEO-E991"]);
    const why = Object.fromEntries(v.rejected.map((r) => [r.id, r.reason]));
    expect(why["GEO-S990"]).toMatch(/must carry, verbatim in reliabilityNotes, the permission line the intake recorded .* carries none/);
    expect(why["GEO-S992"]).toMatch(/must carry, verbatim .* carries a different line/); // a drafter's own assertion is not the intake's record
    expect(why["GEO-S993"]).toMatch(/the intake recorded no permission/);
    expect(why["GEO-E990"]).toMatch(/its source GEO-S990 was rejected/);
  });

  it("a document the intake recorded no permission for supplies no text, whether its Source is proposed or already on the ledger", async () => {
    const { suppliedTexts } = await import("../pipeline/verify.ts");
    const c = geo();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aletheia-supplied-"));
    const dir = path.join(root, "proposals", "2026-09-09-inbox-x-000000");
    fs.mkdirSync(path.join(dir, "documents"), { recursive: true });
    fs.writeFileSync(path.join(dir, "documents", "a.txt"), "text of a");
    fs.writeFileSync(path.join(dir, "documents", "b.txt"), "text of b");
    const a = c.sources[0];
    const b = c.sources[1];
    fs.writeFileSync(path.join(dir, "manifest.yaml"), [
      "items:",
      `  - name: x/a.pdf`, `    kind: document`, `    ledgerSource: ${a.id}`, `    document: documents/a.txt`, `    permission: "Permission on which it is published: Permission: the founder's standing direction …"`,
      `  - name: x/b.pdf`, `    kind: document`, `    ledgerSource: ${b.id}`, `    document: documents/b.txt`, `    permission: null`,
      `  - name: x/c.pdf`, `    kind: document`, `    ledgerSource: ${b.id}`, `    document: documents/b.txt`, // a manifest from before the field existed: no permission recorded, no text supplied
      "",
    ].join("\n"));
    const proposal = { report: "proposals/2026-09-09-inbox-x-000000/report.md" } as never;
    const texts = suppliedTexts(proposal, c.sources, root);
    const got = [...texts.values()];
    expect(got.map((t) => t.text)).toEqual(["text of a"]);
    expect(got[0].permission).toMatch(/^Permission on which it is published: Permission: the founder/);
  });

  it("a claim anchor may carry further passages, each verbatim, judged together; a passage the source lacks rejects the anchor", async () => {
    const { judgeProposal } = await import("../pipeline/verify.ts");
    const c = geo();
    const src = c.sources.find((s) => s.url)!;
    const mk = (id: string, also: { locator: string; quote: string }[]) => ({
      id, statement: "The contrast is drawn across two pages.", theme: Object.keys(c.record.themes)[0], rung: "observation", claimType: null,
      sourceAnchor: { sourceId: src.id, locator: "p. 1", quote: "twelve words that certainly do occur in this text", also },
      parentClaimIds: [], dependsOnClaimIds: [], alternativeToClaimIds: [], contradictsClaimIds: [], reviewState: "ai_extracted", origin: { ref: "test", extractedBy: "m", runId: "r", date: "2026-09-09" },
    });
    const good = mk("GEO-C990", [{ locator: "p. 2", quote: "a second span that also occurs here" }]);
    const badAlso = mk("GEO-C991", [{ locator: "p. 7", quote: "a passage the source never contains" }]);
    const proposal = { runId: "2026-09-09-draft-megalithic-casting-000005", case: c.record.slug, report: null, date: "2026-09-09", model: "m", promptVersion: "draft-v6", basis: { ledgerHash: c.ledgerHash }, rationale: "test",
      adds: { sources: [], evidence: [], claims: [good, badAlso], research: [], images: [] }, corrections: [], dispositions: [], edition: null } as never;
    const texts = new Map([[src.url!, { url: src.url!, ok: true, status: 200, contentType: "text/html", text: "… twelve words that certainly do occur in this text … a second span that also occurs here …" }]]);
    const seen: string[] = [];
    const judge = async (record: unknown, _t: string, context: string) => {
      seen.push(context);
      return { quoteInContext: true, statementSupported: true, locatorSupported: true, directionRight: true, independenceNoted: true, relevant: true, atomic: true, reason: `anchored with ${(record as { anchor?: { also?: unknown[] } }).anchor?.also?.length ?? 0} further passage(s)` };
    };
    const v = await judgeProposal(proposal, c, texts, new Map(), judge, { runId: "r", verb: "verify", case: c.record.slug });
    expect(v.accepted.claims.map((k) => k.id)).toEqual(["GEO-C990"]);
    expect(v.accepted.claims[0].sourceAnchor?.also).toEqual([{ locator: "p. 2", quote: "a second span that also occurs here" }]);
    expect(v.rejected).toEqual([expect.objectContaining({ id: "GEO-C991", reason: expect.stringMatching(/anchor quote not found verbatim/) })]);
    expect(seen[0]).toMatch(/^Case question: .*Does the anchored passages, taken together, support the proposition as stated\?$/);
  });

  it("asks the reader once per question and reuses the answer on a re-run", async () => {
    const { rememberedJudge, rememberedSplitter } = await import("../pipeline/verify.ts");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aletheia-judg-"));
    let asked = 0;
    const base = async () => (asked++, { quoteInContext: true, statementSupported: true, locatorSupported: true, directionRight: true, independenceNoted: true, relevant: true, atomic: true, reason: `answer ${asked}` });
    const meter = { runId: "r", verb: "verify" as const, case: "x" };
    const j1 = rememberedJudge(base, path.join(dir, "judgments.yaml"), "reader");
    const a = await j1({ id: "E1" }, "text", "ctx", meter);
    const b = await j1({ id: "E1" }, "text", "ctx", meter);
    await j1({ id: "E2" }, "text", "ctx", meter);
    expect(asked).toBe(2);
    expect(b).toEqual({ ...a, remembered: { runId: "r", date: expect.stringMatching(/^\d{4}-\d\d-\d\d$/) } }); // the reuse says which run answered
    // A fresh verifier over the same proposal directory does not ask again.
    const j2 = rememberedJudge(base, path.join(dir, "judgments.yaml"), "reader");
    expect((await j2({ id: "E1" }, "text", "ctx", meter)).reason).toBe("answer 1");
    expect(asked).toBe(2);
    // A different reader is a different question.
    await rememberedJudge(base, path.join(dir, "judgments.yaml"), "other")({ id: "E1" }, "text", "ctx", meter);
    expect(asked).toBe(3);
    let splits = 0;
    const s1 = rememberedSplitter(async (st) => (splits++, st.split(" and ")), path.join(dir, "splits.yaml"), "m");
    expect((await s1("a and b", "t", meter) as { parts: string[] }).parts).toEqual(["a", "b"]);
    // Reused, the parts carry the run that wrote them, not the run that reused them.
    const again = await s1("a and b", "t", { ...meter, runId: "later" }) as { parts: string[]; runId?: string };
    expect(again.parts).toEqual(["a", "b"]);
    expect(again.runId).toBe("r");
    expect(splits).toBe(1);
    // A remembered judgment says which run answered; a different protocol is a different question.
    expect((await j2({ id: "E1" }, "text", "ctx", { ...meter, runId: "later" })).remembered).toEqual({ runId: "r", date: expect.stringMatching(/^\d{4}-\d\d-\d\d$/) });
    await rememberedJudge(base, path.join(dir, "judgments.yaml"), "reader", "verify-v0")({ id: "E1" }, "text", "ctx", meter);
    expect(asked).toBe(4);
  });
});
