"use client";

import { useEffect, useState } from "react";
import { Brain, Loader2, ChevronDown, ChevronUp, HeartPulse, User, CheckCircle2, Database, Search, Zap } from "lucide-react";
import type { CallAppointment, AiReport } from "@/types/consultation";

interface Props {
  appointmentId: string;
  appt:          CallAppointment;
}

export function PatientReportPanel({ appointmentId, appt }: Props) {
  const [report, setReport]       = useState<AiReport | null>(appt.aiReport ?? null);
  const [loading, setLoading]     = useState(!appt.aiReport);
  const [reportError, setReportError] = useState<string | null>(null);
  const [expanded, setExpanded]   = useState(true);
  const [prefetchStep, setPrefetchStep] = useState<string | null>(null);

  // Poll prefetchStep so doctor sees live data-loading status during the call
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res  = await fetch(`/api/appointments/${appointmentId}`);
        const data = await res.json();
        const step = data.appointment?.prefetchStep as string | undefined;
        if (!cancelled && step) setPrefetchStep(step);
        if (!cancelled && step !== "ready") setTimeout(poll, 3000);
      } catch { if (!cancelled) setTimeout(poll, 5000); }
    };
    poll();
    return () => { cancelled = true; };
  }, [appointmentId]);

  useEffect(() => {
    if (report) return;
    // Generate (or fetch cached) AI report
    setLoading(true);
    fetch(`/api/appointments/${appointmentId}/ai-report`, { method: "POST" })
      .then(async r => {
        const d = await r.json();
        if (d.aiReport) {
          setReport(d.aiReport);
          setReportError(null);
        } else if (d.error) {
          console.error("[AiReport] Server error:", d.error, d.details);
          setReportError(`${d.error}${d.details ? `: ${d.details}` : ""}`);
        }
      })
      .catch((err) => {
        console.error("[AiReport] Fetch failed:", err);
        setReportError(err instanceof Error ? err.message : "Failed to generate AI report");
      })
      .finally(() => setLoading(false));
  }, [appointmentId, report]);

  const pc = appt.preConsultation;
  const pp = appt.patientProfile;
  const v  = pc?.vitals;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-surface border-l border-border">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
        <div>
          <h2 className="font-bold text-text text-sm">{appt.patientName}</h2>
          <p className="text-xs text-muted">
            {pp ? `${pp.age}yo · ${pp.gender} · ${pp.bloodGroup}` : "Loading profile..."}
          </p>
        </div>
        <button onClick={() => setExpanded(e => !e)} className="p-1.5 rounded-lg hover:bg-slate-100">
          {expanded ? <ChevronUp className="w-4 h-4 text-subtle" /> : <ChevronDown className="w-4 h-4 text-subtle" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">

        {/* Pre-fetch status — always visible once started */}
        {prefetchStep && (
          <div className={`rounded-xl p-3 border space-y-2 ${prefetchStep === "ready" ? "bg-emerald-50 border-emerald-100" : "bg-brand-500/10 border-brand-500/20"}`}>
            {prefetchStep !== "ready" ? (
              <p className="text-xs font-semibold text-brand-600 dark:text-brand-300 flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin shrink-0" /> Fetching AI prescription data…
              </p>
            ) : (
              <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                <Zap className="w-3 h-3 shrink-0" /> AI prescription data ready
              </p>
            )}
            {[
              { key: "patient_history", label: "Past consultation history fetched", Icon: Database },
              { key: "similar_cases",   label: "Top 5 similar cases found",         Icon: Search },
            ].map(({ key, label, Icon }) => {
              const ORDER    = ["patient_history", "similar_cases"];
              const stepIdx  = ORDER.indexOf(prefetchStep);
              const myIdx    = ORDER.indexOf(key);
              const isDone   = prefetchStep === "ready" || myIdx < stepIdx;
              const isActive = myIdx === stepIdx && prefetchStep !== "ready";
              return (
                <div key={key} className="flex items-center gap-2 text-xs">
                  {isDone   ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  : isActive ? <Loader2 className="w-3.5 h-3.5 text-brand-500 animate-spin shrink-0" />
                  :            <Icon className="w-3.5 h-3.5 text-subtle shrink-0" />}
                  <span className={isDone ? "text-emerald-700 font-medium" : isActive ? "text-brand-700 dark:text-brand-300" : "text-subtle"}>
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Patient Stats */}
        {pp && (
          <Section title="Patient Info" icon={<User className="w-3.5 h-3.5" />}>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                ["Age", `${pp.age} yrs`],
                ["Gender", pp.gender],
                ["Weight", `${pp.weight} kg`],
                ["Height", `${pp.height} cm`],
              ].map(([k, v]) => (
                <div key={k} className="bg-surface-2 rounded-lg p-2">
                  <p className="text-subtle font-medium">{k}</p>
                  <p className="text-text font-semibold capitalize">{v}</p>
                </div>
              ))}
            </div>
            {pp.knownConditions?.length > 0 && (
              <TagList label="Known Conditions" items={pp.knownConditions} color="amber" />
            )}
            {pp.allergies?.length > 0 && (
              <TagList label="Allergies" items={pp.allergies} color="red" />
            )}
            {pp.currentMedications?.length > 0 && (
              <TagList label="Medications (history)" items={pp.currentMedications} color="blue" />
            )}
          </Section>
        )}

        {/* Pre-Consultation */}
        {pc && (
          <Section title="Pre-Consultation" icon={<HeartPulse className="w-3.5 h-3.5" />}>
            <Row label="Chief Complaint">{pc.symptoms}</Row>
            <Row label="Duration">{pc.duration}</Row>
            <Row label="Severity">
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${
                pc.severity === "severe" ? "bg-red-100 text-red-700" :
                pc.severity === "moderate" ? "bg-amber-100 text-amber-700" :
                "bg-emerald-100 text-emerald-700"}`}>
                {pc.severity}
              </span>
            </Row>
            {pc.currentMedications && (
              <Row label="Current Meds">{pc.currentMedications}</Row>
            )}
            {pc.additionalNotes && (
              <Row label="Notes">{pc.additionalNotes}</Row>
            )}

            {/* Vitals */}
            {v && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <VitalBox label="Blood Pressure" value={`${v.sbp}/${v.dbp}`} unit="mmHg" tag={v.bp_classification} />
                <VitalBox label="Heart Rate" value={String(v.hr)} unit="bpm"  tag={v.hr_classification} />
              </div>
            )}
          </Section>
        )}

        {/* AI Report */}
        <Section title="AI Analysis" icon={<Brain className="w-3.5 h-3.5" />} accent>
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-brand-600 dark:text-brand-300 py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Generating AI report...
            </div>
          ) : report ? (
            <div className="space-y-3">
              <div className="text-xs text-text leading-relaxed bg-brand-500/10 rounded-xl p-3 border border-brand-500/20">
                {report.summary}
              </div>

              {report.conditions?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Probable Conditions</p>
                  <ul className="space-y-1.5">
                    {report.conditions.map((c, i) => (
                      <li key={i} className="text-xs text-text flex gap-1.5">
                        <span className="text-brand-500 shrink-0">•</span>
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {report.questions?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Suggested Questions</p>
                  <ol className="space-y-1.5 list-decimal list-inside">
                    {report.questions.map((q, i) => (
                      <li key={i} className="text-xs text-text">{q}</li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          ) : reportError ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
              <p className="text-xs font-semibold text-red-700">AI Report Failed</p>
              <p className="text-[10px] text-red-600 break-all">{reportError}</p>
              <button
                onClick={() => {
                  setLoading(true);
                  setReportError(null);
                  fetch(`/api/appointments/${appointmentId}/ai-report`, { method: "POST" })
                    .then(r => r.json())
                    .then(d => { if (d.aiReport) setReport(d.aiReport); else if (d.error) setReportError(d.error); })
                    .catch(e => setReportError(e.message))
                    .finally(() => setLoading(false));
                }}
                className="text-[10px] text-brand-600 dark:text-brand-300 underline mt-1"
              >
                Retry
              </button>
            </div>
          ) : (
            <p className="text-xs text-subtle italic">AI report unavailable. Ensure pre-consultation form is filled.</p>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({
  title, icon, accent = false, children,
}: { title: string; icon: React.ReactNode; accent?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className={`flex items-center gap-1.5 mb-2 ${accent ? "text-brand-600 dark:text-brand-300" : "text-muted"}`}>
        {icon}
        <p className="text-xs font-bold uppercase tracking-wide">{title}</p>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-xs">
      <span className="text-subtle font-medium">{label}: </span>
      <span className="text-text">{children}</span>
    </div>
  );
}

function VitalBox({ label, value, unit, tag }: { label: string; value: string; unit: string; tag: string }) {
  return (
    <div className="bg-surface-2 rounded-xl p-2.5 text-center">
      <p className="text-subtle text-xs mb-0.5">{label}</p>
      <p className="font-bold text-text text-sm">{value} <span className="text-xs font-normal text-muted">{unit}</span></p>
      <p className="text-xs text-muted capitalize mt-0.5">{tag}</p>
    </div>
  );
}

function TagList({ label, items, color }: { label: string; items: string[]; color: string }) {
  const cls: Record<string, string> = {
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    red:   "bg-red-50 text-red-700 border-red-100",
    blue:  "bg-brand-500/10 text-brand-700 dark:text-brand-300 border-brand-500/20",
  };
  return (
    <div className="mt-2">
      <p className="text-xs text-subtle font-medium mb-1">{label}</p>
      <div className="flex flex-wrap gap-1">
        {items.map((item, i) => (
          <span key={i} className={`px-2 py-0.5 rounded-full text-xs border ${cls[color]}`}>{item}</span>
        ))}
      </div>
    </div>
  );
}
