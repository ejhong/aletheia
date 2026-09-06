import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { stringify } from "yaml";
import {
  exactSourceMatch,
  extractArxivId,
  extractDoi,
  normalizeUrl,
  sourceKeys,
} from "../../scripts/lib/source-identity.mjs";
import {
  intakeContext,
  promotionCase,
  promotionWasHandled,
  readIntakeMemory,
} from "../../scripts/lib/intake-memory.mjs";
import { fingerprint } from "../../scripts/lib/review-state.mjs";
import { mergeLedger } from "../../scripts/triage-watch.mjs";

const scratch: string[] = [];
afterEach(() => {
  for (const dir of scratch.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aletheia-intake-"));
  scratch.push(root);
  const write = (file: string, value: unknown) => {
    const full = path.join(root, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, stringify(value));
  };
  return { root, write };
}

describe("shared source identity", () => {
  // Synthetic identifiers test syntax; they are not research citations.
  it("preserves a parenthesized DOI suffix and removes only surrounding punctuation", () => {
    expect(extractDoi("(10.1234/test(ABC)).")).toBe("10.1234/test(abc)");
    expect(
      extractDoi("https://doi.org/10.1234/test%28ABC%29?utm_source=mail"),
    ).toBe("10.1234/test(abc)");
    expect(extractDoi("10.1234/test(a.b)/version-2;")).toBe(
      "10.1234/test(a.b)/version-2",
    );
  });
  it("shares explicit DOI/arXiv aliases, including old arXiv identifiers", () => {
    expect(extractArxivId("https://arxiv.org/pdf/hep-th/9901001v3.pdf")).toBe(
      "hep-th/9901001",
    );
    expect(extractArxivId("arXiv:2605.01190v2")).toBe("2605.01190");
    const source = {
      id: "SRC-TEST",
      identifier: "doi:10.1234/TEST",
      url: "https://arxiv.org/abs/2605.01190v1",
    };
    expect(sourceKeys(source)).toContain("doi:10.1234/test");
    expect(
      exactSourceMatch({ url: "https://doi.org/10.1234/test" }, [source])
        ?.source.id,
    ).toBe(source.id);
    expect(
      exactSourceMatch({ arxivId: "2605.01190v2" }, [source])?.source.id,
    ).toBe(source.id);
  });
  it("does not collapse URL path case, significant queries, fragments, or different hosts", () => {
    const baseline = normalizeUrl("https://Example.org/Record?id=1#p4");
    expect(baseline).toBe("https://example.org/Record?id=1#p4");
    for (const other of [
      "https://example.org/record?id=1#p4",
      "https://example.org/Record?id=2#p4",
      "https://example.org/Record?id=1#p5",
      "https://www.example.org/Record?id=1#p4",
    ])
      expect(normalizeUrl(other)).not.toBe(baseline);
  });
  it("identical titles do not establish source identity", () => {
    const source = {
      id: "SRC-TEST",
      title: "A study of recurring symbols across cultures",
      doi: "10.1234/first",
    };
    expect(
      exactSourceMatch({ ...source, doi: "10.1234/second" }, [source]),
    ).toBeNull();
  });
});

describe("decisions in context", () => {
  const source = {
    id: "SRC-TEST",
    title: "A study of recurring symbols across cultures",
    url: "https://example.org/paper",
    identifier: "doi:10.1234/test",
  };
  const decision = {
    case: "alpha",
    source,
    stage: "promotion",
    decision: "failed",
    reason: "The supplied passage did not address the question.",
    date: "2026-09-01",
    inputHash: "old-inputs",
    candidateHash: fingerprint(source),
  };
  const memory = {
    sourcesByCase: { alpha: [source], beta: [] },
    decisions: [decision],
  };

  it("does not treat a known source as assessment of a new observation", () => {
    const result = intakeContext(
      {
        kind: "evidence",
        text: "A newly examined observation from another passage.",
        source,
      },
      "alpha",
      memory,
    );
    expect(result.kind).toBe("evidence");
    expect(result.sourceRecord?.id).toBe("SRC-TEST");
    expect(result.priorDecisions[0].reason).toBe(decision.reason);
    expect(result.note).toContain("do not establish");
    expect(result).not.toHaveProperty("alreadyConsidered");
  });
  it("keeps earlier rejection reasons beside a revised argument without requiring a newer paper", () => {
    const revised = {
      ...source,
      rationale: "A different control makes the same source useful.",
    };
    expect(
      intakeContext({ source: revised }, "alpha", memory).priorDecisions,
    ).toHaveLength(1);
    expect(promotionWasHandled(revised, "alpha", memory, "old-inputs")).toBe(
      false,
    );
    expect(promotionWasHandled(source, "alpha", memory, "changed-inputs")).toBe(
      false,
    );
    expect(promotionWasHandled(source, "alpha", memory, "old-inputs")).toBe(
      true,
    );
  });
  it("a decision in one case cannot suppress a candidate for another", () => {
    expect(intakeContext({ source }, "beta", memory).priorDecisions).toEqual(
      [],
    );
    expect(promotionWasHandled(source, "beta", memory, "old-inputs")).toBe(
      false,
    );
    const entry = {
      case: "alpha",
      key: "doi:10.1234/test",
      reason: "out of scope",
      date: "2026-09-01",
    };
    const { ledger } = mergeLedger({ items: [entry] }, [
      { ...entry, case: "beta" },
    ]);
    expect(ledger.items).toHaveLength(2);
  });
  it("keeps operational failures retryable when the case and candidate are unchanged", () => {
    const retry = { ...memory, decisions: [{ ...decision, retryable: true }] };
    expect(promotionWasHandled(source, "alpha", retry, "old-inputs")).toBe(
      false,
    );
  });
  it("records a changed reason or basis while an identical retry remains idempotent", () => {
    const entry = {
      case: "alpha",
      key: "doi:10.1234/test",
      reason: "out of scope",
      date: "2026-09-01",
    };
    const result = mergeLedger({ items: [entry] }, [
      entry,
      { ...entry, reason: "a different objection" },
      { ...entry, inputHash: "new-inputs" },
    ]);
    expect(result.added).toBe(2);
    expect(result.ledger.items[0]).toEqual(entry);
  });
  it("does not assign an ambiguous legacy promotion to an invented case", () => {
    expect(
      promotionCase({ of: source.id }, { alpha: [source], beta: [source] }),
    ).toBeNull();
    expect(promotionCase({ of: source.id }, { alpha: [source] })).toBe("alpha");
    const unknown = { ...memory, decisions: [{ ...decision, case: null }] };
    expect(
      intakeContext({ source }, "alpha", unknown).unscopedDecisions,
    ).toHaveLength(1);
    expect(promotionWasHandled(source, "alpha", unknown, "old-inputs")).toBe(
      false,
    );
  });
  it("keeps title similarity advisory when identifiers do not match", () => {
    const result = intakeContext(
      { source: { title: source.title, doi: "10.1234/second" } },
      "alpha",
      memory,
    );
    expect(result.sourceRecord).toBeNull();
    expect(result.possibleSourceRecord?.id).toBe(source.id);
    expect(result.priorDecisions[0].match).toBe("title only");
  });
  it("reads legacy records without backfilling review or input receipts", () => {
    const { root, write } = fixture();
    write("content/cases/alpha/sources.yaml", [source]);
    write("proposals/watch/archive-ledger.yaml", {
      items: [
        {
          key: "doi:10.1234/test",
          title: source.title,
          case: "alpha",
          date: "2026-09-01",
          reason: "out of scope",
        },
      ],
    });
    write("proposals/promotions-ledger.yaml", [
      {
        url: source.url,
        disposition: "duplicate",
        of: source.id,
        via: "title similarity",
      },
    ]);
    const loaded = readIntakeMemory(root);
    expect(loaded.decisions).toHaveLength(2);
    expect(
      loaded.decisions.every(
        (entry) => entry.inputHash === null && entry.model === null,
      ),
    ).toBe(true);
    expect(loaded.decisions[1].case).toBe("alpha");
    expect(loaded.decisions[1].caseBasis).toBe(
      "inferred from current source record",
    );
    expect(loaded.decisions[1].matchMethod).toBe("title similarity");
    expect(promotionWasHandled(source, "alpha", loaded, "new-inputs")).toBe(
      false,
    );
  });
  it("rejects malformed existing memory instead of pretending it is empty", () => {
    const { root, write } = fixture();
    write("content/cases/alpha/sources.yaml", []);
    write("proposals/promotions-ledger.yaml", { not: "a list" });
    expect(() => readIntakeMemory(root)).toThrow(/expected a list/);
    write("proposals/promotions-ledger.yaml", []);
    write("proposals/watch/archive-ledger.yaml", { not: "an archive" });
    expect(() => readIntakeMemory(root)).toThrow(/missing items list/);
  });
  it("exposes the live legacy history through a read-only command", () => {
    const output = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "scripts/intake-report.mjs",
          "--case",
          "transients",
          "--source",
          "https://arxiv.org/abs/2605.01190",
        ],
        { encoding: "utf8" },
      ),
    );
    expect(output.items).toHaveLength(1);
    expect(
      output.items[0].context.priorDecisions.some(
        (entry: { decision: string }) => entry.decision === "duplicate",
      ),
    ).toBe(true);
  });
});
