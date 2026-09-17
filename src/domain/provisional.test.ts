import { describe, expect, it } from "vitest";
import { getCaseBySlug } from "./load.ts";
import { assembleProposal, type DraftReply } from "../pipeline/draft.ts";
import type { FetchedSource } from "../pipeline/fetch.ts";
import { judgeProposal, metadataMatches, sourceExists, type VerifyReply } from "../pipeline/verify.ts";

/** Provisional admission (founder direction, 2026-09-17): a record whose source exists but whose text could not be
 *  read enters unread and labelled, carrying no weight; a record whose source cannot be shown to exist stays blocked;
 *  nothing the second reader would have judged is skipped — it is never asked, because there is no text. */

const DOI = "10.1038/s40494-026-02315-y";
const URL = `https://doi.org/${DOI}`;
const reply = (): DraftReply => ({
  rationale: "a fixture draft with one unreadable source",
  sources: [
    { provisionalId: "S1", url: URL, title: "Sodium carbonate treatment of granite: an experimental study", authors: ["Yi, X."], year: "2026", sourceType: "paper", identifier: `npj Heritage Science 14: 315. DOI: ${DOI}`, verification: "ai_verified", reliabilityNotes: ["Peer-reviewed; single laboratory."] },
  ],
  evidence: [
    { provisionalId: "E1", title: "Molten sodium carbonate fragments granite after five blows", claimRefs: ["C1"], sourceRef: "S1", direction: "supports", strength: "moderate", sourceStatement: 'The authors report that "only five blows with a wooden handle fragmented the specimen" after treatment.', editorInference: null, exactLocator: "Results, para. 3", limitations: [] },
  ],
  claims: [
    { provisionalId: "C1", statement: "Molten sodium carbonate at 900 °C disintegrates granite specimens within fifteen minutes.", theme: "replication", rung: "observation", claimType: "measurement", sourceAnchor: { sourceRef: "S1", locator: "Results", quote: "completely disintegrated the granite" }, parentClaimRefs: [], dependsOnClaimRefs: [], alternativeToRefs: [], contradictsRefs: [] },
  ],
  research: [],
  corrections: [],
  dispositions: [],
  edition: null,
});
const ctx = () => {
  const c = getCaseBySlug("megalithic-casting");
  const { proposal } = assembleProposal(reply(), { loaded: c, reportRunId: "rep", runId: "2026-09-17-draft-megalithic-casting-100000", model: "m", promptVersion: "draft-v8", date: "2026-09-17", fetched: [] });
  const meter = { runId: "2026-09-17-verify-megalithic-casting-100100", verb: "verify" as const, case: c.record.slug };
  let judged = 0;
  const judge = async (): Promise<VerifyReply> => (judged++, { quoteInContext: true, statementSupported: true, locatorSupported: true, directionRight: true, independenceNoted: true, relevant: true, reason: "holds" });
  return { c, proposal, meter, judge, judged: () => judged };
};
const TITLE = "Sodium carbonate treatment of granite: an experimental study";
const unread = (status: number | null, reason: string, pageTitle?: string): FetchedSource => ({ url: URL, ok: false, status, contentType: status ? "application/pdf" : null, text: null, reason, ...(pageTitle ? { pageTitle } : {}) });

describe("sourceExists", () => {
  const src = { id: "SRC-X", title: TITLE, identifier: `DOI: ${DOI}`, sourceType: "paper" as const, verification: "unverified" as const, authors: [], reliabilityNotes: [], background: false } as never;
  it("is an identifier whose resolved metadata names the record's title, or a URL that answered with a document so titled — never a bare status or a bare registration", () => {
    const named = new Map([[`doi:${DOI}`, { status: "resolves", note: `Crossref: "Sodium Carbonate Treatment of Granite: An Experimental Study", 2026` }]]);
    expect(sourceExists(src, { status: 429, reason: "HTTP 429" }, named)).toMatch(/^doi 10\.1038.* resolves to a record with this title/);
    const bare = new Map([[`doi:${DOI}`, { status: "resolves", note: "registered at doi.org (not in Crossref)" }]]);
    expect(sourceExists(src, { status: 429, reason: "HTTP 429" }, bare)).toBeNull();
    const other = new Map([[`doi:${DOI}`, { status: "resolves", note: `Crossref: "A completely different paper about glass", 2019` }]]);
    expect(sourceExists(src, { status: 429, reason: "HTTP 429" }, other)).toBeNull();
    expect(sourceExists(src, { status: 200, reason: "PDF has no extractable text (12 pages)", pageTitle: TITLE }, new Map())).toMatch(/URL answered HTTP 200 with a document titled/);
    expect(sourceExists(src, { status: 200, reason: "PDF has no extractable text (12 pages)" }, new Map())).toBeNull();
    expect(sourceExists(src, { status: 200, reason: "paywall served with HTTP 200", pageTitle: "Log in | Publisher" }, new Map())).toBeNull();
    expect(sourceExists(src, { status: 403, reason: "HTTP 403", pageTitle: TITLE }, new Map())).toBeNull();
    expect(sourceExists(src, { status: null, reason: "fetch failed: ECONNRESET" }, new Map())).toBeNull();
    expect(sourceExists(src, { status: 403, reason: "HTTP 403" }, new Map([[`doi:${DOI}`, { status: "fails", note: "doi.org HTTP 404" }]]))).toBeNull();
    expect(sourceExists(undefined, { status: 200, reason: "x", pageTitle: TITLE }, new Map())).toBeNull();
  });
  it("metadataMatches: the whole normalised title, or four of every five of its words", () => {
    expect(metadataMatches(TITLE, `Crossref: "${TITLE.toUpperCase()}", 2026`)).toBe(true);
    expect(metadataMatches(TITLE, "Sodium carbonate treatment of granite — experimental study (Yi 2026)")).toBe(true);
    expect(metadataMatches(TITLE, "Natron as a flux in early glass")).toBe(false);
    expect(metadataMatches("Short", "Short")).toBe(false);
  });
});

describe("provisional admission", () => {
  it("a scanned PDF with no text: the source, its evidence and its claim enter provisionally, unread, and the reader is never asked", async () => {
    const { c, proposal, meter, judge, judged } = ctx();
    const texts = new Map<string, FetchedSource>([[URL, unread(200, "PDF has no extractable text (12 pages; scanned images need OCR)", TITLE)]]);
    const v = await judgeProposal(proposal, c, texts, new Map(), judge, meter);
    const [e] = proposal.adds.evidence;
    const [k] = proposal.adds.claims;
    expect(v.provisional.evidence.map((x) => x.id)).toEqual([e.id]);
    expect(v.provisional.claims.map((x) => x.id)).toEqual([k.id]);
    expect(v.provisional.sources.map((x) => x.id)).toEqual(["SRC-YI-2026"]);
    const pe = v.provisional.evidence[0];
    expect(pe.reviewState).toBe("provisional");
    expect(pe.provisional).toMatchObject({ since: expect.any(String), exists: expect.stringMatching(/URL answered HTTP 200 with a document titled/), reason: expect.stringMatching(/no extractable text/), route: expect.stringMatching(/re-run verify/), by: meter.runId });
    expect(v.provisional.claims[0].reviewState).toBe("provisional");
    expect(v.provisional.sources[0].verification).toBe("unverified");
    expect(v.accepted.evidence).toEqual([]);
    expect(v.accepted.claims).toEqual([]);
    expect(v.accepted.sources).toEqual([]);
    expect(v.rejected.map((r) => r.id)).not.toContain(e.id);
    expect(judged()).toBe(0);
  });
  it("a 429 with a resolving DOI enters on the identifier; a 403 with nothing resolving stays blocked as before", async () => {
    const { c, proposal, meter, judge } = ctx();
    const resolves = new Map([[`doi:${DOI}`, { status: "resolves", note: `Crossref: "${TITLE}", 2026` }]]);
    const onId = await judgeProposal(proposal, c, new Map([[URL, unread(429, "HTTP 429")]]), resolves, judge, meter);
    expect(onId.provisional.sources.map((s) => s.id)).toEqual(["SRC-YI-2026"]);
    expect(onId.provisional.sources[0].provisional?.exists).toMatch(/resolves to a record with this title/);
    const { c: c2, proposal: p2 } = ctx();
    const blocked = await judgeProposal(p2, c2, new Map([[URL, unread(403, "HTTP 403")]]), new Map(), judge, meter);
    expect(blocked.provisional.evidence).toEqual([]);
    expect(blocked.provisional.claims).toEqual([]);
    expect(blocked.provisional.sources).toEqual([]);
    const ev = blocked.rejected.find((r) => r.kind === "evidence");
    expect(ev?.disposition).toBe("blocked");
    expect(ev?.route).toMatch(/re-run verify/);
    expect(blocked.rejected.find((r) => r.kind === "claim")?.disposition).toBe("blocked");
    expect(blocked.rejected.find((r) => r.kind === "source")?.reason).toMatch(/nothing accepted cites it/);
  });
});
