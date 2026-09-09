/**
 * The independent-vendor panel: one seat per API provider, used by the
 * arbiter (scripts/arbiter.mjs), the cross-model check
 * (scripts/cross-model-check.mjs) and the bench scorer
 * (scripts/score-agenda.mjs). This is the ONE table — "the panel" means
 * the same five judges everywhere it appears on the site.
 *
 * The seats themselves (model, label, tag, pinned effort) are chosen in
 * config/models.yaml — the one place any model is named — and only the
 * API-key variable for each vendor lives here. Seat selection 2026-09-05
 * (docs/DECISIONS.md): the "budget panel".
 */
import { MODELS } from "./models.mjs";

const KEY_ENV = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  xai: "XAI_API_KEY",
  venice: "VENICE_API_KEY",
};

/** The seats, from config/models.yaml (model, label, tag, pinned effort), each with its key reader. */
export const VENDORS = Object.fromEntries(
  Object.entries(MODELS.panel).map(([name, seat]) => {
    if (!KEY_ENV[name]) throw new Error(`config/models.yaml names a panel seat "${name}" with no API-key variable in src/lib/vendors.mjs`);
    return [name, { ...seat, key: () => process.env[KEY_ENV[name]] }];
  }),
);

/**
 * POST with retry on transient failures. Retries (twice, backing off 5s
 * then 20s) exactly the failure classes observed from Actions runners to
 * vendor edges — network-level fetch errors ("TypeError: fetch failed"),
 * HTTP 429, and HTTP 5xx (a Venice seat died on a 520 and then a socket
 * error on two consecutive panel runs, each discarding a paid seat) —
 * and nothing else: 4xx are real errors, and a deadline timeout is not
 * retried because a second 30-minute wait is worse than a failed seat.
 * Returns the first non-retryable Response; the caller still judges
 * res.ok, so genuine HTTP errors keep their existing messages.
 */
export async function fetchWithRetry(name, url, init, attempts = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (attempt > 1) {
      const delay = attempt === 2 ? 5_000 : 20_000;
      console.error(
        `${name}: transient failure (${lastErr}), retry ${attempt - 1}/${attempts - 1} in ${delay / 1000}s`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
    let res;
    try {
      res = await fetch(url, init);
    } catch (err) {
      if (err.name === "TimeoutError" || err.name === "AbortError") throw err;
      lastErr = String(err.cause?.message ?? err.message);
      continue;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < attempts) {
      lastErr = `HTTP ${res.status}`;
      continue;
    }
    return res;
  }
  throw new Error(`${name}: network failure after ${attempts} attempts: ${lastErr}`);
}

/**
 * The exact HTTP request one seat receives for one prompt — url, headers,
 * JSON body — with the seat's pinned effort in the vendor's own dialect.
 * Pure (no I/O), so tests can assert what each seat is actually asked to
 * do. The API key is read here; a missing key throws before any request.
 */
export function buildRequest(name, { system, user, maxTokens = 16000 }) {
  const cfg = VENDORS[name];
  if (!cfg) throw new Error(`unknown vendor ${name}`);
  const key = cfg.key();
  if (!key) throw new Error(`${name}: no API key configured`);

  if (name === "gemini") {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${key}`,
      headers: { "Content-Type": "application/json" },
      body: {
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          thinkingConfig: { thinkingLevel: cfg.effort },
        },
      },
    };
  }
  if (name === "anthropic") {
    return {
      url: "https://api.anthropic.com/v1/messages",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: {
        model: cfg.model,
        // Adaptive thinking shares max_tokens with the visible reply; effort
        // is the depth control on this model family.
        max_tokens: Math.max(maxTokens, 32000),
        output_config: { effort: cfg.effort },
        system,
        messages: [{ role: "user", content: user }],
      },
    };
  }
  // OpenAI-compatible chat completions: OpenAI, xAI, Venice.
  const url =
    name === "xai"
      ? "https://api.x.ai/v1/chat/completions"
      : name === "venice"
        ? "https://api.venice.ai/api/v1/chat/completions"
        : "https://api.openai.com/v1/chat/completions";
  return {
    url,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: {
      model: cfg.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_completion_tokens: maxTokens,
      reasoning_effort: cfg.effort,
    },
  };
}

/**
 * One chat call to one vendor seat. Returns the reply text; throws on HTTP
 * errors or an empty reply (an empty reply is a refusal or a burned
 * thinking budget, and callers must treat it as a failed seat, never as an
 * empty opinion).
 *
 * PANEL SEAT — the refusal fallback (src/lib/llm.mjs) is BANNED here.
 * A seat's identity as a specific vendor/model is constitutionally
 * load-bearing (§3.15 vendor-independence of the panel): a refusing seat
 * must count as a FAILED seat, never be silently swapped to another model.
 */
export async function callVendor(name, opts) {
  return (await callVendorDetailed(name, opts)).text;
}

/**
 * The same call, returning the reply text with the vendor's reported token
 * usage — what the spend ledger (src/pipeline/spend.ts) records. Usage is
 * whatever the vendor reports; when a vendor omits it, the counts are 0 and
 * the caller records that honestly rather than estimating.
 */
export async function callVendorDetailed(
  name,
  { system, user, maxTokens = 16000, timeoutMs = 900_000 },
) {
  const { url, headers, body } = buildRequest(name, { system, user, maxTokens });

  const res = await fetchWithRetry(name, url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok)
    throw new Error(
      `${name} HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`,
    );
  const data = await res.json();
  let text;
  if (name === "gemini") {
    text = (data.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => !p.thought)
      .map((p) => p.text ?? "")
      .join("");
  } else if (name === "anthropic") {
    text = (data.content ?? []).map((b) => b.text ?? "").join("");
  } else {
    text = data.choices?.[0]?.message?.content ?? "";
  }
  if (!text || text.trim().length === 0)
    throw new Error(`${name}: empty reply (stop: ${data.stop_reason ?? data.candidates?.[0]?.finishReason ?? "?"})`);
  const usage =
    name === "gemini"
      ? {
          inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
          outputTokens:
            (data.usageMetadata?.candidatesTokenCount ?? 0) +
            (data.usageMetadata?.thoughtsTokenCount ?? 0),
        }
      : name === "anthropic"
        ? {
            inputTokens: data.usage?.input_tokens ?? 0,
            outputTokens: data.usage?.output_tokens ?? 0,
          }
        : {
            inputTokens: data.usage?.prompt_tokens ?? 0,
            outputTokens: data.usage?.completion_tokens ?? 0,
          };
  return { text, usage, model: VENDORS[name].model };
}
