import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../scripts/lib/ai-budget.mjs", async importOriginal => {
  const original = await importOriginal<typeof import("../../scripts/lib/ai-budget.mjs")>();
  return { ...original, sharedBudget: () => {
    let value: unknown = null; let sha: string | null = null;
    return original.createBudget({ read: async () => ({ sha, value: structuredClone(value) }),
      write: async (_month: string, _sha: string | null, next: unknown) => { value = structuredClone(next); sha = "fixture"; return true; } });
  } };
});

/** Refusals are loud (typed error), and the fallback helper carries
 *  truthful provenance: the returned model is the one that actually
 *  produced the text — the Opus seat's §3.15 objection, pinned. */

function anthropicReply(body: object) {
  return Response.json({ model: "claude-fable-5", usage: { input_tokens: 10, output_tokens: 10 }, ...body });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("refusal handling and provenance-true fallback", () => {
  it("uses Astra by default even when both provider keys exist, with explicit Responses bounds", async () => {
    vi.resetModules();
    vi.stubEnv("OPENAI_API_KEY", "fixture-key");
    vi.stubEnv("ANTHROPIC_API_KEY", "fixture-key");
    vi.stubEnv("EXTRACT_MODEL", "");
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      requests.push({ url, body: JSON.parse(String(init.body)) });
      if (url.endsWith("input_tokens")) return Response.json({ input_tokens: 200 });
      return Response.json({ model: "gpt-6-astra", status: "completed", usage: { input_tokens: 200, output_tokens: 100 },
        output: [{ content: [{ type: "output_text", text: '{"answer":42}' }] }] });
    }));
    const { pickProvider, callWithRefusalFallback } = await import("../../scripts/lib/llm.mjs");
    const provider = pickProvider();
    expect(provider?.name).toBe("openai");
    expect(await callWithRefusalFallback(provider!, "System", "Input")).toEqual({ text: '{"answer":42}', model: "gpt-6-astra", refused: false });
    expect(requests).toHaveLength(2);
    expect(requests[1].url).toBe("https://api.openai.com/v1/responses");
    expect(requests[1].body).toMatchObject({ instructions: "System", input: "Input", store: false,
      reasoning: { effort: "medium" }, max_output_tokens: 64000, service_tier: "default" });
    expect(requests[1].body).not.toHaveProperty("temperature");
  });
  it("falls back once on refusal and reports the model that answered", async () => {
    vi.resetModules();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("EXTRACT_MODEL", ""); // unset: the code default (Fable) applies
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
          model: "claude-opus-5",
          stop_reason: "end_turn",
          content: [{ text: '{"answer":42}' }],
        });
      }),
    );
    const { pickProvider, callWithRefusalFallback } = await import(
      "../../scripts/lib/llm.mjs"
    );
    const provider = pickProvider("anthropic");
    const reply = await callWithRefusalFallback(provider!, "system", "user");
    expect(reply.text).toBe('{"answer":42}');
    expect(reply.model).toBe("claude-opus-5");
    expect(reply.refused).toBe(true);
    expect(calls).toEqual(["claude-fable-5", "claude-opus-5"]);
  });

  it("a bare call() throws RefusalError instead of silently substituting", async () => {
    vi.resetModules();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("EXTRACT_MODEL", "");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => anthropicReply({ stop_reason: "refusal", content: [] })),
    );
    const { pickProvider, RefusalError } = await import("../../scripts/lib/llm.mjs");
    const provider = pickProvider("anthropic");
    await expect(provider!.call("system", "user")).rejects.toBeInstanceOf(RefusalError);
  });

  it("does not loop: a refusing fallback propagates the error, fail-closed", async () => {
    vi.resetModules();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("EXTRACT_MODEL", "claude-opus-5");
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push(JSON.parse(String(init.body)).model);
        return anthropicReply({ model: "claude-opus-5", stop_reason: "refusal", content: [] });
      }),
    );
    const { pickProvider, callWithRefusalFallback, RefusalError } = await import(
      "../../scripts/lib/llm.mjs"
    );
    const provider = pickProvider("anthropic");
    await expect(
      callWithRefusalFallback(provider!, "system", "user"),
    ).rejects.toBeInstanceOf(RefusalError);
    expect(calls).toEqual(["claude-opus-5"]);
  });
});
