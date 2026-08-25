/**
 * The independent-vendor panel: one seat per API provider, used by the
 * arbiter (scripts/arbiter.mjs). Mirrors the seats in
 * scripts/cross-model-check.mjs — same models, same vendors — so "the
 * panel" means the same five judges everywhere it appears on the site.
 * (cross-model-check.mjs keeps its own inline copy for now; folding it
 * onto this module is a pending cleanup, not a behavioral difference.)
 */

export const VENDORS = {
  anthropic: {
    key: () => process.env.ANTHROPIC_API_KEY,
    model: "claude-opus-5",
    label: "Opus 5 (Anthropic)",
    tag: "opus",
  },
  openai: {
    key: () => process.env.OPENAI_API_KEY,
    model: "gpt-5.1",
    label: "GPT-5.1 (OpenAI)",
    tag: "gpt",
  },
  gemini: {
    key: () => process.env.GEMINI_API_KEY,
    model: "gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro (Google)",
    tag: "gemini",
  },
  xai: {
    key: () => process.env.XAI_API_KEY,
    model: "grok-4.6",
    label: "Grok 4.6 (xAI)",
    tag: "grok",
  },
  venice: {
    key: () => process.env.VENICE_API_KEY,
    model: "kimi-k3",
    label: "Kimi K3 (Moonshot, via Venice)",
    tag: "kimi",
  },
};

/**
 * One chat call to one vendor seat. Returns the reply text; throws on HTTP
 * errors or an empty reply (an empty reply is a refusal or a burned
 * thinking budget, and callers must treat it as a failed seat, never as an
 * empty opinion).
 */
export async function callVendor(name, { system, user, maxTokens = 16000 }) {
  const cfg = VENDORS[name];
  if (!cfg) throw new Error(`unknown vendor ${name}`);
  const key = cfg.key();
  if (!key) throw new Error(`${name}: no API key configured`);

  let url, body, headers;
  if (name === "gemini") {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${key}`;
    body = {
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    };
    headers = { "Content-Type": "application/json" };
  } else if (name === "anthropic") {
    url = "https://api.anthropic.com/v1/messages";
    body = {
      model: cfg.model,
      // Adaptive thinking shares max_tokens with the visible reply; effort
      // is the depth control on this model family.
      max_tokens: Math.max(maxTokens, 32000),
      output_config: { effort: "high" },
      system,
      messages: [{ role: "user", content: user }],
    };
    headers = {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    };
  } else {
    url =
      name === "xai"
        ? "https://api.x.ai/v1/chat/completions"
        : name === "venice"
          ? "https://api.venice.ai/api/v1/chat/completions"
          : "https://api.openai.com/v1/chat/completions";
    body = {
      model: cfg.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_completion_tokens: maxTokens,
    };
    headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    };
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(900_000),
  });
  if (!res.ok)
    throw new Error(
      `${name} HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`,
    );
  const data = await res.json();
  let text;
  if (name === "gemini") {
    text = (data.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("");
  } else if (name === "anthropic") {
    text = (data.content ?? []).map((b) => b.text ?? "").join("");
  } else {
    text = data.choices?.[0]?.message?.content ?? "";
  }
  if (!text || text.trim().length === 0)
    throw new Error(`${name}: empty reply (stop: ${data.stop_reason ?? data.candidates?.[0]?.finishReason ?? "?"})`);
  return text;
}
