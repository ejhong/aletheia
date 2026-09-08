import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getCaseBySlug, loadAllCases } from "./load.ts";
import { buildPacket, PACKET_MAX_CHARS, renderPacket } from "../pipeline/packet.ts";
import { loadProtocol, renderProtocol } from "../pipeline/protocols.ts";
import { loadTariffs, priceOf, readSpend, recordSpend, sumCost } from "../pipeline/spend.ts";
import { appendDispositions, newRunId, readProposal, readRuns, writeProposal, writeRun } from "../pipeline/store.ts";

const tmpRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), "aletheia-"));

describe("protocols", () => {
  it("every verb has a committed protocol whose preface is not sent", () => {
    for (const name of ["report", "draft", "verify", "edition", "check", "panel"]) {
      const p = loadProtocol(name);
      expect(p.version).toMatch(new RegExp(`^${name}-v\\d+$`));
      expect(p.text.startsWith("#")).toBe(false);
      expect(p.text.length).toBeGreaterThan(400);
    }
  });

  it("placeholders are filled, and an unfilled one is an error rather than literal braces", () => {
    const check = loadProtocol("check");
    expect(() => renderProtocol(check, { title: "T" })).toThrow(/unfilled placeholders/);
    const text = renderProtocol(check, {
      title: "T",
      today: "2026-09-08",
      promptVersion: check.version,
      verdicts: "a | b",
      featuredCount: 2,
      featuredIds: "X-C001, X-C002",
    });
    expect(text).toContain('"T"');
    expect(text).not.toMatch(/\{\{/);
    expect(loadProtocol("panel").text).toContain("{{today}}");
  });
});

describe("the packet", () => {
  it("is an index, not the ledger: ids and one line each, with the edition and inputs unless blind", () => {
    const geo = getCaseBySlug("megalithic-casting");
    const full = buildPacket(geo);
    expect(full.index.sources.length).toBe(geo.sources.length);
    expect(full.index.claims.find((c) => c.id === "GEO-C001")?.verdict).toBeTruthy();
    expect(full.edition?.featured.length).toBe(14);
    expect(full.inputs?.length).toBeGreaterThan(0);
    expect(full.ledgerHash).toBe(geo.ledgerHash);
    const blind = buildPacket(geo, { blind: true });
    expect(blind.edition).toBeUndefined();
    expect(blind.inputs).toBeUndefined();
    expect(blind.declined).toBeUndefined();
    expect(blind.index.claims.every((c) => c.verdict === null)).toBe(true);
    // The selection stays: a blind judge grades the featured claims and is told which they are.
    expect(blind.index.claims.some((c) => c.featured)).toBe(true);
  });

  it("renders within the bound for every live case, and refuses to truncate", () => {
    for (const c of loadAllCases()) expect(renderPacket(buildPacket(c)).length).toBeLessThan(PACKET_MAX_CHARS);
    expect(() => renderPacket(buildPacket(getCaseBySlug("megalithic-casting")), 1000)).toThrow(/nothing was sent/);
  });
});

describe("the intake store", () => {
  it("writes and reads proposals and runs under proposals/<runId>/, and appends dispositions", () => {
    const root = tmpRoot();
    fs.mkdirSync(path.join(root, "content", "cases", "x"), { recursive: true });
    const runId = newRunId("draft", "x", new Date("2026-09-08T12:00:00Z"));
    expect(runId).toBe("2026-09-08-draft-x-120000");
    writeProposal(
      {
        runId,
        date: "2026-09-08",
        case: "x",
        producer: "draft",
        model: "m",
        promptVersion: "draft-v1",
        basis: { ledgerHash: "a".repeat(64) },
        rationale: "a test proposal, long enough",
        adds: { sources: [], evidence: [], claims: [], research: [], images: [] },
        corrections: [],
        dispositions: [],
      },
      root,
    );
    writeRun(
      {
        runId,
        verb: "draft",
        case: "x",
        date: "2026-09-08",
        model: "m",
        promptVersion: "draft-v1",
        inputHash: null,
        outcome: "completed",
        cost: { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0 },
      },
      root,
    );
    expect(readProposal(runId, root)?.case).toBe("x");
    expect(readRuns(root).map((r) => r.runId)).toEqual([runId]);
    const rows = [
      { key: "doi:10.1234/a", kind: "source" as const, disposition: "irrelevant" as const, reason: "off topic", observed: "A paper", by: runId, date: "2026-09-08" },
    ];
    expect(appendDispositions("x", rows, root)).toBe(1);
    expect(appendDispositions("x", rows, root)).toBe(1);
    const file = fs.readFileSync(path.join(root, "content", "cases", "x", "dispositions.yaml"), "utf8");
    expect(file.startsWith("#")).toBe(true); // the header comment survives the second append
    expect(file.match(/key: doi:10.1234\/a/g)).toHaveLength(2);
  });
});

describe("the spend ledger", () => {
  it("the committed tariffs parse, and every priced row names its source and date", () => {
    const t = loadTariffs();
    for (const [id, row] of Object.entries(t.models)) {
      if (row.inputPerMTok !== null) {
        expect(row.source, id).toMatch(/^https:\/\//);
        expect(row.checked, id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
    expect(t.models["claude-opus-5"].inputPerMTok).toBe(5);
    expect(t.tools["anthropic:web_search"].perCallUsd).toBe(0.01);
  });

  it("records tokens always and dollars only from a reviewed tariff", () => {
    const root = tmpRoot();
    expect(priceOf("unknown-model", { inputTokens: 1000, outputTokens: 1000 }, { models: {}, tools: {} })).toBeNull();
    expect(
      priceOf("m", { inputTokens: 1_000_000, outputTokens: 500_000 }, { models: { m: { inputPerMTok: 2, outputPerMTok: 8, source: "x", checked: "2026-09-08" } }, tools: {} }),
    ).toBe(6);
    recordSpend({ date: "2026-09-08", runId: "r", verb: "report", case: "x", model: "m", calls: 1, inputTokens: 10, outputTokens: 20, usd: null }, root);
    recordSpend({ date: "2026-09-08", runId: "r", verb: "report", case: "x", model: "m", calls: 1, inputTokens: 5, outputTokens: 5, usd: 0.01 }, root);
    const rows = readSpend(root);
    expect(rows).toHaveLength(2);
    const cost = sumCost(rows);
    expect(cost.calls).toBe(2);
    expect(cost.inputTokens).toBe(15);
    expect(cost.usd).toBeNull(); // one unpriced call makes the total honest: unknown
    expect(sumCost([rows[1]]).usd).toBe(0.01);
  });
});
