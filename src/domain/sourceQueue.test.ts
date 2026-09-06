import { testBudget } from "./fixtures/aiBudget";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { stringify } from "yaml";
import { afterEach, describe, expect, it, vi } from "vitest";
import { topicSeed } from "../../scripts/lib/topic-seed.mjs";
import { queueSources, sourceQueue } from "../../scripts/lib/source-queue";
import { researchSources } from "../../scripts/lib/source-research";
import { prepareResearchAdoptions } from "../../scripts/lib/research-adoption";
import { retrieveSource } from "../../scripts/lib/source-passages.mjs";
import { boundedCompletion, RESEARCH_MODELS } from "../../scripts/lib/bounded-model.mjs";
import { readIntakeDecisions } from "../../scripts/lib/intake-store.mjs";
import { loadCase } from "./load";
import { loadPromotionsLedger } from "./governance";

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true }));
});
const stamp = { runId: "synthetic-capture", generatedAt: "2026-09-06T12:00:00.000Z" };
const body = "These observations came from one shared sample. They are not independent replications. This is a synthetic test source, not a real publication.";
const draft = { outcome: "observation", reason: "Synthetic sample provenance.",
  source: { title: "Synthetic source", authors: [] },
  claim: "The synthetic observations came from one shared sample.", title: "A shared synthetic sample",
  sourceStatement: "The test source states that its observations share a sample.",
  quote: "These observations came from one shared sample.",
  inference: "The observations cannot count as independent replications.", limitations: ["One synthetic text."],
  direction: "context", strength: "weak", theme: "methods", themeLabel: "Methods",
  independenceNote: "One shared synthetic sample.", independenceGroup: "synthetic-sample" };
const review = { sourceMetadataSupported: true, claimSupported: true, sourceStatementSupported: true,
  inferenceSeparated: true, limitationsPreserved: true, independenceHandled: true,
  reason: "The sample dependence is preserved.", dependencyNote: "One shared sample." };

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aletheia-source-queue-test-"));
  roots.push(root);
  const addCase = (dir: string, slug: string, id: string) => {
    const folder = path.join(root, "content/cases", dir);
    fs.mkdirSync(folder, { recursive: true });
    for (const [file, value] of Object.entries(topicSeed({ id, slug, title: "Synthetic queue fixture",
      question: "Are these synthetic observations independent?", domain: "Tests only", date: "2026-09-06" })))
      fs.writeFileSync(path.join(folder, file), value);
    return folder;
  };
  const dir = addCase("folder", "synthetic", "TST-001");
  const queue = (url = "https://example.org/one", key = "synthetic", text = "Synthetic request") =>
    queueSources(root, { ...stamp, case: key, urls: [url], text, ref: "inbox/processed/fixture/links.md" });
  return { root, dir, addCase, queue };
}

function reader(overrides: { missing?: string; reject?: boolean; usageMissing?: boolean; noChange?: boolean } = {}) {
  let calls = 0;
  const packets: Array<{ model: string; input: string }> = [];
  const modelFetch: typeof fetch = async (_url, init) => {
    calls++;
    const request = JSON.parse(String(init?.body));
    packets.push(request);
    const value = request.model === RESEARCH_MODELS.draft.id
      ? overrides.noChange ? { outcome: "no_change", reason: "The synthetic source adds nothing useful." } : draft
      : { ...review, claimSupported: !overrides.reject };
    return new Response(JSON.stringify({ id: "synthetic-response", model: request.model,
      status: "completed", usage: overrides.usageMissing ? null : { input_tokens: 100, output_tokens: 50 },
      output: [{ content: [{ type: "output_text", text: JSON.stringify(value) }] }] }));
  };
  const options: Parameters<typeof researchSources>[2] = {
    retrieve: (url, options) => retrieveSource(url, { ...options, fetchImpl: async () =>
      url === overrides.missing ? new Response("unavailable", { status: 429 })
        : new Response(body, { headers: { "content-type": "text/plain" } }) }),
    complete: (budget, role, input) => boundedCompletion(budget, role, input, { allowance: testBudget(), apiKey: "synthetic-only", fetchImpl: modelFetch }),
  };
  return { options, calls: () => calls, packets };
}

describe("shared source queue", () => {
  it("captures inbox links without fetching, keeps their original, and resolves a public slug", () => {
    const { root, dir } = fixture();
    fs.mkdirSync(path.join(root, "inbox"));
    const input = "---\ncase: synthetic\ntype: links\n---\nhttps://example.org/one\n";
    fs.writeFileSync(path.join(root, "inbox/links.md"), input);
    const preload = path.join(root, "no-network.mjs");
    fs.writeFileSync(preload, "globalThis.fetch = () => { throw new Error('capture must not fetch'); };\n");
    execFileSync(process.execPath, ["--import", preload, path.resolve("scripts/process-inbox.mjs")],
      { cwd: root, env: { ...process.env, ANTHROPIC_API_KEY: "", OPENAI_API_KEY: "" }, stdio: "pipe" });
    const history = readIntakeDecisions(root);
    expect(history).toHaveLength(1);
    expect(history[0].stage).toBe("source-request");
    expect(history[0].source).toEqual({ url: "https://example.org/one" });
    expect(fs.readFileSync(path.join(root, history[0].ref!), "utf8")).toBe(input);
    expect(fs.existsSync(path.join(root, "inbox/links.md"))).toBe(false);
    expect(sourceQueue(root).requests[0].case).toBe("synthetic");
    expect(loadCase(dir).sources).toEqual([]);
  });

  it("rests an identical request but permits changed context or a changed ledger", () => {
    const { root, dir, queue } = fixture();
    expect(queue().queued).toBe(1);
    expect(queue().rested).toBe(1);
    expect(queue(undefined, "folder", "A different synthetic argument").queued).toBe(1);
    fs.appendFileSync(path.join(dir, "overview.md"), "\nSynthetic revised context.\n");
    expect(queue().queued).toBe(1);
    expect(readIntakeDecisions(root)).toHaveLength(3);
  });

  it("reads two different cases under one four-call budget and prepares complete validated bundles", async () => {
    const { root, dir, addCase, queue } = fixture();
    const second = addCase("second-folder", "second", "OTH-001");
    fs.writeFileSync(path.join(second, "history.yaml"), "# Synthetic empty history.\n[]\n");
    queue();
    queue("https://example.org/two", "second-folder");
    const mock = reader();
    const report = await researchSources(root, sourceQueue(root).requests, mock.options);
    expect(report.case).toBeNull();
    expect(report.proposedRecords).toBe(6);
    expect(report.budget.calls).toHaveLength(4);
    expect(report.budget.maxUsd).toBe(1);
    const packets = mock.packets.filter(packet => packet.model === RESEARCH_MODELS.draft.id);
    expect(packets.every(packet => packet.input.includes('"requestContext":"Synthetic request"'))).toBe(true);
    expect(loadCase(dir).claims).toEqual([]);
    expect(sourceQueue(root).requests).toEqual([]);
    const adoption = prepareResearchAdoptions(root, { ...stamp, runId: "synthetic-adoption" });
    expect(adoption.prepared).toBe(2);
    for (const folder of [dir, second]) {
      const loaded = loadCase(folder);
      expect(loaded.claims).toHaveLength(1);
      expect(loaded.evidence).toHaveLength(1);
      expect(loaded.sources).toHaveLength(1);
      expect(loaded.assessmentRuns).toEqual([]);
      expect(loaded.history.at(-1)?.actor).toContain(RESEARCH_MODELS.draft.id);
    }
    expect(fs.readFileSync(path.join(second, "history.yaml"), "utf8")).toContain("# Synthetic empty history.");
    vi.spyOn(process, "cwd").mockReturnValue(root);
    expect(loadPromotionsLedger().filter(entry => entry.disposition === "promoted")).toHaveLength(2);
    expect(prepareResearchAdoptions(root, { ...stamp, runId: "synthetic-repeat" }).prepared).toBe(0);
  });

  it("keeps a failed source retryable and does not lose the other checked bundle", async () => {
    const { root, dir, queue } = fixture();
    queue();
    queue("https://example.org/missing");
    const report = await researchSources(root, sourceQueue(root).requests, reader({ missing: "https://example.org/missing" }).options);
    expect(report.decision).toBe("partial");
    expect(report.proposedRecords).toBe(3);
    expect(sourceQueue(root).requests.map(r => r.url)).toEqual(["https://example.org/missing"]);
    expect(prepareResearchAdoptions(root, { ...stamp, runId: "synthetic-partial" }).prepared).toBe(1);
    expect(loadCase(dir).claims).toHaveLength(1);
  });

  it("rests a rejected reading or empty result without manufacturing evidence", async () => {
    for (const mode of [{ reject: true }, { noChange: true }]) {
      const { root, dir, queue } = fixture();
      queue();
      const report = await researchSources(root, sourceQueue(root).requests, reader(mode).options);
      expect(report.proposedRecords).toBe(0);
      expect(sourceQueue(root).requests).toEqual([]);
      expect(loadCase(dir).claims).toEqual([]);
    }
  });

  it("stops the whole pass on unknown usage, retains its reservation, and leaves both requests retryable", async () => {
    const { root, queue } = fixture();
    queue();
    queue("https://example.org/two");
    const mock = reader({ usageMissing: true });
    const report = await researchSources(root, sourceQueue(root).requests, mock.options);
    expect(mock.calls()).toBe(1);
    expect(report.budget.accountedUsd).toBe(0.327);
    expect(report.proposals).toEqual([]);
    expect(sourceQueue(root).requests).toHaveLength(2);
  });

  it("parks stale proposals and reopens their source request for a fresh reading", async () => {
    const { root, dir, queue } = fixture();
    queue();
    await researchSources(root, sourceQueue(root).requests, reader().options);
    fs.appendFileSync(path.join(dir, "overview.md"), "\nSynthetic change after the reading.\n");
    const adoption = prepareResearchAdoptions(root, { ...stamp, runId: "synthetic-stale" });
    expect(adoption.outcomes[0].decision).toBe("stale");
    expect(loadCase(dir).claims).toEqual([]);
    expect(sourceQueue(root).requests).toHaveLength(1);
    await researchSources(root, sourceQueue(root).requests, reader().options);
    expect(prepareResearchAdoptions(root, { ...stamp, runId: "synthetic-fresh" }).prepared).toBe(1);
  });

  it("restores the original ledger if installation is interrupted after a partial write", async () => {
    const { root, dir, queue } = fixture();
    queue();
    await researchSources(root, sourceQueue(root).requests, reader().options);
    const before = loadCase(dir).contentHash;
    const write = fs.writeFileSync;
    let failed = false;
    vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, options) => {
      if (!failed && String(file) === path.join(dir, "evidence.yaml")) {
        failed = true;
        write(file, "synthetic partial write");
        throw new Error("synthetic disk interruption");
      }
      return write(file, data, options);
    });
    const result = prepareResearchAdoptions(root, { ...stamp, runId: "synthetic-interruption" });
    expect(result.prepared).toBe(0);
    expect(result.outcomes[0].decision).toBe("invalid");
    expect(loadCase(dir).contentHash).toBe(before);
    expect(sourceQueue(root).requests).toHaveLength(1);
  });

  it("adapts old watch imports to the same reader without rewriting their files", async () => {
    const { root, dir } = fixture();
    const folder = path.join(root, "proposals/inbox/legacy");
    fs.mkdirSync(folder, { recursive: true });
    const file = path.join(folder, "sources-watch.yaml");
    const original = stringify({ kind: "source-proposals", case: "folder", date: "2026-09-01",
      sources: [{ url: "https://example.org/one", title: "Synthetic source" }] });
    fs.writeFileSync(file, original);
    const queue = sourceQueue(root);
    expect(queue.requests).toHaveLength(1);
    await researchSources(root, queue.requests, reader().options);
    prepareResearchAdoptions(root, { ...stamp, runId: "synthetic-legacy" });
    expect(loadCase(dir).claims).toHaveLength(1);
    expect(sourceQueue(root).requests).toEqual([]);
    expect(fs.readFileSync(file, "utf8")).toBe(original);
  });
});
