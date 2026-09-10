import { describe, expect, it } from "vitest";
import { anthropicJsonRequest } from "../pipeline/models.ts";

/** One-shot structured calls are uncached; a shared prefix is marked as the one breakpoint (spend ledger of 2026-09-09: automatic caching wrote 14.7M tokens for one-shot calls and read 77k). */
describe("prompt caching on structured-output calls", () => {
  const base = { model: "claude-sonnet-5", system: "the protocol", user: '{"record": 1}', schema: { type: "object" } };

  it("sends no automatic cache_control, and a plain string user message, when no prefix is shared", () => {
    const body = anthropicJsonRequest(base, true) as Record<string, unknown>;
    expect(body).not.toHaveProperty("cache_control");
    expect(body.messages).toEqual([{ role: "user", content: '{"record": 1}' }]);
    expect(body.system).toBe("the protocol");
    expect((body.output_config as { format?: unknown }).format).toEqual({ type: "json_schema", schema: { type: "object" } });
  });

  it("puts a shared prefix first as its own block with the breakpoint, the varying part after it", () => {
    const body = anthropicJsonRequest({ ...base, cachedPrefix: "the source text" }, true) as Record<string, unknown>;
    expect(body).not.toHaveProperty("cache_control");
    expect(body.messages).toEqual([
      { role: "user", content: [{ type: "text", text: "the source text", cache_control: { type: "ephemeral" } }, { type: "text", text: '{"record": 1}' }] },
    ]);
  });

  it("folds the schema into the instructions when strict output is refused, prefix or not", () => {
    const body = anthropicJsonRequest({ ...base, cachedPrefix: "the source text" }, false) as Record<string, unknown>;
    expect(body.system).toMatch(/^the protocol\n\nReply with one JSON object/);
    expect((body.output_config as { format?: unknown }).format).toBeUndefined();
    expect(Array.isArray((body.messages as { content: unknown }[])[0].content)).toBe(true);
  });

  it("names a fallback model when one is given", () => {
    const body = anthropicJsonRequest({ ...base, fallback: "claude-opus-5" }, true) as Record<string, unknown>;
    expect(body.fallbacks).toEqual([{ model: "claude-opus-5" }]);
  });
});
