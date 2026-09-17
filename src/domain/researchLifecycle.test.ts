import { describe, expect, it } from "vitest";
import { getCaseBySlug } from "./load.ts";
import { ResearchOpportunitySchema, researchStatus } from "./schema.ts";
import { assembleProposal, type DraftReply } from "../pipeline/draft.ts";
import { researchStatusChanges } from "../pipeline/edition.ts";
import type { FetchedSource } from "../pipeline/fetch.ts";
import { judgeProposal, type PlanReply, type VerifyReply } from "../pipeline/verify.ts";

/** The research agenda has a lifecycle (2026-09-17): items are open until settled, the edition verb settles them with a
 *  note, and verify admits an item only when the reader finds a plan — a measurement, an object, a decision rule. */

describe("a research item's status", () => {
  it("is open unless the file says otherwise", () => {
    const item = ResearchOpportunitySchema.parse({ id: "X-R001", title: "t", summary: "s", claimIds: ["X-C001"], track: "either", effortTier: "desk", informationGain: "g" });
    expect(item.status).toBeUndefined(); // absent in the file reads as open, and keeps the record's canonical form
    expect(researchStatus(item)).toBe("open");
    expect(ResearchOpportunitySchema.parse({ id: "X-R001", title: "t", summary: "s", claimIds: ["X-C001"], track: "either", effortTier: "desk", informationGain: "g", status: "answered", statusNote: "study S-1 collected" }).status).toBe("answered");
  });
});

describe("researchStatusChanges", () => {
  const c = getCaseBySlug("megalithic-casting");
  it("keeps the changes that name a real item with a note, and reports the rest", () => {
    const [a, b] = c.research;
    const { changes, errors } = researchStatusChanges(c, [
      { id: a.id, status: "answered", note: `study collected; see ${b.id}` },
      { id: b.id, status: "open", note: "" },
      { id: "GEO-R999", status: "retired", note: "gone" },
      { id: a.id, status: "retired", note: "again" },
      { id: c.research[2].id, status: "superseded", note: "" },
    ]);
    expect(changes).toEqual([{ id: a.id, from: "open", to: "answered", note: `study collected; see ${b.id}` }]);
    expect(errors).toHaveLength(3);
    expect(errors[0]).toMatch(/GEO-R999/);
    expect(errors[1]).toMatch(/twice/);
    expect(errors[2]).toMatch(/note/);
  });
});

describe("verify's plan gate", () => {
  const DOI = "10.1038/s40494-026-02315-y";
  const URL = `https://doi.org/${DOI}`;
  const text = "Methods. Results: after treatment, only five blows with a wooden handle fragmented the specimen. In the second run the salt completely disintegrated the granite within fifteen minutes.";
  const reply = (): DraftReply => ({
    rationale: "a fixture draft with one research item",
    sources: [{ provisionalId: "S1", url: URL, title: "Sodium carbonate treatment of granite: an experimental study", authors: ["Yi, X."], year: "2026", sourceType: "paper", identifier: `DOI: ${DOI}`, verification: "ai_verified", reliabilityNotes: [] }],
    evidence: [{ provisionalId: "E1", title: "Molten sodium carbonate fragments granite after five blows", claimRefs: ["C1"], sourceRef: "S1", direction: "supports", strength: "moderate", sourceStatement: 'The authors report that "only five blows with a wooden handle fragmented the specimen" after treatment.', editorInference: null, exactLocator: "Results", limitations: [] }],
    claims: [{ provisionalId: "C1", statement: "Molten sodium carbonate at 900 °C disintegrates granite specimens within fifteen minutes.", theme: "replication", rung: "observation", claimType: "measurement", sourceAnchor: { sourceRef: "S1", locator: "Results", quote: "completely disintegrated the granite" }, parentClaimRefs: [], dependsOnClaimRefs: [], alternativeToRefs: [], contradictsRefs: [] }],
    research: [{ provisionalId: "R1", title: "Replicate the molten natron test on Aswan granite", summary: "Repeat the protocol on monument-matched granite with blinded controls.", claimRefs: ["C1"], track: "small_grant", effortTier: "lab", informationGain: "A direct test on the relevant rock." }],
    corrections: [], dispositions: [], edition: null,
  });
  const yes: VerifyReply = { quoteInContext: true, statementSupported: true, locatorSupported: true, directionRight: true, independenceNoted: true, relevant: true, reason: "holds" };
  const setup = () => {
    const c = getCaseBySlug("megalithic-casting");
    const { proposal } = assembleProposal(reply(), { loaded: c, reportRunId: "rep", runId: "2026-09-17-draft-megalithic-casting-100000", model: "m", promptVersion: "draft-v9", date: "2026-09-17", fetched: [] });
    const texts = new Map<string, FetchedSource>([[URL, { url: URL, ok: true, status: 200, contentType: "text/html", text }]]);
    const resolved = new Map([[`doi:${DOI}`, { status: "resolves", note: `Crossref: "Sodium carbonate treatment of granite: an experimental study", 2026` }]]);
    const meter = { runId: "2026-09-17-verify-megalithic-casting-100100", verb: "verify" as const, case: c.record.slug };
    return { c, proposal, texts, resolved, meter };
  };
  it("refuses an item the reader finds is not a plan, with what is missing; admits one that is; ungated calls admit as before", async () => {
    const { c, proposal, texts, resolved, meter } = setup();
    const notPlan: PlanReply = { isPlan: false, measurement: true, object: false, decisionRule: false, novel: true, reason: "It names no specimens and no result that would move the claim." };
    const seen: string[] = [];
    const refused = await judgeProposal(proposal, c, texts, resolved, async () => yes, meter, { model: "reader", date: "2026-09-17" }, undefined, undefined, { judgePlan: async (item, context) => (seen.push(context), notPlan) });
    expect(refused.accepted.research).toEqual([]);
    const r = refused.rejected.find((x) => x.kind === "research");
    expect(r?.disposition).toBe("failed");
    expect(r?.reason).toMatch(/^not a plan \(no object, no decision rule\): It names no specimens/);
    expect(seen[0]).toMatch(/Claims the item would move: .*Molten sodium carbonate/);
    expect(seen[0]).toMatch(/Research items the ledger already holds: GEO-R001/);
    const { c: c2, proposal: p2 } = setup();
    const admitted = await judgeProposal(p2, c2, texts, resolved, async () => yes, meter, { model: "reader", date: "2026-09-17" }, undefined, undefined, { judgePlan: async () => ({ ...notPlan, isPlan: true, object: true, decisionRule: true, novel: false, reason: "the same as GEO-R001" }) });
    expect(admitted.accepted.research).toHaveLength(1);
    expect(admitted.notes.some((n) => /same test as an item the ledger already holds/.test(n))).toBe(true);
    const { c: c3, proposal: p3 } = setup();
    const ungated = await judgeProposal(p3, c3, texts, resolved, async () => yes, meter);
    expect(ungated.accepted.research).toHaveLength(1);
  });
});
