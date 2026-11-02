"use client";

import type { VitalsResult } from "@/types/vitals";

interface Props {
  result:   VitalsResult;
  onAccept: () => void;
  onRescan: () => void;
}

const BP_COLORS: Record<string, string> = {
  "Normal":               "bg-emerald-50 text-emerald-800 border-emerald-200",
  "Elevated":             "bg-amber-50   text-amber-800   border-amber-200",
  "Stage 1 Hypertension": "bg-orange-50  text-orange-800  border-orange-200",
  "Stage 2 Hypertension": "bg-red-50     text-red-800     border-red-200",
  "Hypertensive Crisis":  "bg-red-100    text-red-900     border-red-400",
};

const HR_COLORS: Record<string, string> = {
  Normal:      "bg-emerald-50 text-emerald-700",
  Bradycardia: "bg-amber-50   text-amber-700",
  Tachycardia: "bg-amber-50   text-amber-700",
  Unknown:     "bg-slate-100  text-muted",
};

function ConfidenceBars({ value }: { value: number }) {
  const filled = Math.round(value * 5);
  return (
    <span className="inline-flex items-center gap-0.5">
      {[0, 1, 2, 3, 4].map(i => (
        <span
          key={i}
          className={`inline-block w-2 h-3.5 rounded-sm ${
            i < filled ? "bg-emerald-500" : "bg-slate-200"
          }`}
        />
      ))}
    </span>
  );
}

export function VitalsResults({ result, onAccept, onRescan }: Props) {
  const { blood_pressure: bp, heart_rate: hr, classification, confidence } = result;
  const bpCls  = BP_COLORS[classification.bp] ?? "bg-surface-2 text-text border-border";
  const hrCls  = HR_COLORS[classification.hr] ?? HR_COLORS.Unknown;
  const crisis = classification.bp === "Hypertensive Crisis";

  return (
    <div className="space-y-5 animate-fade-in-up opacity-0" style={{ animationFillMode: "forwards" }}>
      {crisis && (
        <div className="rounded-xl border-2 border-red-400 bg-red-50 p-4 text-red-900">
          <p className="font-bold">⚠ Very high BP reading detected</p>
          <p className="text-sm mt-1">
            This is a screening estimate. If you feel unwell, seek medical attention immediately.
          </p>
        </div>
      )}

      {/* Blood Pressure */}
      <div className="bg-surface-2 rounded-2xl p-5">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
          Blood Pressure
        </p>
        <div className="flex items-end gap-3">
          <span className="text-4xl font-bold tabular-nums text-text">
            {bp.systolic.value.toFixed(0)}
            <span className="text-subtle mx-1">/</span>
            {bp.diastolic.value.toFixed(0)}
          </span>
          <span className="text-muted mb-1">{bp.unit}</span>
          <span className={`ml-auto mb-1 inline-block px-3 py-1 rounded-full text-xs font-semibold border ${bpCls}`}>
            {classification.bp}
          </span>
        </div>
        <p className="text-xs text-subtle mt-2">
          90% range: {bp.systolic.lower.toFixed(0)}–{bp.systolic.upper.toFixed(0)}
          {" / "}
          {bp.diastolic.lower.toFixed(0)}–{bp.diastolic.upper.toFixed(0)} mmHg
        </p>
      </div>

      {/* Heart Rate */}
      <div className="bg-surface-2 rounded-2xl p-5">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
          Heart Rate
        </p>
        <div className="flex items-end gap-3">
          <span className="text-4xl font-bold tabular-nums text-text">
            {hr.value.toFixed(0)}
          </span>
          <span className="text-muted mb-1">{hr.unit}</span>
          <span className={`ml-auto mb-1 inline-block px-3 py-1 rounded-full text-xs font-semibold ${hrCls}`}>
            {classification.hr}
          </span>
        </div>
      </div>

      {/* Confidence */}
      <div className="flex items-center gap-2 text-sm text-muted">
        <span>Confidence</span>
        <ConfidenceBars value={confidence} />
        <span className="tabular-nums text-muted">{confidence.toFixed(2)}</span>
      </div>

      <p className="text-xs text-subtle italic leading-relaxed">
        Camera-based screening estimate only. Not a substitute for a clinical cuff reading.
        Results are shared with your doctor to assist consultation.
      </p>

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button
          onClick={onAccept}
          className="flex-1 bg-brand-gradient hover:brightness-105 active:scale-95 text-white font-semibold rounded-xl py-3 transition-all duration-150"
        >
          Use these readings
        </button>
        <button
          onClick={onRescan}
          className="px-5 border border-border hover:bg-surface-2 rounded-xl py-3 text-muted font-medium transition-colors"
        >
          Rescan
        </button>
      </div>
    </div>
  );
}
