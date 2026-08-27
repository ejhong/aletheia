import { afterEach, describe, expect, it, vi } from "vitest";

/** The Anthropic client retries exactly once on the fallback model when
 *  the configured model refuses (stop_reason "refusal" or empty text) —
 *  the documented Fable failure on pharmacology-adjacent cases. */

function anthropicReply(body: object) {
  return {
    ok: true,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("anthropic refusal fallback", () => {
  it("retries once on claude-opus-5 after a refusal, and not beyond", async () => {
    vi.resetModules();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("EXTRACT_MODEL", "claude-fable-5");
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        calls.push(body.model);
        if (body.model === "claude-fable-5") {
          return anthropicReply({ stop_reason: "refusal", content: [] });
        }
        return anthropicReply({
          stop_reason: "end_turn",
          content: [{ text: '{"answer":42}' }],
        });
      }),
    );
    const { pickProvider } = await import("../../scripts/lib/llm.mjs");
    const provider = pickProvider("anthropic");
    expect(provider).not.toBeNull();
    const reply = await provider!.call("system", "user");
    expect(reply).toBe('{"answer":42}');
    expect(calls).toEqual(["claude-fable-5", "claude-opus-5"]);
  });

  it("does not loop when the fallback itself refuses", async () => {
    vi.resetModules();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("EXTRACT_MODEL", "claude-opus-5");
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push(JSON.parse(String(init.body)).model);
        return anthropicReply({ stop_reason: "refusal", content: [] });
      }),
    );
    const { pickProvider } = await import("../../scripts/lib/llm.mjs");
    const provider = pickProvider("anthropic");
    const reply = await provider!.call("system", "user");
    expect(reply).toBe("");
    expect(calls).toEqual(["claude-opus-5"]);
  });
});
