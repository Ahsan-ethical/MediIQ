"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import { Cpu, Loader2, CheckCircle2, Sparkles, Zap, Server, GitCompareArrows } from "lucide-react";
import { PageBody, PageHeader } from "@/components/ui/PageHeader";
import { spring } from "@/lib/motion";

type AiMode = "gemini_only" | "gemini_ollama_race" | "deepseek_only" | "deepseek_gemini";

interface ModeCard {
  mode: AiMode; label: string; tagline: string; detail: string;
  icon: React.ReactNode; ring: string; chip: string;
}

const MODES: ModeCard[] = [
  {
    mode: "gemini_only", label: "Gemini Only", tagline: "Everything runs on Gemini",
    detail: "All AI tasks — summaries, prescriptions, everything — use Google Gemini 2.5 Flash only. No Ollama, no DeepSeek. If Gemini fails, the task fails.",
    icon: <Sparkles className="h-5 w-5" />, ring: "ring-brand-500 border-brand-400", chip: "bg-brand-500/12 text-brand-600 dark:text-brand-300",
  },
  {
    mode: "gemini_ollama_race", label: "Gemini + Ollama", tagline: "Gemini for the prescriber, Ollama for the rest",
    detail: "The prescribing agent (Agent 6) runs Gemini and local Ollama (qwen3:8b) in parallel and prefers Gemini if it answers within 60s, otherwise takes Ollama's answer. Every other agent runs on Ollama only.",
    icon: <GitCompareArrows className="h-5 w-5" />, ring: "ring-success border-success", chip: "bg-success/12 text-success",
  },
  {
    mode: "deepseek_only", label: "DeepSeek Only", tagline: "Everything runs on DeepSeek v4 Flash",
    detail: "All AI tasks — transcript summarization, prescriptions, everything — use DeepSeek v4 Flash (free) via OpenCode Zen. (Raw speech-to-text is handled by Agora, not an LLM, so it's unaffected.)",
    icon: <Zap className="h-5 w-5" />, ring: "ring-violet-500 border-violet-400", chip: "bg-violet-500/12 text-violet-600 dark:text-violet-300",
  },
  {
    mode: "deepseek_gemini", label: "DeepSeek + Gemini", tagline: "Gemini for the prescriber, DeepSeek for the rest",
    detail: "The prescribing agent (Agent 6) runs Gemini and DeepSeek in parallel and prefers Gemini if it answers within 60s, otherwise takes DeepSeek's answer — and the UI shows 'Gemini failed → DeepSeek answering' next to that agent. Every other agent runs on DeepSeek only.",
    icon: <Server className="h-5 w-5" />, ring: "ring-warning border-warning", chip: "bg-warning/12 text-[color-mix(in_srgb,var(--warning)_78%,black)] dark:text-warning",
  },
];

export default function AiModePage() {
  const [current, setCurrent] = useState<AiMode | null>(null);
  const [saving, setSaving] = useState<AiMode | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/settings/ai-mode")
      .then((r) => r.json())
      .then((d) => setCurrent(d.aiMode ?? "gemini_ollama_race"))
      .catch(() => setCurrent("gemini_ollama_race"))
      .finally(() => setLoading(false));
  }, []);

  const selectMode = async (mode: AiMode) => {
    if (mode === current || saving) return;
    setSaving(mode);
    try {
      const res = await fetch("/api/admin/settings/ai-mode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }) });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setCurrent(mode);
      toast.success(`AI mode set to “${MODES.find((m) => m.mode === mode)!.label}”`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update AI mode");
    } finally {
      setSaving(null);
    }
  };

  return (
    <PageBody className="max-w-4xl">
      <PageHeader
        title={<span className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gradient text-white"><Cpu className="h-5 w-5" /></span> AI Engine</span>}
        subtitle="Choose which model powers every AI task across MediIQ. Your choice is saved and persists across refreshes."
      />

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Loading current mode…</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {MODES.map((m) => {
            const active = current === m.mode;
            const isSaving = saving === m.mode;
            return (
              <motion.button
                key={m.mode}
                onClick={() => selectMode(m.mode)}
                disabled={!!saving}
                whileHover={{ y: saving ? 0 : -3 }}
                transition={spring}
                className={`group relative overflow-hidden rounded-2xl border-2 bg-surface p-5 text-left shadow-1 transition-shadow disabled:cursor-not-allowed ${active ? `ring-2 ${m.ring} shadow-3` : "border-border hover:border-border-strong hover:shadow-3"}`}
              >
                {active && (
                  <motion.span layoutId="ai-mode-active" className="pointer-events-none absolute inset-0 -z-0 bg-brand-radial opacity-50" transition={spring} />
                )}
                <div className="relative flex items-start justify-between">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${m.chip}`}>{m.icon}</span>
                  {active ? (
                    <span className="flex items-center gap-1 text-xs font-semibold text-success"><CheckCircle2 className="h-4 w-4" /> Active</span>
                  ) : isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin text-subtle" />
                  ) : null}
                </div>
                <h3 className="relative mt-3 font-semibold text-text">{m.label}</h3>
                <p className="relative text-xs font-medium text-muted">{m.tagline}</p>
                <p className="relative mt-2 text-sm leading-relaxed text-muted">{m.detail}</p>
              </motion.button>
            );
          })}
        </div>
      )}

      <p className="text-xs text-subtle">
        Note: raw speech-to-text during calls is produced by Agora, not an LLM, so it is unaffected by this setting.
        The Transcribe Agent (which structures &amp; summarizes that transcript) is a text task and follows the mode above.
      </p>
    </PageBody>
  );
}
