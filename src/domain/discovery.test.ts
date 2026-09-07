import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { topicSeed } from "../../scripts/lib/topic-seed.mjs";
import { AI_POLICY } from "../../scripts/lib/ai-policy.mjs";
import { discoverSources, discoveryStatus, resumeDiscoveryQueue, searchSources } from "../../scripts/lib/discovery";
import { readIntakeDecisions } from "../../scripts/lib/intake-store.mjs";
import { queueSources, sourceQueue } from "../../scripts/lib/source-queue";
import { DiscoveryRunSchema } from "./discovery";
import { loadCase } from "./load";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));
const now = () => "2026-09-07T12:00:00.000Z";
const policy = { ...AI_POLICY, discovery: { cases: ["synthetic"], intervalDays: 7, maxQueries: 2, maxLeads: 2 } };
const plan = { question: "Does the synthetic pattern distinguish its alternatives?", whyNow: "The empty fixture needs its first object record.",
  scope: "One synthetic object and a counterexample; no cross-cultural inference.",
  inclusion: "Institutional records with object identifiers and explicit chronology.",
  disconfirmers: "Simple marks in unrelated contexts would weaken a special connection.",
  queries: [{ query: "synthetic museum object mark", purpose: "primary", reason: "Find the original object record." },
    { query: "synthetic common mark chronology", purpose: "counterevidence", reason: "Look for an unrelated negative control." }] };
const selection = { leads: [{ index: 0, reason: "Read the original synthetic object description.",
  observationToCheck: "Check whether the object has a circular mark." }], reason: "One narrow reading is useful before any assessment." };
function output(url = "https://example.org/object") {
  return [{ type: "web_search_call", status: "completed", action: { type: "search", query: "synthetic",
    sources: [{ url, title: "Synthetic object record" }] } }];
}
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aletheia-discovery-")); roots.push(root);
  const dir = path.join(root, "content/cases/synthetic"); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(root, "AGENTS.md"), "Synthetic constitution: never fabricate evidence.");
  for (const [file, body] of Object.entries(topicSeed({ id: "TST-001", slug: "synthetic", title: "Synthetic topic",
    question: "Does this synthetic mark distinguish two explanations?", domain: "Tests only", date: "2026-09-06" })))
    fs.writeFileSync(path.join(dir, file), body);
  return { root, dir };
}
function worker(root: string, options: { selected?: unknown; planned?: unknown; failSearch?: boolean; stale?: boolean } = {}) {
  const respond = vi.fn(async (_system: string, _input: string, phase: "plan" | "search" | "select") => {
    if (phase === "search") {
      expect(readIntakeDecisions(root).some(e => e.discovery?.outcome === "planned")).toBe(true);
      if (options.failSearch) throw new Error("Synthetic HTTP 429; no search result");
      if (options.stale) fs.appendFileSync(path.join(root, "AGENTS.md"), " Changed rule.");
      return { model: "synthetic scout", responseId: "fixture-search", text: "Synthetic unverified search summary.", output: output() };
    }
    return { model: "synthetic author", responseId: "fixture-author",
      text: JSON.stringify(phase === "plan" ? options.planned ?? plan : options.selected ?? selection) };
  });
  return { respond, policy, now };
}

it("starts from an empty case, freezes scope before search, queues leads without fabricating evidence and then rests", async () => {
  const { root, dir } = fixture(); const deps = worker(root);
  const before = loadCase(dir).contentHash;
  const result = DiscoveryRunSchema.parse(await discoverSources(root, "synthetic", {}, deps));
  expect(result.outcome).toBe("queued"); expect(deps.respond).toHaveBeenCalledTimes(4);
  expect(result.sources).toHaveLength(1); // repeat across searches is one source, not extra novelty
  expect(sourceQueue(root).requests).toHaveLength(1);
  expect(sourceQueue(root).requests[0].context).toContain(selection.leads[0].observationToCheck);
  expect(loadCase(dir).contentHash).toBe(before);
  expect(loadCase(dir).claims).toEqual([]);
  expect(resumeDiscoveryQueue(root, result)).toBe(0);
  expect((await discoverSources(root, "synthetic", {}, deps)).outcome).toBe("rested");
  expect(deps.respond).toHaveBeenCalledTimes(4);
});

it("revisits on cadence or new external input, without its own queue producing a self-trigger", async () => {
  const { root } = fixture(); const deps = worker(root);
  await discoverSources(root, "synthetic", {}, deps);
  expect(discoveryStatus(root, "synthetic", "2026-09-08T12:00:00.000Z", undefined, policy).due).toBe(false);
  expect(discoveryStatus(root, "synthetic", "2026-09-14T12:00:00.000Z", undefined, policy).due).toBe(true);
  queueSources(root, { case: "synthetic", urls: ["https://example.org/new"], text: "A newly supplied alternative.",
    ref: "inbox/fixture", runId: "new-inbox", generatedAt: "2026-09-08T11:00:00.000Z" });
  expect(discoveryStatus(root, "synthetic", "2026-09-08T12:00:00.000Z", undefined, policy).due).toBe(true);
  expect(discoveryStatus(root, "synthetic", now(), "Test this narrowed synthetic variant.", policy).due).toBe(true);
});

it("accepts an empty plan or selection, records the reason and spends no search time on an empty plan", async () => {
  for (const emptyPlan of [true, false]) {
    const { root } = fixture(); const deps = worker(root, emptyPlan ? { planned: { ...plan, queries: [] } }
      : { selected: { leads: [], reason: "The returned synthetic source adds no useful observation." } });
    const result = await discoverSources(root, "synthetic", {}, deps);
    expect(result.outcome).toBe("no_change");
    expect(deps.respond).toHaveBeenCalledTimes(emptyPlan ? 1 : 4);
    expect(sourceQueue(root).requests).toHaveLength(0);
  }
});

it("preserves invalid replies, rejects invented and duplicate source indexes, and never queues a partial selection", async () => {
  for (const selected of [{ ...selection, leads: [...selection.leads, { ...selection.leads[0], index: 999 }] },
    { ...selection, leads: [...selection.leads, ...selection.leads] }]) {
    const { root } = fixture(); const result = DiscoveryRunSchema.parse(await discoverSources(root, "synthetic", {}, worker(root, { selected })));
    expect(result.outcome).toBe("failed"); expect(result.selected).toBeNull();
    expect(result.selection?.text).toContain(JSON.stringify(selected));
    expect(sourceQueue(root).requests).toHaveLength(0);
  }
  const { root } = fixture(); const deps = worker(root, { planned: { ...plan, queries: [plan.queries[0]] } });
  const result = await discoverSources(root, "synthetic", {}, deps);
  expect(result.outcome).toBe("failed"); expect(deps.respond).toHaveBeenCalledTimes(1);
});

it("does not accept URLs from prose, uncompleted actions or a fabricated replay", () => {
  expect(searchSources([...output(), { type: "message", content: [{ type: "output_text", text: "https://example.org/invented" }] }]))
    .toEqual([{ url: "https://example.org/object", title: "Synthetic object record" }]);
  expect(() => searchSources([{ type: "web_search_call", status: "failed" }])).toThrow(/completed/);
  expect(() => searchSources([...output(), ...output()])).toThrow(/one completed/);
});

it("records a failed search and stops without repeated calls or a false saturation result", async () => {
  const { root } = fixture(); const deps = worker(root, { failSearch: true });
  const result = DiscoveryRunSchema.parse(await discoverSources(root, "synthetic", {}, deps));
  expect(result.outcome).toBe("failed"); expect(result.searches).toHaveLength(1);
  expect(deps.respond).toHaveBeenCalledTimes(2);
  expect(result.searches[0].error).toContain("429");
  expect(sourceQueue(root).requests).toEqual([]);
});

it("stops when inputs change during research and leaves the ledger and queue untouched", async () => {
  const { root } = fixture(); const deps = worker(root, { stale: true });
  const result = await discoverSources(root, "synthetic", {}, deps);
  expect(result.outcome).toBe("stale"); expect(deps.respond).toHaveBeenCalledTimes(2);
  expect(sourceQueue(root).requests).toEqual([]);
});
