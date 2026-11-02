"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, Pill, Loader2, RefreshCw, Plus, Trash2, Send,
  History, ChevronDown, ChevronUp, CheckCircle2, Circle,
  ShieldAlert, AlertTriangle, XCircle, ArrowRightLeft,
  User, FileText, Users, Stethoscope, ShieldCheck, FlaskConical,
  ClipboardCheck, ExternalLink, Code2,
  type LucideIcon,
} from "lucide-react";
import toast from "react-hot-toast";
import type { AiReport, Prescription, PrescriptionMedicine } from "@/types/consultation";

function cleanAdvice(text: string): string {
  return text
    .split(/\n+/)
    .map(line => line.replace(/^\d+\.\s*/, "").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1").trim())
    .filter(Boolean)
    .join("\n");
}

const BLANK_MED: PrescriptionMedicine = {
  medicine: "", dosage: "", timing: "after food", frequency: "twice daily", duration: "", condition: "", purpose: "",
};

// ── Pipeline step definitions ────────────────────────────────────────────────

const AGENT_STEPS: { key: string; label: string; sub: string }[] = [
  { key: "agent_1_done",           label: "Agent 1 — Patient Summary",  sub: "Profile summary + running clinical summary loaded" },
  { key: "agents_345_done",        label: "Agents 3,4,5 — Pre-call",    sub: "Similar cases + medical context + allergy context gathered" },
  { key: "call_ended",             label: "Call ended",                  sub: "Transcript saved" },
  { key: "agent_2_running",        label: "Agent 2 — Transcribe",       sub: "Structuring transcript + RxNorm drug normalization" },
  { key: "agent_2_done",           label: "Agent 2 — Done",             sub: "Symptoms, medications, allergies extracted" },
  { key: "agent_6_running",        label: "Agent 6 — Prescribe",        sub: "Generating prescription from all gathered data" },
  { key: "agent_6_done",           label: "Agent 6 — Done",             sub: "Diagnosis + medicines + advice generated" },
  { key: "agent_7_running",        label: "Agent 7 — Drug Check",       sub: "Checking interactions + dosage via DDInter DB" },
  { key: "agent_7_done",           label: "Agent 7 — Done",             sub: "Drug interactions verified" },
  { key: "agent_8_running",        label: "Agent 8 — Allergy Check",    sub: "Cross-checking via RxClass class-membership" },
  { key: "agent_8_done",           label: "Agent 8 — Done",             sub: "Allergy safety verified" },
  { key: "loop_2_agent_6_running", label: "⟲ Agent 6 — Re-prescribe",   sub: "Flagged drugs found — replacing with safe alternatives" },
  { key: "loop_2_agent_6_done",    label: "⟲ Agent 6 — Revised",        sub: "Alternative medicines selected" },
  { key: "loop_2_agent_7_running", label: "⟲ Agent 7 — Re-check",       sub: "Verifying replacement drugs" },
  { key: "loop_2_agent_7_done",    label: "⟲ Agent 7 — Passed",         sub: "Replacements verified clean" },
  { key: "pipeline_done",          label: "✓ Pipeline Complete",         sub: "All 8 agents finished — review prescription below" },
];

interface FlaggedDrug {
  drug: string;
  reason: string;
  suggestedAlternative?: string;
  flaggedBy: "agent7" | "agent8";
  replacement?: { medicine?: string; dosage?: string; frequency?: string; duration?: string; purpose?: string };
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function DoctorPostCallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  type SimilarCase = {
    patient?: { age?: number; sex?: string; bloodGroup?: string; knownConditions?: string[]; allergies?: string[] };
    symptoms?: string; duration?: string; severity?: string;
    diagnosis?: string;
    prescription?: Array<{ medicine: string; dosage?: string; frequency?: string; duration?: string }>;
    advice?: string;
  };

  const [aiReport, setAiReport] = useState<AiReport | null>(null);
  const [aiPrescription, setAiPx] = useState<Prescription | null>(null);
  const [aiLoading, setAiLoading] = useState(true);
  const [patientName, setPatientName] = useState("");
  const [transcript, setTranscript] = useState("");
  const [showTranscript, setShowTx] = useState(false);
  type HistoryEntry = { date: string; symptoms?: string; severity?: string; diagnosis?: string; medicines?: string; feedback?: string; source?: string };
  const [similarCases, setSimilarCases] = useState<SimilarCase[]>([]);
  const [showCases, setShowCases] = useState(false);
  const [patientHistory, setPatientHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [aiHistorySummary, setAiHistorySummary] = useState("");

  // Agent pipeline state
  const [pipelineStep, setPipelineStep] = useState("idle");
  const [flaggedDrugs, setFlaggedDrugs] = useState<FlaggedDrug[]>([]);
  const [agentOutputs, setAgentOutputs] = useState<Record<string, unknown>>({});

  // Editable prescription state
  const [diagnosis, setDiagnosis] = useState("");
  const [medicines, setMedicines] = useState<PrescriptionMedicine[]>([{ ...BLANK_MED }]);
  const [advicePoints, setAdvicePoints] = useState<string[]>(["", "", "", "", ""]);
  const [drugSafetyNote, setDrugSafetyNote] = useState("");
  const [sending, setSending] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const realTriggeredRef = useRef(false); // ensures the real pipeline is kicked off only once

  // Fetch appointment on mount
  useEffect(() => {
    console.log("[DocPage] Mounting — fetching appointment", id);
    fetch(`/api/appointments/${id}`)
      .then(r => r.json())
      .then(d => {
        const appt = d.appointment;
        console.log("[DocPage] Appointment loaded:", {
          status: appt?.status,
          hasAiReport: !!appt?.aiReport,
          hasAiPrescription: !!appt?.aiPrescription,
          pipelineStep: appt?.agentPipelineStep,
          prescriptionStep: appt?.prescriptionStep,
          hasFlaggedDrugs: appt?.flaggedDrugs?.length ?? 0,
          agentOutputKeys: appt?.agentOutputs ? Object.keys(appt.agentOutputs) : [],
          similarCasesCount: appt?.similarCases?.length ?? 0,
        });
        if (!appt) { console.error("[DocPage] No appointment in response"); return; }
        setPatientName(appt.patientName ?? "");
        setTranscript(appt.transcript ?? "");
        if (appt.aiReport) setAiReport(appt.aiReport);
        if (appt.aiPrescription) applyAiPrescription(appt.aiPrescription);
        if (appt.similarCases?.length) setSimilarCases(appt.similarCases);
        if (appt.flaggedDrugs?.length) setFlaggedDrugs(appt.flaggedDrugs);
        if (appt.agentPipelineStep) setPipelineStep(appt.agentPipelineStep);
        if (appt.aiHistorySummary) setAiHistorySummary(appt.aiHistorySummary);

        // Build initial agent outputs — pre-populate agent1 from appointment data
        const initialOutputs = (appt.agentOutputs ?? {}) as Record<string, unknown>;
        if (!initialOutputs.agent1 && appt.patientName) {
          initialOutputs.agent1 = {
            profileSummary: appt.aiReport?.summary ?? "Patient summary loaded",
            provider: "pre-computed",
          };
        }
        console.log("[DocPage] Agent outputs:", Object.keys(initialOutputs));
        setAgentOutputs(initialOutputs);
      })
      .catch(err => console.error("[DocPage] Mount fetch FAILED:", err));
  }, [id]);

  const applyAiPrescription = useCallback((p: Prescription & { drugSafetyNote?: string }) => {
    console.log("[DocPage] applyAiPrescription called:", {
      diagnosis: p.diagnosis?.slice(0, 80),
      medicineCount: p.medicines?.length,
      adviceType: Array.isArray(p.advice) ? "array" : typeof p.advice,
      adviceValue: Array.isArray(p.advice) ? p.advice.length + " items" : String(p.advice ?? "").slice(0, 80),
      drugSafetyNote: p.drugSafetyNote?.slice(0, 80),
    });
    setAiPx(p);
    setDiagnosis(p.diagnosis ?? "");
    setMedicines(p.medicines?.length ? p.medicines : [{ ...BLANK_MED }]);
    let pts: string[] = [];
    if (Array.isArray(p.advice)) {
      pts = (p.advice as string[]).filter(Boolean).slice(0, 5);
    } else {
      pts = cleanAdvice(String(p.advice ?? "")).split("\n").filter(Boolean).slice(0, 5);
    }
    console.log("[DocPage] Advice points parsed:", pts);
    setAdvicePoints([...pts, "", "", "", "", ""].slice(0, 5));
    if (p.drugSafetyNote) setDrugSafetyNote(p.drugSafetyNote);
    console.log("[DocPage] ✅ Prescription applied to form");
  }, []);

  // Poll + advance pipeline — each call advances one demo step (2.5s between calls = visible delay)
  useEffect(() => {
    let cancelled = false;
    let pollCount = 0;
    let prescriptionApplied = false;

    const poll = async () => {
      pollCount++;
      try {
        // Try to advance the demo pipeline by one step
        const advRes = await fetch(`/api/appointments/${id}/advance-pipeline`, { method: "POST" });
        let data;
        if (advRes.ok) {
          data = await advRes.json();
          console.log(`[DocPage] Step #${pollCount}: ${data.pipelineStep} | Rx:${!!data.aiPrescription} | Flags:${data.flaggedDrugs?.length ?? 0} | Agents:[${data.agentOutputs ? Object.keys(data.agentOutputs) : ""}]`);
        } else {
          // Not in demo mode — fetch appointment directly for real pipeline status
          const statusRes = await fetch(`/api/appointments/${id}`);
          const statusData = await statusRes.json();
          const appt = statusData.appointment;
          data = {
            pipelineStep: appt?.agentPipelineStep ?? "idle",
            aiPrescription: appt?.aiPrescription ?? null,
            flaggedDrugs: appt?.flaggedDrugs ?? [],
            agentOutputs: appt?.agentOutputs ?? {},
            aiHistorySummary: appt?.aiHistorySummary ?? "",
          };
          console.log(`[DocPage] Poll #${pollCount}: ${data.pipelineStep} | Agents:[${Object.keys(data.agentOutputs)}]`);

          // Real (non-demo) pipeline: kick it off exactly once. Fire on ANY pre-Agent-2
          // step — the pre-call step can linger/overwrite "call_ended" if the pre-warm
          // finished late. The route is idempotent + guards against re-entry.
          const PRE_AGENT2 = ["idle", "agent_1_done", "agents_345_running", "agents_345_processing", "agents_345_done", "agents_345_failed", "call_ended"];
          if (!realTriggeredRef.current && PRE_AGENT2.includes(data.pipelineStep)) {
            realTriggeredRef.current = true;
            console.log("[DocPage] Not in demo — triggering real 9-agent pipeline");
            fetch(`/api/appointments/${id}/run-pipeline`, { method: "POST" })
              .then((r) => r.json())
              .then((d) => console.log("[DocPage] run-pipeline:", d))
              .catch((e) => console.error("[DocPage] run-pipeline failed:", e));
          }
        }

        // Update pipeline step (forward-only)
        if (data.pipelineStep) {
          setPipelineStep(prev => {
            const prevIdx = AGENT_STEPS.findIndex(s => s.key === prev);
            const newIdx  = AGENT_STEPS.findIndex(s => s.key === data.pipelineStep);
            if (newIdx >= prevIdx || data.pipelineStep === "pipeline_done" || data.pipelineStep === "pipeline_failed") {
              return data.pipelineStep;
            }
            return prev;
          });
        }

        // Merge agent outputs (never overwrite existing)
        if (data.agentOutputs && Object.keys(data.agentOutputs).length > 0) {
          setAgentOutputs(prev => ({ ...prev, ...data.agentOutputs }));
        }
        if (data.aiHistorySummary) setAiHistorySummary(data.aiHistorySummary);

        // Show flagged drugs as soon as they appear (agent 7 or 8 flags)
        if (data.flaggedDrugs?.length) {
          setFlaggedDrugs(prev => {
            const merged = [...prev];
            for (const f of data.flaggedDrugs as FlaggedDrug[]) {
              if (!merged.some(m => m.drug.toLowerCase() === f.drug.toLowerCase())) {
                merged.push(f);
              }
            }
            return merged;
          });
        }

        // Fill prescription fields as soon as Agent 6 produces them
        if (data.aiPrescription && !cancelled) {
          if (!prescriptionApplied) {
            console.log("[DocPage] ✅ First prescription draft — filling form");
            applyAiPrescription(data.aiPrescription);
            prescriptionApplied = true;
          } else if (data.pipelineStep === "loop_2_agent_6_done" || data.pipelineStep === "pipeline_done") {
            console.log("[DocPage] 🔄 Revised prescription — updating form (removing flagged drugs)");
            applyAiPrescription(data.aiPrescription);
          }
        }

        // Stop when pipeline finishes
        if (data.pipelineStep === "pipeline_done" || data.pipelineStep === "pipeline_failed") {
          console.log("[DocPage] Pipeline complete:", data.pipelineStep);
          setAiLoading(false);
          return;
        }

        // Legacy fallback
        if (!data.aiPrescription && (data.pipelineStep === "idle" || !data.pipelineStep)) {
          const res2 = await fetch(`/api/appointments/${id}/prescription`);
          const d2 = await res2.json();
          if (d2.similarCases?.length) setSimilarCases(d2.similarCases);
          if (d2.patientHistory?.length) setPatientHistory(d2.patientHistory);
          if (d2.aiPrescription && !cancelled) {
            applyAiPrescription(d2.aiPrescription);
            return;
          }
        }

        if (!cancelled) setTimeout(poll, 2500);
      } catch (pollErr) {
        console.error("[DocPage] Poll error:", pollErr);
        if (!cancelled) setTimeout(poll, 5000);
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [id, applyAiPrescription]);

  const updateMed = (idx: number, field: keyof PrescriptionMedicine, val: string) =>
    setMedicines(prev => prev.map((m, i) => i === idx ? { ...m, [field]: val } : m));
  const addMed = () => setMedicines(prev => [...prev, { ...BLANK_MED }]);
  const removeMed = (idx: number) => setMedicines(prev => prev.filter((_, i) => i !== idx));

  const isFlagged = (drugName: string) => flaggedDrugs.some(f => f.drug.toLowerCase() === drugName.toLowerCase());
  const getFlag = (drugName: string) => flaggedDrugs.find(f => f.drug.toLowerCase() === drugName.toLowerCase());

  const handleSend = async () => {
    console.log("[DocPage] handleSend called");
    console.log("[DocPage] Diagnosis:", diagnosis?.slice(0, 80));
    console.log("[DocPage] All medicines:", medicines.map(m => m.medicine));
    console.log("[DocPage] Flagged drugs:", flaggedDrugs.map(f => f.drug));
    if (!diagnosis.trim()) { toast.error("Please enter a diagnosis"); return; }
    // Exclude flagged drugs from patient prescription
    const cleanMeds = medicines.filter(m => m.medicine.trim() && !isFlagged(m.medicine));
    console.log("[DocPage] Clean meds (after removing flagged):", cleanMeds.map(m => m.medicine));
    if (!cleanMeds.length) { toast.error("No approved medicines to send (all are flagged)"); return; }

    setSending(true);
    try {
      const res = await fetch(`/api/appointments/${id}/prescription`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diagnosis, medicines: cleanMeds, advice: advicePoints.filter(Boolean).join("\n"), drugSafetyNote }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed to send"); return; }
      toast.success("Prescription sent to patient!");
      setTimeout(() => router.replace("/doctor/dashboard"), 1500);
    } catch {
      toast.error("Network error");
    } finally {
      setSending(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Are you sure you want to cancel this consultation? No prescription will be sent and no data from this consultation will be saved to the patient record.")) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/appointments/${id}/cancel`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed to cancel"); return; }
      toast.success("Consultation cancelled — no changes saved");
      setTimeout(() => router.replace("/doctor/dashboard"), 1500);
    } catch {
      toast.error("Network error");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-bg">
      {/* Header */}
      <div className="sticky top-16 z-10 flex items-center justify-between border-b border-border bg-surface/80 px-6 py-4 backdrop-blur">
        <div>
          <h1 className="font-bold text-text">Post-call review</h1>
          <p className="text-xs text-muted">{patientName} · Write and send prescription</p>
        </div>
        {aiLoading && (
          <span className="flex items-center gap-1.5 text-xs text-brand-600 dark:text-brand-300 bg-brand-500/10 px-3 py-1.5 rounded-full border border-brand-500/20">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> AI pipeline running...
          </span>
        )}
        {!aiLoading && aiPrescription && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
            <RefreshCw className="w-3.5 h-3.5" /> AI suggestion ready
          </span>
        )}
      </div>

      <div className="max-w-3xl mx-auto p-6 space-y-6">

        {/* Agent Pipeline Progress */}
        {/* Always show — animates through steps even after pipeline finishes */}
        <AgentPipelineProgress currentStep={pipelineStep} />

        {/* No-audio notice — shown when Agent 2 was skipped (no speech captured) */}
        {(agentOutputs.agent2 as { skipped?: boolean } | undefined)?.skipped && (
          <div className="flex items-center gap-2.5 rounded-2xl border border-warning/25 bg-warning/10 px-5 py-3.5 text-sm text-[color-mix(in_srgb,var(--warning)_78%,black)] dark:text-warning">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span><strong>No audio detected in this call</strong> — transcription (Agent 2) was skipped. The prescription below is based on the pre-consultation form and the patient&apos;s record.</span>
          </div>
        )}

        {/* Rejected Drugs Box — shows above prescription when Agent 7/8 flag drugs */}
        {flaggedDrugs.length > 0 && (
          <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-500" />
              <span className="text-base font-bold text-red-800">Rejected Drugs ({flaggedDrugs.length})</span>
            </div>
            <p className="text-xs text-red-600">
              The following drugs were automatically rejected by the safety agents. They will NOT be sent to the patient.
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
                        <span className="text-xs text-emerald-800">
                          Replaced with: <span className="font-bold">{f.suggestedAlternative}</span>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Agent Pipeline Outputs — readable, structured per-agent panels */}
        {Object.keys(agentOutputs).length > 0 && (
          <AgentOutputsPanel outputs={agentOutputs} />
        )}

        {/* AI Analysis */}
        {aiReport && (
          <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-2">
              <Brain className="w-4 h-4 text-brand-600 dark:text-brand-300" />
              <h2 className="font-bold text-text text-sm">AI Analysis</h2>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-text leading-relaxed bg-brand-500/10 rounded-xl p-3 border border-brand-500/20">{aiReport.summary}</p>
              {aiReport.conditions?.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-muted uppercase tracking-wide mb-2">Probable Conditions</p>
                  <ul className="space-y-1">
                    {aiReport.conditions.map((c, i) => (
                      <li key={i} className="text-sm text-text flex gap-2"><span className="text-brand-400 shrink-0">•</span>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* AI History Insight */}
        {aiHistorySummary && (
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-5 py-4 flex gap-3">
            <Brain className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-indigo-600 uppercase tracking-wide mb-1">AI History Insight</p>
              <p className="text-sm text-indigo-900 leading-relaxed">{aiHistorySummary}</p>
            </div>
          </div>
        )}

        {/* Transcript */}
        {transcript && (
          <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden">
            <button onClick={() => setShowTx(t => !t)} className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-surface-2 transition-colors">
              <span className="font-semibold text-text text-sm">Call Transcript</span>
              <span className="text-xs text-subtle">{showTranscript ? "Hide" : "Show"}</span>
            </button>
            {showTranscript && (
              <div className="px-5 pb-5 max-h-60 overflow-y-auto space-y-1 border-t border-border pt-4">
                {transcript.split("\n").filter(Boolean).map((line, i) => {
                  const isDoc = line.startsWith("Doctor:");
                  return (
                    <p key={i} className="text-xs leading-relaxed">
                      <span className={`font-semibold ${isDoc ? "text-brand-600 dark:text-brand-300" : "text-emerald-600"}`}>{isDoc ? "Doctor" : "Patient"}:</span>{" "}
                      <span className="text-muted">{line.replace(/^(Doctor|Patient):\s*/, "")}</span>
                    </p>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Similar Cases */}
        {similarCases.length > 0 && (
          <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden">
            <button onClick={() => setShowCases(v => !v)} className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-surface-2 transition-colors">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-violet-600" />
                <h2 className="font-bold text-text text-sm">Similar Past Cases</h2>
                <span className="bg-violet-100 text-violet-700 text-xs font-semibold px-2 py-0.5 rounded-full">{similarCases.length} found</span>
              </div>
              {showCases ? <ChevronUp className="w-4 h-4 text-subtle" /> : <ChevronDown className="w-4 h-4 text-subtle" />}
            </button>
            {showCases && (
              <div className="px-5 pb-5 border-t border-border pt-4 space-y-3">
                {similarCases.map((c, i) => (
                  <div key={i} className="rounded-xl border border-border bg-surface-2 p-4 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="w-6 h-6 rounded-full bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                      <span className="text-xs font-semibold text-text">{c.patient?.age ? `${c.patient.age}yo` : "?"} {c.patient?.sex ?? ""}</span>
                      {c.severity && <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${c.severity === "mild" ? "bg-emerald-50 text-emerald-700" : c.severity === "moderate" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>{c.severity}</span>}
                    </div>
                    {c.symptoms && <p className="text-xs text-muted"><span className="font-semibold text-muted">Symptoms: </span>{c.symptoms}</p>}
                    {c.diagnosis && <p className="text-xs bg-brand-500/10 text-brand-700 dark:text-brand-200 rounded-lg px-3 py-2 font-medium">{c.diagnosis}</p>}
                    {c.prescription?.length ? <div className="flex flex-wrap gap-1.5">{c.prescription.map((m, j) => <span key={j} className="text-xs bg-surface border border-border text-text rounded-lg px-2.5 py-1">{m.medicine}{m.dosage ? ` ${m.dosage}` : ""}</span>)}</div> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Patient History */}
        {patientHistory.length > 0 && (
          <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden">
            <button onClick={() => setShowHistory(v => !v)} className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-surface-2 transition-colors">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-indigo-600" />
                <h2 className="font-bold text-text text-sm">Patient&apos;s Consultation History</h2>
                <span className="bg-indigo-100 text-indigo-700 text-xs font-semibold px-2 py-0.5 rounded-full">{patientHistory.length} past visits</span>
              </div>
              {showHistory ? <ChevronUp className="w-4 h-4 text-subtle" /> : <ChevronDown className="w-4 h-4 text-subtle" />}
            </button>
            {showHistory && (
              <div className="px-5 pb-5 border-t border-border pt-4 space-y-3">
                {patientHistory.map((h, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <div className="flex flex-col items-center shrink-0">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${h.source === "ai" ? "bg-violet-100 text-violet-700" : "bg-brand-500/12 text-brand-700 dark:text-brand-300"}`}>{h.source === "ai" ? "AI" : "Dr"}</div>
                      {i < patientHistory.length - 1 && <div className="w-0.5 h-4 bg-border-strong mt-1" />}
                    </div>
                    <div className="flex-1 bg-surface-2 rounded-xl p-3 border border-border">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-semibold text-muted">{h.date}</span>
                        {h.severity && <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${h.severity === "mild" ? "bg-emerald-50 text-emerald-700" : h.severity === "moderate" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>{h.severity}</span>}
                      </div>
                      {h.symptoms && <p className="text-xs text-muted mb-0.5"><span className="font-semibold">Symptoms:</span> {h.symptoms}</p>}
                      {h.diagnosis && <p className="text-xs text-brand-700 dark:text-brand-200 font-medium mb-0.5">{h.diagnosis}</p>}
                      {h.medicines && <p className="text-xs text-subtle">Rx: {h.medicines}</p>}
                      {h.feedback && <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-2 py-1 mt-1">💬 {h.feedback}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Prescription Editor */}
        <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Pill className="w-4 h-4 text-emerald-600" />
            <h2 className="font-bold text-text text-sm">Prescription</h2>
            <span className="text-xs text-subtle ml-auto">AI-filled · Edit as needed</span>
          </div>
          <div className="p-5 space-y-5">
            {/* Diagnosis */}
            <div>
              <label className="text-xs font-bold text-muted uppercase tracking-wide block mb-1.5">Diagnosis *</label>
              <textarea rows={2} value={diagnosis} onChange={e => setDiagnosis(e.target.value)} placeholder="Primary diagnosis with brief reasoning..."
                className="w-full rounded-xl border border-border px-4 py-3 text-sm text-text placeholder:text-subtle focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/12 resize-none" />
            </div>

            {/* Medicines */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-muted uppercase tracking-wide">Medicines *</label>
                <button onClick={addMed} className="flex items-center gap-1 text-xs text-brand-600 dark:text-brand-300 hover:text-brand-700 dark:text-brand-300 font-semibold"><Plus className="w-3.5 h-3.5" /> Add</button>
              </div>
              <div className="space-y-3">
                {medicines.map((med, i) => {
                  const flag = getFlag(med.medicine);
                  return (
                    <div key={i} className={flag ? "relative" : ""}>
                      {flag && (
                        <div className="absolute -top-1 -right-1 z-10 bg-red-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">
                          FLAGGED
                        </div>
                      )}
                      <MedicineRow med={med} idx={i} onChange={updateMed} onRemove={medicines.length > 1 ? removeMed : undefined} flagged={!!flag} />
                      {flag && (
                        <div className="mt-1 bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">
                          <span className="font-bold">Issue:</span> {flag.reason}
                          {flag.suggestedAlternative && (
                            <span className="text-emerald-700 ml-2">→ Suggested: <span className="font-semibold">{flag.suggestedAlternative}</span></span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Advice */}
            <div>
              <label className="text-xs font-bold text-muted uppercase tracking-wide block mb-1.5">Doctor&apos;s Advice</label>
              <p className="text-xs text-subtle mb-3">5 brief points — AI suggested, edit freely.</p>
              <div className="space-y-2">
                {advicePoints.map((pt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                    <input value={pt} onChange={e => setAdvicePoints(prev => prev.map((v, j) => j === i ? e.target.value : v))} placeholder={`Advice point ${i + 1}…`}
                      className="flex-1 rounded-xl border border-border px-3 py-2 text-sm text-text placeholder:text-subtle focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                  </div>
                ))}
              </div>
            </div>

            {/* Drug Safety Note */}
            <div>
              <label className="text-xs font-bold text-muted uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-500" /> Drug Safety Note
              </label>
              <input value={drugSafetyNote} onChange={e => setDrugSafetyNote(e.target.value)} placeholder="e.g. Avoid ibuprofen — patient has diabetes."
                className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 placeholder:text-amber-300 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
            </div>

            {flaggedDrugs.length > 0 && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-2">
                ⚠ {flaggedDrugs.length} flagged drug(s) will be excluded from the patient&apos;s prescription. Only approved drugs are sent.
              </p>
            )}

            <button onClick={handleSend} disabled={sending || cancelling}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-surface-3 disabled:text-subtle text-white font-semibold rounded-xl py-3.5 transition-all active:scale-95 shadow-sm">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? "Sending..." : `Send Prescription to Patient${flaggedDrugs.length ? ` (${medicines.filter(m => m.medicine.trim() && !isFlagged(m.medicine)).length} drugs)` : ""}`}
            </button>

            <button onClick={handleCancel} disabled={sending || cancelling}
              className="w-full flex items-center justify-center gap-2 border-2 border-red-200 hover:bg-red-50 disabled:opacity-40 text-red-600 font-semibold rounded-xl py-3 transition-all active:scale-95 text-sm">
              {cancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
              {cancelling ? "Cancelling..." : "Cancel Consultation — Don’t Send Prescription"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Agent Pipeline Progress Bar ──────────────────────────────────────────────

function AgentPipelineProgress({ currentStep }: { currentStep: string }) {
  const stepIdx = AGENT_STEPS.findIndex(s => s.key === currentStep);
  const pipelineDone = currentStep === "pipeline_done" || currentStep === "pipeline_failed";
  const pipelineFailed = currentStep === "pipeline_failed";
  const isLoop = currentStep.startsWith("loop_");
  const pct = pipelineDone ? 100 : stepIdx >= 0 ? Math.round(((stepIdx + 1) / AGENT_STEPS.length) * 100) : 5;
  const displayIdx = stepIdx;

  const [elapsed, setElapsed] = useState(0);
  const [stepStart, setStepStart] = useState(Date.now());
  const prevStepRef = useRef(currentStep);

  useEffect(() => {
    if (currentStep !== prevStepRef.current) {
      prevStepRef.current = currentStep;
      setStepStart(Date.now());
      setElapsed(0);
    }
  }, [currentStep]);

  useEffect(() => {
    if (pipelineDone) return;
    const t = setInterval(() => setElapsed(Date.now() - stepStart), 100);
    return () => clearInterval(t);
  }, [stepStart, pipelineDone]);

  const STATUS_MESSAGES: Record<string, string> = {
    idle:                    "Waiting for pipeline to start...",
    agent_1_done:            "Patient profile loaded — gathering clinical context...",
    agents_345_done:         "Similar cases, medical context, and allergy data ready",
    call_ended:              "Call ended — preparing transcript for analysis...",
    agent_2_running:         "Analyzing transcript — extracting symptoms, medications, and allergies...",
    agent_2_done:            "Transcript structured — starting prescription generation...",
    agent_6_running:         "AI is writing the prescription based on all gathered evidence...",
    agent_6_done:            "Prescription draft ready — now checking for drug interactions...",
    agent_7_running:         "Checking drug-drug interactions via DDInter database...",
    agent_7_done:            "Drug interactions verified — now checking allergy safety...",
    agent_8_running:         "Cross-checking prescribed drugs against patient allergies...",
    agent_8_done:            "Allergy check complete — all safety checks passed",
    loop_2_agent_6_running:  "Unsafe drugs flagged — AI is prescribing safer alternatives...",
    loop_2_agent_6_done:     "Revised prescription ready — re-verifying safety...",
    loop_2_agent_7_running:  "Re-checking replacement drugs for interactions...",
    loop_2_agent_7_done:     "Replacement drugs verified clean — pipeline finishing",
    pipeline_done:           "All agents complete — prescription ready for your review",
    pipeline_failed:         "Pipeline encountered an error — please review manually",
  };

  const statusMsg = STATUS_MESSAGES[currentStep] ?? "Processing...";

  return (
    <div className={`bg-surface rounded-2xl border shadow-sm overflow-hidden ${pipelineFailed ? "border-red-200" : pipelineDone ? "border-emerald-200" : "border-brand-500/20"}`}>
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          {pipelineFailed
            ? <AlertTriangle className="w-4 h-4 text-red-500" />
            : pipelineDone
            ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            : <Loader2 className="w-4 h-4 text-brand-500 animate-spin" />}
          <h2 className="font-bold text-text text-sm">
            {pipelineFailed ? "Agent Pipeline — Error" : isLoop ? "Agent Pipeline — Safety Loop Active" : pipelineDone ? "Agent Pipeline — Complete" : "Agent Pipeline — Running"}
          </h2>
        </div>
        <span className={`text-xs font-semibold ${pipelineDone ? "text-emerald-600" : "text-brand-600 dark:text-brand-300"}`}>{pct}%</span>
      </div>

      {/* Live status message */}
      <div className={`px-5 py-2.5 text-xs font-medium ${
        pipelineFailed ? "bg-red-50 text-red-700" :
        isLoop ? "bg-amber-50 text-amber-700" :
        pipelineDone ? "bg-emerald-50 text-emerald-700" :
        "bg-brand-500/10 text-brand-700 dark:text-brand-300"
      }`}>
        {statusMsg}
      </div>

      <div className="px-5 pt-3 pb-1">
        <div className="w-full h-1.5 bg-surface-3 rounded-full overflow-hidden mb-4">
          <div className={`h-full rounded-full transition-all duration-1000 ease-out ${
            pipelineFailed ? "bg-red-500" : pipelineDone ? "bg-emerald-500" : "bg-brand-500/100"
          }`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="px-5 pb-5 space-y-2.5">
        {AGENT_STEPS.map((step, i) => {
          const done = pipelineDone || i < displayIdx;
          const active = !pipelineDone && i === displayIdx;
          const pending = !pipelineDone && i > displayIdx;
          return (
            <div key={step.key} className={`flex items-center gap-3 transition-all duration-500 ${pending ? "opacity-30" : "opacity-100"}`}>
              <div className="shrink-0">
                {done ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  : active ? <Loader2 className="w-4 h-4 text-brand-500 animate-spin" />
                  : <Circle className="w-4 h-4 text-subtle" />}
              </div>
              <div className="flex-1 min-w-0">
                <span className={`text-xs font-semibold ${done ? "text-emerald-600" : active ? "text-brand-700 dark:text-brand-300" : "text-subtle"}`}>{step.label}</span>
                {active && <span className="text-xs text-subtle ml-2">{step.sub}</span>}
              </div>
              {active && (
                <span className={`text-[10px] font-mono tabular-nums shrink-0 ${elapsed > 15000 ? "text-amber-600" : "text-subtle"}`}>
                  {(elapsed / 1000).toFixed(1)}s
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Medicine Row ─────────────────────────────────────────────────────────────

function MedicineRow({
  med, idx, onChange, onRemove, flagged,
}: {
  med: PrescriptionMedicine; idx: number;
  onChange: (idx: number, field: keyof PrescriptionMedicine, val: string) => void;
  onRemove?: (idx: number) => void;
  flagged?: boolean;
}) {
  const inp = "rounded-lg border border-border px-3 py-2 text-xs text-text focus:outline-none focus:border-brand-500 w-full";
  const flagBorder = flagged ? "border-red-300 bg-red-50/50" : "border-border";
  return (
    <div className={`bg-surface-2 rounded-xl p-3 space-y-2 border ${flagBorder} ${flagged ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-2">
        <input placeholder="Medicine name *" value={med.medicine} onChange={e => onChange(idx, "medicine", e.target.value)}
          className={`${inp} flex-1 font-medium ${flagged ? "line-through text-red-400" : ""}`} />
        {onRemove && (
          <button onClick={() => onRemove(idx)} className="p-1.5 rounded-lg hover:bg-red-100 text-red-400 hover:text-red-600">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input placeholder="Dosage" value={med.dosage} onChange={e => onChange(idx, "dosage", e.target.value)} className={inp} />
        <select value={med.timing} onChange={e => onChange(idx, "timing", e.target.value)} className={inp}>
          <option value="before food">Before food</option><option value="after food">After food</option>
          <option value="with food">With food</option><option value="at bedtime">At bedtime</option><option value="as needed">As needed</option>
        </select>
        <select value={med.frequency} onChange={e => onChange(idx, "frequency", e.target.value)} className={inp}>
          <option value="once daily">Once daily</option><option value="twice daily">Twice daily</option>
          <option value="thrice daily">Thrice daily</option><option value="every 6 hours">Every 6 hours</option>
          <option value="at bedtime">At bedtime</option><option value="as needed">As needed</option>
        </select>
        <input placeholder="Duration" value={med.duration} onChange={e => onChange(idx, "duration", e.target.value)} className={inp} />
        <input placeholder="Condition (SOS)" value={med.condition ?? ""} onChange={e => onChange(idx, "condition", e.target.value)} className={inp + " col-span-2 text-amber-700"} />
        <input placeholder="Purpose" value={med.purpose ?? ""} onChange={e => onChange(idx, "purpose", e.target.value)} className={inp + " col-span-2 italic text-muted"} />
      </div>
    </div>
  );
}

// ── Agent Pipeline Outputs — readable renderer ───────────────────────────────

type AgentMeta = {
  id: string;
  label: string;
  role: string;
  icon: LucideIcon;
  accent: string;   // title text color
  chip: string;     // icon chip background + text
  rail: string;     // left accent border color
};

const AGENT_LIST: AgentMeta[] = [
  { id: "agent1", label: "Patient Summary",      role: "Profile & running clinical summary",            icon: User,          accent: "text-slate-600 dark:text-slate-300",   chip: "bg-slate-500/12 text-slate-600 dark:text-slate-300",   rail: "border-l-slate-400" },
  { id: "agent2", label: "Transcript Analysis",  role: "Structured transcript, symptoms & drugs",        icon: FileText,      accent: "text-brand-600 dark:text-brand-300",   chip: "bg-brand-500/12 text-brand-600 dark:text-brand-300",   rail: "border-l-brand-500" },
  { id: "agent3", label: "Similar Cases",        role: "Closest matches from the case library",          icon: Users,         accent: "text-violet-600 dark:text-violet-300", chip: "bg-violet-500/12 text-violet-600 dark:text-violet-300", rail: "border-l-violet-500" },
  { id: "agent4", label: "Medical Context",      role: "ICD-10, MedlinePlus & evidence",                 icon: Stethoscope,   accent: "text-cyan-600 dark:text-cyan-300",     chip: "bg-cyan-500/12 text-cyan-600 dark:text-cyan-300",     rail: "border-l-cyan-500" },
  { id: "agent5", label: "Allergy Context",      role: "Drug classes, cross-reactivity, alternatives",   icon: ShieldCheck,   accent: "text-rose-600 dark:text-rose-300",     chip: "bg-rose-500/12 text-rose-600 dark:text-rose-300",     rail: "border-l-rose-500" },
  { id: "agent6", label: "Prescription Draft",   role: "Diagnosis, medicines & advice",                  icon: Pill,          accent: "text-emerald-600 dark:text-emerald-300", chip: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300", rail: "border-l-emerald-500" },
  { id: "agent7", label: "Drug Interaction Check", role: "DDInter & openFDA verification",               icon: FlaskConical,  accent: "text-amber-600 dark:text-amber-300",   chip: "bg-amber-500/12 text-amber-600 dark:text-amber-300",   rail: "border-l-amber-500" },
  { id: "agent8", label: "Allergy Safety Check", role: "RxClass cross-check vs. patient allergies",      icon: ClipboardCheck, accent: "text-pink-600 dark:text-pink-300",    chip: "bg-pink-500/12 text-pink-600 dark:text-pink-300",     rail: "border-l-pink-500" },
];

// Internal/noisy fields we never surface in the readable view (still visible in raw JSON).
const HIDDEN_KEYS = new Set([
  "provider", "cacheStatus", "geminiFailed", "trace", "timings", "searchStats",
  "sourceMeta", "retrievedChunks", "structuredTranscript", "retrievalQueries",
]);

const KEY_LABELS: Record<string, string> = {
  icd10Code: "ICD-10 code", rxCUI: "RxCUI", rxNormName: "RxNorm name", rxClassSource: "RxClass source",
  medlinePlusUrl: "MedlinePlus", medlinePlusTitle: "MedlinePlus title", medlinePlusSummary: "MedlinePlus summary",
  chiefComplaint: "Chief complaint", mentionedSymptoms: "Symptoms mentioned", mentionedMedications: "Medications mentioned",
  mentionedAllergies: "Allergies mentioned", overallSummary: "Overall summary", cleanedSymptoms: "Cleaned symptoms",
  topCases: "Top matching cases", conditionSummary: "Summary", possibleDiagnoses: "Possible diagnoses",
  redFlags: "Red flags", managementConsiderations: "Management considerations", clinicalInsights: "Clinical insights",
  crossReactivity: "Cross-reactivity", crossReactivityFlags: "Cross-reactivity flags", safeAlternatives: "Safe alternatives",
  safeAlternativesSummary: "Safe alternatives", avoidDrugs: "Avoid drugs", avoidLevel: "Avoid level", drugClass: "Drug class",
  knownConditions: "Known conditions", relevanceNote: "Relevance", perMedicine: "Per medicine", flagReason: "Flag reason",
  drugSafetyNote: "Drug safety note", historySummary: "History summary", profileSummary: "Profile summary",
  runningSummary: "Running summary", allAllergies: "All allergies", conditions: "Conditions", medicines: "Medicines",
  evidenceSummary: "Evidence summary", allergyStatus: "Allergy status", suggestedAlternative: "Suggested alternative",
};

function formatKey(k: string): string {
  if (KEY_LABELS[k]) return KEY_LABELS[k];
  const spaced = k.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

const isEmptyValue = (v: unknown): boolean =>
  v == null || v === "" ||
  (Array.isArray(v) && v.length === 0) ||
  (isPlainObject(v) && Object.keys(v).filter(k => !HIDDEN_KEYS.has(k)).length === 0);

// Verdict/status → semantic pill styling
function statusPill(text: string) {
  const t = text.toLowerCase();
  if (["pass", "safe", "ok", "clear", "matched", "confirmed"].some(w => t.includes(w)))
    return "bg-success/12 text-success border border-success/25";
  if (["flag", "fail", "block", "violat", "unsafe", "critical", "hard"].some(w => t.includes(w)))
    return "bg-danger/12 text-danger border border-danger/25";
  if (["caution", "warn", "monitor", "suspected", "unrecognized", "likely", "review"].some(w => t.includes(w)))
    return "bg-warning/14 text-[color-mix(in_srgb,var(--warning)_80%,black)] dark:text-warning border border-warning/30";
  return "bg-surface-3 text-muted border border-border";
}

function Chips({ items, tone = "neutral" }: { items: unknown[]; tone?: "neutral" | "accent" }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s, i) => (
        <span key={i} className={`rounded-md px-2 py-0.5 text-[11px] font-medium tabular-nums ${
          tone === "accent" ? "bg-brand-500/10 text-brand-600 dark:text-brand-300" : "bg-surface-3 text-muted"
        }`}>
          {String(s)}
        </span>
      ))}
    </div>
  );
}

/** Recursively renders any agent-output value as readable UI (never raw JSON). */
function PrettyValue({ value, keyName, depth = 0 }: { value: unknown; keyName?: string; depth?: number }) {
  if (value == null || value === "")
    return <span className="text-xs text-subtle">—</span>;

  if (typeof value === "boolean")
    return (
      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${value ? "bg-success/12 text-success" : "bg-surface-3 text-subtle"}`}>
        {value ? "Yes" : "No"}
      </span>
    );

  if (typeof value === "number") {
    const pct = (keyName === "similarity" || keyName === "score") && value <= 1;
    return <span className="text-[13px] tabular-nums text-text">{pct ? `${Math.round(value * 100)}%` : value}</span>;
  }

  if (typeof value === "string") {
    if (/^https?:\/\//.test(value))
      return (
        <a href={value} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[13px] text-brand-600 hover:underline dark:text-brand-300 break-all">
          {value.replace(/^https?:\/\//, "").slice(0, 48)}<ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      );
    // Status-like short tokens → pill
    if (keyName && /status|verdict|severity|level/i.test(keyName) && value.length < 24 && !value.includes(" "))
      return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${statusPill(value)}`}>{value.replace(/_/g, " ")}</span>;
    if (value.length > 88 || value.includes("\n"))
      return <p className="text-[13px] leading-relaxed text-text whitespace-pre-wrap">{value}</p>;
    return <span className="text-[13px] text-text">{value}</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-xs text-subtle">None</span>;
    if (value.every(v => typeof v === "string" || typeof v === "number" || typeof v === "boolean"))
      return <Chips items={value} />;
    return (
      <div className="space-y-2">
        {value.map((item, i) => (
          <div key={i} className="rounded-xl border border-border bg-surface-2 p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-4 w-4 items-center justify-center rounded bg-surface-3 text-[10px] font-bold tabular-nums text-subtle">{i + 1}</span>
              {(() => {
                const it = item as Record<string, unknown>;
                const sim = typeof it?.similarity === "number" ? `${Math.round((it.similarity as number) * 100)}% match` : null;
                const name = (it?.drug ?? it?.medicine ?? it?.allergen ?? it?.inputName ?? it?.name ?? it?.condition) as string | undefined;
                return (
                  <div className="flex items-center gap-2">
                    {name && <span className="text-xs font-semibold text-text">{name}</span>}
                    {sim && <span className="rounded bg-brand-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand-600 tabular-nums dark:text-brand-300">{sim}</span>}
                  </div>
                );
              })()}
            </div>
            <ObjectRows obj={item as Record<string, unknown>} depth={depth + 1} skip={["similarity", "drug", "medicine", "allergen", "inputName", "name", "condition"]} />
          </div>
        ))}
      </div>
    );
  }

  if (isPlainObject(value)) {
    if (depth >= 4) return <span className="text-xs text-subtle">{Object.keys(value).length} field(s)</span>;
    return <ObjectRows obj={value} depth={depth + 1} inset />;
  }

  return <span className="text-[13px] text-text">{String(value)}</span>;
}

/** A labelled list of an object's fields. */
function ObjectRows({ obj, depth = 0, skip = [], inset = false }: { obj: Record<string, unknown>; depth?: number; skip?: string[]; inset?: boolean }) {
  const entries = Object.entries(obj).filter(
    ([k, v]) => !HIDDEN_KEYS.has(k) && !skip.includes(k) && v !== undefined,
  );
  if (entries.length === 0) return <span className="text-xs text-subtle">—</span>;
  return (
    <div className={`space-y-3 ${inset ? "border-l border-border pl-3" : ""}`}>
      {entries.map(([k, v]) => (
        <div key={k} className="space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-subtle">{formatKey(k)}</div>
          <div><PrettyValue value={v} keyName={k} depth={depth} /></div>
        </div>
      ))}
    </div>
  );
}

function AgentCard({ meta, value }: { meta: AgentMeta; value: unknown }) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState(false);
  const has = value !== undefined;
  const empty = has && isEmptyValue(value);
  const Icon = meta.icon;

  const out = isPlainObject(value) ? value : undefined;
  const prov = out?.provider as string | undefined;
  const cache = out?.cacheStatus as string | undefined;
  const geminiFailed = out?.geminiFailed as boolean | undefined;
  const fbModel = prov?.includes("deepseek") ? "DeepSeek" : prov?.includes("ollama") ? "Ollama" : "backup";
  const skipped = (out?.skipped as boolean | undefined) ?? false;

  return (
    <div className={`border-l-2 ${has && !empty ? meta.rail : "border-l-transparent"}`}>
      <button
        onClick={() => has && setOpen(o => !o)}
        disabled={!has}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors sm:px-5 ${has ? "cursor-pointer hover:bg-surface-2" : "cursor-default opacity-45"}`}
      >
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${has ? meta.chip : "bg-surface-3 text-subtle"}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-semibold ${has ? meta.accent : "text-subtle"}`}>{meta.label}</p>
          <p className="truncate text-[11px] text-subtle">{meta.role}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {has ? (
            <>
              {geminiFailed && (
                <span className="hidden rounded bg-warning/12 px-1.5 py-0.5 text-[9px] font-semibold text-[color-mix(in_srgb,var(--warning)_80%,black)] dark:text-warning sm:inline" title={`Gemini unavailable — ${fbModel} answered`}>
                  ⚠ {fbModel}
                </span>
              )}
              {prov && (
                <span className={`hidden rounded px-1.5 py-0.5 font-mono text-[9px] sm:inline ${
                  prov.includes("gemini") ? "bg-brand-500/10 text-brand-500" :
                  prov.includes("deepseek") ? "bg-violet-500/10 text-violet-500" :
                  prov.includes("ollama") ? "bg-orange-500/10 text-orange-500" : "bg-surface-3 text-subtle"
                }`}>{prov.length > 22 ? prov.slice(0, 22) + "…" : prov}</span>
              )}
              {cache === "hit" && <span className="hidden rounded bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[9px] text-cyan-600 sm:inline dark:text-cyan-300">⚡ cached</span>}
              <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                skipped ? "bg-warning/14 text-[color-mix(in_srgb,var(--warning)_80%,black)] dark:text-warning" :
                empty ? "bg-surface-3 text-subtle" : "bg-success/12 text-success"
              }`}>
                {skipped ? "Skipped" : empty ? "No output" : "Done"}
              </span>
              <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} className="text-subtle">
                <ChevronDown className="h-4 w-4" />
              </motion.span>
            </>
          ) : (
            <span className="flex items-center gap-1.5 text-[10px] text-subtle">
              <Circle className="h-3 w-3" /> Waiting
            </span>
          )}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && has && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-border bg-surface-2/60 px-4 py-4 sm:px-5">
              {empty ? (
                <p className="text-[13px] leading-relaxed text-muted">
                  This agent ran but produced no output — e.g. no similar cases were found, or there was no audio to transcribe.
                </p>
              ) : raw ? (
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-3/70 p-3 font-mono text-[11px] leading-relaxed text-muted">
                  {JSON.stringify(value, null, 2)}
                </pre>
              ) : (
                <div className="max-h-[28rem] overflow-auto pr-1">
                  {isPlainObject(value)
                    ? <ObjectRows obj={value} />
                    : <PrettyValue value={value} />}
                </div>
              )}
              {!empty && (
                <button
                  onClick={() => setRaw(r => !r)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-subtle transition-colors hover:bg-surface-3 hover:text-muted"
                >
                  <Code2 className="h-3 w-3" /> {raw ? "Readable view" : "Show raw JSON"}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AgentOutputsPanel({ outputs }: { outputs: Record<string, unknown> }) {
  const done = AGENT_LIST.filter(a => a.id in outputs).length;
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-brand-600 dark:text-brand-300" />
          <h2 className="text-sm font-bold text-text">Agent Pipeline Outputs</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] tabular-nums text-subtle">{done} of {AGENT_LIST.length} reported</span>
          <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-surface-3 sm:block">
            <div className="h-full rounded-full bg-brand-500 transition-all duration-700" style={{ width: `${(done / AGENT_LIST.length) * 100}%` }} />
          </div>
        </div>
      </div>
      <div className="divide-y divide-border">
        {AGENT_LIST.map(meta => (
          <AgentCard key={meta.id} meta={meta} value={outputs[meta.id]} />
        ))}
      </div>
    </section>
  );
}
