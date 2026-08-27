import { describe, expect, it } from "vitest";
import { parseProposalFile } from "./agendaProposals";
import { renderProposalFile } from "../../scripts/lib/agenda-propose.mjs";

const proposal = {
  kind: "study",
  title: "A frozen-criteria table of something checkable",
  question:
    "For each qualifying record, what does the primary document state, under criteria frozen before collection?",
  closestExisting: ["X-R001", "X-C002"],
  gap: "R001 requests the records; nothing tabulates what is already published",
  wouldSettle: "a consistent table supports X; a staggered one unanchors it",
  effortTier: "desk",
};

describe("proposal file roundtrip (generator → site parser)", () => {
  it("parses everything renderProposalFile emits", () => {
    const text = renderProposalFile("case-x", [proposal], {
      date: "2026-08-27",
      runId: "2026-08-27-agenda-1",
      model: "test-model",
      promptVersion: "agenda-propose-v1",
    });
    const parsed = parseProposalFile("case-x", text);
    expect(parsed.skippedBlocks).toBe(0);
    expect(parsed.date).toBe("2026-08-27");
    expect(parsed.runId).toBe("2026-08-27-agenda-1");
    expect(parsed.model).toBe("test-model");
    expect(parsed.promptVersion).toBe("agenda-propose-v1");
    expect(parsed.proposals).toHaveLength(1);
    expect(parsed.proposals[0]).toMatchObject({
      kind: "study",
      title: proposal.title,
      closestExisting: ["X-R001", "X-C002"],
      effortTier: "desk",
    });
  });

  it("skips malformed blocks without inventing fields or breaking", () => {
    const text = renderProposalFile("case-x", [proposal], {
      date: "2026-08-27",
      runId: "r",
      model: "m",
      promptVersion: "v",
    });
    const mangled = text + "\n## 2. not a proposal header at all\n\njunk\n";
    const parsed = parseProposalFile("case-x", mangled);
    expect(parsed.proposals).toHaveLength(1);
    expect(parsed.skippedBlocks).toBe(1);
  });
});
