import { AI_POLICY, BudgetStopped, tariff, tokenCost } from "./ai-policy.mjs";
import { sharedBudget } from "./ai-budget.mjs";

const integer = n => Number.isSafeInteger(n) && n >= 0;
export function usageReceipt(provider, data) {
  const u = provider === "gemini" ? data.usageMetadata : data.usage;
  if (!u) throw new BudgetStopped("Missing model usage; full reservation retained.");
  let input, output, cacheWrite = 0;
  if (provider === "anthropic") {
    cacheWrite = u.cache_creation_input_tokens ?? 0;
    const cached = u.cache_read_input_tokens ?? 0;
    if (![u.input_tokens, cacheWrite, cached].every(integer)) throw new BudgetStopped("Invalid Anthropic usage.");
    input = u.input_tokens + cacheWrite + cached; output = u.output_tokens;
  } else if (provider === "gemini") {
    input = u.promptTokenCount;
    const thoughts = u.thoughtsTokenCount ?? 0;
    if (!integer(thoughts) || !integer(u.candidatesTokenCount)) throw new BudgetStopped("Invalid Gemini usage.");
    output = u.candidatesTokenCount + thoughts;
  } else {
    input = u.input_tokens ?? u.prompt_tokens;
    output = u.output_tokens ?? u.completion_tokens;
    cacheWrite = u.input_tokens_details?.cache_write_tokens ?? u.prompt_tokens_details?.cache_write_tokens ?? 0;
  }
  if (![input, output, cacheWrite].every(integer) || cacheWrite > input)
    throw new BudgetStopped("Invalid token usage; full reservation retained.");
  return { input, output, cacheWrite };
}

export function verifyModel(requested, returned) {
  // An alias may report its dated snapshot. Arbitrary substitutions are rejected.
  if (typeof returned !== "string" || (returned !== requested &&
    !new RegExp(`^${requested.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-\\d{4}-\\d{2}-\\d{2}$`).test(returned)))
    throw new BudgetStopped("Unexpected model receipt; full reservation retained.");
}

/** @param {{model: string, workload: string, inputLimit?: number, outputLimit: number, cacheWrites?: boolean, budget?: ReturnType<typeof sharedBudget>}} options */
export async function reserveModel({ model, workload, inputLimit, outputLimit, cacheWrites = true, budget = sharedBudget() }) {
  const policy = await budget.getPolicy();
  const rate = tariff(model, policy);
  const reservedRate = cacheWrites ? rate : { ...rate, cacheWrite: rate.input };
  const input = inputLimit ?? rate.context;
  if (!integer(input) || input > rate.context || !integer(outputLimit) || outputLimit < 1 || outputLimit > rate.maxOutput)
    throw new BudgetStopped("Request exceeds the recorded model limits.");
  const ticket = await budget.reserve({ model, workload, amount: tokenCost(reservedRate, input, outputLimit, { reserve: true }),
    terms: { inputLimit: input, outputLimit, inputRate: rate.input, cacheWriteRate: reservedRate.cacheWrite ?? rate.input,
      outputRate: rate.output, longThreshold: rate.longThreshold ?? rate.context,
      longInputFactor: rate.longInputFactor ?? 1, longOutputFactor: rate.longOutputFactor ?? 1,
      rateDate: policy.rateDate, source: rate.source } });
  return { async settle(data) {
    // Images generations report usage but do not echo a model field.
    const returnedModel = data.model ?? (model === AI_POLICY.imageModel ? model : data.modelVersion?.replace(/^models\//, ""));
    verifyModel(model, returnedModel);
    const usage = usageReceipt(rate.provider, data);
    if (!cacheWrites && usage.cacheWrite > 0) throw new BudgetStopped("Unexpected cache creation; reservation retained.");
    if (usage.input > input || usage.output > outputLimit) throw new BudgetStopped("Usage exceeds reserved token limits; reservation retained.");
    await budget.settle(ticket, tokenCost(rate, usage.input, usage.output, usage),
      { ...usage, model: returnedModel, rateDate: policy.rateDate,
        ...(typeof (data.id ?? data.responseId) === "string" ? { responseId: data.id ?? data.responseId } : {}) });
  }, ticket };
}

/** Every retry is a separate liability. Unknown HTTP outcomes stay reserved;
 * successful refusals still cost tokens and are settled before being rejected.
 * @param {string} url
 * @param {RequestInit} init
 * @param {{model: string, workload: string, inputLimit?: number, outputLimit: number, cacheWrites?: boolean, budget?: ReturnType<typeof sharedBudget>, fetchImpl?: typeof fetch}} options
 */
export async function meteredFetch(url, init, { model, workload, inputLimit,
  outputLimit, cacheWrites, budget, fetchImpl = fetch }) {
  const reservation = await reserveModel({ model, workload, inputLimit, outputLimit, cacheWrites, ...(budget ? { budget } : {}) });
  const res = await fetchImpl(url, init);
  if (res.ok) await reservation.settle(await res.clone().json());
  return res;
}

/** The main writer uses the provider's input counter so reserving Astra's
 * million-token context does not prevent a short request. No hidden server
 * state, files or hosted tools are permitted by this text-only client.
 * @param {{model: string, input: string, instructions: string}} body
 * @param {{apiKey: string, fetchImpl?: typeof fetch}} options
 */
export async function countResponseInput(body, { apiKey, fetchImpl = fetch }) {
  if (typeof body.input !== "string" || typeof body.instructions !== "string")
    throw new BudgetStopped("The drafting client requires an explicit text packet.");
  const res = await fetchImpl("https://api.openai.com/v1/responses/input_tokens", {
    method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: body.model, input: body.input, instructions: body.instructions }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new BudgetStopped(`Input count HTTP ${res.status}; no generation sent.`);
  const count = (await res.json()).input_tokens;
  if (!integer(count)) throw new BudgetStopped("Invalid input count; no generation sent.");
  const context = tariff(body.model).context;
  if (count > context) throw new BudgetStopped("Drafting input exceeds the model context.");
  return Math.min(context, count + 4096); // explicit headroom for framing; verify receipt on return
}
