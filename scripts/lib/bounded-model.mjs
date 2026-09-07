import { AI_POLICY } from "./ai-policy.mjs";
import { meteredFetch } from "./metered-model.mjs";
import { fingerprint } from "./review-state.mjs";
import { pdfInput, pageImageInput } from "./pdf-passages.mjs";

/** Small manual research pilots only. Rates are explicit standard-tier USD;
 * no tools, retries, cached-input discount assumptions, or unmetered fallback.
 * The shared allowance additionally covers the panel and all other API workers. */
export const RESEARCH_MODELS = Object.fromEntries([
  ["draft", AI_POLICY.sourceDraft], ["read", AI_POLICY.sourceCheck],
].map(([role, id]) => [role, { id, ...AI_POLICY.rates[id] }]));
export const RATE_DATE = AI_POLICY.rateDate;

export class RunStopped extends Error {
  constructor(kind, message) { super(message); this.name = "RunStopped"; this.kind = kind; }
}

export function createResearchBudget({ maxUsd = 1, maxCalls = 4, maxOutputTokens = 6000,
  deadlineMs = 240000, save = (/** @type {unknown} */ report) => { void report; }, now = Date.now } = {}) {
  if (![maxUsd, maxCalls, maxOutputTokens, deadlineMs].every(n => Number.isFinite(n) && n > 0) ||
    !Number.isInteger(maxCalls) || !Number.isInteger(maxOutputTokens)) throw new Error("invalid research budget");
  const started = now();
  const calls = [];
  const report = () => ({ maxUsd, maxCalls, maxOutputTokens, deadlineMs, rateDate: RATE_DATE,
    accountedUsd: calls.reduce((sum, call) => sum + (call.actualUsd ?? call.reservedUsd), 0),
    elapsedMs: now() - started, calls: structuredClone(calls) });
  function checkTime() {
    if (now() - started >= deadlineMs) throw new RunStopped("budget_exhausted", "research deadline reached");
  }
  function reserve(role) {
    checkTime();
    const config = RESEARCH_MODELS[role];
    if (!config) throw new Error("unknown research model role");
    // Reserve the model's ENTIRE input context, not a guessed token count.
    // A single text/file request without tools cannot exceed this context.
    const reservedUsd = (config.context * config.input + maxOutputTokens * config.output) / 1e6;
    if (calls.length >= maxCalls || report().accountedUsd + reservedUsd > maxUsd)
      throw new RunStopped("budget_exhausted", "insufficient call or spend allowance for the next request");
    const call = { index: calls.length, role, model: config.id, rates: config,
      reservedUsd, status: "reserved", inputHash: null };
    calls.push(call);
    save(report()); // Persist liability BEFORE any paid request is sent.
    return call;
  }
  function settle(call, usage, model) {
    const config = call.rates;
    if (!usage || !Number.isInteger(usage.input_tokens) || usage.input_tokens < 0 ||
      usage.input_tokens > config.context || !Number.isInteger(usage.output_tokens) ||
      usage.output_tokens < 0 || usage.output_tokens > maxOutputTokens || model !== config.id)
      throw new RunStopped("failed", "missing or inconsistent usage/model receipt; full reservation retained");
    call.usage = { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens };
    call.actualUsd = (usage.input_tokens * config.input + usage.output_tokens * config.output) / 1e6;
    call.status = "accounted";
    save(report());
  }
  return { report, reserve, settle, checkTime, maxOutputTokens,
    remainingMs: () => Math.max(1, deadlineMs - (now() - started)),
    persist: () => save(report()) };
}

/** @param {ReturnType<typeof createResearchBudget>} budget
 * @param {string} role
 * @param {{instructions: string, input: string, inputHash: string, document?: {data: string, pages: number}, pageImage?: {data: string, page: number}, schema?: Record<string, unknown>}} packet
 * @param {{apiKey?: string, fetchImpl?: typeof fetch, allowance?: ReturnType<typeof import('./ai-budget.mjs').sharedBudget>}} options
 */
export async function boundedCompletion(budget, role, { instructions, input, inputHash, document, pageImage, schema },
  { apiKey = process.env.OPENAI_API_KEY, fetchImpl = fetch, allowance } = {}) {
  if (!apiKey) throw new RunStopped("failed", "OPENAI_API_KEY is not configured");
  if (typeof instructions !== "string" || typeof input !== "string" ||
    Buffer.byteLength(instructions + input, "utf8") > 200000)
    throw new RunStopped("failed", "research packet exceeds the explicit text limit");
  const file = document ? pdfInput(document) : null; // validate before reserving or sending
  const image = pageImage ? pageImageInput(pageImage, document) : [];
  const prompt = `Return the requested JSON object.\n\n${input}`;
  const call = budget.reserve(role);
  const request = { model: call.model, instructions,
    input: file ? [{ role: "user", content: [file, ...image, { type: "input_text", text: prompt }] }] : prompt, store: false,
    service_tier: "default", max_output_tokens: budget.maxOutputTokens,
    reasoning: { effort: "medium" }, text: { format: schema ? { type: "json_schema", name: "source_reading", strict: true, schema } : { type: "json_object" } } };
  call.packetHash = inputHash;
  call.inputHash = fingerprint(request);
  budget.persist();
  try {
    const response = await meteredFetch("https://api.openai.com/v1/responses", {
      method: "POST", signal: AbortSignal.timeout(Math.min(90000, budget.remainingMs())),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }, { model: call.model, workload: "research", outputLimit: budget.maxOutputTokens, fetchImpl, budget: allowance });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      const safe = value => typeof value === "string" && /^[a-zA-Z0-9_.\[\]-]{1,100}$/.test(value) ? value : "unknown";
      call.error = { code: safe(detail.error?.code), type: safe(detail.error?.type), parameter: safe(detail.error?.param) };
      throw new RunStopped("failed", `model HTTP ${response.status}: ${call.error.code} (${call.error.parameter}); reservation retained`);
    }
    const body = await response.json();
    call.outputHash = fingerprint(body.output ?? null);
    budget.settle(call, body.usage, body.model);
    call.responseId = body.id;
    const content = (body.output ?? []).flatMap(item => item.content ?? []);
    if (content.some(item => item.type === "refusal")) throw new RunStopped("refused", "source pass refused");
    if (body.status !== "completed") throw new RunStopped("failed", `model response ${body.status ?? "missing status"}`);
    const text = content.filter(item => item.type === "output_text").map(item => item.text).join("\n");
    if (!text.trim()) throw new RunStopped("failed", "empty model response");
    budget.checkTime();
    const parsed = JSON.parse(text);
    return { value: schema ? parsed.result : parsed, model: body.model, responseId: body.id };
  } catch (error) {
    call.status = error.kind ?? "failed";
    throw error;
  } finally { budget.persist(); }
}
