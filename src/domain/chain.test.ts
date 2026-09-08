import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getCaseBySlug, loadAllCases } from "./load.ts";
import { assertWithinBudget, BudgetExceeded, estimateUsd, tokensFromChars } from "../pipeline/budget.ts";
import { assembleProposal, urlsInReport, type DraftReply } from "../pipeline/draft.ts";
import { assembleEdition, type EditionReply } from "../pipeline/edition.ts";
import { stripHtml } from "../pipeline/fetch.ts";
import { quoteOccurs, quotedSpans, unverifiedQuotes } from "../pipeline/quotes.ts";
import { runReport } from "../pipeline/report.ts";
import { recordSpend } from "../pipeline/spend.ts";
import { readRuns } from "../pipeline/store.ts";
import { judgeProposal, type VerifyReply } from "../pipeline/verify.ts";
import type { FetchedSource } from "../pipeline/fetch.ts";

const tmpRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aletheia-chain-"));
  fs.mkdirSync(path.join(root, "config"));
  fs.copyFileSync(path.join(process.cwd(), "config", "budget.yaml"), path.join(root, "config", "budget.yaml"));
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
  });

  it("refuses a call that would pass the per-run, per-day, or per-month cap, and says which", () => {
    const root = tmpRoot();
    expect(assertWithinBudget(5, { runId: "r1", verb: "report", root, today: "2026-09-08" })).toBe(5);
    recordSpend({ date: "2026-09-08", runId: "r1", verb: "report", case: "x", model: "m", calls: 1, inputTokens: 1, outputTokens: 1, usd: 18 }, root);
    expect(() => assertWithinBudget(5, { runId: "r1", verb: "report", root, today: "2026-09-08" })).toThrow(/per-run cap/);
    expect(assertWithinBudget(5, { runId: "r2", verb: "report", root, today: "2026-09-08" })).toBe(5);
    recordSpend({ date: "2026-09-08", runId: "r2", verb: "report", case: "x", model: "m", calls: 1, inputTokens: 1, outputTokens: 1, usd: 30 }, root);
    expect(() => assertWithinBudget(5, { runId: "r3", verb: "report", root, today: "2026-09-08" })).toThrow(/per-day cap/);
    expect(assertWithinBudget(5, { runId: "r3", verb: "report", root, today: "2026-09-09" })).toBe(5);
    for (let i = 0; i < 6; i++) {
      recordSpend({ date: `2026-09-1${i}`, runId: `m${i}`, verb: "report", case: "x", model: "m", calls: 1, inputTokens: 1, outputTokens: 1, usd: 19 }, root);
    }
    expect(() => assertWithinBudget(5, { runId: "r9", verb: "report", root, today: "2026-09-20" })).toThrow(/per-month cap/);
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
    return { rationale: "a test edition that re-adopts the incumbent's judgment", featuredClaimIds: ed.featuredClaimIds, cruxOrder: ed.cruxOrder, article: ed.article, assessment: null, ...over };
  };
  const ctx = { model: "claude-opus-5", promptVersion: "edition-v1", now: new Date("2026-09-09T12:00:00Z"), root: process.cwd() };

  it("a candidate that changes only prose re-adopts the incumbent's assessment and passes the loader's rules", () => {
    const c = geo();
    const { edition, assessment, errors } = assembleEdition(c, editionReply({ article: c.editions.at(-1)!.article + "\n\nA closing paragraph the panel can judge." }), ctx);
    expect(errors).toEqual([]);
    expect(assessment).toBeNull();
    expect(edition.assessment?.runId).toBe(c.editions.at(-1)!.assessment?.runId);
    expect(edition.previous).toBe(c.editions.at(-1)!.runId);
    expect(edition.basis.ledgerHash).toBe(c.ledgerHash);
  });

  it("dropping a plate, featuring an unknown claim, or unfeaturing a load-bearing claim is refused", () => {
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

describe("verify v2: the reader's dissent on direction is recorded, not fatal", () => {
  it("admits a record whose only fault is the direction label, with the dissent in its limitations", async () => {
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
    expect(v.accepted.evidence[0].limitations.at(-1)).toBe("Second reader (reader-x, 2026-09-08) disputes the stated direction: it plainly supports the claim");
    expect(v.rejected).toHaveLength(0);
    // Any other fault still gates.
    const bad = await judgeProposal(proposal, c, texts, new Map(), async () => ({ ...dissent, relevant: false }), { runId: "r", verb: "verify", case: c.record.slug });
    expect(bad.accepted.evidence).toHaveLength(0);
    expect(bad.rejected[0].reason).toMatch(/relevant/);
  });
});
