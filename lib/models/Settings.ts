import mongoose, { Schema, Model } from "mongoose";

export interface ISetting {
  key: string;
  value: boolean | string | number;
}

const SettingsSchema = new Schema<ISetting>(
  {
    key: { type: String, required: true, unique: true },
    value: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

if (process.env.NODE_ENV === "development") {
  delete mongoose.models["Settings"];
}

const Settings: Model<ISetting> =
  mongoose.models.Settings || mongoose.model<ISetting>("Settings", SettingsSchema);

export default Settings;

export async function isDemoMode(): Promise<boolean> {
  try {
    const doc = await Settings.findOne({ key: "demoMode" }).lean();
    return doc?.value === true;
  } catch {
    return false;
  }
}

export async function setDemoMode(value: boolean): Promise<void> {
  await Settings.updateOne(
    { key: "demoMode" },
    { $set: { key: "demoMode", value } },
    { upsert: true },
  );
}

// ── AI Mode (global LLM routing strategy) ──────────────────────────────────────
//   gemini_only        — every AI task runs on Gemini only
//   gemini_ollama_race — prescriber (Agent 6) = Gemini-preferred parallel (60s) vs
//                        Ollama; every other agent = Ollama only
//   deepseek_only      — every AI task runs on DeepSeek v4 Flash (OpenCode Zen)
//   deepseek_gemini    — prescriber (Agent 6) = Gemini-preferred parallel (60s) vs
//                        DeepSeek; every other agent = DeepSeek only

export type AiMode =
  | "gemini_only"
  | "gemini_ollama_race"
  | "deepseek_only"
  | "deepseek_gemini";

export const AI_MODES: AiMode[] = [
  "gemini_only",
  "gemini_ollama_race",
  "deepseek_only",
  "deepseek_gemini",
];

export const AI_MODE_LABELS: Record<AiMode, string> = {
  gemini_only: "Gemini Only",
  gemini_ollama_race: "Gemini + Ollama",
  deepseek_only: "DeepSeek Only",
  deepseek_gemini: "DeepSeek + Gemini",
};

const DEFAULT_AI_MODE: AiMode = "gemini_ollama_race";

export async function getAiMode(): Promise<AiMode> {
  try {
    const doc = await Settings.findOne({ key: "aiMode" }).lean();
    const v = doc?.value;
    if (typeof v === "string" && (AI_MODES as string[]).includes(v)) {
      return v as AiMode;
    }
    return DEFAULT_AI_MODE;
  } catch {
    return DEFAULT_AI_MODE;
  }
}

export async function setAiMode(mode: AiMode): Promise<void> {
  await Settings.updateOne(
    { key: "aiMode" },
    { $set: { key: "aiMode", value: mode } },
    { upsert: true },
  );
}
