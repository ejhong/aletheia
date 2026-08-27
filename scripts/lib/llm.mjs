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
    // Default history: Fable was the original default; decision #15's
    // reversal made it Opus after Fable's safety filter refused plain
    // pharmacology statements (11 of orch-or's 18 claims returned
    // stop_reason "refusal", failing that case's reassessment three
    // times; verified 2026-08-25). With the one-shot Opus fallback
    // below, Fable-first is safe again and is the founder's preference
    // (2026-08-27): Fable answers where it will, Opus catches the
    // refusals, and both repos stay identical with no per-repo
    // EXTRACT_MODEL variable to drift. The variable still overrides
    // when set.
    model: process.env.EXTRACT_MODEL || "claude-fable-5",
    // Fable's safety filter refuses plain pharmacology/physiology
    // statements (stop_reason "refusal", or zero text blocks) on cases
    // like orch-or — the documented failure above. When the configured
    // model refuses, retry ONCE on the fallback rather than failing the
    // whole case; the retry is logged, and the caller's fail-closed
    // parsing still governs whatever comes back.
    fallbackModel: "claude-opus-5",
    async call(system, user, modelOverride) {
      const model = modelOverride ?? this.model;
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
      const refused =
        data.stop_reason === "refusal" || text.trim().length === 0;
      if (refused && model !== this.fallbackModel) {
        console.error(
          `model ${model} refused or returned nothing; retrying once on ${this.fallbackModel}`,
        );
        return this.call(system, user, this.fallbackModel);
      }
      return text;
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
