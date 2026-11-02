"use client";

import { useEffect, useRef, useState } from "react";
import { X, Sun } from "lucide-react";
import type { VitalsDemographics, VitalsResult, ScanState } from "@/types/vitals";
import { useFaceLandmarker } from "./useFaceLandmarker";
import { useVitalsCapture } from "./useVitalsCapture";
import { CameraView } from "./CameraView";
import { VitalsResults } from "./VitalsResults";
import { predictVitalsDL } from "@/lib/vitalsApi";

interface Props {
  demographics: VitalsDemographics;
  onComplete:   (vitals: VitalsResult) => void;
  onCancel:     () => void;
}

const SCAN_DURATION = 45;

export function VitalsScanModal({ demographics, onComplete, onCancel }: Props) {
  const [phase, setPhase]               = useState<ScanState>("intro");
  const [streamError, setStreamError]   = useState<string | null>(null);
  const [predictError, setPredictError] = useState<string | null>(null);
  const [result, setResult]             = useState<VitalsResult | null>(null);
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

  useEffect(() => {
    if (phase !== "brightness") return;
    if (warmupCount <= 0) {
      setPhase("positioning");
      return;
    }
    const t = setTimeout(() => setWarmupCount(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, warmupCount]);

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

      predictVitalsDL(capture.faceCrops, capture.framesProcessed, 72, demographics, capture.actualFps)
        .then(r => { setResult(r); setPhase("done"); })
        .catch(e => {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[Vitals] FAILED:", msg);
          setPredictError(msg);
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
  const handleRescan = () => {
    setResult(null);
    setStreamError(null);
    setPredictError(null);
    setPhase("intro");
  };
  const handleAccept = () => {
    if (result) onComplete(result);
    stopStream();
  };

  const isScanning = phase === "positioning" || phase === "scanning" || phase === "brightness";

  return (
    <div
      role="dialog"
      aria-modal="true"
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
            <h2 className="text-lg font-bold text-text">Measure Vitals</h2>
            <p className="text-xs text-muted mt-0.5">45-second camera scan</p>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-muted" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">

          {/* Intro */}
          {phase === "intro" && (
            <div className="space-y-4 animate-fade-in">
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                    <Sun className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-amber-900">Set your screen brightness to maximum</p>
                    <p className="text-xs text-amber-700 mt-1">
                      The screen turns white during scanning to illuminate your face evenly.
                      Higher brightness = better accuracy.
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
              <p className="text-xs text-subtle italic leading-relaxed">
                This is a screening tool, not a medical measurement. Results are estimates
                to assist your doctor during the consultation.
              </p>
              <button
                onClick={startBrightnessPhase}
                disabled={lmLoading || !!lmError}
                className="w-full bg-brand-gradient hover:brightness-105 disabled:bg-slate-200 disabled:text-subtle text-white font-semibold rounded-xl py-3 transition-all duration-150 active:scale-95"
              >
                {lmLoading ? "Loading face model..." : lmError ? "Face model unavailable" : "Start scan"}
              </button>
              {lmError && (
                <p className="text-xs text-red-600 text-center">{lmError}</p>
              )}
            </div>
          )}

          {/* Brightness warmup */}
          {phase === "brightness" && (
            <div className="py-16 text-center animate-fade-in">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-100 flex items-center justify-center mb-6">
                <Sun className="w-8 h-8 text-amber-500 animate-pulse" />
              </div>
              <p className="text-lg font-semibold text-text">Preparing lighting...</p>
              <p className="text-sm text-muted mt-2">Illuminating your face for better signal quality</p>
              <p className="text-4xl font-bold text-brand-600 dark:text-brand-300 mt-6 tabular-nums">{warmupCount}</p>
              <p className="text-xs text-subtle mt-2">Scan starts automatically</p>
            </div>
          )}

          {/* Camera view */}
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

          {/* Processing */}
          {phase === "processing" && (
            <div className="py-14 text-center">
              <div className="inline-block w-10 h-10 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
              <p className="mt-5 text-text font-medium">Analysing your signal...</p>
              <p className="text-xs text-subtle mt-1">This usually takes a few seconds</p>
            </div>
          )}

          {/* Results */}
          {phase === "done" && result && (
            <VitalsResults
              result={result}
              onAccept={handleAccept}
              onRescan={handleRescan}
            />
          )}

          {/* Error */}
          {phase === "error" && (
            <div className="space-y-4 animate-fade-in">
              <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-red-800 text-sm space-y-2">
                <p className="font-bold">Error Details:</p>
                <p className="break-all">{streamError ?? predictError ?? "Something went wrong. Please try again."}</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleRescan}
                  className="flex-1 bg-brand-gradient hover:brightness-105 text-white font-semibold rounded-xl py-2.5 transition-colors active:scale-95"
                >
                  Try again
                </button>
                <button
                  onClick={handleClose}
                  className="px-5 border border-border hover:bg-surface-2 rounded-xl py-2.5 text-muted font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
