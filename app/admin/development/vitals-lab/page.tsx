"use client";

import { useState } from "react";
import { Activity, Server, Heart, Gauge, Wind, Zap } from "lucide-react";
import { VitalsScanModal } from "@/components/vitals-lab/VitalsScanModal";
import { checkLabHealth } from "@/lib/vitalsLabApi";
import type { LabVitalsResult } from "@/lib/vitalsLabApi";
import type { VitalsDemographics } from "@/types/vitals";

export default function VitalsLabPage() {
  const [showScanner, setShowScanner] = useState(false);
  const [lastResult, setLastResult]   = useState<LabVitalsResult | null>(null);
  const [apiStatus, setApiStatus]     = useState<"unknown" | "ok" | "down">("unknown");
  const [apiModel, setApiModel]       = useState<string>("");
  const [checking, setChecking]       = useState(false);

  const [age, setAge]       = useState(25);
  const [sex, setSex]       = useState<"M" | "F">("M");
  const [height, setHeight] = useState(170);
  const [weight, setWeight] = useState(70);

  const demographics: VitalsDemographics = { age, sex, height, weight };

  const handleCheckApi = async () => {
    setChecking(true);
    const { ok, model } = await checkLabHealth();
    setApiStatus(ok ? "ok" : "down");
    setApiModel(model ?? "");
    setChecking(false);
  };

  const handleComplete = (result: LabVitalsResult) => {
    setLastResult(result);
    setShowScanner(false);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
            <Activity className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text">Vitals Lab</h1>
            <p className="text-sm text-muted">open-rppg deep learning scanner — isolated sandbox</p>
          </div>
        </div>
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          This uses the <span className="font-semibold">FacePhys.rlap</span> deep learning model instead of POS.
          Changes here do NOT affect the real vitals scanner.
        </div>
      </div>

      {/* API Health Check */}
      <div className="bg-surface rounded-2xl border border-border p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-muted" />
            <span className="font-semibold text-text">Lab API</span>
          </div>
          <button onClick={handleCheckApi} disabled={checking} className="text-sm px-4 py-1.5 rounded-lg border border-border hover:bg-surface-2 disabled:opacity-50 transition-colors">
            {checking ? "Checking..." : "Check Health"}
          </button>
        </div>
        {apiStatus !== "unknown" && (
          <div className={`text-sm px-3 py-2 rounded-lg ${
            apiStatus === "ok" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"
          }`}>
            {apiStatus === "ok"
              ? `Lab API ready — model: ${apiModel}`
              : "Lab API not reachable — make sure the Python server is running with open-rppg installed"}
          </div>
        )}
        <p className="text-xs text-subtle">
          Endpoint: {process.env.NEXT_PUBLIC_VITALS_API_URL ?? "http://localhost:8000"}/api/v1/lab/predict-faces
        </p>
      </div>

      {/* Demographics */}
      <div className="bg-surface rounded-2xl border border-border p-5 space-y-4">
        <h2 className="font-semibold text-text">Test Demographics</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <label className="block text-xs text-muted mb-1">Age</label>
            <input type="number" value={age} onChange={e => setAge(Number(e.target.value))} min={1} max={120} className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Sex</label>
            <select value={sex} onChange={e => setSex(e.target.value as "M" | "F")} className="w-full border border-border rounded-lg px-3 py-2 text-sm">
              <option value="M">Male</option>
              <option value="F">Female</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Height (cm)</label>
            <input type="number" value={height} onChange={e => setHeight(Number(e.target.value))} min={50} max={250} className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Weight (kg)</label>
            <input type="number" value={weight} onChange={e => setWeight(Number(e.target.value))} min={20} max={300} className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
      </div>

      {/* Run Scanner */}
      <div className="bg-surface rounded-2xl border border-border p-5">
        <button onClick={() => setShowScanner(true)} className="w-full bg-violet-600 hover:bg-violet-700 active:scale-[0.98] text-white font-semibold rounded-xl py-4 transition-all duration-150 text-lg">
          Open Vitals Scanner (DL Model)
        </button>
      </div>

      {/* Last Result */}
      {lastResult && (
        <div className="bg-surface rounded-2xl border border-border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-text">Last Scan Result</h2>
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
              lastResult.signal_source === "camera"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-amber-50 text-amber-700 border border-amber-200"
            }`}>
              {lastResult.signal_source === "camera" ? "Signal-based" : "NHANES fallback used"}
            </span>
          </div>

          {lastResult.signal_source === "fallback" && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              Signal quality was too low (SQI: {lastResult.diagnostics.signal_quality.toFixed(3)}) —
              BP relies partly on NHANES population averages for your age/sex.
              Try better lighting and hold still for more accurate camera-based readings.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {lastResult.blood_pressure ? (
              <div className="bg-surface-2 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Gauge className="w-4 h-4 text-blue-500" />
                  <span className="text-xs font-semibold text-muted uppercase tracking-wider">Blood Pressure</span>
                </div>
                <p className="text-3xl font-bold tabular-nums text-text">
                  {lastResult.blood_pressure.systolic.value.toFixed(0)}
                  <span className="text-subtle mx-1">/</span>
                  {lastResult.blood_pressure.diastolic.value.toFixed(0)}
                  <span className="text-base font-normal text-muted ml-1">mmHg</span>
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">{lastResult.classification.bp}</span>
                </div>
                <p className="text-xs text-subtle mt-1.5">
                  90% CI: {lastResult.blood_pressure.systolic.lower.toFixed(0)}-{lastResult.blood_pressure.systolic.upper.toFixed(0)} / {lastResult.blood_pressure.diastolic.lower.toFixed(0)}-{lastResult.blood_pressure.diastolic.upper.toFixed(0)}
                </p>
              </div>
            ) : (
              <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
                <p className="text-sm font-medium text-amber-800">BP unavailable</p>
                <p className="text-xs text-amber-600 mt-1">{lastResult.diagnostics.bp_error}</p>
              </div>
            )}

            <div className="bg-surface-2 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Heart className="w-4 h-4 text-red-500" />
                <span className="text-xs font-semibold text-muted uppercase tracking-wider">Heart Rate</span>
              </div>
              <p className="text-3xl font-bold tabular-nums text-text">
                {lastResult.heart_rate.value.toFixed(0)}
                <span className="text-base font-normal text-muted ml-1">bpm</span>
              </p>
              <span className="inline-block mt-2 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">{lastResult.classification.hr}</span>
            </div>
          </div>

          {(lastResult.hrv.sdnn || lastResult.hrv.rmssd) && (
            <div className="bg-surface-2 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-semibold text-muted uppercase tracking-wider">HRV Metrics</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                {lastResult.hrv.sdnn != null && <p><span className="text-muted">SDNN:</span> <span className="font-medium">{lastResult.hrv.sdnn} ms</span></p>}
                {lastResult.hrv.rmssd != null && <p><span className="text-muted">RMSSD:</span> <span className="font-medium">{lastResult.hrv.rmssd} ms</span></p>}
                {lastResult.hrv.pnn50 != null && <p><span className="text-muted">pNN50:</span> <span className="font-medium">{lastResult.hrv.pnn50}%</span></p>}
                {lastResult.hrv.lf_hf != null && <p><span className="text-muted">LF/HF:</span> <span className="font-medium">{lastResult.hrv.lf_hf}</span></p>}
              </div>
            </div>
          )}

          {lastResult.hrv.breathing_rate != null && (
            <div className="bg-surface-2 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Wind className="w-4 h-4 text-cyan-500" />
                <span className="text-xs font-semibold text-muted uppercase tracking-wider">Respiratory Rate</span>
              </div>
              <p className="text-2xl font-bold tabular-nums text-text">{lastResult.hrv.breathing_rate} <span className="text-base font-normal text-muted">breaths/min</span></p>
            </div>
          )}

          {/* Ensemble + Model Details */}
          <div className="bg-surface-2 rounded-xl p-4 text-sm space-y-2">
            <p><span className="font-medium text-muted">Pipeline:</span> {lastResult.diagnostics.model}</p>
            <p><span className="font-medium text-muted">Confidence:</span> {lastResult.confidence.toFixed(2)}</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted">
              <p>Frames: {lastResult.diagnostics.frames_processed}</p>
              <p>Duration: {lastResult.diagnostics.duration_sec}s</p>
              <p>SQI: {lastResult.diagnostics.signal_quality.toFixed(3)}</p>
              <p>Latency: {lastResult.diagnostics.latency_ms}ms</p>
            </div>
            {lastResult.diagnostics.ensemble && (
              <div className="mt-2 pt-2 border-t border-border">
                <p className="text-xs font-medium text-muted mb-1">Ensemble Models:</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(lastResult.diagnostics.ensemble).map(([name, data]) => (
                    <span key={name} className={`px-2 py-0.5 rounded-full text-[10px] font-mono border ${
                      name === lastResult.diagnostics.best_model
                        ? "bg-violet-50 text-violet-700 border-violet-200"
                        : "bg-slate-100 text-muted border-border"
                    }`}>
                      {name.replace(".rlap", "")} HR:{data.hr.toFixed(0)} SQI:{data.sqi.toFixed(2)}
                      {name === lastResult.diagnostics.best_model && " *"}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {lastResult.diagnostics.bp_model_info && (
              <div className="mt-2 pt-2 border-t border-border text-xs text-muted">
                <p>BP Windows: {lastResult.diagnostics.bp_model_info.windows_evaluated} | Avg quality: {lastResult.diagnostics.bp_model_info.mean_window_quality.toFixed(3)}</p>
                <p>Raw model: {lastResult.diagnostics.bp_model_info.raw_sbp}/{lastResult.diagnostics.bp_model_info.raw_dbp} | NHANES prior: {lastResult.diagnostics.bp_model_info.nhanes_sbp}/{lastResult.diagnostics.bp_model_info.nhanes_dbp} | Blend: {(lastResult.diagnostics.bp_model_info.blend * 100).toFixed(0)}% signal</p>
              </div>
            )}
          </div>

          <details className="group">
            <summary className="cursor-pointer text-xs text-subtle hover:text-muted transition-colors">Raw JSON response</summary>
            <pre className="mt-2 bg-slate-900 text-slate-200 rounded-xl p-4 text-xs overflow-x-auto max-h-64">
              {JSON.stringify(lastResult, null, 2)}
            </pre>
          </details>
        </div>
      )}

      {/* Scanner Modal */}
      {showScanner && (
        <VitalsScanModal
          demographics={demographics}
          onComplete={handleComplete}
          onCancel={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
