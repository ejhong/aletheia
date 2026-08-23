/**
 * Shared LLM client for the pipeline scripts.
 *
 * Environment (see docs/EXTRACTION_PIPELINE.md and docs/MAINTENANCE.md):
 *   ANTHROPIC_API_KEY  Anthropic Messages API key (preferred provider)
 *   OPENAI_API_KEY     OpenAI Chat Completions API key (fallback)
 *   EXTRACT_MODEL      optional model override for whichever provider runs
 */

const providers = {
  anthropic: {
    key: process.env.ANTHROPIC_API_KEY,
    model: process.env.EXTRACT_MODEL || "claude-fable-5",
    async call(system, user) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 8192,
          system,
          messages: [{ role: "user", content: user }],
        }),
      });
      if (!res.ok) {
        throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
      }
      const data = await res.json();
      return data.content.map((b) => b.text ?? "").join("");
    },
  },
  openai: {
    key: process.env.OPENAI_API_KEY,
    model: process.env.EXTRACT_MODEL || "gpt-4o",
    async call(system, user) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.key}`,
        },
        body: JSON.stringify({
          model: this.model,
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
    "Optional: EXTRACT_MODEL to override the default model.",
    "See docs/EXTRACTION_PIPELINE.md and docs/MAINTENANCE.md.",
    "",
  ].join("\n");
}

/** Models occasionally wrap JSON in a code fence; strip it and parse. */
export function parseJsonReply(text) {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse((m ? m[1] : text).trim());
}
