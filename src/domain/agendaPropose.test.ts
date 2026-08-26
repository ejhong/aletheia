import { describe, expect, it } from "vitest";
import {
  buildCasePacket,
  validateProposals,
  renderProposalFile,
} from "../../scripts/lib/agenda-propose.mjs";

const good = {
  kind: "study",
  title: "Independence map of the proxy literature",
  question:
    "Which published site studies share authors, labs, or datasets, coded into independence groups?",
  closestExisting: ["X-R005"],
  gap: "R005 asks for replication status but never codes overlap",
  wouldSettle: "a small independent core supports; a single-network web undermines",
  effortTier: "desk",
};

describe("agenda proposal validation (fail-closed)", () => {
  const known = new Set(["X-R005", "X-C001"]);

  it("accepts a well-formed proposal anchored to real IDs", () => {
    const { ok, rejected } = validateProposals({ proposals: [good] }, known);
    expect(ok).toHaveLength(1);
    expect(rejected).toHaveLength(0);
  });

  it("rejects dangling anchors, bad kinds, and missing fields — each with a reason", () => {
    const { ok, rejected } = validateProposals(
      {
        proposals: [
          { ...good, closestExisting: ["X-R999"] },
          { ...good, kind: "verdict" },
          { ...good, question: "too short" },
        ],
      },
      known,
    );
    expect(ok).toHaveLength(0);
    expect(rejected.map((r: { reason: string }) => r.reason)).toEqual([
      "dangling existing ID: X-R999",
      "bad kind: verdict",
      "missing question/truth condition",
    ]);
  });

  it("caps at three, drops duplicates, and survives a malformed reply", () => {
    const four = [good, { ...good, title: "Second distinct proposal title" }, good, good];
    const { ok, rejected } = validateProposals({ proposals: four }, known);
    expect(ok).toHaveLength(2);
    expect(rejected[0].reason).toBe("duplicate title");
    expect(validateProposals({ nonsense: true }, known).ok).toHaveLength(0);
  });

  it("packet and rendering carry the load-bearing text", () => {
    const packet = buildCasePacket({
      claims: [{ id: "X-C001", tier: "featured", statement: "s" }],
      research: [{ id: "X-R005", title: "t", summary: "sum", effortTier: "desk" }],
      studies: [{ id: "X-S001", title: "st", question: "q", findings: [{ statement: "f1" }] }],
      evidence: [{ id: "X-E001", direction: "supports", title: "ev" }],
    });
    for (const anchor of ["X-C001", "X-R005", "X-S001", "f1", "X-E001"]) {
      expect(packet).toContain(anchor);
    }
    const file = renderProposalFile("case-x", [good], {
      date: "2026-08-26",
      runId: "r",
      model: "m",
    });
    expect(file).toContain("PROPOSALS ONLY");
    expect(file).toContain("Independence map");
  });
});
