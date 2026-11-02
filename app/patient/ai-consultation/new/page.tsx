"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Brain, Loader2, ChevronRight, Camera, HeartPulse } from "lucide-react";
import toast from "react-hot-toast";
import AiDoctorAvatar from "@/components/AiDoctorAvatar";
import { VitalsScanModal } from "@/components/vitals/VitalsScanModal";
import Button from "@/components/ui/Button";
import type { VitalsResult, VitalsDemographics } from "@/types/vitals";

const SEVERITIES = [
  { id: "mild", cls: "bg-success text-white" },
  { id: "moderate", cls: "bg-warning text-white" },
  { id: "severe", cls: "bg-danger text-white" },
];
const inputCls =
  "w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/12";

export default function NewAiConsultationPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showVitals, setShowVitals] = useState(false);
  const [vitals, setVitals] = useState<VitalsResult | null>(null);
  const [demographics, setDemographics] = useState<VitalsDemographics | null>(null);
  const [form, setForm] = useState({ symptoms: "", duration: "", severity: "moderate", currentMedications: "", additionalNotes: "" });
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    fetch("/api/patient/profile")
      .then((r) => r.json())
      .then((d) => {
        if (d.profile) setDemographics({ age: d.profile.age, sex: d.profile.gender === "Male" ? "M" : "F", height: d.profile.height ?? undefined, weight: d.profile.weight ?? undefined });
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.symptoms.trim() || !form.duration.trim()) { toast.error("Symptoms and duration are required"); return; }
    setLoading(true);
    try {
      const body: Record<string, unknown> = { ...form };
      if (vitals) {
        body.sbp = vitals.blood_pressure.systolic.value.toFixed(0);
        body.dbp = vitals.blood_pressure.diastolic.value.toFixed(0);
        body.hr = vitals.heart_rate.value.toFixed(0);
      }
      const res = await fetch("/api/ai-consultation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed"); return; }
      toast.success("Ready! Starting your AI consultation…");
      router.push(`/patient/ai-consultation/${data.consultation._id}`);
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6 p-5 pt-8 sm:p-8">
      {/* Header card */}
      <div className="grain relative flex items-center gap-5 overflow-hidden rounded-3xl bg-[#0a0c11] p-6 text-white shadow-3">
        <div className="pointer-events-none absolute inset-0 bg-brand-radial opacity-70" />
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border-2 border-white/20">
          <AiDoctorAvatar className="h-full w-full" />
        </div>
        <div className="relative">
          <div className="mb-1 flex items-center gap-2">
            <Brain className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide text-white/70">AI Doctor</span>
          </div>
          <h1 className="text-xl font-bold">Dr. MediIQ AI</h1>
          <p className="mt-0.5 text-sm text-white/70">Available 24/7 · Voice consultation · Safety-checked</p>
        </div>
      </div>

      <div className="rounded-2xl border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-[color-mix(in_srgb,var(--warning)_78%,black)] dark:text-warning">
        <strong>Note:</strong> This is an AI-assisted consultation. The report is generated automatically and is not a substitute for a licensed doctor for serious or emergency conditions.
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-border bg-surface p-6 shadow-1">
        <h2 className="font-semibold text-text">Pre-consultation details</h2>

        <Field label="Symptoms" required>
          <textarea value={form.symptoms} onChange={(e) => set("symptoms", e.target.value)} placeholder="Describe what you're experiencing (e.g. fever, headache, body ache)" rows={3} className={`${inputCls} resize-none`} required />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Duration" required>
            <input value={form.duration} onChange={(e) => set("duration", e.target.value)} placeholder="e.g. 2 days, 1 week" className={inputCls} required />
          </Field>
          <Field label="Severity">
            <div className="flex h-[46px] gap-2">
              {SEVERITIES.map((s) => (
                <button key={s.id} type="button" onClick={() => set("severity", s.id)} className={`flex-1 rounded-xl text-xs font-semibold capitalize transition-colors ${form.severity === s.id ? s.cls : "bg-surface-2 text-muted hover:bg-surface-3"}`}>
                  {s.id}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <Field label="Current medications (if any)">
          <input value={form.currentMedications} onChange={(e) => set("currentMedications", e.target.value)} placeholder="e.g. Metformin 500mg, None" className={inputCls} />
        </Field>

        <Field label="Additional notes">
          <textarea value={form.additionalNotes} onChange={(e) => set("additionalNotes", e.target.value)} placeholder="Anything else the doctor should know…" rows={2} className={`${inputCls} resize-none`} />
        </Field>

        {demographics && (
          <div className="rounded-2xl border border-brand-500/20 bg-brand-500/[0.06] p-4">
            <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-text">
              <HeartPulse className="h-4 w-4 text-brand-500" /> Vitals scan <span className="font-normal text-muted">(optional)</span>
            </p>
            <p className="mb-3 text-xs text-muted">Share a quick BP &amp; heart-rate reading from your camera. Takes 30 seconds.</p>
            {!vitals ? (
              <button type="button" onClick={() => setShowVitals(true)} className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-2">
                <Camera className="h-4 w-4" /> Start 30-second scan
              </button>
            ) : (
              <div className="flex items-center justify-between rounded-xl border border-success/25 bg-surface p-3">
                <div className="text-sm">
                  <p className="font-semibold text-text">BP {vitals.blood_pressure.systolic.value.toFixed(0)} / {vitals.blood_pressure.diastolic.value.toFixed(0)} mmHg <span className="ml-2 font-normal text-muted">({vitals.classification.bp})</span></p>
                  <p className="mt-0.5 text-xs text-muted">HR {vitals.heart_rate.value.toFixed(0)} bpm <span className="ml-1">({vitals.classification.hr})</span></p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <button type="button" onClick={() => setShowVitals(true)} className="text-xs text-brand-600 hover:underline dark:text-brand-300">Rescan</button>
                  <button type="button" onClick={() => setVitals(null)} className="text-xs text-subtle hover:underline">Remove</button>
                </div>
              </div>
            )}
          </div>
        )}

        <Button type="submit" loading={loading} size="lg" className="w-full">
          {loading ? "Preparing your consultation…" : <>Start AI consultation <ChevronRight className="h-4 w-4" /></>}
        </Button>
      </form>

      {showVitals && demographics && (
        <VitalsScanModal demographics={demographics} onComplete={(v: VitalsResult) => { setVitals(v); setShowVitals(false); }} onCancel={() => setShowVitals(false)} />
      )}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-subtle">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      {children}
    </div>
  );
}
