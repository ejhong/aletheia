import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VENDORS, buildRequest, callVendorDetailed } from "../lib/vendors.mjs";
import { seatKey } from "../lib/seat-key.mjs";
import { readSpend } from "../pipeline/spend.ts";
import { callSeat } from "../pipeline/transport.ts";

/**
 * The panel is five seats, one per API vendor, each pinned to a model AND
 * an effort level (§3.15: a seat's identity is load-bearing; a vendor
 * changing its default depth must not silently change the judge). These
 * tests pin the seat table's invariants and the exact request each seat
 * receives, in that vendor's dialect — the one place a wrong parameter
 * name would otherwise surface is a 400 from a paid panel run.
 */

const SEATS = ["anthropic", "openai", "gemini", "xai", "venice"] as const;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("panel seat table", () => {
  it("has exactly five seats with distinct vendors, tags, and models, each with pinned effort", () => {
    expect(Object.keys(VENDORS).sort()).toEqual([...SEATS].sort());
    const tags = Object.values(VENDORS).map((v) => v.tag);
    const models = Object.values(VENDORS).map((v) => v.model);
    expect(new Set(tags).size).toBe(5);
    expect(new Set(models).size).toBe(5);
    for (const v of Object.values(VENDORS)) {
      expect(v.label).toMatch(/\(.+\)/);
      expect(["low", "medium", "high", "max"]).toContain(v.effort);
    }
  });

  it("seat labels map to five distinct seat keys, one per API vendor", () => {
    const keys = Object.values(VENDORS).map((v) => seatKey(v.label));
    expect(new Set(keys).size).toBe(5);
    expect(keys).toContain("venice");
  });
});

describe("per-seat request shape", () => {
  const prompt = { system: "S", user: "U", maxTokens: 20000 };

  it("refuses to build a request without the seat's key", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(() => buildRequest("openai", prompt)).toThrow(/no API key/);
    expect(() => buildRequest("nope", prompt)).toThrow(/unknown vendor/);
  });

  it("Anthropic: output_config.effort, and the roster's own ceiling on thinking and reply together", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    const r = buildRequest("anthropic", prompt);
    expect(r.url).toContain("api.anthropic.com");
    expect(r.body.model).toBe(VENDORS.anthropic.model);
    expect(r.body.output_config).toEqual({ effort: VENDORS.anthropic.effort });
    // The seat thinks and replies under one ceiling and is not told where it is: the roster names the ceiling
    // (config/models.yaml), and a caller asking for less or more does not move it.
    const ceiling = (VENDORS.anthropic as { maxOutputTokens?: number }).maxOutputTokens;
    expect(ceiling).toBeGreaterThanOrEqual(64000);
    expect(r.body.max_tokens).toBe(ceiling);
    expect(buildRequest("anthropic", { ...prompt, maxTokens: 64000 }).body.max_tokens).toBe(ceiling);
    // Seats whose vendor counts reasoning apart from the reply keep the caller's figure.
    vi.stubEnv("OPENAI_API_KEY", "k");
    expect(buildRequest("openai", prompt).body.max_completion_tokens).toBe(20000);
  });

  it("a seat that thought to its ceiling is a failed seat, and what it cost is on the ledger", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    const ev = (type: string, body: object) => `event: ${type}\ndata: ${JSON.stringify({ type, ...body })}\n\n`;
    // The whole budget went to thinking: the stream ends at max_tokens with no text block.
    const sse =
      ev("message_start", { message: { id: "msg_1", model: VENDORS.anthropic.model, stop_reason: null, content: [], usage: { input_tokens: 35000, output_tokens: 1 } } }) +
      ev("content_block_start", { index: 0, content_block: { type: "thinking", thinking: "" } }) +
      ev("content_block_delta", { index: 0, delta: { type: "thinking_delta", thinking: "still weighing" } }) +
      ev("content_block_stop", { index: 0 }) +
      ev("message_delta", { delta: { stop_reason: "max_tokens" }, usage: { output_tokens: 64000 } }) +
      ev("message_stop", {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response(sse, { status: 200 })));
    const failure = await callVendorDetailed("anthropic", prompt).catch((e: Error & { usage?: unknown; model?: string }) => e);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe("anthropic: empty reply (stop: max_tokens)");
    expect(failure).toMatchObject({ model: VENDORS.anthropic.model, usage: { inputTokens: 35000, outputTokens: 64000, cacheReadTokens: 0, cacheWriteTokens: 0 } });

    // Through the metered transport the failure still reaches the caller, and the row is written first.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aletheia-seat-spend-"));
    fs.mkdirSync(path.join(root, "config"));
    fs.copyFileSync(path.join(process.cwd(), "config", "tariffs.yaml"), path.join(root, "config", "tariffs.yaml"));
    const meter = { runId: "2099-01-01-check-x-000000", verb: "check" as const, case: "x", root };
    await expect(callSeat("anthropic", prompt, meter)).rejects.toThrow(/empty reply \(stop: max_tokens\)/);
    const rows = readSpend(root);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ runId: meter.runId, verb: "check", model: VENDORS.anthropic.model, calls: 1, inputTokens: 35000, outputTokens: 64000 });
    expect(rows[0].usd).toBeGreaterThan(1); // the seat's thinking is billed whether or not it ends in a reply
    // A failure before the vendor counted anything (a refused key) writes no row.
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 401 })));
    await expect(callSeat("anthropic", prompt, meter)).rejects.toThrow(/HTTP 401/);
    expect(readSpend(root)).toHaveLength(1);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("Anthropic streams, and only how the reply travels changes: a seat that thinks past five minutes is still heard", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    vi.stubEnv("OPENAI_API_KEY", "k");
    expect(buildRequest("anthropic", prompt).body.stream).toBe(true);
    expect(buildRequest("openai", prompt).body).not.toHaveProperty("stream");
    // The streamed shape of a Messages reply: a thinking block, then the text in two deltas, usage completed at the end.
    const ev = (type: string, body: object) => `event: ${type}\ndata: ${JSON.stringify({ type, ...body })}\n\n`;
    const sse =
      ev("message_start", { message: { id: "msg_1", model: VENDORS.anthropic.model, stop_reason: null, content: [], usage: { input_tokens: 900, output_tokens: 1, cache_read_input_tokens: 100, cache_creation_input_tokens: 50 } } }) +
      ev("content_block_start", { index: 0, content_block: { type: "thinking", thinking: "" } }) +
      ev("content_block_delta", { index: 0, delta: { type: "thinking_delta", thinking: "weighing" } }) +
      ev("content_block_stop", { index: 0 }) +
      ev("ping", {}) +
      ev("content_block_start", { index: 1, content_block: { type: "text", text: "" } }) +
      ev("content_block_delta", { index: 1, delta: { type: "text_delta", text: "vote: " } }) +
      ev("content_block_delta", { index: 1, delta: { type: "text_delta", text: "complies" } }) +
      ev("content_block_stop", { index: 1 }) +
      ev("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 420 } }) +
      ev("message_stop", {});
    const sent: { body?: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body?: string }) => (sent.push(init), new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } }))));
    const r = await callVendorDetailed("anthropic", prompt);
    expect(JSON.parse(sent[0].body!).stream).toBe(true);
    expect(r.text).toBe("vote: complies"); // the thinking is not the reply
    expect(r.usage).toEqual({ inputTokens: 900, outputTokens: 420, cacheReadTokens: 100, cacheWriteTokens: 50 });
    expect(r.model).toBe(VENDORS.anthropic.model);
    // A stream cut before message_stop is a failed seat, never half an opinion.
    vi.stubGlobal("fetch", vi.fn(async () => new Response(sse.slice(0, sse.indexOf("event: message_delta")), { status: 200 })));
    await expect(callVendorDetailed("anthropic", prompt)).rejects.toThrow(/anthropic: anthropic stream ended before message_stop/);
  });

  it("Gemini: thinkingConfig.thinkingLevel inside generationConfig", () => {
    vi.stubEnv("GEMINI_API_KEY", "k");
    const r = buildRequest("gemini", prompt);
    expect(r.url).toContain(`/models/${VENDORS.gemini.model}:generateContent`);
    expect(r.body.generationConfig).toEqual({
      maxOutputTokens: 20000,
      thinkingConfig: { thinkingLevel: VENDORS.gemini.effort },
    });
  });

  it.each([
    ["openai", "api.openai.com", "OPENAI_API_KEY"],
    ["xai", "api.x.ai", "XAI_API_KEY"],
    ["venice", "api.venice.ai", "VENICE_API_KEY"],
  ] as const)("%s: OpenAI-compatible body carries reasoning_effort", (name, host, envVar) => {
    vi.stubEnv(envVar, "k");
    const r = buildRequest(name, prompt);
    expect(r.url).toContain(host);
    expect(r.headers.Authorization).toBe("Bearer k");
    expect(r.body.model).toBe(VENDORS[name].model);
    expect(r.body.reasoning_effort).toBe(VENDORS[name].effort);
    expect(r.body.max_completion_tokens).toBe(20000);
    expect(r.body.messages?.map((m: { role: string }) => m.role)).toEqual(["system", "user"]);
  });
});

describe("seatKey", () => {
  it("keys a seat by API vendor so a model upgrade supersedes rather than doubles", () => {
    expect(seatKey("GPT-5.1 (OpenAI) — independent check run via gpt-5.1")).toBe("openai");
    expect(seatKey("GPT-5.6 Sol (OpenAI) — independent check run via gpt-5.6-sol")).toBe("openai");
    expect(seatKey("Kimi K3 (Moonshot, via Venice) — independent check run via kimi-k3")).toBe("venice");
    expect(seatKey("GLM 5.3 Flash (Z.ai, via Venice) — independent check run via z-ai-glm-5-3-flash")).toBe("venice");
    expect(seatKey("Gemini 3.1 Pro (Google)")).toBe("google");
    expect(seatKey("Grok 4.6 (xAI), independent judge run")).toBe("xai");
  });

  it("keeps the early records on their seats", () => {
    expect(seatKey("Opus 5 (Claude), independent judge run")).toBe("anthropic");
    expect(seatKey("Opus 5 (Anthropic) — independent check run via claude-opus-5")).toBe("anthropic");
    // No parenthetical at all: fall back to the label's first token.
    expect(seatKey("gpt-5.1 house draft")).toBe("gpt-5.1");
  });
});

describe("prompt caching on the seats", () => {
  const prompt = { system: "judge", user: "the change" };
  it("marks a shared prefix as the one breakpoint on Anthropic, places it first elsewhere, and caches nothing without one", () => {
    process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "test-key";
    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "test-key";
    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || "test-key";
    const a = buildRequest("anthropic", { ...prompt, cachedPrefix: "the constitution" });
    expect(a.body.messages).toEqual([{ role: "user", content: [{ type: "text", text: "the constitution", cache_control: { type: "ephemeral" } }, { type: "text", text: "the change" }] }]);
    expect(a.body).not.toHaveProperty("cache_control");
    expect(buildRequest("anthropic", prompt).body.messages).toEqual([{ role: "user", content: "the change" }]);
    const o = buildRequest("openai", { ...prompt, cachedPrefix: "the constitution" }).body as { messages?: unknown[] };
    expect(o.messages?.[1]).toEqual({ role: "user", content: "the constitution\n\nthe change" });
    const g = buildRequest("gemini", { ...prompt, cachedPrefix: "the constitution" }).body as { contents?: { parts: unknown[] }[] };
    expect(g.contents?.[0].parts).toEqual([{ text: "the constitution" }, { text: "the change" }]);
  });
});
