"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Pill, Star, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import type { Prescription } from "@/types/consultation";

interface Props {
  appointmentId: string;
}

export function PrescriptionView({ appointmentId }: Props) {
  const [prescription, setPrescription] = useState<Prescription | null>(null);
  const [prescriptionSentAt, setSentAt] = useState<string | null>(null);
  const [loading, setLoading]           = useState(true);
  const [rating, setRating]             = useState(0);
  const [hover, setHover]               = useState(0);
  const [comment, setComment]           = useState("");
  const [rated, setRated]               = useState(false);
  const [submittingRating, setSubmitting] = useState(false);

  // Poll for prescription
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res  = await fetch(`/api/appointments/${appointmentId}/prescription`);
        const data = await res.json();
        if (data.prescription && !cancelled) {
          setPrescription(data.prescription);
          setSentAt(data.prescriptionSentAt ?? null);
          setLoading(false);
        } else if (!cancelled) {
          setTimeout(poll, 3000);
        }
      } catch {
        if (!cancelled) setTimeout(poll, 5000);
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [appointmentId]);

  const submitRating = async () => {
    if (!rating) { toast.error("Please select a star rating"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/appointments/${appointmentId}/rating`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ rating, comment }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed"); return; }
      toast.success("Thank you for your feedback!");
      setRated(true);
    } catch {
      toast.error("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 py-20">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
        <div className="text-center">
          <p className="font-semibold text-text">Doctor is reviewing your case...</p>
          <p className="text-sm text-muted mt-1">Your prescription will appear here shortly.</p>
        </div>
      </div>
    );
  }

  if (!prescription) return null;

  return (
    <div className="max-w-xl mx-auto space-y-6 px-4 py-6">
      {/* Header */}
      <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 flex items-center gap-3">
        <CheckCircle2 className="w-8 h-8 text-emerald-500 shrink-0" />
        <div>
          <p className="font-bold text-emerald-800">Prescription Ready</p>
          {prescriptionSentAt && (
            <p className="text-xs text-emerald-600">
              Sent {new Date(prescriptionSentAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
      </div>

      {/* Diagnosis */}
      <div className="bg-surface rounded-2xl border border-border shadow-sm p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-subtle mb-2">Diagnosis</p>
        <p className="text-text text-sm leading-relaxed">{prescription.diagnosis}</p>
      </div>

      {/* Medicines */}
      <div className="bg-surface rounded-2xl border border-border shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Pill className="w-4 h-4 text-brand-600 dark:text-brand-300" />
          <p className="text-xs font-bold uppercase tracking-wide text-subtle">Medicines</p>
        </div>
        <div className="space-y-3">
          {prescription.medicines?.map((med, i) => (
            <div key={i} className="rounded-xl bg-surface-2 border border-border p-4">
              <p className="font-semibold text-text text-sm">{med.medicine}</p>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <Detail label="Dosage"    value={med.dosage} />
                <Detail label="Timing"    value={med.timing} />
                <Detail label="Frequency" value={med.frequency} />
              </div>
              <div className="mt-1.5">
                <Detail label="Duration" value={med.duration} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Advice */}
      {prescription.advice && (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-600 mb-2">Advice</p>
          <p className="text-sm text-amber-900 leading-relaxed whitespace-pre-line">{prescription.advice}</p>
        </div>
      )}

      {/* Rating */}
      {!rated ? (
        <div className="bg-surface rounded-2xl border border-border shadow-sm p-5 space-y-4">
          <p className="font-semibold text-text text-sm">Rate your consultation</p>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(star => (
              <button
                key={star}
                onMouseEnter={() => setHover(star)}
                onMouseLeave={() => setHover(0)}
                onClick={() => setRating(star)}
                className="text-2xl transition-transform hover:scale-110"
              >
                <Star
                  className="w-8 h-8"
                  fill={(hover || rating) >= star ? "#f59e0b" : "none"}
                  stroke={(hover || rating) >= star ? "#f59e0b" : "#cbd5e1"}
                />
              </button>
            ))}
          </div>
          <textarea
            rows={2}
            placeholder="Optional comment for the doctor..."
            value={comment}
            onChange={e => setComment(e.target.value)}
            className="w-full rounded-xl border border-border px-4 py-3 text-sm text-text placeholder:text-subtle focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/12 resize-none"
          />
          <button
            onClick={submitRating}
            disabled={submittingRating || !rating}
            className="w-full bg-brand-gradient hover:brightness-105 disabled:bg-slate-100 disabled:text-subtle text-white font-semibold rounded-xl py-2.5 transition-all active:scale-95"
          >
            {submittingRating ? "Submitting..." : "Submit Rating"}
          </button>
        </div>
      ) : (
        <div className="text-center py-4 text-emerald-600 font-semibold text-sm">
          ✓ Thank you for rating this consultation!
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-subtle font-medium">{label}</p>
      <p className="text-xs text-text capitalize">{value}</p>
    </div>
  );
}
