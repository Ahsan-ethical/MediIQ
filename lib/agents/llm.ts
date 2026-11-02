/**
 * Shared LLM helper — mode-aware routing across Gemini, Ollama and DeepSeek.
 *
 * The public API is unchanged so existing call-sites keep working:
 *   generateText            — "race" strategy (used by symptom-cleaning etc.)
 *   generateTextGeminiFirst — "gemini_first" strategy (most agents)
 *   generateTextStreaming   — streaming (Agent 6 real pipeline)
 *
 * What each does now depends on the GLOBAL AI MODE (admin-controlled, persisted
 * in the Settings collection — see lib/models/Settings.ts):
 *
 *   gemini_ollama_race  → original behaviour (unchanged):
 *                           generateText            = Gemini ∥ Ollama race
 *                           generateTextGeminiFirst = Gemini(60s) → Ollama fallback
 *                           generateTextStreaming   = Gemini stream → Ollama fallback
 *   gemini_only         → every task on Gemini only (no Ollama, no DeepSeek)
 *   deepseek_only       → every task on DeepSeek v4 Flash only
 *   deepseek_gemini     → general/summary tasks on DeepSeek only;
 *                         prescription tasks: Gemini first, DeepSeek fallback
 *                         (result.geminiError is set so the UI can show the fallback)
 *
 * Callers that produce a prescription pass { task: "prescription" }; everything
 * else defaults to "general". If the mode can't be read (e.g. DB down) we fall
 * back to gemini_ollama_race — i.e. today's behaviour.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { callDeepSeek } from "@/lib/deepseek";
import { connectDB } from "@/lib/mongodb";
import { getAiMode, type AiMode } from "@/lib/models/Settings";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const gemini = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

function getOllamaBase(): string {
  const env = process.env.NEXT_PUBLIC_OLLAMA_URL?.replace(/\/+$/, "");
  return env || "http://localhost:11434";
}

const OLLAMA_MODEL = "qwen3:8b";

async function callOllama(prompt: string): Promise<string> {
  const base = getOllamaBase();
  const url = `${base}/api/chat`;

  const body = JSON.stringify({
    model: OLLAMA_MODEL,
    messages: [{ role: "user", content: `/no_think\n${prompt}` }],
    stream: false,
    options: { num_predict: 4000 },
  });

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (base.includes("ngrok")) {
    headers["ngrok-skip-browser-warning"] = "1";
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(180_000),
  });

  if (!res.ok) {
    throw new Error(`Ollama ${res.status}: ${await res.text().catch(() => "")}`);
  }

  const data = (await res.json()) as { message?: { content?: string; thinking?: string } };
  const text = data.message?.content?.trim() || data.message?.thinking?.trim() || "";
  if (!text) throw new Error("Ollama returned empty response");
  return text;
}

// ── Gemini primitives ─────────────────────────────────────────────────────────

async function callGemini(prompt: string, timeoutMs = 60_000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const geminiPromise = gemini
    .generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] }, { signal: controller.signal })
    .then((r) => {
      clearTimeout(timer);
      const text = r.response.text().trim();
      if (!text) throw new Error("Gemini returned empty response");
      return text;
    });

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`Gemini timed out after ${timeoutMs / 1000}s`)), timeoutMs);
  });

  return Promise.race([geminiPromise, timeoutPromise]);
}

async function callGeminiStream(prompt: string, onChunk: (partialText: string) => void): Promise<string> {
  const streamResult = await gemini.generateContentStream(prompt);
  let fullText = "";
  for await (const chunk of streamResult.stream) {
    const part = chunk.text();
    if (part) {
      fullText += part;
      onChunk(fullText);
    }
  }
  const text = fullText.trim();
  if (!text) throw new Error("Gemini returned empty response");
  return text;
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.message.includes("ECONNREFUSED")) return `Connection refused — server not running (${err.message.match(/\d+\.\d+\.\d+\.\d+:\d+/)?.[0] ?? ""})`;
    if (err.message.includes("timeout") || err.message.includes("Timeout")) return `Request timed out — ${err.message}`;
    if (err.message.includes("ENOTFOUND")) return `DNS resolution failed — host not found`;
    if (err.message.includes("fetch failed")) return `Network error — ${err.message}`;
    if (err.message.includes("503")) return `Service unavailable (503) — server overloaded`;
    if (err.message.includes("429")) return `Rate limited (429) — too many requests`;
    if (err.message.includes("401") || err.message.includes("403")) return `Auth error — invalid API key or forbidden`;
    if (err.message.includes("SAFETY")) return `Content blocked by safety filter`;
    return err.message;
  }
  return String(err);
}

export type LlmStrategy = "race" | "gemini_first" | "streaming";
export type LlmProvider = "gemini" | "ollama" | "deepseek";

/** Task category — lets deepseek_gemini mode treat prescriptions specially. */
export type LlmTask = "general" | "prescription";

export interface LlmOpts {
  task?: LlmTask;
}

export interface GenerateResult {
  text: string;
  provider: LlmProvider;
  strategy: LlmStrategy;
  geminiError?: string;
  ollamaError?: string;
  deepseekError?: string;
}

/** Read the admin-selected AI mode; fall back to today's behaviour on any error. */
async function resolveMode(): Promise<AiMode> {
  try {
    await connectDB();
    return await getAiMode();
  } catch {
    return "gemini_ollama_race";
  }
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

type OtherProvider = "ollama" | "deepseek";

function emit(text: string, onChunk?: (t: string) => void): string {
  if (onChunk) onChunk(text);
  return text;
}

function callOther(prompt: string, other: OtherProvider): Promise<string> {
  return other === "ollama" ? callOllama(prompt) : callDeepSeek(prompt);
}

/**
 * PRESCRIBER strategy for the two MIXED modes (gemini_ollama_race, deepseek_gemini).
 *
 * Fire Gemini AND the other model (Ollama or DeepSeek) in parallel the moment the
 * prescriber starts. Prefer Gemini if it returns a valid answer within `timeoutMs`
 * (default 60s). If Gemini errors OR is still not done at 60s, use the other model's
 * answer — which has been running in parallel the whole time, so it's usually ready
 * (this is what saves the wall-clock time).
 */
async function runPreferGemini(
  prompt: string,
  other: OtherProvider,
  { onChunk, timeoutMs = 60_000 }: { onChunk?: (t: string) => void; timeoutMs?: number },
): Promise<GenerateResult> {
  const strategy: LlmStrategy = onChunk ? "streaming" : "gemini_first";

  type GeminiOutcome = { ok: true; text: string } | { ok: false; err: string };
  const geminiP: Promise<GeminiOutcome> = (onChunk ? callGeminiStream(prompt, onChunk) : callGemini(prompt, timeoutMs))
    .then((text): GeminiOutcome => ({ ok: true, text }))
    .catch((e): GeminiOutcome => ({ ok: false, err: extractErrorMessage(e) }));

  // Start the other model immediately, in parallel with Gemini.
  const otherP: Promise<{ text?: string; err?: string }> = callOther(prompt, other)
    .then((text) => ({ text }))
    .catch((e) => ({ err: extractErrorMessage(e) }));

  const timeoutP = new Promise<"timeout">((res) => setTimeout(() => res("timeout"), timeoutMs));

  const winner = await Promise.race([geminiP, timeoutP]);

  // Gemini produced a valid answer within the 60s window → take it.
  if (winner !== "timeout" && winner.ok) {
    return { text: winner.text, provider: "gemini", strategy };
  }

  // Gemini failed or was too slow → take the other model's answer (already running).
  const geminiError = winner !== "timeout" ? winner.err : `Gemini did not respond within ${timeoutMs / 1000}s`;
  console.warn(`[LLM] prescriber: Gemini unavailable (${geminiError}) — using ${other}`);
  const otherRes = await otherP;
  if (otherRes.text) {
    if (onChunk) onChunk(otherRes.text); // replace any partial Gemini stream in the UI
    return { text: otherRes.text, provider: other, strategy, geminiError };
  }
  throw new Error(`All LLM providers failed. Gemini: ${geminiError}. ${other}: ${otherRes.err ?? "empty response"}`);
}

/**
 * Central mode dispatch — every public helper funnels through here.
 *
 *   gemini_only        → everything on Gemini.
 *   deepseek_only      → everything on DeepSeek.
 *   gemini_ollama_race → prescriber = Gemini-preferred parallel (60s) vs Ollama;
 *                        every other task = Ollama only.
 *   deepseek_gemini    → prescriber = Gemini-preferred parallel (60s) vs DeepSeek;
 *                        every other task = DeepSeek only.
 */
async function dispatch(
  prompt: string,
  mode: AiMode,
  { task, onChunk, timeoutMs = 60_000 }: { task: LlmTask; onChunk?: (t: string) => void; timeoutMs?: number },
): Promise<GenerateResult> {
  const strategy: LlmStrategy = onChunk ? "streaming" : task === "prescription" ? "gemini_first" : "race";

  // Pure single-provider modes.
  if (mode === "gemini_only") {
    const text = onChunk ? await callGeminiStream(prompt, onChunk) : await callGemini(prompt, timeoutMs);
    return { text, provider: "gemini", strategy };
  }
  if (mode === "deepseek_only") {
    return { text: emit(await callDeepSeek(prompt), onChunk), provider: "deepseek", strategy };
  }

  // Mixed modes — Gemini is reserved for the prescriber only.
  const other: OtherProvider = mode === "gemini_ollama_race" ? "ollama" : "deepseek";

  if (task === "prescription") {
    return runPreferGemini(prompt, other, { onChunk, timeoutMs });
  }

  // Every other (general) task → the OTHER model only, no Gemini, no fallback.
  return { text: emit(await callOther(prompt, other), onChunk), provider: other, strategy };
}

// ── Public API (names unchanged; behaviour now driven by the global mode) ──────

/** Streaming variant — pushes partial text via `onChunk`. */
export async function generateTextStreaming(
  prompt: string,
  onChunk: (partialText: string) => void,
  opts: LlmOpts = {},
): Promise<GenerateResult> {
  const mode = await resolveMode();
  return dispatch(prompt, mode, { task: opts.task ?? "general", onChunk });
}

/** Non-streaming; `timeoutMs` bounds how long the prescriber waits for Gemini. */
export async function generateTextGeminiFirst(
  prompt: string,
  timeoutMs = 60_000,
  opts: LlmOpts = {},
): Promise<GenerateResult> {
  const mode = await resolveMode();
  return dispatch(prompt, mode, { task: opts.task ?? "general", timeoutMs });
}

/** Non-streaming; kept for backwards compatibility with existing call-sites. */
export async function generateText(prompt: string, opts: LlmOpts = {}): Promise<GenerateResult> {
  const mode = await resolveMode();
  return dispatch(prompt, mode, { task: opts.task ?? "general" });
}
