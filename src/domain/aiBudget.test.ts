import { afterEach, describe, expect, it, vi } from "vitest";
import { createBudget, githubBudgetStore, sharedBudget } from "../../scripts/lib/ai-budget.mjs";
import { AI_POLICY, BudgetStopped, PolicySchema, tariff, tokenCost } from "../../scripts/lib/ai-policy.mjs";
import { countResponseInput, meteredFetch, reserveModel, usageReceipt } from "../../scripts/lib/metered-model.mjs";
import { openaiResponse } from "../../scripts/lib/openai-response.mjs";
import { anthropicStreamReceipt, meterOperator, operatorRequest } from "../../scripts/lib/operator-meter.mjs";
import { memoryBudgetStore, testBudget } from "./fixtures/aiBudget";
import fs from "node:fs";

afterEach(() => vi.unstubAllEnvs());
const month = "2026-09";
const now = () => `${month}-06T23:59:00.000Z`;
const policy = { ...AI_POLICY, monthlyUsd: 10, dailyUsd: 10, reviewReserveUsd: 2 };
const request = { model: "gpt-6-astra", workload: "drafting", amount: 4_000_000 };

describe("one shared AI allowance", () => {
  it("applies a pause and changed limits between requests from the same worker", async () => {
    let live = { ...policy };
    const budget = sharedBudget({ ...memoryBudgetStore(), async policy() { return live; } });
    const admitted = await budget.reserve(request);
    live = { ...live, enabled: false };
    await expect(budget.reserve({ ...request, amount: 1 })).rejects.toThrow(/allowance/);
    await budget.settle(admitted, 123);
    live = { ...live, enabled: true, dailyUsd: 1 };
    await expect(budget.reserve(request)).rejects.toThrow(/allowance/);
    await budget.reserve({ ...request, amount: 100 });
    expect((await budget.status()).totals.month).toBe(223);
  });
  it("changes live controls without a model call or a publication PR, preserving review policy", async () => {
    const config = JSON.parse(fs.readFileSync("config/ai.json", "utf8"));
    let allowance = { ...config.initialBudget }; let sha = 1;
    const writes: string[] = [];
    const response = (value: unknown) => Response.json({ sha: String(sha), encoding: "base64", content: Buffer.from(JSON.stringify(value)).toString("base64") });
    const store = githubBudgetStore({ token: "fixture-only", fetchImpl: async (url, init) => {
      const endpoint = String(url);
      if (endpoint.includes("/contents/config/ai.json?ref=main")) return response(config);
      if (!endpoint.includes("/contents/allowance.json")) throw new Error("unexpected control request");
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body));
        expect(body.sha).toBe(String(sha));
        allowance = JSON.parse(Buffer.from(body.content, "base64").toString()); sha++; writes.push(endpoint);
        return Response.json({});
      }
      return response(allowance);
    } });
    await store.configure({ enabled: false });
    expect((await store.policy()).enabled).toBe(false);
    await store.configure({ enabled: true, monthlyUsd: 200 });
    expect(await store.policy()).toMatchObject({ enabled: true, monthlyUsd: 200, main: config.main });
    expect(writes).toHaveLength(2);
    await expect(store.configure({ monthlyUsd: 1 })).rejects.toThrow(/review reserve/);
    await expect(store.configure({ model: "unreviewed" })).rejects.toThrow();
    expect(writes).toHaveLength(2);
  });
  it("does not use the initial bootstrap after published policy has been deleted", async () => {
    const store = githubBudgetStore({ token: "fixture-only", fetchImpl: async url => {
      const endpoint = String(url);
      if (endpoint.includes("/config/ai.json")) return new Response("", { status: 404 });
      if (endpoint.includes("/bootstrap-policy.json")) return Response.json({ encoding: "base64", content: Buffer.from(JSON.stringify({ baseSha: "old", policy: AI_POLICY })).toString("base64") });
      if (endpoint.includes("/commits?")) return Response.json([{ sha: "published-policy" }]);
      throw new Error("unexpected bootstrap fallback");
    } });
    await expect(store.policy()).rejects.toThrow(/No approved/);
  });
  it("does not admit simultaneous jobs beyond the allowance; keeps room for review", async () => {
    const store = memoryBudgetStore();
    const a = createBudget(store, { policy, now });
    const b = createBudget(store, { policy, now });
    const outcomes = await Promise.allSettled([a.reserve(request), b.reserve(request), a.reserve(request)]);
    expect(outcomes.filter(o => o.status === "fulfilled")).toHaveLength(2);
    await expect(b.reserve({ ...request, amount: 1 })).rejects.toBeInstanceOf(BudgetStopped);
    await b.reserve({ ...request, workload: "review", amount: 2_000_000 });
    expect((await a.status()).totals.month).toBe(10_000_000);
    await expect(b.reserve({ ...request, workload: "review", amount: 1 })).rejects.toThrow(/allowance/);
  });
  it("releases unused liability exactly once and rejects conflicting receipts", async () => {
    const budget = createBudget(memoryBudgetStore(), { now });
    const ticket = await budget.reserve(request);
    expect((await budget.status()).totals.held).toBe(4_000_000);
    await budget.settle(ticket, 123, { output: 10 });
    await budget.settle(ticket, 123, { output: 10 });
    expect((await budget.status()).totals).toMatchObject({ held: 0, month: 123 });
    await expect(budget.settle(ticket, 124, {})).rejects.toThrow(/Conflicting/);
    await expect(budget.settle(ticket, -1)).rejects.toThrow(/invalid/);
  });
  it("resolves a lost write acknowledgement without double admission", async () => {
    const store = memoryBudgetStore(); let lose = true;
    const budget = createBudget({ read: store.read, async write(m: string, sha: string | null, value: unknown) {
      const result = await store.write(m, sha, value);
      if (lose) { lose = false; return false; } return result;
    } }, { now });
    await budget.reserve(request);
    expect((await budget.status()).entries).toHaveLength(1);
  });
  it("does not expire unknown charges and settles in the admission month across midnight", async () => {
    let date = now();
    const budget = createBudget(memoryBudgetStore(), { policy: { ...policy, dailyUsd: 4 }, now: () => date });
    const old = await budget.reserve(request);
    await expect(budget.reserve({ ...request, amount: 1 })).rejects.toThrow(/allowance/);
    date = "2026-09-07T00:01:00.000Z";
    expect((await budget.status()).totals).toMatchObject({ day: 0, held: 4_000_000 });
    date = "2026-10-01T00:01:00.000Z";
    await budget.settle(old, 1200);
    expect((await budget.status(month)).totals.month).toBe(1200);
    expect((await budget.status()).totals.month).toBe(0);
  });
  it("fails closed on missing access, corrupt state, paused policy and unknown models", async () => {
    expect(() => githubBudgetStore({ token: "" })).toThrow(/access/);
    expect(() => tariff("new-unpriced-model")).toThrow(/tariff/);
    const paused = createBudget(memoryBudgetStore(), { now, policy: { ...policy, enabled: false } });
    await expect(paused.reserve(request)).rejects.toThrow(/allowance/);
    const corrupt = createBudget({ read: async () => ({ sha: "bad", value: {} }), write: vi.fn() });
    await expect(corrupt.reserve(request)).rejects.toThrow();
    expect(() => PolicySchema.parse({ ...AI_POLICY, dailyUsd: -1 })).toThrow();
  });
  it("uses GitHub's file SHA on writes and treats conflicts as an instruction to re-read", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const store = githubBudgetStore({ token: "fixture-key", fetchImpl: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
      if (init?.method === "GET") return Response.json({ sha: "v1", encoding: "base64", content: Buffer.from('{"version":1}').toString("base64") });
      return new Response("", { status: 409 });
    } });
    expect(await store.read(month)).toEqual({ sha: "v1", value: { version: 1 } });
    expect(await store.write(month, "v1", { entries: [] })).toBe(false);
    expect(calls[1].body).toMatchObject({ sha: "v1", branch: "automation-budget" });
    expect(JSON.stringify(calls)).not.toContain("fixture-key");
  });
});

describe("metered vendor requests", () => {
  it("bounds hosted search in the actual request and reserves search content, tool fees and case attribution before sending", async () => {
    const budget = testBudget();
    const model = AI_POLICY.sourceDraft;
    let requestBody: Record<string, unknown> = {};
    await openaiResponse("Synthetic source discovery", "One synthetic query", { model, search: true,
      maxOutputTokens: 4000, workload: "research", budget, apiKey: "fixture-only",
      context: { case: "synthetic", runId: "synthetic-discovery", phase: "search" },
      fetchImpl: async (_url, init) => {
        requestBody = JSON.parse(String(init?.body));
        const status = await budget.status();
        expect(status.totals.held).toBe(628000); // 2 x 400k input, 4k output, one $0.01 tool call
        expect(status.entries[0].terms).toMatchObject({ case: "synthetic", operationRun: "synthetic-discovery", webSearchLimit: 1 });
        return Response.json({ model, id: "synthetic-search", status: "completed",
          usage: { input_tokens: 500000, output_tokens: 100 },
          output: [{ type: "web_search_call", status: "completed", action: { type: "search", sources: [] } }] });
      } });
    expect(requestBody).toMatchObject({ max_tool_calls: 1, parallel_tool_calls: false, tool_choice: "required",
      tools: [{ type: "web_search", search_context_size: "low" }], store: false });
    const status = await budget.status();
    expect(status.totals).toMatchObject({ held: 0, month: 385450 });
    expect(status.entries[0].receipt).toMatchObject({ webSearchCalls: 1, webSearchMicroUsd: 10000 });
  });
  it("cannot fund an unapproved search tariff and retains liability for unknown or excessive tool use", async () => {
    const old = { ...AI_POLICY, webSearch: undefined };
    const budget = createBudget(memoryBudgetStore(), { policy: old });
    const fetchImpl = vi.fn();
    await expect(openaiResponse("Synthetic", "Synthetic", { model: AI_POLICY.sourceDraft,
      search: true, maxOutputTokens: 4000, budget, apiKey: "fixture", fetchImpl })).rejects.toThrow(/tariff/);
    expect(fetchImpl).not.toHaveBeenCalled();
    for (const output of [undefined, [{ type: "web_search_call", status: "failed" }],
      [{ type: "code_interpreter_call", status: "completed" }],
      Array.from({ length: 2 }, () => ({ type: "web_search_call", status: "completed" }))]) {
      const current = testBudget();
      const reservation = await reserveModel({ model: AI_POLICY.sourceDraft, workload: "research",
        outputLimit: 4000, webSearchCalls: 1, budget: current });
      await expect(reservation.settle({ model: AI_POLICY.sourceDraft,
        usage: { input_tokens: 1000, output_tokens: 100 }, output })).rejects.toThrow(/tools|usage/);
      expect((await current.status()).totals.held).toBe(628000);
    }
  });
  it("covers cache creation and long-context premiums, including reasoning output", () => {
    const rate = tariff("gpt-6-astra");
    expect(tokenCost(rate, 1000, 100)).toBe(15000);
    expect(tokenCost(rate, 300000, 100, { reserve: true })).toBe(7_507_500);
    expect(usageReceipt("gemini", { usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 80 } })).toEqual({ input: 100, output: 100, cacheWrite: 0 });
    expect(usageReceipt("anthropic", { usage: { input_tokens: 100, cache_read_input_tokens: 20, cache_creation_input_tokens: 30, output_tokens: 10 } })).toEqual({ input: 150, output: 10, cacheWrite: 30 });
  });
  it("reserves before sending, settles returned usage, and leaves failed attempts held", async () => {
    const budget = testBudget();
    const options = { model: "gpt-5.4-mini-2026-03-17", workload: "research", outputLimit: 6000, budget };
    const fetchImpl = vi.fn(async () => {
      expect((await budget.status()).totals.held).toBe(327000);
      return Response.json({ model: options.model, usage: { input_tokens: 100, output_tokens: 50 } });
    });
    await meteredFetch("https://fixture.invalid", {}, { ...options, fetchImpl });
    expect((await budget.status()).totals.month).toBe(300);
    await meteredFetch("https://fixture.invalid", {}, { ...options, fetchImpl: async () => new Response("", { status: 503 }) });
    expect((await budget.status()).totals).toMatchObject({ held: 327000, month: 327300 });
    await expect(meteredFetch("https://fixture.invalid", {}, { ...options, fetchImpl: async () => Response.json({ model: options.model }) })).rejects.toThrow(/usage/);
    expect((await budget.status()).totals.held).toBe(654000);
  });
  it("never makes a paid request if the shared reservation is refused", async () => {
    const budget = createBudget(memoryBudgetStore(), { policy: { ...policy, enabled: false } });
    const fetchImpl = vi.fn();
    await expect(meteredFetch("https://fixture.invalid", {}, { model: "gpt-6-astra", workload: "drafting", outputLimit: 1000, budget, fetchImpl })).rejects.toThrow(/allowance/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("verifies response identity and usage limits before releasing money", async () => {
    const budget = testBudget();
    const call = await reserveModel({ model: "gpt-6-astra", workload: "drafting", inputLimit: 100, outputLimit: 100, budget });
    await expect(call.settle({ model: "other", usage: { input_tokens: 10, output_tokens: 10 } })).rejects.toThrow(/model/);
    await expect(call.settle({ model: "gpt-6-astra", usage: { input_tokens: 101, output_tokens: 10 } })).rejects.toThrow(/limits/);
    expect((await budget.status()).totals.held).toBe(6250);
  });
  it("counts Astra's explicit input packet before generation without guessing tokens from characters", async () => {
    const body = { model: "gpt-6-astra", instructions: "Read", input: "Synthetic", max_output_tokens: 1000 };
    let sent;
    expect(await countResponseInput(body, { apiKey: "test", fetchImpl: async (_url, init) => {
      sent = JSON.parse(String(init?.body)); return Response.json({ input_tokens: 100 });
    } })).toBe(4196);
    expect(sent).toEqual({ model: body.model, instructions: body.instructions, input: body.input });
  });
});

describe("operator and artwork accounting", () => {
  const body = { model: AI_POLICY.operator.model, max_tokens: 1000, messages: [{ role: "user", content: "Synthetic" }] };
  it("meters the operator and rejects unpriced hosted tools or model substitutions", async () => {
    expect(operatorRequest(body).service_tier).toBe("standard_only");
    expect(() => operatorRequest({ ...body, tools: [{ type: "web_search_20250305" }] })).toThrow(/contract/);
    expect(() => operatorRequest({ ...body, model: "unpriced" })).toThrow(/contract/);
    expect(() => operatorRequest({ ...body, speed: "fast" })).toThrow(/contract/);
    const budget = testBudget();
    const call = await meterOperator(body, { budget });
    await call.settle({ model: body.model, usage: { input_tokens: 100, output_tokens: 10 } });
    expect((await budget.status()).totals.byWorkload.operator).toBe(750);
  });
  it("records cumulative streaming usage and retains interrupted streams", () => {
    const frame = (value: object) => `data: ${JSON.stringify(value)}\n\n`;
    const stream = frame({ type: "message_start", message: { model: body.model, usage: { input_tokens: 100, output_tokens: 1 } } })
      + frame({ type: "message_delta", usage: { output_tokens: 20 } })
      + frame({ type: "message_delta", usage: { output_tokens: 40 } });
    expect(() => anthropicStreamReceipt(stream)).toThrow(/Incomplete/);
    expect(anthropicStreamReceipt(stream + frame({ type: "message_stop" })).usage.output_tokens).toBe(40);
  });
  it("accounts a fixed-format generated plate even when the Images API omits model", async () => {
    const budget = testBudget();
    const call = await reserveModel({ model: AI_POLICY.imageModel, workload: "images", outputLimit: 6400, budget });
    await call.settle({ usage: { input_tokens: 100, output_tokens: 6240 } });
    expect((await budget.status()).totals.byWorkload.images).toBe(250100);
  });
});
