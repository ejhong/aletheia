/**
 * The streamed shape of an Anthropic Messages response, read and reassembled.
 * Shared by the two paths that call the vendor: the verbs' house model
 * (src/pipeline/models.ts) and the panel's Anthropic seat
 * (src/lib/vendors.mjs). Both stream for one reason — a reply that takes
 * longer than the five minutes Node's fetch waits for response headers is
 * otherwise lost, and paid for (2026-09-08 on the house path; 2026-09-28 on
 * the seat, after it moved to a model and effort that think for longer).
 */

export type AnthropicBlock = {
  type: string;
  text?: string;
  citations?: { type: string; url?: string; title?: string }[];
  /** Server-tool and thinking blocks carry more; kept whole so a paused turn can be re-sent. */
  [k: string]: unknown;
};
export type AnthropicMessage = {
  id: string;
  model: string;
  stop_reason: string;
  content: AnthropicBlock[];
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    server_tool_use?: { web_search_requests?: number; web_fetch_requests?: number };
    /** Per-iteration models of a multi-turn server call; a `fallback_message` entry was answered by the fallback. */
    iterations?: {
      model?: string;
      type?: string;
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    }[];
  };
};

/**
 * Rebuild the message a streamed response describes. Every call streams:
 * a research turn with thirty searches takes longer than the five minutes
 * Node's fetch waits for response headers, and a retry after that timeout
 * pays for the whole request again (observed 2026-09-08, first paid run).
 * With streaming the headers arrive at once and the connection stays live
 * on deltas and pings. Blocks are reassembled exactly — text and citation
 * deltas appended, tool inputs parsed from their JSON fragments, thinking
 * and signatures kept — because a `pause_turn` needs the assistant content
 * re-sent verbatim.
 */
export function assembleAnthropicStream(sse: string): AnthropicMessage {
  let message: AnthropicMessage | null = null;
  let stopped = false;
  const jsonBuf = new Map<number, string>();
  for (const chunk of sse.split(/\r?\n\r?\n/)) {
    const data = chunk
      .split(/\r?\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .join("");
    if (!data) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the vendor's event union, read field by field below
    const ev = JSON.parse(data) as Record<string, any>;
    switch (ev.type) {
      case "message_start":
        message = { ...ev.message, content: [...(ev.message.content ?? [])] };
        break;
      case "content_block_start": {
        const block = { ...ev.content_block } as AnthropicBlock;
        if (block.type === "text" && block.text === undefined) block.text = "";
        message!.content[ev.index] = block;
        break;
      }
      case "content_block_delta": {
        const block = message!.content[ev.index];
        const d = ev.delta;
        if (d.type === "text_delta") block.text = (block.text ?? "") + d.text;
        else if (d.type === "input_json_delta") jsonBuf.set(ev.index, (jsonBuf.get(ev.index) ?? "") + d.partial_json);
        else if (d.type === "thinking_delta") block.thinking = String(block.thinking ?? "") + d.thinking;
        else if (d.type === "signature_delta") block.signature = d.signature;
        else if (d.type === "citations_delta") block.citations = [...(block.citations ?? []), d.citation];
        break;
      }
      case "content_block_stop": {
        const buf = jsonBuf.get(ev.index);
        if (buf !== undefined) message!.content[ev.index].input = JSON.parse(buf || "{}");
        break;
      }
      case "message_delta":
        message!.stop_reason = ev.delta?.stop_reason ?? message!.stop_reason;
        message!.usage = { ...message!.usage, ...(ev.usage ?? {}) };
        break;
      case "message_stop":
        stopped = true;
        break;
      case "error":
        throw new Error(`anthropic stream error: ${ev.error?.type ?? "unknown"}: ${ev.error?.message ?? ""}`);
      default:
        break; // ping, message_stop
    }
  }
  if (!message) throw new Error("anthropic stream ended without a message_start");
  if (!stopped || !message.stop_reason) throw new Error(`anthropic stream ended before message_stop (last stop_reason: ${message.stop_reason ?? "none"})`);
  return message;
}

/**
 * Read a streamed body to the end, keeping every byte received. Twice on
 * 2026-09-08 a long call died with undici's "terminated" — the connection
 * closed without a clean end after the whole reply had arrived — and
 * `res.text()` discarded a finished, paid answer. The bytes are kept and
 * the assembler decides: a stream that carried `message_stop` is complete
 * whatever the socket did afterwards; one that did not is an error, with
 * the socket's reason attached.
 */
export async function readStreamText(body: ReadableStream<Uint8Array> | null): Promise<{ text: string; ended: Error | null }> {
  if (!body) return { text: "", ended: new Error("no response body") };
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { text, ended: null };
  } catch (e) {
    return { text, ended: e as Error };
  }
}
