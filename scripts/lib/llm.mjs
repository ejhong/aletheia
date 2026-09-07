/** Shared authoring client. Model policy and spend limits live in config/ai.json. */
import { AI_POLICY, tariff, BudgetStopped } from "./ai-policy.mjs";
import { meteredFetch } from "./metered-model.mjs";
import { openaiResponse, OpenAIRefusalError } from "./openai-response.mjs";

const providers = {
  anthropic: {
    key: process.env.ANTHROPIC_API_KEY,
    model: process.env.EXTRACT_MODEL || (AI_POLICY.main.provider === "anthropic" ? AI_POLICY.main.model : "claude-fable-5"),
    fallbackModel: "claude-opus-5",
    async call(system, user, modelOverride) {
      const model = modelOverride ?? this.model;
      if (tariff(model).provider !== "anthropic") throw new BudgetStopped("EXTRACT_MODEL does not belong to Anthropic.");
      const maxTokens = AI_POLICY.main.maxOutputTokens;
      const res = await meteredFetch("https://api.anthropic.com/v1/messages", {
        method: "POST", signal: AbortSignal.timeout(900000),
        headers: { "content-type": "application/json", "x-api-key": this.key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: maxTokens, service_tier: "standard_only",
          output_config: { effort: AI_POLICY.main.effort }, system, messages: [{ role: "user", content: user }] }),
      }, { model, workload: "drafting", outputLimit: maxTokens, cacheWrites: false });
      if (!res.ok) throw new Error(`Anthropic API HTTP ${res.status}; reservation retained`);
      const data = await res.json();
      const text = (data.content ?? []).map(b => b.text ?? "").join("");
      if (data.stop_reason === "refusal" || !text.trim()) throw new RefusalError(model);
      if (data.stop_reason !== "end_turn") throw new Error(`Anthropic response stopped: ${data.stop_reason}`);
      return text;
    },
  },
  openai: {
    key: process.env.OPENAI_API_KEY,
    model: process.env.EXTRACT_MODEL || AI_POLICY.main.model,
    async call(system, user) {
      if (tariff(this.model).provider !== "openai") throw new BudgetStopped("EXTRACT_MODEL does not belong to OpenAI.");
      const { text } = await openaiResponse(system, user, { model: this.model, apiKey: this.key }).catch(error => {
        if (error instanceof OpenAIRefusalError) throw new RefusalError(this.model);
        throw error;
      });
      if (!text.trim()) throw new Error("OpenAI response empty");
      return text;
    },
  },
};

/** A model declined to answer (safety filter), as opposed to erroring. */
export class RefusalError extends Error {
  constructor(model) {
    super(`model ${model} refused or returned no text`);
    this.name = "RefusalError";
    this.model = model;
  }
}

/**
 * Call the provider; on a refusal by the configured Anthropic model,
 * retry EXACTLY once on the fallback (claude-opus-5) — loudly, and with
 * truthful provenance: the return value carries the model that actually
 * produced the text, and callers MUST stamp that model, never
 * provider.model, on any record they write (§3.15). A refusal by the
 * fallback itself propagates as the error it is: fail closed, caller
 * decides.
 */
export async function callWithRefusalFallback(provider, system, user) {
  try {
    const text = await provider.call(system, user);
    return { text, model: provider.model, refused: false };
  } catch (e) {
    const fallback = providers.anthropic.fallbackModel;
    if (
      !(e instanceof RefusalError) ||
      provider.name !== "anthropic" ||
      provider.model === fallback
    ) {
      throw e;
    }
    console.error(
      `model ${provider.model} refused; retrying once on ${fallback} (the record must stamp ${fallback})`,
    );
    const text = await provider.call(system, user, fallback);
    return { text, model: fallback, refused: true };
  }
}

/**
 * Pick the configured provider (or an explicit CLI override). No key-based model substitution.
 * Returns null when none is configured — callers decide whether that is
 * fatal for their run.
 */
export function pickProvider(forced) {
  const name = forced ?? AI_POLICY.main.provider;
  const provider = providers[name];
  if (!provider || !provider.key) return null;
  return { name, model: provider.model, call: provider.call.bind(provider) };
}

/** Standard early-failure message when no key is configured. */
export function noKeyMessage() {
  return [
    "",
    "ERROR: no LLM API key configured.",
    "",
    "Set the configured provider key (locally, or as a repository",
    "secret under GitHub → Settings → Secrets and variables → Actions):",
    "",
    "  OPENAI_API_KEY      OpenAI Responses API (Astra default)",
    "  ANTHROPIC_API_KEY   Explicit Anthropic provider / independent panel",
    "",
    "Model and budget: config/ai.json. EXTRACT_MODEL must have a recorded tariff.",
    "See docs/EXTRACTION_PIPELINE.md and docs/MAINTENANCE.md.",
    "",
  ].join("\n");
}

/**
 * Models occasionally wrap JSON in a code fence, preface it with a sentence,
 * or trail it with commentary. Try the obvious parses first; fall back to
 * the outermost brace span. Still throws on genuinely malformed JSON —
 * callers are fail-closed and must stay that way.
 */
export function parseJsonReply(text) {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fence ? fence[1] : text).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("no JSON object in reply");
    return JSON.parse(candidate.slice(start, end + 1));
  }
}
