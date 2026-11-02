"use client";

import { useEffect, useRef, useState } from "react";
import { X, Sun } from "lucide-react";
import type { VitalsDemographics, ScanState } from "@/types/vitals";
import type { LabVitalsResult } from "@/lib/vitalsLabApi";
import { useFaceLandmarker } from "./useFaceLandmarker";
import { useVitalsCapture } from "./useVitalsCapture";
import { CameraView } from "./CameraView";
import { predictVitalsLab } from "@/lib/vitalsLabApi";

interface Props {
  demographics: VitalsDemographics;
  onComplete:   (result: LabVitalsResult) => void;
  onCancel:     () => void;
}

const SCAN_DURATION = 45;
const LIGHT_WARMUP_MS = 3000;

type LabPhase = ScanState | "brightness";

export function VitalsScanModal({ demographics, onComplete, onCancel }: Props) {
  const [phase, setPhase]               = useState<LabPhase>("intro");
  const [streamError, setStreamError]   = useState<string | null>(null);
  const [predictError, setPredictError] = useState<string | null>(null);
  const [result, setResult]             = useState<LabVitalsResult | null>(null);
  const [warmupCount, setWarmupCount]   = useState(3);

  const videoRef  = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const { landmarker, isLoading: lmLoading, error: lmError } = useFaceLandmarker();
  const capture = useVitalsCapture(videoRef, landmarker);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const startBrightnessPhase = async () => {
    setStreamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      setPhase("brightness");
      setWarmupCount(3);
    } catch (e) {
      setStreamError(e instanceof Error ? e.message : "Could not access camera");
      setPhase("error");
    }
  };

  // Brightness warmup countdown → then transition to positioning
  useEffect(() => {
    if (phase !== "brightness") return;
    if (warmupCount <= 0) {
      setPhase("positioning");
      return;
    }
    const t = setTimeout(() => setWarmupCount(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, warmupCount]);

  // Attach stream when positioning starts
  useEffect(() => {
    if (phase !== "positioning") return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    video.play().catch(() => { video.muted = true; video.play().catch(() => {}); });
    const t = setTimeout(() => capture.start(), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    return () => { capture.cancel(); stopStream(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (capture.state === "scanning") setPhase("scanning");

    if (capture.state === "complete" && capture.faceCrops) {
      setPhase("processing");
      stopStream();
      predictVitalsLab(capture.faceCrops, capture.framesProcessed, 72, demographics, capture.actualFps)
        .then(r => { setResult(r); setPhase("done"); })
        .catch(e => {
          setPredictError(e instanceof Error ? e.message : String(e));
          setPhase("error");
        });
    }

    if (capture.state === "error") {
      setStreamError(capture.errorMessage);
      stopStream();
      setPhase("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capture.state]);

  const handleClose  = () => { capture.cancel(); stopStream(); onCancel(); };
  const handleRescan = () => { setResult(null); setStreamError(null); setPredictError(null); setPhase("intro"); };
  const handleAccept = () => { if (result) onComplete(result); stopStream(); };

  const isScanning = phase === "positioning" || phase === "scanning" || phase === "brightness";

  return (
    <div
      role="dialog" aria-modal="true"
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in transition-colors duration-500 ${
        isScanning ? "bg-surface" : "bg-black/60 backdrop-blur-sm"
      }`}
      onClick={handleClose}
    >
      <div
        className={`rounded-3xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto animate-fade-in-up opacity-0 transition-colors duration-500 ${
          isScanning ? "bg-surface border-2 border-border" : "bg-surface"
        }`}
        style={{ animationFillMode: "forwards" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <div>
            <h2 className="text-lg font-bold text-text">Vitals Lab</h2>
            <p className="text-xs text-muted mt-0.5">Ensemble DL model — 45-second scan (720p)</p>
          </div>
          <button onClick={handleClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors" aria-label="Close">
            <X className="w-4 h-4 text-muted" />
          </button>
        </div>

        <div className="p-6">

          {/* INTRO */}
          {phase === "intro" && (
            <div className="space-y-4 animate-fade-in">
              <div className="rounded-lg bg-violet-50 border border-violet-200 p-3 text-sm text-violet-800">
                Using <span className="font-semibold">3-model ensemble</span> (FacePhys + PhysNet + EfficientPhys) with MIMIC-III ResNet for BP.
              </div>

              {/* Brightness prompt */}
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Sun className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-amber-900">Increase your screen brightness to maximum</p>
                    <p className="text-xs text-amber-700 mt-1">
                      During the scan, the screen turns bright white to illuminate your face evenly.
                      Higher brightness = better signal quality = more accurate readings.
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-text text-sm font-medium">Before scanning:</p>
              <ul className="list-disc list-inside space-y-1.5 text-sm text-muted">
                <li>Set screen brightness to 100%</li>
                <li>Remove glasses if they cause glare</li>
                <li>Keep still and look directly at the camera</li>
                <li>The scan takes 45 seconds</li>
              </ul>
              <button
                onClick={startBrightnessPhase}
                disabled={lmLoading || !!lmError}
                className="w-full bg-violet-600 hover:bg-violet-700 disabled:bg-slate-200 disabled:text-subtle text-white font-semibold rounded-xl py-3 transition-all duration-150 active:scale-95"
              >
                {lmLoading ? "Loading face model..." : lmError ? "Face model unavailable" : "Start scan"}
              </button>
              {lmError && <p className="text-xs text-red-600 text-center">{lmError}</p>}
            </div>
          )}

          {/* BRIGHTNESS WARMUP — white screen illumination phase */}
          {phase === "brightness" && (
            <div className="py-16 text-center animate-fade-in">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-100 flex items-center justify-center mb-6">
                <Sun className="w-8 h-8 text-amber-500 animate-pulse" />
              </div>
              <p className="text-lg font-semibold text-text">Preparing lighting...</p>
              <p className="text-sm text-muted mt-2">
                Your screen is illuminating your face for better signal quality
              </p>
              <p className="text-4xl font-bold text-violet-600 mt-6 tabular-nums">{warmupCount}</p>
              <p className="text-xs text-subtle mt-2">Scan starts automatically</p>
            </div>
          )}

          {/* CAMERA VIEW — positioning & scanning */}
          {(phase === "positioning" || phase === "scanning") && (
            <CameraView
              videoRef={videoRef}
              faceQuality={capture.faceQuality}
              state={phase as "positioning" | "scanning"}
              countdown={capture.countdown}
              framesProcessed={capture.framesProcessed}
              scanDurationSec={SCAN_DURATION}
            />
          )}

          {/* PROCESSING */}
          {phase === "processing" && (
            <div className="py-14 text-center">
              <div className="inline-block w-10 h-10 rounded-full border-4 border-violet-600 border-t-transparent animate-spin" />
              <p className="mt-5 text-text font-medium">Running 3-model ensemble...</p>
              <p className="text-xs text-subtle mt-1">FacePhys + PhysNet + EfficientPhys + ResNet BP</p>
            </div>
          )}

          {/* RESULTS */}
          {phase === "done" && result && (
            <LabResults result={result} onAccept={handleAccept} onRescan={handleRescan} />
          )}

          {/* ERROR */}
          {phase === "error" && (
            <div className="space-y-4 animate-fade-in">
              <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-red-800 text-sm space-y-2">
                <p className="font-bold">Error</p>
                <p className="break-all">{streamError ?? predictError ?? "Something went wrong."}</p>
              </div>
              <div className="flex gap-3">
                <button onClick={handleRescan} className="flex-1 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl py-2.5 transition-colors active:scale-95">Try again</button>
                <button onClick={handleClose} className="px-5 border border-border hover:bg-surface-2 rounded-xl py-2.5 text-muted font-medium">Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LabResults({ result, onAccept, onRescan }: { result: LabVitalsResult; onAccept: () => void; onRescan: () => void }) {
  const bp = result.blood_pressure;
  const hr = result.heart_rate;
  const d = result.diagnostics;
  const hrv = result.hrv;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="bg-surface-2 rounded-2xl p-5">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Heart Rate</p>
        <div className="flex items-end gap-3">
          <span className="text-4xl font-bold tabular-nums text-text">{hr.value.toFixed(0)}</span>
          <span className="text-muted mb-1">{hr.unit}</span>
          <span className="ml-auto mb-1 inline-block px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">{result.classification.hr}</span>
        </div>
      </div>

      {bp ? (
        <div className="bg-surface-2 rounded-2xl p-5">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Blood Pressure</p>
          <div className="flex items-end gap-3">
            <span className="text-4xl font-bold tabular-nums text-text">
              {bp.systolic.value.toFixed(0)}<span className="text-subtle mx-1">/</span>{bp.diastolic.value.toFixed(0)}
            </span>
            <span className="text-muted mb-1">{bp.unit}</span>
            <span className="ml-auto mb-1 inline-block px-3 py-1 rounded-full text-xs font-semibold bg-brand-500/10 text-brand-700 dark:text-brand-300 border border-brand-500/25">{result.classification.bp}</span>
          </div>
          <p className="text-xs text-subtle mt-2">
            90% CI: {bp.systolic.lower.toFixed(0)}-{bp.systolic.upper.toFixed(0)} / {bp.diastolic.lower.toFixed(0)}-{bp.diastolic.upper.toFixed(0)} mmHg
          </p>
        </div>
      ) : (
        <div className="bg-amber-50 rounded-xl p-3 text-sm text-amber-800 border border-amber-200">
          BP prediction unavailable: {d.bp_error ?? "Unknown error"}
        </div>
      )}

      {(hrv.sdnn || hrv.rmssd) && (
        <div className="bg-surface-2 rounded-2xl p-5">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">HRV Metrics</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {hrv.sdnn != null && <p><span className="text-muted">SDNN:</span> <span className="font-medium">{hrv.sdnn} ms</span></p>}
            {hrv.rmssd != null && <p><span className="text-muted">RMSSD:</span> <span className="font-medium">{hrv.rmssd} ms</span></p>}
            {hrv.pnn50 != null && <p><span className="text-muted">pNN50:</span> <span className="font-medium">{hrv.pnn50}%</span></p>}
            {hrv.lf_hf != null && <p><span className="text-muted">LF/HF:</span> <span className="font-medium">{hrv.lf_hf}</span></p>}
            {hrv.breathing_rate != null && <p><span className="text-muted">Breathing:</span> <span className="font-medium">{hrv.breathing_rate}/min</span></p>}
          </div>
        </div>
      )}

      <div className="bg-surface-2 rounded-xl p-4 text-xs text-muted space-y-1">
        <p className="font-semibold text-muted text-sm mb-2">Diagnostics</p>
        <p>Model: {d.model} ({d.engine})</p>
        <p>Frames: {d.frames_processed} | Duration: {d.duration_sec}s</p>
        <p>Signal quality (SQI): {d.signal_quality.toFixed(3)}</p>
        <p>Confidence: {result.confidence.toFixed(2)}</p>
        <p>Latency: {d.latency_ms}ms</p>
      </div>

      <div className="flex gap-3 pt-1">
        <button onClick={onAccept} className="flex-1 bg-violet-600 hover:bg-violet-700 active:scale-95 text-white font-semibold rounded-xl py-3 transition-all duration-150">Done</button>
        <button onClick={onRescan} className="px-5 border border-border hover:bg-surface-2 rounded-xl py-3 text-muted font-medium transition-colors">Rescan</button>
      </div>
    </div>
  );
}
