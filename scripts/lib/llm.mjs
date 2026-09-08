/**
 * Shared LLM client for the maintenance scripts that predate the verb chain.
 *
 * Environment (see docs/EXTRACTION_PIPELINE.md and docs/MAINTENANCE.md):
 *   ANTHROPIC_API_KEY  Anthropic Messages API key (preferred provider)
 *   OPENAI_API_KEY     OpenAI Chat Completions API key (fallback)
 * Models are chosen in config/models.yaml (house; legacy.openaiChat) — the
 * one place any model is named. The former EXTRACT_MODEL override is
 * retired: an override outside the committed file would make the file lie.
 */
import { MODELS } from "./models.mjs";

const providers = {
  anthropic: {
    key: process.env.ANTHROPIC_API_KEY,
    // The house model (config/models.yaml). History: Fable was the original
    // default; decision #15's reversal made it Opus after Fable's safety
    // filter refused plain pharmacology statements (11 of orch-or's 18
    // claims returned stop_reason "refusal"; verified 2026-08-25). With the
    // one-shot fallback below, Fable-first is safe again and is the
    // founder's preference (2026-08-27): Fable answers where it will, the
    // fallback catches the refusals. A refusal THROWS a typed error instead
    // of silently substituting a model: silent substitution would make
    // every downstream model stamp false (§3.15). Callers that want the
    // fallback use callWithRefusalFallback below, which returns the model
    // that actually produced the text so stamps stay true.
    model: MODELS.house.model,
    fallbackModel: MODELS.house.fallback,
    async call(system, user, model = this.model) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          // Adaptive thinking shares this budget with the visible reply —
          // there is no thinking-budget parameter on this model family. A
          // large case (18 claims) can burn a small budget entirely on
          // thinking and return zero text blocks, which is how the orch-or
          // reassessment kept failing with an empty reply.
          max_tokens: 64000,
          output_config: { effort: "medium" },
          system,
          messages: [{ role: "user", content: user }],
        }),
      });
      if (!res.ok) {
        throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
      }
      const data = await res.json();
      const text = data.content.map((b) => b.text ?? "").join("");
      if (data.stop_reason === "refusal" || text.trim().length === 0) {
        throw new RefusalError(model);
      }
      return text;
    },
  },
  openai: {
    key: process.env.OPENAI_API_KEY,
    model: MODELS.legacy.openaiChat.model,
    async call(system, user, model = this.model) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.key}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) {
        throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
      }
      const data = await res.json();
      return data.choices[0].message.content;
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
 * retry EXACTLY once on the configured fallback — loudly, and with
 * truthful provenance: the return value carries the model that actually
 * produced the text, and callers MUST stamp that model, never
 * provider.model, on any record they write (§3.15). A refusal by the
 * fallback itself propagates as the error it is: fail closed, caller
 * decides.
 */
export async function callWithRefusalFallback(provider, system, user) {
  try {
    const text = await provider.call(system, user, provider.model);
    return { text, model: provider.model, refused: false };
  } catch (e) {
    const fallback = providers.anthropic.fallbackModel;
    if (
      !(e instanceof RefusalError) ||
      provider.name !== "anthropic" ||
      !fallback ||
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
 * Pick a provider (forced name, or auto-detect by which key is set).
 * Returns null when none is configured — callers decide whether that is
 * fatal for their run.
 */
export function pickProvider(forced) {
  const name =
    forced ??
    (process.env.ANTHROPIC_API_KEY
      ? "anthropic"
      : process.env.OPENAI_API_KEY
        ? "openai"
        : null);
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
    "Set ONE of these environment variables (locally, or as a repository",
    "secret under GitHub → Settings → Secrets and variables → Actions):",
    "",
    "  ANTHROPIC_API_KEY   Anthropic Messages API (preferred)",
    "  OPENAI_API_KEY      OpenAI Chat Completions API",
    "",
    "Models are chosen in config/models.yaml.",
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
