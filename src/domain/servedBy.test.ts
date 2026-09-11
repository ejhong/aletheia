import { describe, expect, it } from "vitest";
import { servedBy, usageByModel } from "../pipeline/models.ts";

// The vendor's server-side fallback leaves the outer `model` naming the model
// asked; the truth is in the `fallback` block and the per-iteration usage.
const fell = {
  model: "claude-fable-5-1",
  content: [
    { type: "fallback", from: { model: "claude-fable-5-1" }, to: { model: "claude-opus-5" }, trigger: { type: "refusal", category: "bio" } },
    { type: "text", text: "the report" },
  ],
  usage: {
    input_tokens: 1,
    output_tokens: 1,
    iterations: [
      { type: "message", model: "claude-fable-5-1" },
      { type: "fallback_message", model: "claude-opus-5" },
      { type: "fallback_message", model: "claude-opus-5" },
    ],
  },
};

describe("servedBy", () => {
  it("names the fallback model, its trigger, and how many iterations it answered", () => {
    expect(servedBy(fell, "claude-fable-5-1")).toEqual({
      model: "claude-opus-5",
      fallback: "claude-fable-5-1 → claude-opus-5 (refusal, bio; 2 fallback iterations)",
    });
  });
  it("reads the iterations when the fallback block was not echoed", () => {
    const m = { ...fell, content: [{ type: "text", text: "the report" }] };
    expect(servedBy(m, "claude-fable-5-1")).toEqual({
      model: "claude-opus-5",
      fallback: "claude-fable-5-1 → claude-opus-5 (server-side fallback; 2 fallback iterations)",
    });
  });
  it("keeps the model that answered when nothing fell back", () => {
    const m = { model: "claude-fable-5-1", content: [{ type: "text", text: "x" }], usage: { input_tokens: 1, output_tokens: 1, iterations: [{ type: "message", model: "claude-fable-5-1" }] } };
    expect(servedBy(m, "claude-fable-5-1")).toEqual({ model: "claude-fable-5-1" });
  });
  it("falls back to the name asked when the message names no model", () => {
    expect(servedBy({ content: [], usage: { input_tokens: 0, output_tokens: 0 } } as never, "claude-sonnet-5")).toEqual({ model: "claude-sonnet-5" });
  });
});

describe("usageByModel", () => {
  it("bills each iteration to the model that consumed it", () => {
    const m = {
      usage: {
        input_tokens: 6,
        output_tokens: 300,
        cache_read_input_tokens: 500,
        cache_creation_input_tokens: 40,
        iterations: [
          { type: "message", model: "claude-fable-5-1", input_tokens: 4, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 40 },
          { type: "fallback_message", model: "claude-opus-5", input_tokens: 2, output_tokens: 200, cache_read_input_tokens: 500, cache_creation_input_tokens: 0 },
        ],
      },
    };
    expect([...usageByModel(m, "claude-opus-5")]).toEqual([
      ["claude-fable-5-1", { inputTokens: 4, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 40 }],
      ["claude-opus-5", { inputTokens: 2, outputTokens: 200, cacheReadTokens: 500, cacheWriteTokens: 0 }],
    ]);
  });
  it("bills the whole message to the served model when there are no iterations", () => {
    const m = { usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 30, cache_creation_input_tokens: 40 } };
    expect([...usageByModel(m, "claude-sonnet-5")]).toEqual([["claude-sonnet-5", { inputTokens: 10, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 40 }]]);
  });
});
