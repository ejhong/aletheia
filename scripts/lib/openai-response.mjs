import { AI_POLICY, BudgetStopped } from "./ai-policy.mjs";
import { countResponseInput, meteredFetch } from "./metered-model.mjs";

export class OpenAIRefusalError extends Error {}

/** Explicit, stateless Responses requests. Only this bounded search path may
 * attach a hosted tool; text writers share the same transport and accounting.
 * @param {string} instructions
 * @param {string} input
 * @param {{model?: string, effort?: string, maxOutputTokens?: number, workload?: string, search?: boolean,
 * context?: {case: string, runId: string, phase: string}, budget?: ReturnType<typeof import('./ai-budget.mjs').sharedBudget>,
 * apiKey?: string, fetchImpl?: typeof fetch, timeoutMs?: number}} options */
export async function openaiResponse(instructions, input, { model = AI_POLICY.main.model,
  effort = AI_POLICY.main.effort, maxOutputTokens = AI_POLICY.main.maxOutputTokens,
  workload = "drafting", search = false, context, budget,
  apiKey = process.env.OPENAI_API_KEY, fetchImpl = fetch, timeoutMs = 900000 } = {}) {
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  if (typeof instructions !== "string" || typeof input !== "string")
    throw new Error("Responses requires an explicit text packet");
  const body = { model, instructions, input, store: false, service_tier: "default",
    max_output_tokens: maxOutputTokens, reasoning: { effort },
    ...(search ? { tools: [{ type: "web_search", search_context_size: "low" }],
      max_tool_calls: 1, parallel_tool_calls: false, tool_choice: "required",
      include: ["web_search_call.action.sources"] } : {}) };
  const inputLimit = search ? undefined : await countResponseInput(body, { apiKey, fetchImpl });
  const res = await meteredFetch("https://api.openai.com/v1/responses", {
    method: "POST", signal: AbortSignal.timeout(timeoutMs),
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  }, { model, workload, inputLimit, outputLimit: maxOutputTokens,
    webSearchCalls: search ? 1 : 0, context, budget, fetchImpl });
  if (!res.ok) throw new Error(`OpenAI API HTTP ${res.status}; reservation retained`);
  const data = await res.json();
  const content = (data.output ?? []).flatMap(item => item.content ?? []);
  if (content.some(item => item.type === "refusal")) throw new OpenAIRefusalError(`model ${model} refused`);
  if (data.status !== "completed") throw new Error(`OpenAI response ${data.status ?? "missing status"}`);
  if (search && data.output.filter(item => item.type === "web_search_call").length !== 1)
    throw new BudgetStopped("Search did not run; no discovered URLs may be inferred from model prose.");
  return { text: content.filter(item => item.type === "output_text").map(item => item.text).join("\n"),
    model: data.model, responseId: data.id, output: data.output };
}
