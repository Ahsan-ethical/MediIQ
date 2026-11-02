"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, MessageSquarePlus } from "lucide-react";

type MedRating = { medicine: string; helpful: string };

interface Props {
  appointmentId: string;
  medicines: Array<{ medicine: string; dosage?: string }>;
  alreadySubmitted: boolean;
  existingSummary?: string;
}

const QUESTIONS = [
  { key: "recoveryTime",         label: "How quickly did you start feeling better?",
    options: ["Within 24 hours", "2-3 days", "4-7 days", "1-2 weeks", "Still not fully recovered"] },
  { key: "overallEffectiveness", label: "How effective was the prescribed treatment?",
    options: ["Very effective", "Somewhat effective", "Not effective", "Made it worse"] },
  { key: "sideEffects",          label: "Did you experience any side effects?",
    options: ["None at all", "Mild (manageable)", "Moderate (uncomfortable)", "Severe (had to stop)"] },
  { key: "courseCompleted",      label: "Did you complete the full medication course?",
    options: ["Yes, fully", "Mostly (a few missed)", "Stopped early — felt better", "Stopped early — side effects"] },
  { key: "symptomsResolved",     label: "Are your symptoms now?",
    options: ["Completely resolved", "Mostly resolved", "Partially resolved", "Not resolved"] },
  { key: "revisitNeeded",        label: "Did you need to see a doctor again for the same issue?",
    options: ["No, recovered well", "Yes, once more", "Yes, multiple times"] },
  { key: "dosageExperience",     label: "How was the medication dosage/strength?",
    options: ["Just right", "Too strong (caused discomfort)", "Too weak (not enough effect)", "Caused issues"] },
  { key: "careRating",           label: "How would you rate the overall quality of care?",
    options: ["⭐⭐⭐⭐⭐ Excellent", "⭐⭐⭐⭐ Good", "⭐⭐⭐ Average", "⭐⭐ Poor"] },
  { key: "wouldUseAgain",        label: "Would you use this service again?",
    options: ["Definitely yes", "Probably yes", "Probably not", "No"] },
];

function PillOption({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
        selected
          ? "bg-brand-gradient border-blue-600 text-white"
          : "bg-surface border-border text-muted hover:border-blue-300 hover:text-brand-700 dark:text-brand-300"
      }`}>
      {label}
    </button>
  );
}

export default function PrescriptionFeedbackForm({ appointmentId, medicines, alreadySubmitted, existingSummary }: Props) {
  const [open,     setOpen]     = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [done,     setDone]     = useState(alreadySubmitted);
  const [answers,  setAnswers]  = useState<Record<string, string>>({});
  const [medRatings, setMedRatings] = useState<MedRating[]>(
    medicines.map(m => ({ medicine: `${m.medicine}${m.dosage ? ` ${m.dosage}` : ""}`, helpful: "" }))
  );
  const [extra, setExtra] = useState("");

  const set = (key: string, val: string) => setAnswers(p => ({ ...p, [key]: val }));

  const allAnswered =
    QUESTIONS.every(q => answers[q.key]) &&
    medRatings.every(m => m.helpful);

  const handleSubmit = async () => {
    if (!allAnswered) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/appointments/${appointmentId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...answers, medicineRatings: medRatings, additionalFeedback: extra }),
      });
      if (res.ok) setDone(true);
    } finally {
      setLoading(false);
    }
  };

  if (done) return (
    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-5 py-4 flex items-center gap-3">
      <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
      <div>
        <p className="text-sm font-semibold text-emerald-800">Thank you for your feedback!</p>
        {existingSummary && <p className="text-xs text-emerald-600 mt-0.5">{existingSummary}</p>}
      </div>
    </div>
  );

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full px-5 py-4 flex items-center gap-3 hover:bg-surface-2 transition-colors text-left">
        <div className="w-8 h-8 rounded-xl bg-brand-500/12 flex items-center justify-center shrink-0">
          <MessageSquarePlus className="w-4 h-4 text-brand-600 dark:text-brand-300" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-text text-sm">How did your recovery go?</p>
          <p className="text-xs text-subtle">Share your experience — helps improve future care</p>
        </div>
        <span className="text-xs text-brand-600 dark:text-brand-300 font-semibold">{open ? "Close" : "Give Feedback"}</span>
      </button>

      {open && (
        <div className="border-t border-border px-5 pb-6 pt-5 space-y-6">
          {/* Static questions */}
          {QUESTIONS.map((q, qi) => (
            <div key={q.key}>
              <p className="text-sm font-semibold text-text mb-2.5">
                <span className="text-brand-500 mr-1.5">{qi + 1}.</span>{q.label}
              </p>
              <div className="flex flex-wrap gap-2">
                {q.options.map(opt => (
                  <PillOption key={opt} label={opt} selected={answers[q.key] === opt}
                    onClick={() => set(q.key, opt)} />
                ))}
              </div>
            </div>
          ))}

          {/* Dynamic medicine ratings */}
          {medRatings.length > 0 && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-text">
                <span className="text-brand-500 mr-1.5">{QUESTIONS.length + 1}.</span>
                How helpful was each medicine?
              </p>
              {medRatings.map((m, i) => (
                <div key={i} className="bg-surface-2 rounded-xl p-3">
                  <p className="text-xs font-semibold text-muted mb-2">{m.medicine}</p>
                  <div className="flex flex-wrap gap-2">
                    {["Very helpful", "Somewhat helpful", "Not helpful", "Couldn't take it"].map(opt => (
                      <PillOption key={opt} label={opt} selected={m.helpful === opt}
                        onClick={() => setMedRatings(prev => prev.map((r, j) => j === i ? { ...r, helpful: opt } : r))} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Free text */}
          <div>
            <p className="text-sm font-semibold text-text mb-2">
              <span className="text-subtle mr-1.5">+</span>
              Anything else you&apos;d like to share? <span className="text-subtle font-normal">(optional)</span>
            </p>
            <textarea rows={3} value={extra} onChange={e => setExtra(e.target.value)}
              placeholder="e.g. The medicine helped but caused slight drowsiness the first day…"
              className="w-full rounded-xl border border-border px-4 py-3 text-sm text-text placeholder:text-subtle focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/12 resize-none" />
          </div>

          <button onClick={handleSubmit} disabled={!allAnswered || loading}
            className="w-full flex items-center justify-center gap-2 bg-brand-gradient hover:brightness-105 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-colors text-sm">
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : "Submit Feedback"}
          </button>
          {!allAnswered && (
            <p className="text-xs text-center text-subtle">Please answer all questions to submit</p>
          )}
        </div>
      )}
    </div>
  );
}
