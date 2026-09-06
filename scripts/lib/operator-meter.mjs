import { AI_POLICY, BudgetStopped } from "./ai-policy.mjs";
import { reserveModel } from "./metered-model.mjs";

/** Claude Code owns its tool loop; it must not own an unmetered API route.
 * Only client-executed tools are admitted. Paid hosted tools need an explicit
 * tariff and are rejected here until such an adapter exists. */
export function operatorRequest(body) {
  if (body.model !== AI_POLICY.operator.model || !Array.isArray(body.messages) ||
    !Number.isSafeInteger(body.max_tokens) || body.max_tokens < 1 ||
    body.max_tokens > AI_POLICY.rates[body.model].maxOutput ||
    body.tools?.some(tool => tool.type && tool.type !== "custom") ||
    body.container || body.mcp_servers?.length || body.context_management || body.speed === "fast" ||
    (body.inference_geo && body.inference_geo !== "global"))
    throw new BudgetStopped("Operator request is outside the metered model/tool contract.");
  return { ...body, service_tier: "standard_only", output_config: { ...body.output_config, effort: AI_POLICY.operator.effort } };
}

/** SSE output counts are cumulative, not a sum of message_delta events. */
export function anthropicStreamReceipt(stream) {
  let model, id, usage, stopped = false, finalUsage = false;
  for (const frame of stream.replaceAll("\r\n", "\n").split("\n\n")) {
    const lines = frame.split("\n").filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart());
    if (!lines.length) continue;
    const event = JSON.parse(lines.join("\n"));
    if (event.type === "error") throw new BudgetStopped("Operator stream failed; full reservation retained.");
    if (event.type === "message_start") { model = event.message.model; id = event.message.id; usage = { ...event.message.usage }; }
    if (event.type === "message_delta" && event.usage) { usage = { ...usage, ...event.usage }; finalUsage = true; }
    if (event.type === "message_stop") stopped = true;
  }
  if (!stopped || !model || !usage || !finalUsage) throw new BudgetStopped("Incomplete operator stream; reservation retained.");
  return { model, id, usage };
}

export async function meterOperator(body, options = {}) {
  const request = operatorRequest(body);
  const reservation = await reserveModel({ model: request.model, workload: "operator", outputLimit: request.max_tokens,
    ...(options.budget ? { budget: options.budget } : {}) });
  return { request, settle: reservation.settle };
}
