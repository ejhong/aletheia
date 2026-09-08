import { afterEach, describe, expect, it, vi } from "vitest";
import { MODELS } from "../../scripts/lib/models.mjs";

const HOUSE = MODELS.house.model;
const FALLBACK = MODELS.house.fallback!;

/** Refusals are loud (typed error), and the fallback helper carries
 *  truthful provenance: the returned model is the one that actually
 *  produced the text — the Opus seat's §3.15 objection, pinned. */

function anthropicReply(body: object) {
  return { ok: true, json: async () => body } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("refusal handling and provenance-true fallback", () => {
  it("falls back once on refusal and reports the model that answered", async () => {
    vi.resetModules();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        calls.push(body.model);
        if (body.model === HOUSE) {
          return anthropicReply({ stop_reason: "refusal", content: [] });
        }
        return anthropicReply({
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
    expect(reply.model).toBe(FALLBACK);
    expect(reply.refused).toBe(true);
    expect(calls).toEqual([HOUSE, FALLBACK]);
  });

  it("a bare call() throws RefusalError instead of silently substituting", async () => {
    vi.resetModules();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
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
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push(JSON.parse(String(init.body)).model);
        return anthropicReply({ stop_reason: "refusal", content: [] });
      }),
    );
    const { pickProvider, callWithRefusalFallback, RefusalError } = await import(
      "../../scripts/lib/llm.mjs"
    );
    // A provider already running on the fallback model has nowhere to fall to.
    const provider = { ...pickProvider("anthropic")!, model: FALLBACK };
    await expect(
      callWithRefusalFallback(provider, "system", "user"),
    ).rejects.toBeInstanceOf(RefusalError);
    expect(calls).toEqual([FALLBACK]);
  });
});
