"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Play, Loader2, CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp,
  Brain, Pill, Shield, Search, BookOpen, FileText, ScanSearch, Siren,
  ArrowRightLeft, Workflow, User, Activity, Heart, Timer,
} from "lucide-react";

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface PatientData {
  user: { _id: string; name: string; email: string };
  profile: Record<string, unknown> | null;
  appointments: Array<Record<string, unknown>>;
  systemDetected: Array<Record<string, unknown>>;
}

interface AgentResult {
  agentId: number;
  agentName: string;
  status: "ok" | "flag" | "error";
  input: unknown;
  output: unknown;
  feedsInto: number[];
  triggeredBy: number[];
  logs: string[];
  durationMs: number;
  error?: string;
}

interface AgentRunState {
  status: "waiting" | "running" | "completed" | "failed";
  result: AgentResult | null;
  startTime: number | null;
  endTime: number | null;
  elapsed: number;
}

interface FormData {
  symptoms: string;
  duration: string;
  severity: "mild" | "moderate" | "severe";
  currentMedications: string;
  additionalNotes: string;
}

interface FlaggedDrug {
  drug: string;
  reason: string;
  suggestedAlternative?: string;
  flaggedBy: "agent7" | "agent8";
}

/* ── Constants ──────────────────────────────────────────────────────────────── */

const AGENT_META: { id: number; name: string; phase: string; desc: string }[] = [
  { id: 1, name: "Patient Summary Agent",  phase: "gather",    desc: "Profile summary + running clinical summary" },
  { id: 3, name: "Similar Cases Agent",    phase: "gather",    desc: "Hybrid vector search + rerank over case library" },
  { id: 4, name: "Medical Context Agent",  phase: "gather",    desc: "ICD-10 codes, MedlinePlus, evidence from knowledge library" },
  { id: 5, name: "Allergy Context Agent",  phase: "gather",    desc: "Expand allergies into drug classes via RxClass" },
  { id: 6, name: "Reasoning Agent",        phase: "prescribe", desc: "Generate prescription from all gathered data" },
  { id: 7, name: "Drug Medic Agent",       phase: "verify",    desc: "Drug interactions + dosage + indication check" },
  { id: 8, name: "Allergy Agent",          phase: "verify",    desc: "Allergy safety check via RxClass cross-references" },
  { id: 9, name: "Finding Detector Agent", phase: "detect",    desc: "Detect new lifelong meds + allergies" },
];

const PIPELINE_ORDER = [1, 3, 4, 5, 6, 7, 8, 9];

const AGENT_ICONS: Record<number, React.ReactNode> = {
  1: <FileText className="w-4 h-4" />,
  3: <Search className="w-4 h-4" />,
  4: <BookOpen className="w-4 h-4" />,
  5: <Shield className="w-4 h-4" />,
  6: <Brain className="w-4 h-4" />,
  7: <Pill className="w-4 h-4" />,
  8: <Siren className="w-4 h-4" />,
  9: <ScanSearch className="w-4 h-4" />,
};

const PHASE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  gather:    { bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200" },
  prescribe: { bg: "bg-violet-50",  text: "text-violet-700",  border: "border-violet-200" },
  verify:    { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200" },
  detect:    { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
};

/* ── Helper Components ──────────────────────────────────────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-semibold text-text">{label}</label>
      {children}
    </div>
  );
}

function InfoPill({ label, value, color = "blue" }: { label: string; value: string | number; color?: string }) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    violet: "bg-violet-50 text-violet-700 border-violet-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    red: "bg-red-50 text-red-700 border-red-100",
    slate: "bg-surface-2 text-text border-border",
  };
  return (
    <div className={`rounded-xl border px-3 py-2 ${colors[color] ?? colors.blue}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-60">{label}</p>
      <p className="text-sm font-bold mt-0.5">{value || "—"}</p>
    </div>
  );
}

function LlmStrategyBadge({ strategy }: { strategy?: string }) {
  if (!strategy) return null;
  if (strategy === "gemini_first") {
    return (
      <span className="text-[9px] px-2 py-0.5 rounded-full font-mono font-bold bg-blue-50 text-blue-500 border border-blue-200">
        Gemini First → Ollama
      </span>
    );
  }
  if (strategy === "race") {
    return (
      <span className="text-[9px] px-2 py-0.5 rounded-full font-mono font-bold bg-violet-50 text-violet-500 border border-violet-200">
        Race: Gemini ∥ Ollama
      </span>
    );
  }
  if (strategy === "streaming") {
    return (
      <span className="text-[9px] px-2 py-0.5 rounded-full font-mono font-bold bg-indigo-50 text-indigo-500 border border-indigo-200">
        Stream: Gemini → Ollama
      </span>
    );
  }
  return null;
}

function LlmWinnerBadge({ provider }: { provider?: string }) {
  if (!provider) return null;
  if (provider === "cache") {
    return (
      <span className="text-[9px] px-2 py-0.5 rounded-full font-mono font-bold bg-cyan-50 text-cyan-600 border border-cyan-200">
        ✔ Cache
      </span>
    );
  }
  if (provider.includes("deepseek")) {
    return (
      <span className="text-[9px] px-2 py-0.5 rounded-full font-mono font-bold bg-violet-50 text-violet-600 border border-violet-200">
        ✔ DeepSeek
      </span>
    );
  }
  const isGemini = provider.includes("gemini");
  return (
    <span className={`text-[9px] px-2 py-0.5 rounded-full font-mono font-bold ${
      isGemini ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-orange-50 text-orange-600 border border-orange-200"
    }`}>
      {isGemini ? "✔ Gemini won" : "✔ Ollama won"}
    </span>
  );
}

/** Shown next to the prescribing agent when Gemini failed and the other model took over. */
function GeminiFallbackBadge({ geminiFailed, provider }: { geminiFailed?: boolean; provider?: string }) {
  if (!geminiFailed) return null;
  const other = provider?.includes("deepseek") ? "DeepSeek" : provider?.includes("ollama") ? "Ollama" : "backup model";
  return (
    <span
      className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-amber-50 text-amber-700 border border-amber-300"
      title={`Gemini was unavailable — ${other} generated this response`}
    >
      ⚠ Gemini failed → {other} answering
    </span>
  );
}

function LlmErrorNote({ geminiError, ollamaError }: { geminiError?: string; ollamaError?: string }) {
  if (!geminiError && !ollamaError) return null;
  return (
    <div className="mt-2 space-y-1">
      {geminiError ? (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[11px]">
          <span className="font-bold text-red-600">Gemini failed: </span>
          <span className="text-red-700">{geminiError}</span>
        </div>
      ) : null}
      {ollamaError ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-[11px]">
          <span className="font-bold text-amber-600">Ollama failed: </span>
          <span className="text-amber-700">{ollamaError}</span>
        </div>
      ) : null}
    </div>
  );
}

function CacheBadge({ cacheStatus }: { cacheStatus?: string }) {
  if (!cacheStatus) return null;
  return (
    <span className={`text-[9px] px-2 py-0.5 rounded-full font-mono font-bold ${
      cacheStatus === "hit"
        ? "bg-cyan-50 text-cyan-700 border border-cyan-200"
        : "bg-surface-2 text-muted border border-border"
    }`}>
      {cacheStatus === "hit" ? "⚡ Cache Hit" : "Cache Miss"}
    </span>
  );
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/* ── Patient Info Section ───────────────────────────────────────────────────── */

function PatientInfoSection({ patient }: { patient: PatientData }) {
  const p = patient.profile;
  if (!p) return <p className="text-sm text-muted">No patient profile found.</p>;

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <User className="w-4 h-4 text-blue-600" />
        <h2 className="font-bold text-text text-sm">Patient Information</h2>
        <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-semibold ml-auto">
          {(p.userId as string) ?? "—"}
        </span>
      </div>
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-linear-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-white text-xl font-bold shrink-0">
            {patient.user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 className="font-bold text-text text-lg capitalize">{patient.user.name}</h3>
            <p className="text-xs text-muted">{patient.user.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <InfoPill label="Age" value={p.age as number} />
          <InfoPill label="Gender" value={p.gender as string} color="violet" />
          <InfoPill label="Weight" value={`${p.weight}kg`} color="emerald" />
          <InfoPill label="Height" value={`${p.height}cm`} color="emerald" />
          <InfoPill label="Blood Group" value={p.bloodGroup as string} color="red" />
          <InfoPill label="City" value={p.city as string} color="slate" />
          <InfoPill label="State" value={p.state as string} color="slate" />
          <InfoPill label="Country" value={p.country as string} color="slate" />
        </div>

        {((p.knownConditions as string[]) ?? []).length > 0 && (
          <div>
            <p className="text-xs font-bold text-muted uppercase tracking-wide mb-2">Known Conditions</p>
            <div className="flex flex-wrap gap-1.5">
              {((p.knownConditions as string[]) ?? []).map((c: string, i: number) => (
                <span key={i} className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-lg px-2.5 py-1 font-medium">{c}</span>
              ))}
            </div>
          </div>
        )}

        {((p.allergies as string[]) ?? []).length > 0 && (
          <div>
            <p className="text-xs font-bold text-muted uppercase tracking-wide mb-2">Allergies</p>
            <div className="flex flex-wrap gap-1.5">
              {((p.allergies as string[]) ?? []).map((a: string, i: number) => (
                <span key={i} className="text-xs bg-red-50 text-red-700 border border-red-200 rounded-lg px-2.5 py-1 font-medium">{a}</span>
              ))}
            </div>
          </div>
        )}

        {((p.currentMedications as string[]) ?? []).length > 0 && (
          <div>
            <p className="text-xs font-bold text-muted uppercase tracking-wide mb-2">Current Medications</p>
            <div className="flex flex-wrap gap-1.5">
              {((p.currentMedications as string[]) ?? []).map((m: string, i: number) => (
                <span key={i} className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg px-2.5 py-1 font-medium">{m}</span>
              ))}
            </div>
          </div>
        )}

        {patient.appointments.length > 0 && (
          <div>
            <p className="text-xs font-bold text-muted uppercase tracking-wide mb-2">Previous Appointments</p>
            <div className="space-y-1.5">
              {patient.appointments.slice(0, 5).map((apt, i) => (
                <div key={i} className="flex items-center gap-2 text-xs bg-surface-2 rounded-lg px-3 py-2 border border-border">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${apt.status === "completed" ? "bg-emerald-400" : "bg-slate-300"}`} />
                  <span className="font-semibold text-text">{(apt.doctorName as string) ?? "—"}</span>
                  <span className="text-subtle">•</span>
                  <span className="text-muted">{(apt.specialization as string) ?? ""}</span>
                  <span className="text-subtle ml-auto">{new Date(apt.createdAt as string).toLocaleDateString()}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold capitalize ${
                    apt.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-muted"
                  }`}>{apt.status as string}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Agent 1 Output Section ─────────────────────────────────────────────────── */

function Agent1Section({ result, isAfter }: { result: AgentResult | null; isAfter?: boolean }) {
  const [expanded, setExpanded] = useState(!isAfter);
  if (!result?.output) return null;
  const out = result.output as { profileSummary?: string; runningSummary?: string; pastConsultations?: Array<Record<string, unknown>>; provider?: string };

  return (
    <div className={`bg-surface rounded-2xl border shadow-sm overflow-hidden ${isAfter ? "border-emerald-200" : "border-blue-200"}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-surface-2/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <FileText className={`w-4 h-4 ${isAfter ? "text-emerald-600" : "text-blue-600"}`} />
          <h2 className="font-bold text-text text-sm">
            {isAfter ? "Agent 1 — After Consultation (Verification)" : "Agent 1 — Patient Summary"}
          </h2>
          <LlmWinnerBadge provider={(out as Record<string, unknown>).provider as string | undefined} />
          <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full">{formatMs(result.durationMs)}</span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-subtle" /> : <ChevronDown className="w-4 h-4 text-subtle" />}
      </button>
      {expanded && (
        <div className="px-5 pb-5 border-t border-border pt-4 space-y-4">
          {out.profileSummary ? (
            <div>
              <p className="text-xs font-bold text-muted uppercase tracking-wide mb-1.5">Profile Summary</p>
              <p className="text-sm text-text bg-blue-50 rounded-xl p-3 border border-blue-100 leading-relaxed">{out.profileSummary}</p>
            </div>
          ) : null}
          {out.runningSummary ? (
            <div>
              <p className="text-xs font-bold text-muted uppercase tracking-wide mb-1.5">Running Clinical Summary</p>
              <p className="text-sm text-text bg-indigo-50 rounded-xl p-3 border border-indigo-100 leading-relaxed">{out.runningSummary}</p>
            </div>
          ) : null}
          {(out.pastConsultations ?? []).length > 0 ? (
            <div>
              <p className="text-xs font-bold text-muted uppercase tracking-wide mb-1.5">Past Consultations</p>
              <div className="space-y-1.5">
                {(out.pastConsultations ?? []).map((c, i) => (
                  <div key={i} className="bg-surface-2 rounded-lg p-3 border border-border text-xs">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-muted">{String(c.date ?? "")}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${c.type === "ai" ? "bg-violet-50 text-violet-700" : "bg-blue-50 text-blue-700"}`}>{c.type === "ai" ? "AI" : "Doctor"}</span>
                    </div>
                    {c.symptoms ? <p className="text-muted"><span className="font-semibold">Symptoms:</span> {String(c.symptoms)}</p> : null}
                    {c.diagnosis ? <p className="text-blue-800 font-medium mt-0.5">{String(c.diagnosis)}</p> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/* ── Pre-Consultation Form ──────────────────────────────────────────────────── */

function PreConsultationForm({
  form, setForm, onRun, running, disabled,
}: {
  form: FormData;
  setForm: React.Dispatch<React.SetStateAction<FormData>>;
  onRun: () => void;
  running: boolean;
  disabled: boolean;
}) {
  const inputClass = "w-full rounded-xl border border-border px-4 py-3 text-sm text-text placeholder:text-subtle focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all";

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <Activity className="w-4 h-4 text-violet-600" />
        <h2 className="font-bold text-text text-sm">Pre-Consultation Details</h2>
        <span className="text-[10px] text-subtle ml-auto">Simulated consultation form</span>
      </div>
      <div className="p-5 space-y-4">
        <Field label="What are the main symptoms? *">
          <textarea
            rows={3}
            placeholder="e.g. Headache, fever, sore throat..."
            value={form.symptoms}
            onChange={(e) => setForm((p) => ({ ...p, symptoms: e.target.value }))}
            className={inputClass + " resize-none"}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Duration *">
            <input
              type="text"
              placeholder="e.g. 3 days, 1 week..."
              value={form.duration}
              onChange={(e) => setForm((p) => ({ ...p, duration: e.target.value }))}
              className={inputClass}
            />
          </Field>
          <Field label="Severity">
            <select
              value={form.severity}
              onChange={(e) => setForm((p) => ({ ...p, severity: e.target.value as FormData["severity"] }))}
              className={inputClass}
            >
              <option value="mild">Mild</option>
              <option value="moderate">Moderate</option>
              <option value="severe">Severe</option>
            </select>
          </Field>
        </div>

        <Field label="Current medications (if any)">
          <input
            type="text"
            placeholder="e.g. Paracetamol 500mg..."
            value={form.currentMedications}
            onChange={(e) => setForm((p) => ({ ...p, currentMedications: e.target.value }))}
            className={inputClass}
          />
        </Field>

        <Field label="Additional notes">
          <textarea
            rows={2}
            placeholder="Anything else the doctor should know..."
            value={form.additionalNotes}
            onChange={(e) => setForm((p) => ({ ...p, additionalNotes: e.target.value }))}
            className={inputClass + " resize-none"}
          />
        </Field>

        <button
          onClick={onRun}
          disabled={running || disabled || !form.symptoms.trim() || !form.duration.trim()}
          className="w-full flex items-center justify-center gap-2 bg-linear-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3.5 transition-all active:scale-[0.98] shadow-sm"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {running ? "Pipeline Running..." : "Run Complete Pipeline"}
        </button>
      </div>
    </div>
  );
}

/* ── Pipeline Timeline ──────────────────────────────────────────────────────── */

function PipelineTimeline({ agentStates }: { agentStates: Record<number, AgentRunState> }) {
  const completedCount = PIPELINE_ORDER.filter(id => agentStates[id]?.status === "completed").length;
  const pct = Math.round((completedCount / PIPELINE_ORDER.length) * 100);
  const allDone = completedCount === PIPELINE_ORDER.length;
  const anyRunning = PIPELINE_ORDER.some(id => agentStates[id]?.status === "running");

  return (
    <div className="bg-surface rounded-2xl border border-blue-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          {anyRunning ? <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
            : allDone ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            : <Workflow className="w-4 h-4 text-subtle" />}
          <h2 className="font-bold text-text text-sm">
            {allDone ? "Pipeline Complete" : anyRunning ? "Pipeline Running" : "Pipeline Timeline"}
          </h2>
        </div>
        <span className="text-xs font-semibold text-blue-600">{pct}%</span>
      </div>

      <div className="px-5 pt-3 pb-1">
        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-4">
          <div className="h-full bg-blue-500 rounded-full transition-all duration-700 ease-out" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="px-5 pb-5 space-y-2">
        {PIPELINE_ORDER.map((id) => {
          const meta = AGENT_META.find(a => a.id === id)!;
          const state = agentStates[id];
          const isDone = state?.status === "completed";
          const isRunning = state?.status === "running";
          const isFailed = state?.status === "failed";
          const isWaiting = !state || state.status === "waiting";
          const pc = PHASE_COLORS[meta.phase];
          const output = state?.result?.output as Record<string, unknown> | undefined;
          const provider = output?.provider as string | undefined;

          return (
            <div key={id} className={`flex items-center gap-3 transition-all duration-500 ${isWaiting ? "opacity-30" : "opacity-100"}`}>
              <div className="shrink-0">
                {isDone ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  : isRunning ? <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                  : isFailed ? <XCircle className="w-4 h-4 text-red-500" />
                  : <div className="w-4 h-4 rounded-full border-2 border-border" />}
              </div>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${pc.bg} ${pc.text}`}>
                {AGENT_ICONS[id]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-semibold ${isDone ? "text-emerald-600" : isRunning ? "text-blue-700" : isFailed ? "text-red-600" : "text-subtle"}`}>
                    Agent {id} — {meta.name.replace(" Agent", "")}
                  </span>
                  <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full ${pc.bg} ${pc.text}`}>{meta.phase}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                <LlmStrategyBadge strategy={(output?.strategy as string) ?? undefined} />
                {provider && <LlmWinnerBadge provider={provider} />}
                <CacheBadge cacheStatus={(output?.cacheStatus as string) ?? undefined} />
                {(isDone || isFailed) && state?.result && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    isDone ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                  }`}>
                    {formatMs(state.result.durationMs)}
                  </span>
                )}
                {isRunning && (
                  <AgentTimer startTime={state.startTime!} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {allDone && (
        <div className="px-5 pb-4 pt-1 border-t border-border">
          <div className="flex items-center gap-2 text-xs text-muted">
            <Timer className="w-3.5 h-3.5" />
            Total: {formatMs(PIPELINE_ORDER.reduce((s, id) => s + (agentStates[id]?.result?.durationMs ?? 0), 0))} across {PIPELINE_ORDER.length} agents
          </div>
        </div>
      )}
    </div>
  );
}

function AgentTimer({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setElapsed(Date.now() - startTime), 100);
    return () => clearInterval(interval);
  }, [startTime]);
  return (
    <span className="text-[10px] font-mono font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full tabular-nums">
      {(elapsed / 1000).toFixed(1)}s
    </span>
  );
}

/* ── Expandable Agent Card ──────────────────────────────────────────────────── */

function AgentCard({ agentId, state }: { agentId: number; state: AgentRunState }) {
  const [expanded, setExpanded] = useState(false);
  const meta = AGENT_META.find(a => a.id === agentId)!;
  const pc = PHASE_COLORS[meta.phase];
  const result = state.result;
  if (!result) return null;

  const output = result.output as Record<string, unknown> | null;
  const provider = output?.provider as string | undefined;

  return (
    <div className={`bg-surface rounded-2xl border shadow-sm overflow-hidden transition-all ${
      expanded ? `${pc.border} border-l-4` : "border-border"
    }`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-surface-2/50 transition-colors"
      >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${pc.bg} ${pc.text}`}>
          {AGENT_ICONS[agentId]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-text">#{agentId}</span>
            <span className="font-semibold text-sm text-text">{meta.name}</span>
            <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${pc.bg} ${pc.text}`}>{meta.phase}</span>
          </div>
          <p className="text-xs text-muted mt-0.5">{meta.desc}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          <LlmStrategyBadge strategy={(output?.strategy as string) ?? undefined} />
          {provider && <LlmWinnerBadge provider={provider} />}
          <GeminiFallbackBadge geminiFailed={output?.geminiFailed as boolean | undefined} provider={provider} />
          <CacheBadge cacheStatus={(output?.cacheStatus as string) ?? undefined} />
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
            result.status === "ok" ? "bg-emerald-50 text-emerald-700" :
            result.status === "flag" ? "bg-amber-50 text-amber-700" :
            "bg-red-50 text-red-700"
          }`}>
            {result.status.toUpperCase()} • {formatMs(result.durationMs)}
          </span>
          {expanded ? <ChevronUp className="w-4 h-4 text-subtle" /> : <ChevronDown className="w-4 h-4 text-subtle" />}
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-border space-y-4 pt-4">
          <LlmErrorNote
            geminiError={(output?.geminiError as string) ?? undefined}
            ollamaError={(output?.ollamaError as string) ?? undefined}
          />
          {result.logs.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-muted block mb-1.5">Agent Logs</label>
              <div className="bg-slate-900 rounded-lg p-3 space-y-0.5 max-h-40 overflow-y-auto">
                {result.logs.map((log, i) => (
                  <div key={i} className="text-[11px] font-mono text-subtle">
                    <span className="text-muted mr-2">{String(i + 1).padStart(2, "0")}</span>
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-muted block mb-1.5">Input</label>
            <pre className="bg-surface-2 border border-border rounded-lg p-3 text-[11px] font-mono text-text overflow-x-auto max-h-60 overflow-y-auto whitespace-pre-wrap">
              {JSON.stringify(result.input, null, 2)}
            </pre>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted block mb-1.5">Output</label>
            <pre className="bg-surface-2 border border-border rounded-lg p-3 text-[11px] font-mono text-text overflow-x-auto max-h-80 overflow-y-auto whitespace-pre-wrap">
              {JSON.stringify(result.output, null, 2)}
            </pre>
          </div>

          {result.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
              <span className="font-semibold">Error:</span> {result.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Drug Interaction Section ───────────────────────────────────────────────── */

function DrugInteractionSection({ agent7Result }: { agent7Result: AgentResult | null }) {
  if (!agent7Result?.output) return null;
  const out = agent7Result.output as Record<string, unknown>;
  const interactions = (out.interactions as Array<Record<string, unknown>>) ?? [];
  const perMedicine = (out.perMedicine as Array<Record<string, unknown>>) ?? [];
  const flagged = perMedicine.filter(v => v.verdict === "FLAG");

  if (interactions.length === 0 && flagged.length === 0) return null;

  return (
    <div className="bg-surface rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-amber-100 flex items-center gap-2">
        <Pill className="w-4 h-4 text-amber-600" />
        <h2 className="font-bold text-amber-800 text-sm">Drug Interaction Analysis</h2>
        <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold ml-auto">Agent 7</span>
      </div>
      <div className="p-5 space-y-3">
        {interactions.length > 0 && (
          <div>
            <p className="text-xs font-bold text-muted uppercase tracking-wide mb-2">Interactions Found</p>
            {interactions.map((int, i) => (
              <div key={i} className={`rounded-xl border p-3 mb-2 ${
                int.level === "Major" ? "bg-red-50 border-red-200" : int.level === "Moderate" ? "bg-amber-50 border-amber-200" : "bg-surface-2 border-border"
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-bold ${int.level === "Major" ? "text-red-700" : int.level === "Moderate" ? "text-amber-700" : "text-muted"}`}>
                    {String(int.level)}
                  </span>
                  <span className="text-xs text-muted">{String(int.drugA)} ↔ {String(int.drugB)}</span>
                </div>
                <p className="text-xs text-muted">{String(int.note)}</p>
              </div>
            ))}
          </div>
        )}
        {flagged.length > 0 && (
          <div>
            <p className="text-xs font-bold text-red-500 uppercase tracking-wide mb-2">Flagged Medicines</p>
            {flagged.map((v, i) => (
              <div key={i} className="bg-red-50 border border-red-200 rounded-xl p-3 mb-2">
                <div className="flex items-center gap-2 mb-1">
                  <XCircle className="w-3.5 h-3.5 text-red-500" />
                  <span className="text-sm font-bold text-red-800 line-through">{String(v.drug)}</span>
                </div>
                <p className="text-xs text-red-600">{String(v.flagReason)}</p>
                {v.replacement ? (
                  <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-2">
                    <ArrowRightLeft className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="text-xs text-emerald-800">Replaced with: <span className="font-bold">{String((v.replacement as Record<string, string>).medicine)}</span></span>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Allergy Detection Section ──────────────────────────────────────────────── */

function AllergyDetectionSection({ agent8Result }: { agent8Result: AgentResult | null }) {
  if (!agent8Result?.output) return null;
  const out = agent8Result.output as Record<string, unknown>;
  const checks = (out.checks as Array<Record<string, unknown>>) ?? [];
  const violations = checks.filter(c => c.verdict !== "PASS" && c.violates);

  if (violations.length === 0) return null;

  return (
    <div className="bg-surface rounded-2xl border border-pink-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-pink-100 flex items-center gap-2">
        <Siren className="w-4 h-4 text-pink-600" />
        <h2 className="font-bold text-pink-800 text-sm">Allergy Violations Detected</h2>
        <span className="text-[10px] bg-pink-100 text-pink-700 px-2 py-0.5 rounded-full font-semibold ml-auto">Agent 8</span>
      </div>
      <div className="p-5 space-y-3">
        {violations.map((c, i) => (
          <div key={i} className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="font-bold text-red-800 text-sm line-through">{String(c.drug)}</span>
              <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                c.verdict === "HARD_BLOCK" ? "bg-red-200 text-red-800" : "bg-amber-100 text-amber-700"
              }`}>{String(c.verdict)}</span>
            </div>
            <p className="text-xs text-red-600 mb-1">
              <span className="font-semibold">Existing Allergy:</span> {String(c.violates)}
            </p>
            {c.classMatch ? (
              <p className="text-xs text-red-500">
                <span className="font-semibold">Drug Class Match:</span> {String(c.classMatch)}
              </p>
            ) : null}
            {c.replacement ? (
              <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-2">
                <ArrowRightLeft className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="text-xs text-emerald-800">Suggested alternative: <span className="font-bold">{String((c.replacement as Record<string, string>).medicine)}</span></span>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Agent 9 Section — Memory Updates ───────────────────────────────────────── */

function Agent9Section({ result }: { result: AgentResult | null }) {
  if (!result?.output) return null;
  const out = result.output as Record<string, unknown>;
  const findings = (out.findings as Array<Record<string, unknown>>) ?? [];

  return (
    <div className="bg-surface rounded-2xl border border-emerald-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-emerald-100 flex items-center gap-2">
        <ScanSearch className="w-4 h-4 text-emerald-600" />
        <h2 className="font-bold text-emerald-800 text-sm">Agent 9 — Patient Memory Updates</h2>
        <LlmWinnerBadge provider={(out as Record<string, unknown>).provider as string | undefined} />
        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold ml-auto">
          {String(out.newLifelongMeds ?? 0)} meds · {String(out.newAllergies ?? 0)} allergies
        </span>
      </div>
      <div className="p-5 space-y-3">
        {findings.length === 0 ? (
          <p className="text-sm text-muted">No new findings detected — patient record is up to date.</p>
        ) : (
          <>
            <p className="text-xs text-muted mb-2">
              The following changes would be written to the patient&apos;s permanent record:
            </p>
            {findings.map((f, i) => (
              <div key={i} className={`rounded-xl border p-3 ${
                f.type === "allergy" ? "bg-red-50 border-red-200" : "bg-blue-50 border-blue-200"
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  {f.type === "allergy" ? <Siren className="w-3.5 h-3.5 text-red-500" /> : <Pill className="w-3.5 h-3.5 text-blue-500" />}
                  <span className={`text-xs font-bold uppercase ${f.type === "allergy" ? "text-red-700" : "text-blue-700"}`}>
                    {f.type === "allergy" ? "New Allergy" : "Lifetime Medicine"}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                    f.status === "pending" ? "bg-amber-100 text-amber-700" : f.status === "accepted" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-muted"
                  }`}>{String(f.status)}</span>
                </div>
                <p className={`text-sm font-semibold ${f.type === "allergy" ? "text-red-800" : "text-blue-800"}`}>{String(f.value)}</p>
                <p className="text-xs text-muted mt-1">{String(f.reason)}</p>
                {f.severity ? <p className="text-[10px] text-muted mt-0.5">Severity: {String(f.severity)}</p> : null}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Rejected Drugs Summary ─────────────────────────────────────────────────── */

function RejectedDrugsBox({ flaggedDrugs }: { flaggedDrugs: FlaggedDrug[] }) {
  if (flaggedDrugs.length === 0) return null;

  return (
    <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <XCircle className="w-5 h-5 text-red-500" />
        <span className="text-base font-bold text-red-800">Rejected Drugs ({flaggedDrugs.length})</span>
      </div>
      <p className="text-xs text-red-600">
        The following drugs were automatically rejected by the safety agents.
      </p>
      {flaggedDrugs.map((f, i) => (
        <div key={i} className="bg-surface rounded-xl border border-red-200 p-4">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
              <XCircle className="w-4 h-4 text-red-500" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-red-800 text-sm line-through">{f.drug}</span>
                <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                  f.flaggedBy === "agent7" ? "bg-amber-100 text-amber-700" : "bg-pink-100 text-pink-700"
                }`}>
                  {f.flaggedBy === "agent7" ? "Agent 7 — Drug Interaction" : "Agent 8 — Allergy Violation"}
                </span>
              </div>
              <p className="text-xs text-red-600 mt-1">{f.reason}</p>
              {f.suggestedAlternative && (
                <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-2">
                  <ArrowRightLeft className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="text-xs text-emerald-800">Replaced with: <span className="font-bold">{f.suggestedAlternative}</span></span>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Prescription Preview ───────────────────────────────────────────────────── */

function PrescriptionPreview({ agent6Result }: { agent6Result: AgentResult | null }) {
  if (!agent6Result?.output) return null;
  const out = agent6Result.output as Record<string, unknown>;
  const rx = out.prescription as Record<string, unknown> | undefined;
  if (!rx) return null;

  const medicines = (rx.medicines as Array<Record<string, unknown>>) ?? [];
  const advice = rx.advice as string[] | string | undefined;
  const adviceList = Array.isArray(advice) ? advice : typeof advice === "string" ? advice.split("\n").filter(Boolean) : [];

  return (
    <div className="bg-surface rounded-2xl border border-emerald-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-emerald-100 flex items-center gap-2">
        <Pill className="w-4 h-4 text-emerald-600" />
        <h2 className="font-bold text-text text-sm">AI Prescription</h2>
        <LlmWinnerBadge provider={(out as Record<string, unknown>).provider as string | undefined} />
        <GeminiFallbackBadge geminiFailed={out.geminiFailed as boolean | undefined} provider={out.provider as string | undefined} />
        <span className="text-[10px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full font-semibold ml-auto">Agent 6</span>
      </div>
      <div className="p-5 space-y-4">
        <div>
          <p className="text-xs font-bold text-muted uppercase tracking-wide mb-1.5">Diagnosis</p>
          <p className="text-sm text-text bg-blue-50 rounded-xl p-3 border border-blue-100 font-medium">{String(rx.diagnosis)}</p>
        </div>

        {medicines.length > 0 && (
          <div>
            <p className="text-xs font-bold text-muted uppercase tracking-wide mb-2">Medicines ({medicines.length})</p>
            <div className="space-y-2">
              {medicines.map((med, i) => (
                <div key={i} className="bg-surface-2 rounded-xl p-3 border border-border">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                    <span className="font-semibold text-sm text-text">{String(med.medicine)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted ml-7">
                    <span>Dosage: {String(med.dosage)}</span>
                    <span>Timing: {String(med.timing)}</span>
                    <span>Frequency: {String(med.frequency)}</span>
                    <span>Duration: {String(med.duration)}</span>
                    {med.purpose ? <span className="col-span-2 italic text-muted">Purpose: {String(med.purpose)}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {adviceList.length > 0 && (
          <div>
            <p className="text-xs font-bold text-muted uppercase tracking-wide mb-2">Advice</p>
            <div className="space-y-1.5">
              {adviceList.map((a, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-text">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                  <span>{a}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {rx.drugSafetyNote ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-xs font-bold text-amber-600 mb-1 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" /> Drug Safety Note
            </p>
            <p className="text-xs text-amber-800">{String(rx.drugSafetyNote)}</p>
          </div>
        ) : null}

        {out.reasoning ? (
          <div>
            <p className="text-xs font-bold text-muted uppercase tracking-wide mb-1.5">Reasoning</p>
            <p className="text-xs text-muted bg-surface-2 rounded-xl p-3 border border-border">{String(out.reasoning)}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────────────────────────── */

export default function FullPipelineFlowPage() {
  const [patient, setPatient] = useState<PatientData | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormData>({
    symptoms: "", duration: "", severity: "moderate", currentMedications: "", additionalNotes: "",
  });

  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineComplete, setPipelineComplete] = useState(false);
  const [agentStates, setAgentStates] = useState<Record<number, AgentRunState>>({});
  const [currentAgentId, setCurrentAgentId] = useState<number | null>(null);
  const [flaggedDrugs, setFlaggedDrugs] = useState<FlaggedDrug[]>([]);
  const [agent1Before, setAgent1Before] = useState<AgentResult | null>(null);
  const [agent1After, setAgent1After] = useState<AgentResult | null>(null);
  const outputsRef = useRef<Record<string, unknown>>({});

  useEffect(() => {
    fetch("/api/admin/development/pipeline-simulation")
      .then(r => r.json())
      .then(d => {
        if (d.ok) setPatient(d.patient);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const runAgent = useCallback(async (agentId: number, formData: FormData): Promise<AgentResult | null> => {
    setCurrentAgentId(agentId);
    setAgentStates(prev => ({
      ...prev,
      [agentId]: { status: "running", result: null, startTime: Date.now(), endTime: null, elapsed: 0 },
    }));

    try {
      const res = await fetch("/api/admin/development/pipeline-simulation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          formData,
          previousOutputs: outputsRef.current,
        }),
      });
      const data = await res.json();

      if (data.ok && data.result) {
        const result = data.result as AgentResult;
        outputsRef.current[`agent${agentId}`] = result.output;

        setAgentStates(prev => ({
          ...prev,
          [agentId]: { status: "completed", result, startTime: prev[agentId]?.startTime ?? null, endTime: Date.now(), elapsed: result.durationMs },
        }));
        return result;
      } else {
        setAgentStates(prev => ({
          ...prev,
          [agentId]: {
            status: "failed",
            result: {
              agentId, agentName: AGENT_META.find(a => a.id === agentId)?.name ?? "",
              status: "error", input: null, output: null, feedsInto: [], triggeredBy: [],
              logs: [data.error ?? "Unknown error"], durationMs: 0, error: data.error,
            },
            startTime: prev[agentId]?.startTime ?? null, endTime: Date.now(), elapsed: 0,
          },
        }));
        return null;
      }
    } catch (err) {
      setAgentStates(prev => ({
        ...prev,
        [agentId]: {
          status: "failed",
          result: {
            agentId, agentName: AGENT_META.find(a => a.id === agentId)?.name ?? "",
            status: "error", input: null, output: null, feedsInto: [], triggeredBy: [],
            logs: [(err as Error).message], durationMs: 0, error: (err as Error).message,
          },
          startTime: prev[agentId]?.startTime ?? null, endTime: Date.now(), elapsed: 0,
        },
      }));
      return null;
    }
  }, []);

  const runPipeline = useCallback(async () => {
    setPipelineRunning(true);
    setPipelineComplete(false);
    setAgentStates({});
    setFlaggedDrugs([]);
    setAgent1Before(null);
    setAgent1After(null);
    outputsRef.current = {};

    const allFlagged: FlaggedDrug[] = [];

    for (const agentId of PIPELINE_ORDER) {
      const result = await runAgent(agentId, form);
      if (!result) continue;

      if (agentId === 1) {
        setAgent1Before(result);
      }

      if (agentId === 7) {
        const out = result.output as Record<string, unknown> | null;
        const perMedicine = (out?.perMedicine as Array<Record<string, unknown>>) ?? [];
        for (const v of perMedicine) {
          if (v.verdict === "FLAG" && v.flagReason) {
            allFlagged.push({
              drug: v.drug as string,
              reason: v.flagReason as string,
              suggestedAlternative: (v.replacement as Record<string, unknown>)?.medicine as string | undefined,
              flaggedBy: "agent7",
            });
          }
        }
        setFlaggedDrugs([...allFlagged]);
      }

      if (agentId === 8) {
        const out = result.output as Record<string, unknown> | null;
        const checks = (out?.checks as Array<Record<string, unknown>>) ?? [];
        for (const c of checks) {
          if (c.verdict !== "PASS" && c.violates) {
            allFlagged.push({
              drug: c.drug as string,
              reason: `Allergy violation: ${c.violates}`,
              suggestedAlternative: (c.replacement as Record<string, unknown>)?.medicine as string | undefined,
              flaggedBy: "agent8",
            });
          }
        }
        setFlaggedDrugs([...allFlagged]);
      }
    }

    // Run Agent 1 again for before/after comparison
    setCurrentAgentId(null);
    const afterResult = await runAgent(1, form);
    if (afterResult) {
      setAgent1After(afterResult);
      setAgentStates(prev => {
        const next = { ...prev };
        if (next[1]) {
          next[1] = { ...next[1], result: agent1Before ?? next[1].result };
        }
        return next;
      });
    }

    setCurrentAgentId(null);
    setPipelineRunning(false);
    setPipelineComplete(true);
  }, [form, runAgent, agent1Before]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted">Loading patient data from MongoDB...</p>
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <div className="text-center max-w-md">
          <XCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <h2 className="font-bold text-text mb-1">Mock Patient Not Found</h2>
          <p className="text-sm text-muted">
            Could not find john@gmail.com in MongoDB. Make sure the patient exists in the database.
          </p>
        </div>
      </div>
    );
  }

  const hasAnyResults = Object.keys(agentStates).length > 0;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-bg">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-surface border-b border-border px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-text text-lg">Full Pipeline Flow</h1>
          <p className="text-xs text-muted">Complete 9-agent consultation simulation with real MongoDB data</p>
        </div>
        {pipelineRunning && (
          <span className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-100">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Pipeline running...
          </span>
        )}
        {pipelineComplete && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
            <CheckCircle2 className="w-3.5 h-3.5" /> Pipeline complete
          </span>
        )}
      </div>

      <div className="max-w-3xl mx-auto p-6 space-y-6">
        {/* Patient Info */}
        <PatientInfoSection patient={patient} />

        {/* Agent 1 Output (before) */}
        {agent1Before && <Agent1Section result={agent1Before} />}

        {/* Pre-Consultation Form */}
        <PreConsultationForm
          form={form}
          setForm={setForm}
          onRun={runPipeline}
          running={pipelineRunning}
          disabled={pipelineComplete}
        />

        {/* Pipeline Timeline */}
        {hasAnyResults && (
          <PipelineTimeline agentStates={agentStates} />
        )}

        {/* Rejected Drugs */}
        <RejectedDrugsBox flaggedDrugs={flaggedDrugs} />

        {/* Prescription Preview (Agent 6) */}
        {agentStates[6]?.status === "completed" && (
          <PrescriptionPreview agent6Result={agentStates[6]?.result ?? null} />
        )}

        {/* Drug Interaction Section (Agent 7) */}
        {agentStates[7]?.status === "completed" && (
          <DrugInteractionSection agent7Result={agentStates[7]?.result ?? null} />
        )}

        {/* Allergy Detection Section (Agent 8) */}
        {agentStates[8]?.status === "completed" && (
          <AllergyDetectionSection agent8Result={agentStates[8]?.result ?? null} />
        )}

        {/* Agent 9 — Memory Updates */}
        {agentStates[9]?.status === "completed" && (
          <Agent9Section result={agentStates[9]?.result ?? null} />
        )}

        {/* Expandable Agent Cards — all completed agents */}
        {hasAnyResults && (
          <div className="space-y-3">
            <h2 className="font-semibold text-text text-sm uppercase tracking-wide">Agent Details</h2>
            {PIPELINE_ORDER.map((id) => {
              const state = agentStates[id];
              if (!state || !state.result) return null;
              return <AgentCard key={id} agentId={id} state={state} />;
            })}
          </div>
        )}

        {/* Final Verification — Before vs After */}
        {agent1After && (
          <div className="space-y-3">
            <h2 className="font-semibold text-text text-sm uppercase tracking-wide flex items-center gap-2">
              <Heart className="w-4 h-4 text-emerald-500" /> Final Verification — Memory Comparison
            </h2>
            <Agent1Section result={agent1After} isAfter />
          </div>
        )}
      </div>
    </div>
  );
}
