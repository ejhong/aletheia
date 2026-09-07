import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { topicSeed } from "../../scripts/lib/topic-seed.mjs";
import { caseResearchInput, researchCase } from "../../scripts/lib/case-research";
import { readIntakeDecisions } from "../../scripts/lib/intake-store.mjs";
import { queueSources } from "../../scripts/lib/source-queue";
import { loadCase } from "./load";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aletheia-case-research-")); roots.push(root);
  const dir = path.join(root, "content/cases/synthetic"); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(root, "AGENTS.md"), "Synthetic constitution: never fabricate evidence.");
  for (const [file, body] of Object.entries(topicSeed({ id: "TST-001", slug: "synthetic", title: "Synthetic topic",
    question: "Does the synthetic mark distinguish two explanations?", domain: "Tests only", date: "2026-09-06" })))
    fs.writeFileSync(path.join(dir, file), body);
  return { root, dir };
}
const reply = { model: "synthetic researcher", responseId: "synthetic-response", text: "Synthetic unverified report.",
  output: [], usage: {}, citations: [{ type: "url_citation", url: "https://example.org/source", title: "Synthetic source" }] };

it("records the question and memory before browsing, saves a report without altering the case, and rests unchanged work", async () => {
  const { root, dir } = fixture();
  const before = loadCase(dir).contentHash;
  const respond = vi.fn(async (_instructions: string, input: string) => {
    expect(readIntakeDecisions(root).find(e => e.decision === "partial")?.details?.request).toBeDefined();
    const packet = JSON.parse(input);
    expect(packet.ledger.claims).toEqual([]);
    expect(packet.case.whatIsClaimed).toContain("synthetic mark");
    return reply;
  });
  expect((await researchCase(root, "synthetic", {}, { respond })).outcome).toBe("completed");
  expect(loadCase(dir).contentHash).toBe(before);
  expect((await researchCase(root, "synthetic", {}, { respond })).outcome).toBe("rested");
  expect(respond).toHaveBeenCalledTimes(1);
  const state = caseResearchInput(root, "synthetic");
  expect(state.packet.previousReport).toMatchObject({ text: reply.text, verification: "unverified working report", citations: reply.citations });
  expect(state.packet.memory).toHaveLength(2);
});

it("new inbox context can reopen research, and earlier reports remain in the packet as unverified memory", async () => {
  const { root } = fixture();
  await researchCase(root, "synthetic", {}, { respond: async () => reply });
  const before = caseResearchInput(root, "synthetic").basis;
  queueSources(root, { case: "synthetic", urls: ["https://example.org/new-reading"], ref: "Synthetic inbox",
    text: "Investigate this synthetic competing account.", runId: "fixture-inbox", generatedAt: "2026-09-07T12:00:00.000Z" });
  const state = caseResearchInput(root, "synthetic");
  expect(state.basis).not.toBe(before);
  expect(state.packet.memory.some(e => e.requestedReading === "Investigate this synthetic competing account.")).toBe(true);
  expect(state.packet.previousReport).toMatchObject({ text: reply.text, verification: "unverified working report" });
});

it("preserves failure without automatic repayment; explicit reconsideration must give a reason", async () => {
  const { root } = fixture();
  const respond = vi.fn(async () => { throw new Error("Synthetic transport interruption"); });
  expect((await researchCase(root, "synthetic", {}, { respond })).outcome).toBe("failed");
  expect((await researchCase(root, "synthetic", {}, { respond })).outcome).toBe("rested");
  expect(respond).toHaveBeenCalledTimes(1);
  await expect(researchCase(root, "synthetic", { reconsider: "again" }, { respond })).rejects.toThrow(/reason/);
  expect(readIntakeDecisions(root).some(e => e.reason === "Synthetic transport interruption")).toBe(true);
});
