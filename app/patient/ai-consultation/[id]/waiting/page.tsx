"use client";

import { useEffect, use, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Brain, Loader2, CheckCircle2, Circle } from "lucide-react";

type ReportStep =
  | "transcribed" | "patient_history" | "embedding" | "similar_cases"
  | "drug_check" | "llm_sending" | "llm_success" | "parsing" | "done";

const STEPS: { key: ReportStep; label: string; sub: string }[] = [
  { key: "transcribed", label: "Call transcribed", sub: "Your conversation has been captured" },
  { key: "patient_history", label: "Reviewing your history", sub: "Fetching your past consultations" },
  { key: "embedding", label: "Analyzing symptoms", sub: "Processing medical context" },
  { key: "similar_cases", label: "Searching case records", sub: "Finding similar medical cases" },
  { key: "drug_check", label: "Checking drug interactions", sub: "Verifying against your current medications" },
  { key: "llm_sending", label: "Calling the AI model", sub: "Reasoning over your case" },
  { key: "llm_success", label: "AI responded", sub: "Clinical response received" },
  { key: "parsing", label: "Building your report", sub: "Structuring diagnosis & prescription" },
  { key: "done", label: "Report complete!", sub: "Opening your report now…" },
];
const STEP_ORDER = STEPS.map((s) => s.key);
const stepIndex = (key: ReportStep | undefined | null) => (key ? STEP_ORDER.indexOf(key) : -1);

export default function AiWaitingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [reportStep, setReportStep] = useState<ReportStep | null>(null);
  const [stepSecs, setStepSecs] = useState(0);
  const stepStartRef = useRef<number>(Date.now());

  useEffect(() => { stepStartRef.current = Date.now(); setStepSecs(0); }, [reportStep]);
  useEffect(() => {
    const t = setInterval(() => setStepSecs(Math.floor((Date.now() - stepStartRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/ai-consultation/${id}`);
        const data = await res.json();
        const c = data.consultation;
        if (!c) return;
        if (c.reportStep) setReportStep(c.reportStep as ReportStep);
        if (c.status === "report_ready") { clearInterval(poll); router.replace(`/patient/ai-consultation/${id}/report`); }
      } catch { /* keep polling */ }
    }, 2000);
    return () => clearInterval(poll);
  }, [id, router]);

  const currentIdx = stepIndex(reportStep);
  const percent = reportStep ? Math.round(((currentIdx + 1) / STEP_ORDER.length) * 100) : 5;

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-8 p-8">
      {/* AI orb */}
      <div className="relative h-20 w-20">
        <motion.span className="absolute inset-0 rounded-full bg-brand-500/25" animate={{ scale: [1, 1.8], opacity: [0.5, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }} />
        <span className="relative flex h-full w-full items-center justify-center rounded-full bg-brand-gradient shadow-brand">
          <Brain className="h-9 w-9 text-white" />
        </span>
      </div>

      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-text">Generating your report</h1>
        <p className="mx-auto max-w-xs text-sm text-muted">Dr. MediIQ AI is reviewing your consultation and preparing a personalised medical report.</p>
      </div>

      <div className="w-full max-w-sm space-y-2">
        <div className="flex justify-between text-xs text-subtle"><span>Progress</span><span className="tnum">{percent}%</span></div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
          <motion.div className="h-full rounded-full bg-brand-gradient" animate={{ width: `${percent}%` }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }} />
        </div>
      </div>

      <div className="w-full max-w-sm space-y-3.5 rounded-2xl border border-border bg-surface p-5 shadow-1">
        {STEPS.map((step, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          const pending = i > currentIdx;
          return (
            <div key={step.key} className={`flex items-start gap-3 transition-opacity duration-300 ${pending ? "opacity-40" : "opacity-100"}`}>
              <span className="mt-0.5 shrink-0">
                {done ? <CheckCircle2 className="h-5 w-5 text-success" /> : active ? <Loader2 className="h-5 w-5 animate-spin text-brand-500" /> : <Circle className="h-5 w-5 text-subtle" />}
              </span>
              <div>
                <p className={`flex items-center gap-2 text-sm font-semibold ${done ? "text-success" : active ? "text-text" : "text-subtle"}`}>
                  {step.label}
                  {active && stepSecs > 0 && <span className="text-xs font-normal text-muted tnum">{stepSecs}s</span>}
                </p>
                <p className="mt-0.5 text-xs text-subtle">{step.sub}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 text-sm text-subtle">
        <Loader2 className="h-4 w-4 animate-spin" /> Please wait — this usually takes under a minute
      </div>
    </div>
  );
}
