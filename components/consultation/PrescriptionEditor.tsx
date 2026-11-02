"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Send, Loader2, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import type { Prescription, PrescriptionMedicine } from "@/types/consultation";

interface Props {
  appointmentId:   string;
  aiPrescription?: Prescription | null;
  onSent:          () => void;
}

const BLANK_MED: PrescriptionMedicine = {
  medicine: "", dosage: "", timing: "after food", frequency: "twice daily", duration: "",
};

export function PrescriptionEditor({ appointmentId, aiPrescription, onSent }: Props) {
  const [diagnosis, setDiagnosis] = useState(aiPrescription?.diagnosis ?? "");
  const [medicines, setMedicines] = useState<PrescriptionMedicine[]>(
    aiPrescription?.medicines?.length ? aiPrescription.medicines : [{ ...BLANK_MED }]
  );
  const [advice, setAdvice]     = useState(aiPrescription?.advice ?? "");
  const [sending, setSending]   = useState(false);
  const [aiLoading, setAiLoading] = useState(!aiPrescription);

  // Poll for aiPrescription if not yet available (async post-call pipeline)
  useEffect(() => {
    if (aiPrescription) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const res  = await fetch(`/api/appointments/${appointmentId}/prescription`);
        const data = await res.json();
        if (data.aiPrescription && !cancelled) {
          const p = data.aiPrescription as Prescription;
          setDiagnosis(p.diagnosis ?? "");
          setMedicines(p.medicines?.length ? p.medicines : [{ ...BLANK_MED }]);
          setAdvice(p.advice ?? "");
          setAiLoading(false);
        } else if (!cancelled) {
          setTimeout(poll, 3000);
        }
      } catch {
        if (!cancelled) setTimeout(poll, 5000);
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [appointmentId, aiPrescription]);

  const updateMed = useCallback((idx: number, field: keyof PrescriptionMedicine, val: string) => {
    setMedicines(prev => prev.map((m, i) => i === idx ? { ...m, [field]: val } : m));
  }, []);

  const addMed    = () => setMedicines(prev => [...prev, { ...BLANK_MED }]);
  const removeMed = (idx: number) => setMedicines(prev => prev.filter((_, i) => i !== idx));

  const handleSend = async () => {
    if (!diagnosis.trim()) { toast.error("Please enter a diagnosis"); return; }
    const validMeds = medicines.filter(m => m.medicine.trim());
    if (!validMeds.length) { toast.error("Please add at least one medicine"); return; }

    setSending(true);
    try {
      const res = await fetch(`/api/appointments/${appointmentId}/prescription`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ diagnosis, medicines: validMeds, advice }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed to send"); return; }
      toast.success("Prescription sent to patient!");
      onSent();
    } catch {
      toast.error("Network error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5 p-5">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-brand-500/100 animate-pulse" />
        <h3 className="font-bold text-text">Write Prescription</h3>
        {aiLoading && (
          <span className="flex items-center gap-1 text-xs text-brand-600 dark:text-brand-300 ml-auto">
            <Loader2 className="w-3 h-3 animate-spin" /> AI generating...
          </span>
        )}
        {!aiLoading && aiPrescription && (
          <span className="flex items-center gap-1 text-xs text-emerald-600 ml-auto">
            <RefreshCw className="w-3 h-3" /> AI suggestion loaded
          </span>
        )}
      </div>

      {/* Diagnosis */}
      <div>
        <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">Diagnosis *</label>
        <textarea
          rows={2}
          value={diagnosis}
          onChange={e => setDiagnosis(e.target.value)}
          placeholder="Primary diagnosis and brief reasoning..."
          className="w-full rounded-xl border border-border px-4 py-3 text-sm text-text placeholder:text-subtle focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/12 resize-none"
        />
      </div>

      {/* Medicines */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-muted uppercase tracking-wide">Medicines *</label>
          <button
            type="button"
            onClick={addMed}
            className="flex items-center gap-1 text-xs text-brand-600 dark:text-brand-300 hover:text-brand-700 dark:text-brand-300 font-semibold"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>
        <div className="space-y-3">
          {medicines.map((med, i) => (
            <MedicineRow
              key={i}
              med={med}
              idx={i}
              onChange={updateMed}
              onRemove={medicines.length > 1 ? removeMed : undefined}
            />
          ))}
        </div>
      </div>

      {/* Advice */}
      <div>
        <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">Advice / Do&apos;s & Don&apos;ts</label>
        <textarea
          rows={3}
          value={advice}
          onChange={e => setAdvice(e.target.value)}
          placeholder="Lifestyle advice, dietary restrictions, follow-up instructions..."
          className="w-full rounded-xl border border-border px-4 py-3 text-sm text-text placeholder:text-subtle focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/12 resize-none"
        />
      </div>

      <button
        onClick={handleSend}
        disabled={sending}
        className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-subtle text-white font-semibold rounded-xl py-3 transition-all active:scale-95"
      >
        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {sending ? "Sending..." : "Send Prescription to Patient"}
      </button>
    </div>
  );
}

function MedicineRow({
  med, idx, onChange, onRemove,
}: {
  med: PrescriptionMedicine;
  idx: number;
  onChange: (idx: number, field: keyof PrescriptionMedicine, val: string) => void;
  onRemove?: (idx: number) => void;
}) {
  const inp = "rounded-lg border border-border px-3 py-2 text-xs text-text focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/12 w-full";
  return (
    <div className="bg-surface-2 rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2">
        <input
          placeholder="Medicine name *"
          value={med.medicine}
          onChange={e => onChange(idx, "medicine", e.target.value)}
          className={inp + " flex-1"}
        />
        {onRemove && (
          <button onClick={() => onRemove(idx)} className="p-1.5 rounded-lg hover:bg-red-100 text-red-400 hover:text-red-600">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input
          placeholder="Dosage (e.g. 500mg)"
          value={med.dosage}
          onChange={e => onChange(idx, "dosage", e.target.value)}
          className={inp}
        />
        <select
          value={med.timing}
          onChange={e => onChange(idx, "timing", e.target.value)}
          className={inp}
        >
          <option value="before food">Before food</option>
          <option value="after food">After food</option>
          <option value="with food">With food</option>
          <option value="as needed">As needed</option>
        </select>
        <select
          value={med.frequency}
          onChange={e => onChange(idx, "frequency", e.target.value)}
          className={inp}
        >
          <option value="once daily">Once daily</option>
          <option value="twice daily">Twice daily</option>
          <option value="thrice daily">Thrice daily</option>
          <option value="every 6 hours">Every 6 hours</option>
          <option value="at bedtime">At bedtime</option>
          <option value="as needed">As needed</option>
        </select>
        <input
          placeholder="Duration (e.g. 5 days)"
          value={med.duration}
          onChange={e => onChange(idx, "duration", e.target.value)}
          className={inp}
        />
      </div>
    </div>
  );
}
