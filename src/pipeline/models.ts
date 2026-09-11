import { isoDate } from "../lib/overlay-ids.mjs";
import { parseJsonReply } from "../lib/llm.mjs";
import { fetchWithRetry } from "../lib/vendors.mjs";
import { assertWithinBudget, estimateUsd } from "./budget.ts";
import { loadTariffs, priceOf, recordSpend, type Meter, type TokenUsage } from "./spend.ts";

export type { Meter } from "./spend.ts";

/**
 * The two model surfaces the verbs use beyond a plain chat completion
 * (docs/AUTOMATION.md, "The code": one transport, the spend ledger inside
 * it). Raw HTTP, like every vendor call in this repository (AGENTS.md §4:
 * minimal dependencies), with request shapes taken from the vendors'
 * current documentation:
 *
 *  - Anthropic Messages with server tools (web search, web fetch) and
 *    `pause_turn` continuation — the browsing research seat — and Messages
 *    with structured JSON output — the drafter and the verifier.
 *  - OpenAI Responses in background mode with the web_search tool and high
 *    reasoning effort — the other research seat.
 *
 * Every call: budget check first (a refused call sends nothing), then the
 * request, then one spend row per priced thing (tokens; searches).
 */

export type { TokenUsage as Usage } from "./spend.ts";
type Usage = TokenUsage;

export interface ResearchResult {
  text: string;
  model: string;
  usage: Usage;
  searches: number;
  fetches: number;
  citations: { url: string; title?: string }[];
  /** Vendor payloads, kept beside the report as working material. */
  raw: unknown[];
  /** Set when the vendor's server-side fallback answered: "asked → served (trigger; n iterations)". */
  fallback?: string;
}

export type FetchLike = typeof fetch;

/**
 * No model is named here: every choice is config/models.yaml (src/lib/
 * models.mjs). A call may carry a `fallback` — Anthropic's server-side
 * fallback (docs/DECISIONS.md 2026-08-27, "Fable-first, loud Opus fallback,
 * truthful stamps"): a safety-classifier decline is re-run on the fallback
 * inside the same request, and the run records the model that actually
 * served — never the one that was asked. A decline by both fails the run.
 */
const FALLBACK_BETA = "server-side-fallback-2026-06-01";

const ANTHROPIC_VERSION = "2023-06-01";

function recordTokens(meter: Meter, model: string, usage: Usage): number | null {
  const usd = priceOf(model, usage, loadTariffs(meter.root));
  recordSpend(
    {
      date: isoDate(),
      runId: meter.runId,
      verb: meter.verb,
      case: meter.case,
      model,
      calls: 1,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens ?? 0,
      cacheWriteTokens: usage.cacheWriteTokens ?? 0,
      usd,
    },
    meter.root,
  );
  return usd;
}

function recordSearches(meter: Meter, toolKey: string, count: number): void {
  if (count <= 0) return;
  const t = loadTariffs(meter.root).tools[toolKey];
  const usd = t && t.perCallUsd !== null ? Number((count * t.perCallUsd).toFixed(6)) : null;
  recordSpend(
    {
      date: isoDate(),
      runId: meter.runId,
      verb: meter.verb,
      case: meter.case,
      model: toolKey,
      calls: count,
      inputTokens: 0,
      outputTokens: 0,
      usd,
    },
    meter.root,
  );
}

function key(name: string): string {
  const k = process.env[name];
  if (!k) throw new Error(`${name} is not set`);
  return k;
}

// ------------------------------------------------------------------ Anthropic

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
 * The model that actually answered. With a server-side fallback the outer
 * `model` field still names the model that was asked, while the message
 * carries a `fallback` block (from → to, with its trigger) and per-iteration
 * usage whose later entries are `fallback_message`s from the fallback model.
 * Observed 2026-09-11 on the Orch OR research pass: one Fable turn, a
 * refusal (category bio), then twenty-nine Opus iterations — and a run
 * record stamped "claude-fable-5-1". The stamp reads the fallback now.
 */
export function servedBy(
  m: { model?: string; content?: AnthropicBlock[]; usage?: { iterations?: { model?: string; type?: string }[] } },
  asked: string,
): { model: string; fallback?: string } {
  const block = m.content?.find((b) => b.type === "fallback") as
    | { from?: { model?: string }; to?: { model?: string }; trigger?: { type?: string; category?: string } }
    | undefined;
  const fell = (m.usage?.iterations ?? []).filter((i) => i.type === "fallback_message" && i.model);
  const to = block?.to?.model ?? fell.at(-1)?.model;
  if (!to) return { model: m.model || asked };
  const from = block?.from?.model ?? m.model ?? asked;
  const trigger = block?.trigger ? [block.trigger.type, block.trigger.category].filter(Boolean).join(", ") : "server-side fallback";
  const n = fell.length || 1;
  return { model: to, fallback: `${from} → ${to} (${trigger}; ${n} fallback iteration${n === 1 ? "" : "s"})` };
}

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

/** A call with a configured fallback carries it as the vendor's `fallbacks` parameter. */
function withFallback<T extends { model: string }>(body: T, fallback: string | undefined): T & { fallbacks?: { model: string }[] } {
  return fallback ? { ...body, fallbacks: [{ model: fallback }] } : body;
}

/**
 * A stream that died before `message_stop` (2026-09-08: a fifteen-minute
 * edition reply, torn mid-way). The reply is gone and was probably billed;
 * one more attempt is made and said so on stderr, because an unattended
 * loop that stops on a dropped socket is worse than one that sometimes
 * pays twice. A second tear fails the run.
 */
const TORN_STREAM = /ended before message_stop|operation was aborted|TimeoutError/i;

async function anthropicPost(body: { model: string; fallbacks?: unknown }, fetchImpl: FetchLike, timeoutMs: number): Promise<AnthropicMessage> {
  try {
    return await anthropicPostOnce(body, fetchImpl, timeoutMs);
  } catch (e) {
    if (!TORN_STREAM.test((e as Error).message)) throw e;
    console.error(`anthropic: ${(e as Error).message}; sending the request once more`);
    return anthropicPostOnce(body, fetchImpl, timeoutMs);
  }
}

async function anthropicPostOnce(body: { model: string; fallbacks?: unknown }, fetchImpl: FetchLike, timeoutMs: number): Promise<AnthropicMessage> {
  const res = await fetchWithRetry("anthropic", "https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key("ANTHROPIC_API_KEY"),
      "anthropic-version": ANTHROPIC_VERSION,
      ...(body.fallbacks ? { "anthropic-beta": FALLBACK_BETA } : {}),
    },
    body: JSON.stringify({ ...body, stream: true }),
    signal: AbortSignal.timeout(timeoutMs),
    // fetchWithRetry uses the global fetch; fetchImpl is honored by tests through globalThis
  });
  void fetchImpl;
  if (!res.ok) throw new Error(`anthropic HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const { text, ended } = await readStreamText(res.body);
  try {
    return assembleAnthropicStream(text);
  } catch (e) {
    throw ended ? new Error(`${(e as Error).message}; the connection ended with: ${ended.message}`) : e;
  }
}

/** The vendor's split: uncached input, cache reads, cache writes — each priced at its own rate. */
function usageOf(m: AnthropicMessage): Usage {
  return {
    inputTokens: m.usage.input_tokens ?? 0,
    outputTokens: m.usage.output_tokens ?? 0,
    cacheReadTokens: m.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: m.usage.cache_creation_input_tokens ?? 0,
  };
}

/**
 * Tokens by the model that consumed them. A server call that fell back is
 * billed at two tariffs — the asked model's for the turn it declined, the
 * fallback's for the rest — and the per-iteration usage says which was
 * which; without iterations the whole message is the served model's.
 */
export function usageByModel(m: Pick<AnthropicMessage, "usage">, served: string): Map<string, Usage> {
  const by = new Map<string, Usage>();
  const add = (model: string, u: Usage) => {
    const t = by.get(model) ?? { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
    t.inputTokens += u.inputTokens;
    t.outputTokens += u.outputTokens;
    t.cacheReadTokens! += u.cacheReadTokens ?? 0;
    t.cacheWriteTokens! += u.cacheWriteTokens ?? 0;
    by.set(model, t);
  };
  const iterations = (m.usage?.iterations ?? []).filter((i) => i.input_tokens !== undefined || i.output_tokens !== undefined);
  if (iterations.length === 0) {
    add(served, usageOf(m as AnthropicMessage));
    return by;
  }
  for (const i of iterations) {
    add(i.model || served, {
      inputTokens: i.input_tokens ?? 0,
      outputTokens: i.output_tokens ?? 0,
      cacheReadTokens: i.cache_read_input_tokens ?? 0,
      cacheWriteTokens: i.cache_creation_input_tokens ?? 0,
    });
  }
  return by;
}

/**
 * Automatic prompt caching for the research loop only (the vendor moves the
 * breakpoint forward as the turn grows). In a server-tool loop the model
 * re-reads the whole context after each result; cached, those re-reads cost
 * a fortieth of the base rate on the house model. The first paid run went
 * without it and paid the base rate 39 times over.
 *
 * Not for one-shot calls. The spend ledger of 2026-09-08/09 showed what
 * automatic caching does to a call that is never re-sent: every prompt is
 * written to the cache at 1.25× the base rate and read by nobody — edition
 * 1.74M tokens written, 0 read; draft 1.38M written, 0 read; verify 11.5M
 * written, 77k read (a 1% hit rate) — a quarter more than uncached input for
 * nothing. One-shot calls go uncached; a call that shares a long prefix with
 * its neighbours (verify's source text) marks that prefix itself.
 */
const AUTO_CACHE = { cache_control: { type: "ephemeral" } } as const;

export interface AnthropicResearchOptions {
  model: string;
  fallback?: string;
  system: string;
  user: string;
  maxTokens?: number;
  maxSearches?: number;
  maxFetches?: number;
  maxContentTokens?: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  maxContinuations?: number;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

/**
 * One research turn with web search and web fetch, continued across
 * `pause_turn` stops by re-sending the paused assistant turn (the server
 * resumes; no extra user message). Returns the whole turn's text.
 */
export async function anthropicResearch(opts: AnthropicResearchOptions, meter: Meter): Promise<ResearchResult> {
  const model = opts.model;
  const maxTokens = opts.maxTokens ?? 32000;
  const maxSearches = opts.maxSearches ?? 30;
  const maxFetches = opts.maxFetches ?? 15;
  const maxContentTokens = opts.maxContentTokens ?? 30000;
  assertWithinBudget(
    estimateUsd({
      model,
      inputChars: opts.system.length + opts.user.length,
      maxOutputTokens: maxTokens,
      searches: { count: maxSearches, toolKey: "anthropic:web_search" },
      fetches: { count: maxFetches, maxContentTokens },
    }, loadTariffs(meter.root)),
    { runId: meter.runId, verb: meter.verb, root: meter.root },
  );

  const messages: { role: "user" | "assistant"; content: unknown }[] = [{ role: "user", content: opts.user }];
  const body = withFallback({
    model,
    max_tokens: maxTokens,
    ...AUTO_CACHE,
    thinking: { type: "adaptive" },
    output_config: { effort: opts.effort ?? "high" },
    system: opts.system,
    tools: [
      { type: "web_search_20260318", name: "web_search", max_uses: maxSearches },
      {
        type: "web_fetch_20260318",
        name: "web_fetch",
        max_uses: maxFetches,
        max_content_tokens: maxContentTokens,
        citations: { enabled: true },
        // Fetched bodies consumed by the model's own filtering are not echoed back: they are the bulk of the payload and of the output bill.
        response_inclusion: "excluded",
      },
    ],
    messages,
  }, opts.fallback);

  const raw: unknown[] = [];
  let served = model;
  let fallbackNote: string | undefined;
  const billed = new Map<string, Usage>();
  const texts: string[] = [];
  const citations: { url: string; title?: string }[] = [];
  const usage: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  let searches = 0;
  let fetches = 0;
  const limit = opts.maxContinuations ?? 8;
  for (let i = 0; i <= limit; i++) {
    const m = await anthropicPost(body, opts.fetchImpl ?? fetch, opts.timeoutMs ?? 1_800_000);
    raw.push(m);
    const who = servedBy(m, served); // the model that actually answered (the fallback, if it ran)
    served = who.model;
    if (who.fallback && !fallbackNote) fallbackNote = who.fallback;
    for (const [bm, bu] of usageByModel(m, served)) {
      const t = billed.get(bm) ?? { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
      t.inputTokens += bu.inputTokens;
      t.outputTokens += bu.outputTokens;
      t.cacheReadTokens! += bu.cacheReadTokens ?? 0;
      t.cacheWriteTokens! += bu.cacheWriteTokens ?? 0;
      billed.set(bm, t);
    }
    const u = usageOf(m);
    usage.inputTokens += u.inputTokens;
    usage.outputTokens += u.outputTokens;
    usage.cacheReadTokens! += u.cacheReadTokens ?? 0;
    usage.cacheWriteTokens! += u.cacheWriteTokens ?? 0;
    searches += m.usage.server_tool_use?.web_search_requests ?? 0;
    fetches += m.usage.server_tool_use?.web_fetch_requests ?? 0;
    for (const b of m.content) {
      if (b.type === "text" && b.text) texts.push(b.text);
      for (const c of b.citations ?? []) if (c.url) citations.push({ url: c.url, title: c.title });
    }
    if (m.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: m.content });
      continue;
    }
    break;
  }
  // The ledger first: a refused or truncated turn was billed all the same — each model at its own tariff.
  for (const [bm, bu] of billed) recordTokens(meter, bm, bu);
  recordSearches(meter, "anthropic:web_search", searches);
  const last = raw.at(-1) as AnthropicMessage;
  if (last.stop_reason === "refusal") throw new Error(`${model} refused the research request`);
  if (last.stop_reason === "max_tokens") throw new Error(`${served} hit max_tokens (${maxTokens}) before finishing the report`);
  const text = texts.join("\n").trim();
  if (!text) throw new Error(`${served}: empty report`);
  return { text, model: served, usage, searches, fetches, citations: dedupeCitations(citations), raw, ...(fallbackNote ? { fallback: fallbackNote } : {}) };
}

/**
 * The vendor payload kept beside a report, without the fetched page bodies:
 * the first run's raw.json was 4.2 MB, 3.7 MB of it web pages the model had
 * read. Tool inputs, text, thinking, usage, and the search result lists
 * stay; fetched and executed content is replaced by its size.
 */
export function compactRaw(raw: unknown[]): unknown[] {
  return raw.map((m) => {
    const msg = m as { content?: AnthropicBlock[] };
    if (!Array.isArray(msg.content)) return m;
    return {
      ...msg,
      content: msg.content.map((b) =>
        b.type === "web_fetch_tool_result" || b.type === "code_execution_tool_result"
          ? { ...b, content: { omitted: `${JSON.stringify(b.content ?? null).length} chars` } }
          : b,
      ),
    };
  });
}

function dedupeCitations(list: { url: string; title?: string }[]) {
  const seen = new Map<string, { url: string; title?: string }>();
  for (const c of list) if (!seen.has(c.url)) seen.set(c.url, c);
  return [...seen.values()];
}

export interface AnthropicJsonOptions {
  model: string;
  fallback?: string;
  system: string;
  user: string;
  /**
   * Text shared by many calls in a row (verify: the retrieved source, the
   * same for every record judged against it), placed before `user` as its
   * own block and marked as the cache breakpoint, so the system prompt and
   * this text are written once and read at a tenth of the rate afterwards.
   * Absent, the call is uncached (see AUTO_CACHE).
   */
  cachedPrefix?: string;
  /** JSON Schema (structured outputs: additionalProperties false everywhere, no length or numeric constraints). */
  schema: Record<string, unknown>;
  maxTokens?: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

/** One structured-output call; returns the parsed JSON and the usage. */
/** The vendor's refusal to compile a large schema into a grammar; nothing was billed. */
const GRAMMAR_TOO_LARGE = /compiled grammar is too large/i;

/**
 * One JSON call. Strict structured output first (the vendor guarantees the
 * shape); when the vendor refuses the schema as too large to compile — the
 * draft schema is — the same call is made once more with the schema in the
 * instructions and the reply parsed as JSON. The caller validates either way
 * (every proposal and edition is Zod-checked before it is written), so the
 * loss is only the guarantee, and the result says which mode answered.
 */
/**
 * The body of one structured-output call, pure so the shape is testable: no
 * automatic cache; a `cachedPrefix`, when given, is the first user block and
 * carries the one cache breakpoint (everything before it — the system prompt
 * and the prefix — is what later calls read back); the schema is the output
 * format in strict mode and part of the instructions otherwise.
 */
export function anthropicJsonRequest(opts: AnthropicJsonOptions, strict: boolean) {
  const content = opts.cachedPrefix
    ? [
        { type: "text", text: opts.cachedPrefix, cache_control: { type: "ephemeral" } },
        { type: "text", text: opts.user },
      ]
    : opts.user;
  return withFallback({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 32000,
    thinking: { type: "adaptive" },
    output_config: strict
      ? { effort: opts.effort ?? "high", format: { type: "json_schema", schema: opts.schema } }
      : { effort: opts.effort ?? "high" },
    system: strict
      ? opts.system
      : `${opts.system}\n\nReply with one JSON object and nothing else — no prose, no code fence. It must satisfy this JSON Schema exactly:\n${JSON.stringify(opts.schema)}`,
    messages: [{ role: "user", content }],
  }, opts.fallback);
}

export async function anthropicJson<T = unknown>(
  opts: AnthropicJsonOptions,
  meter: Meter,
): Promise<{ data: T; model: string; usage: Usage; usd: number | null; strict: boolean; fallback?: string }> {
  const model = opts.model;
  const maxTokens = opts.maxTokens ?? 32000;
  assertWithinBudget(
    estimateUsd({ model, inputChars: opts.system.length + (opts.cachedPrefix?.length ?? 0) + opts.user.length, maxOutputTokens: maxTokens }, loadTariffs(meter.root)),
    { runId: meter.runId, verb: meter.verb, root: meter.root },
  );
  const request = (strict: boolean) => anthropicJsonRequest(opts, strict);

  let strict = true;
  let m: AnthropicMessage;
  try {
    m = await anthropicPost(request(true), opts.fetchImpl ?? fetch, opts.timeoutMs ?? 1_800_000);
  } catch (e) {
    if (!GRAMMAR_TOO_LARGE.test((e as Error).message)) throw e;
    console.error(`${meter.runId}: the vendor would not compile the schema for strict output; sending it as instructions`);
    strict = false;
    m = await anthropicPost(request(false), opts.fetchImpl ?? fetch, opts.timeoutMs ?? 1_800_000);
  }
  const who = servedBy(m, model);
  const served = who.model;
  // The ledger first: a refused or truncated reply was billed all the same.
  const usage = usageOf(m);
  let usd: number | null = 0;
  for (const [bm, bu] of usageByModel(m, served)) {
    const part = recordTokens(meter, bm, bu);
    usd = usd === null || part === null ? null : usd + part;
  }
  if (usd !== null) usd = Number(usd.toFixed(6));
  if (m.stop_reason === "refusal") throw new Error(`${model} (and its fallback) refused`);
  if (m.stop_reason === "max_tokens") throw new Error(`${served} hit max_tokens (${maxTokens}) before finishing`);
  const text = m.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  let data: T;
  try {
    data = (strict ? JSON.parse(text) : parseJsonReply(text)) as T;
  } catch (e) {
    throw new Error(`${served}: reply was not the JSON the schema demanded (${(e as Error).message})`);
  }
  return { data, model: served, usage, usd, strict, ...(who.fallback ? { fallback: who.fallback } : {}) };
}

// --------------------------------------------------------------------- OpenAI

type ResponsesOutputItem = {
  type: string;
  content?: { type: string; text?: string; annotations?: { type: string; url?: string; title?: string }[] }[];
};
type ResponsesObject = {
  id: string;
  status: string;
  model: string;
  output?: ResponsesOutputItem[];
  usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } };
  error?: { message?: string } | null;
  incomplete_details?: { reason?: string } | null;
};

export interface OpenAIResearchOptions {
  model: string;
  effort?: "low" | "medium" | "high" | "xhigh";
  instructions: string;
  input: string;
  maxToolCalls?: number;
  maxOutputTokens?: number;
  pollMs?: number;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * A browsing research call through the Responses API in background mode,
 * polled until it completes. Search calls are counted from the output.
 */
export async function openaiResearch(opts: OpenAIResearchOptions, meter: Meter): Promise<ResearchResult> {
  const model = opts.model;
  const maxToolCalls = opts.maxToolCalls ?? 40;
  const maxOutputTokens = opts.maxOutputTokens ?? 40000;
  assertWithinBudget(
    estimateUsd({
      model,
      inputChars: opts.instructions.length + opts.input.length,
      maxOutputTokens,
      searches: { count: maxToolCalls, toolKey: "openai:web_search" },
    }, loadTariffs(meter.root)),
    { runId: meter.runId, verb: meter.verb, root: meter.root },
  );
  const fetchImpl = opts.fetchImpl ?? fetch;
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${key("OPENAI_API_KEY")}` };
  const create = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      instructions: opts.instructions,
      input: opts.input,
      background: true,
      tools: [{ type: "web_search", search_context_size: "medium" }],
      max_tool_calls: maxToolCalls,
      max_output_tokens: maxOutputTokens,
      reasoning: { effort: opts.effort ?? "high", summary: "auto" },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!create.ok) throw new Error(`openai HTTP ${create.status}: ${(await create.text()).slice(0, 400)}`);
  let resp = (await create.json()) as ResponsesObject;
  const raw: unknown[] = [resp];
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const deadline = Date.now() + (opts.timeoutMs ?? 2_400_000);
  while (resp.status === "queued" || resp.status === "in_progress") {
    if (Date.now() > deadline) throw new Error(`openai response ${resp.id} still ${resp.status} after the deadline`);
    await sleep(opts.pollMs ?? 15_000);
    const poll = await fetchImpl(`https://api.openai.com/v1/responses/${resp.id}`, { headers, signal: AbortSignal.timeout(60_000) });
    if (!poll.ok) throw new Error(`openai poll HTTP ${poll.status}`);
    resp = (await poll.json()) as ResponsesObject;
  }
  raw.push(resp);
  // OpenAI counts cached tokens inside input_tokens; split them out so each is priced at its rate.
  const cached = resp.usage?.input_tokens_details?.cached_tokens ?? 0;
  const usage: Usage = {
    inputTokens: Math.max(0, (resp.usage?.input_tokens ?? 0) - cached),
    outputTokens: resp.usage?.output_tokens ?? 0,
    cacheReadTokens: cached,
  };
  const searches = (resp.output ?? []).filter((o) => o.type === "web_search_call").length;
  recordTokens(meter, model, usage);
  recordSearches(meter, "openai:web_search", searches);
  if (resp.status !== "completed") {
    throw new Error(`openai response ended ${resp.status}: ${resp.error?.message ?? resp.incomplete_details?.reason ?? "no detail"}`);
  }
  const content = (resp.output ?? []).filter((o) => o.type === "message").flatMap((o) => o.content ?? []);
  if (content.some((c) => c.type === "refusal")) throw new Error(`${model} refused the research request`);
  const text = content.filter((c) => c.type === "output_text").map((c) => c.text ?? "").join("\n").trim();
  if (!text) throw new Error(`${model}: empty report`);
  const citations = content
    .flatMap((c) => c.annotations ?? [])
    .filter((a) => a.type === "url_citation" && a.url)
    .map((a) => ({ url: a.url!, title: a.title }));
  return { text, model: resp.model, usage, searches, fetches: 0, citations: dedupeCitations(citations), raw };
}
