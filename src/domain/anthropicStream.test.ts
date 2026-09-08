import { describe, expect, it } from "vitest";
import { assembleAnthropicStream } from "../pipeline/models.ts";

/** The streamed shape of a Messages response, reassembled exactly — text and
 *  citations appended, tool input parsed from fragments, usage merged from the
 *  final delta — so a paused turn can be re-sent and the ledger priced. */

const ev = (type: string, body: object) => `event: ${type}\ndata: ${JSON.stringify({ type, ...body })}\n\n`;

describe("assembleAnthropicStream", () => {
  it("rebuilds content blocks, stop reason, served model, and usage from the event stream", () => {
    const sse =
      ev("message_start", { message: { id: "msg_1", model: "claude-opus-5", stop_reason: null, content: [], usage: { input_tokens: 120, output_tokens: 1, cache_read_input_tokens: 40 } } }) +
      ev("content_block_start", { index: 0, content_block: { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: {} } }) +
      ev("content_block_delta", { index: 0, delta: { type: "input_json_delta", partial_json: '{"query": "geopoly' } }) +
      ev("content_block_delta", { index: 0, delta: { type: "input_json_delta", partial_json: 'mer pyramid"}' } }) +
      ev("content_block_stop", { index: 0 }) +
      ev("content_block_start", { index: 1, content_block: { type: "web_search_tool_result", tool_use_id: "srvtoolu_1", content: [{ type: "web_search_result", url: "https://x.test/a", title: "A" }] } }) +
      ev("content_block_stop", { index: 1 }) +
      ev("content_block_start", { index: 2, content_block: { type: "text", text: "" } }) +
      ev("content_block_delta", { index: 2, delta: { type: "text_delta", text: "Cast " } }) +
      ev("content_block_delta", { index: 2, delta: { type: "text_delta", text: "or carved." } }) +
      ev("content_block_delta", { index: 2, delta: { type: "citations_delta", citation: { type: "web_search_result_location", url: "https://x.test/a", title: "A", cited_text: "…" } } }) +
      ev("content_block_stop", { index: 2 }) +
      ev("ping", {}) +
      ev("message_delta", { delta: { stop_reason: "pause_turn", stop_sequence: null }, usage: { output_tokens: 350, server_tool_use: { web_search_requests: 1 } } }) +
      ev("message_stop", {});
    const m = assembleAnthropicStream(sse);
    expect(m.model).toBe("claude-opus-5");
    expect(m.stop_reason).toBe("pause_turn");
    expect(m.content[0]).toEqual({ type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "geopolymer pyramid" } });
    expect(m.content[1].type).toBe("web_search_tool_result");
    expect(m.content[2].text).toBe("Cast or carved.");
    expect(m.content[2].citations?.[0].url).toBe("https://x.test/a");
    expect(m.usage).toEqual({ input_tokens: 120, output_tokens: 350, cache_read_input_tokens: 40, server_tool_use: { web_search_requests: 1 } });
  });

  it("surfaces a streamed error and refuses a stream with no message", () => {
    expect(() => assembleAnthropicStream(ev("error", { error: { type: "overloaded_error", message: "Overloaded" } }))).toThrow(/overloaded_error: Overloaded/);
    expect(() => assembleAnthropicStream(ev("ping", {}))).toThrow(/without a message_start/);
  });
});
