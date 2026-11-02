"use client";
import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Clock, CheckCircle2, AlertCircle, Stethoscope, Radio, Lock, Loader2, Camera, HeartPulse } from "lucide-react";
import Button from "@/components/ui/Button";
import { VitalsScanModal } from "@/components/vitals/VitalsScanModal";
import type { VitalsResult, VitalsDemographics } from "@/types/vitals";

interface Appointment {
  _id: string; doctorName: string; specialization: string; consultationFee: number;
  status: string; bookedAt: string; consultationStartsAt: string; approvedAt?: string;
  preConsultation?: { filledAt: string }; preConsultationLocked?: boolean;
}

const inputCls =
  "w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/12";

function useCountdown(targetMs: number) {
  const [remaining, setRemaining] = useState(() => Math.max(0, targetMs - Date.now()));
  useEffect(() => {
    const interval = setInterval(() => setRemaining(Math.max(0, targetMs - Date.now())), 1000);
    return () => clearInterval(interval);
  }, [targetMs]);
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  return { remaining, mins, secs, expired: remaining === 0 };
}

export default function PreConsultationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [appt, setAppt] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ symptoms: "", duration: "", severity: "moderate" as "mild" | "moderate" | "severe", currentMedications: "", additionalNotes: "" });
  const [showVitals, setShowVitals] = useState(false);
  const [vitals, setVitals] = useState<VitalsResult | null>(null);
  const [demographics, setDemographics] = useState<VitalsDemographics | null>(null);
  const [locked, setLocked] = useState(false);
  const [locking, setLocking] = useState(false);

  useEffect(() => {
    fetch("/api/patient/profile").then((r) => r.json()).then((d) => {
      if (d.profile) setDemographics({ age: d.profile.age, sex: d.profile.gender === "Male" ? "M" : "F", height: d.profile.height ?? undefined, weight: d.profile.weight ?? undefined });
    }).catch(() => {});
  }, []);

  const fetchAppt = useCallback(async () => {
    const res = await fetch(`/api/appointments/${id}`);
    const data = await res.json();
    if (data.appointment) {
      setAppt(data.appointment);
      if (data.appointment.preConsultation?.filledAt) setSubmitted(true);
      if (data.appointment.preConsultationLocked) setLocked(true);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchAppt();
    const interval = setInterval(fetchAppt, 5000);
    return () => clearInterval(interval);
  }, [fetchAppt]);

  const patientDeadlineMs = appt ? new Date(appt.bookedAt).getTime() + 5 * 60 * 1000 : Date.now();
  const consultationMs = appt ? new Date(appt.consultationStartsAt).getTime() : Date.now();
  const patientTimer = useCountdown(patientDeadlineMs);
  const consultationTimer = useCountdown(consultationMs);

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.symptoms.trim() || !form.duration.trim()) { toast.error("Please fill in all required fields"); return; }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { ...form };
      if (vitals) body.vitals = { sbp: vitals.blood_pressure.systolic.value, dbp: vitals.blood_pressure.diastolic.value, hr: vitals.heart_rate.value, bp_classification: vitals.classification.bp, hr_classification: vitals.classification.hr, confidence: vitals.confidence };
      const res = await fetch(`/api/appointments/${id}/pre-consultation`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("Details submitted! Waiting for doctor approval.");
      setSubmitted(true);
      setAppt(data.appointment);
    } catch {
      toast.error("Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
    </div>
  );
  if (!appt) return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center"><p className="text-muted">Appointment not found.</p></div>
  );

  const isRejected = appt.status === "rejected" || appt.status === "cancelled";
  const isConfirmed = appt.status === "confirmed";
  const isActive = appt.status === "active";

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-5 sm:p-8">
      {/* Doctor */}
      <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-5 shadow-1">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-accent-400 text-lg font-bold text-white">{appt.doctorName.charAt(0)}</span>
        <div className="flex-1">
          <p className="font-bold text-text">Dr. {appt.doctorName}</p>
          <p className="text-xs capitalize text-muted">{appt.specialization}</p>
        </div>
        <p className="font-bold text-text">₹{appt.consultationFee}</p>
      </div>

      {/* Timers */}
      <div className="grid grid-cols-2 gap-4">
        <TimerTile
          tone={submitted ? "green" : patientTimer.expired ? "red" : "blue"}
          icon={submitted ? <CheckCircle2 className="h-7 w-7 text-success" /> : patientTimer.expired ? <AlertCircle className="h-7 w-7 text-danger" /> : <Clock className="h-7 w-7 text-brand-500" />}
        >
          {submitted ? <p className="text-xs font-semibold text-success">Details submitted</p>
            : patientTimer.expired ? <p className="text-xs font-semibold text-danger">Time expired</p>
            : <><p className="text-2xl font-bold tnum text-brand-600 dark:text-brand-300">{String(patientTimer.mins).padStart(2, "0")}:{String(patientTimer.secs).padStart(2, "0")}</p><p className="mt-1 text-xs font-semibold text-brand-600 dark:text-brand-300">Fill your details</p></>}
        </TimerTile>
        <TimerTile
          tone={isActive || consultationTimer.expired ? "green" : isRejected ? "red" : "violet"}
          icon={isRejected ? <AlertCircle className="h-7 w-7 text-danger" /> : isActive || consultationTimer.expired ? <Radio className="h-7 w-7 animate-pulse text-success" /> : <Stethoscope className="h-7 w-7 text-violet-500" />}
        >
          {isRejected ? <p className="text-xs font-semibold text-danger">Consultation rejected</p>
            : isActive || consultationTimer.expired ? <p className="text-xs font-semibold text-success">Consultation active</p>
            : <><p className="text-2xl font-bold tnum text-violet-600 dark:text-violet-300">{String(consultationTimer.mins).padStart(2, "0")}:{String(consultationTimer.secs).padStart(2, "0")}</p><p className="mt-1 text-xs font-semibold text-violet-600 dark:text-violet-300">{isConfirmed ? "Consultation starts in" : "Waiting for approval"}</p></>}
        </TimerTile>
      </div>

      {/* Approval banner */}
      {!isRejected && (
        <div className={`flex items-center gap-3 rounded-2xl border p-4 ${isConfirmed || isActive ? "border-success/20 bg-success/10" : "border-warning/25 bg-warning/10"}`}>
          {isConfirmed || isActive ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" /> : <Clock className="h-5 w-5 shrink-0 animate-pulse text-warning" />}
          <div>
            <p className={`text-sm font-semibold ${isConfirmed || isActive ? "text-success" : "text-[color-mix(in_srgb,var(--warning)_78%,black)] dark:text-warning"}`}>
              {isConfirmed || isActive ? "Doctor approved your request" : "Waiting for doctor approval"}
            </p>
            <p className="mt-0.5 text-xs text-muted">{isConfirmed || isActive ? "Your consultation has been confirmed." : "The doctor has 5 minutes to accept your request."}</p>
          </div>
        </div>
      )}

      {isRejected && (
        <div className="rounded-2xl border border-danger/20 bg-danger/10 p-5 text-center">
          <AlertCircle className="mx-auto mb-2 h-8 w-8 text-danger" />
          <p className="font-semibold text-text">Consultation rejected or expired</p>
          <p className="mb-4 mt-1 text-xs text-muted">The doctor did not accept in time, or the request was declined.</p>
          <Button onClick={() => router.push("/patient/book-appointment")} variant="outline" size="sm">Book another doctor</Button>
        </div>
      )}

      {/* Form */}
      {!submitted && !isRejected && (
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-1">
          <h2 className="mb-1 font-bold text-text">Pre-consultation details</h2>
          <p className="mb-5 text-xs text-muted">Help your doctor prepare — fill this within 5 minutes of booking.</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="What are your main symptoms? *">
              <textarea required rows={3} placeholder="e.g. Headache, fever, sore throat…" value={form.symptoms} onChange={(e) => setForm((p) => ({ ...p, symptoms: e.target.value }))} className={`${inputCls} resize-none`} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="How long have you had these? *">
                <input type="text" required placeholder="e.g. 3 days, 1 week…" value={form.duration} onChange={(e) => setForm((p) => ({ ...p, duration: e.target.value }))} className={inputCls} />
              </Field>
              <Field label="Severity">
                <select value={form.severity} onChange={(e) => setForm((p) => ({ ...p, severity: e.target.value as "mild" | "moderate" | "severe" }))} className={inputCls}>
                  <option value="mild">Mild</option><option value="moderate">Moderate</option><option value="severe">Severe</option>
                </select>
              </Field>
            </div>
            <Field label="Current medications (if any)">
              <input type="text" placeholder="e.g. Paracetamol 500mg…" value={form.currentMedications} onChange={(e) => setForm((p) => ({ ...p, currentMedications: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Anything else the doctor should know?">
              <textarea rows={2} placeholder="Additional context, previous diagnoses, allergies…" value={form.additionalNotes} onChange={(e) => setForm((p) => ({ ...p, additionalNotes: e.target.value }))} className={`${inputCls} resize-none`} />
            </Field>

            {demographics && (
              <div className="rounded-2xl border border-brand-500/20 bg-brand-500/[0.06] p-4">
                <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-text"><HeartPulse className="h-4 w-4 text-brand-500" /> Vitals scan <span className="font-normal text-muted">(optional)</span></p>
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

            <Button type="submit" loading={submitting} disabled={patientTimer.expired} size="lg" className="w-full">
              {patientTimer.expired ? "Time expired" : "Submit details"}
            </Button>
          </form>
        </div>
      )}

      {showVitals && demographics && (
        <VitalsScanModal demographics={demographics} onComplete={(v) => { setVitals(v); setShowVitals(false); }} onCancel={() => setShowVitals(false)} />
      )}

      {/* Submitted */}
      {submitted && !isRejected && (
        <div className="rounded-2xl border border-success/20 bg-surface p-6 text-center shadow-1">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-success" />
          <h2 className="mb-1 font-bold text-text">Details submitted!</h2>
          <p className="text-sm text-muted">{isConfirmed || isActive ? "Your doctor has approved. You can now connect." : "Your doctor can now see your details. Waiting for their approval."}</p>

          {submitted && !locked && (
            <button
              onClick={async () => {
                setLocking(true);
                try {
                  const res = await fetch(`/api/appointments/${id}/lock-preconsultation`, { method: "POST" });
                  if (res.ok) {
                    setLocked(true);
                    toast.success("Details locked — AI agents preparing your consultation data");
                    // Trigger the real pre-call agents (3/4/5). Awaited server-side so it
                    // survives on serverless; idempotent, so demo/already-done just no-ops.
                    fetch(`/api/appointments/${id}/run-precall`, { method: "POST" }).catch(() => {});
                  }
                  else { const d = await res.json(); toast.error(d.error ?? "Lock failed"); }
                } catch { toast.error("Failed to lock"); }
                finally { setLocking(false); }
              }}
              disabled={locking}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 font-semibold text-white shadow-md transition-transform hover:brightness-105 active:scale-95 disabled:opacity-50"
            >
              {locking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              {locking ? "Locking…" : "Lock details & prepare AI data"}
            </button>
          )}

          {locked && (
            <div className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-violet-500/20 bg-violet-500/10 px-4 py-2.5 text-sm text-violet-600 dark:text-violet-300">
              <Lock className="h-4 w-4" /> Details locked — AI agents are preparing your consultation data
            </div>
          )}

          {(isActive || isConfirmed) && (
            <button onClick={() => router.push(`/patient/waiting-room/${id}`)} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-success py-3 font-semibold text-white shadow-md transition-transform hover:brightness-105 active:scale-95">
              <Radio className="h-4 w-4" /> Connect with doctor
            </button>
          )}

          {isConfirmed && !isActive && <SkipWaitButton appointmentId={id} onSkipped={fetchAppt} />}
        </div>
      )}
    </div>
  );
}

function TimerTile({ tone, icon, children }: { tone: "green" | "red" | "blue" | "violet"; icon: React.ReactNode; children: React.ReactNode }) {
  const map = {
    green: "border-success/20 bg-success/10", red: "border-danger/20 bg-danger/10",
    blue: "border-brand-500/20 bg-brand-500/10", violet: "border-violet-500/20 bg-violet-500/10",
  };
  return (
    <div className={`rounded-2xl border p-5 text-center ${map[tone]}`}>
      <div className="mx-auto mb-2 flex justify-center">{icon}</div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-semibold text-text">{label}</label>
      {children}
    </div>
  );
}

function SkipWaitButton({ appointmentId, onSkipped }: { appointmentId: string; onSkipped: () => void }) {
  const [loading, setLoading] = useState(false);
  const skip = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/appointments/${appointmentId}/skip-wait`, { method: "POST" });
      if (res.ok) { toast.success("⏩ Wait skipped — consultation is now live!"); onSkipped(); }
      else { const d = await res.json(); toast.error(d.error); }
    } catch { toast.error("Failed"); }
    finally { setLoading(false); }
  };
  return (
    <button onClick={skip} disabled={loading} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-warning/40 bg-warning/10 px-4 py-2.5 text-xs font-semibold text-[color-mix(in_srgb,var(--warning)_78%,black)] transition-colors hover:bg-warning/15 disabled:opacity-50 dark:text-warning">
      {loading ? "Skipping…" : "⏩ DEV: Skip wait"}
    </button>
  );
}
