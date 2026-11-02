/**
 * DeepSeek v4 Flash (free) client — via the OpenCode Zen OpenAI-compatible endpoint.
 *
 * Config (see .env.local):
 *   OPENCODE_ZEN_API_KEY   — Zen bearer key (from `opencode auth login`)
 *   OPENCODE_ZEN_BASE_URL  — defaults to https://opencode.ai/zen/v1
 *   OPENCODE_DEEPSEEK_MODEL — defaults to deepseek-v4-flash-free
 *
 * NOTE: deepseek-v4-flash-free is a *reasoning* model. Its final answer lands in
 * `choices[0].message.content`; the chain-of-thought is in `reasoning_content`.
 * We must allow enough max_tokens for the reasoning to finish, otherwise `content`
 * comes back empty. We read `content`, and only fall back to `reasoning_content`
 * if the model ran out of tokens mid-thought.
 */

function getZenBase(): string {
  return (process.env.OPENCODE_ZEN_BASE_URL || "https://opencode.ai/zen/v1").replace(/\/+$/, "");
}

function getDeepSeekModel(): string {
  return process.env.OPENCODE_DEEPSEEK_MODEL || "deepseek-v4-flash-free";
}

interface ZenChoice {
  message?: { content?: string; reasoning_content?: string };
  finish_reason?: string;
}

/**
 * Single-shot completion from DeepSeek v4 Flash.
 * Throws on network error, non-2xx, or empty response.
 */
export async function callDeepSeek(prompt: string): Promise<string> {
  const key = process.env.OPENCODE_ZEN_API_KEY;
  if (!key) throw new Error("OPENCODE_ZEN_API_KEY is not set");

  const res = await fetch(`${getZenBase()}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: getDeepSeekModel(),
      messages: [{ role: "user", content: prompt }],
      // Generous budget: this is a reasoning model, so the answer only appears
      // after the (hidden) reasoning tokens are spent.
      max_tokens: 8000,
      temperature: 0.3,
      stream: false,
    }),
    signal: AbortSignal.timeout(180_000),
  });

  if (!res.ok) {
    throw new Error(`DeepSeek ${res.status}: ${await res.text().catch(() => "")}`);
  }

  const data = (await res.json()) as { choices?: ZenChoice[] };
  const choice = data.choices?.[0];
  const content = choice?.message?.content?.trim();
  if (content) return content;

  // Ran out of tokens before producing a final answer — surface the reasoning so
  // callers at least get something to parse rather than a silent empty string.
  const reasoning = choice?.message?.reasoning_content?.trim();
  if (reasoning) return reasoning;

  throw new Error("DeepSeek returned empty response");
}
