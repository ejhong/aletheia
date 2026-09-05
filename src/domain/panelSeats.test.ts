import { afterEach, describe, expect, it, vi } from "vitest";
import { VENDORS, buildRequest } from "../../scripts/lib/vendors.mjs";
import { seatKey } from "../../scripts/lib/seat-key.mjs";

/**
 * The panel is five seats, one per API vendor, each pinned to a model AND
 * an effort level (§3.15: a seat's identity is load-bearing; a vendor
 * changing its default depth must not silently change the judge). These
 * tests pin the seat table's invariants and the exact request each seat
 * receives, in that vendor's dialect — the one place a wrong parameter
 * name would otherwise surface is a 400 from a paid panel run.
 */

const SEATS = ["anthropic", "openai", "gemini", "xai", "venice"] as const;

afterEach(() => vi.unstubAllEnvs());

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

  it("Anthropic: output_config.effort, max_tokens never below the thinking floor", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    const r = buildRequest("anthropic", prompt);
    expect(r.url).toContain("api.anthropic.com");
    expect(r.body.model).toBe(VENDORS.anthropic.model);
    expect(r.body.output_config).toEqual({ effort: VENDORS.anthropic.effort });
    expect(r.body.max_tokens).toBe(32000);
    expect(buildRequest("anthropic", { ...prompt, maxTokens: 64000 }).body.max_tokens).toBe(64000);
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
