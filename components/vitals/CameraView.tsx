"use client";

import { useEffect, useMemo, useState } from "react";
import type { FaceQuality } from "@/types/vitals";

interface Props {
  videoRef:        React.RefObject<HTMLVideoElement | null>;
  faceQuality:     FaceQuality;
  state:           "positioning" | "scanning";
  countdown:       number;
  framesProcessed: number;
  scanDurationSec: number;
}

const COACHING: Record<string, string> = {
  none_pos:  "Align your face with the guide",
  poor_pos:  "Move closer — fill the face outline",
  good_pos:  "Perfect! Hold steady...",
  none_scan: "Face lost — look at the camera",
  poor_scan: "Hold still — stay centred",
  good_scan: "Measuring your pulse...",
};

const FACE_GUIDE = `
  M 50,8
  C 38,8 28,14 24,24
  C 20,34 19,44 21,54
  C 22,60 24,66 28,72
  C 32,78 38,84 42,88
  C 46,91 48,92 50,92
  C 52,92 54,91 58,88
  C 62,84 68,78 72,72
  C 76,66 78,60 79,54
  C 81,44 80,34 76,24
  C 72,14 62,8 50,8 Z
`;

export function CameraView({
  videoRef, faceQuality, state, countdown, framesProcessed, scanDurationSec,
}: Props) {
  const [coaching, setCoaching] = useState("Align your face with the guide");

  useEffect(() => {
    const key = `${faceQuality}_${state === "scanning" ? "scan" : "pos"}`;
    const t = setTimeout(() => setCoaching(COACHING[key] ?? ""), 400);
    return () => clearTimeout(t);
  }, [faceQuality, state]);

  const guideColor = useMemo(() => ({
    good: "#10b981",
    poor: "#f59e0b",
    none: "#94a3b8",
  }[faceQuality]), [faceQuality]);

  const glowColor = useMemo(() => ({
    good: "rgba(16,185,129,0.25)",
    poor: "rgba(245,158,11,0.15)",
    none: "rgba(148,163,184,0.1)",
  }[faceQuality]), [faceQuality]);

  const progress = state === "scanning"
    ? Math.min(1, (scanDurationSec - countdown) / scanDurationSec)
    : 0;

  const pathLen = 290;
  const dashOffset = pathLen * (1 - progress);

  return (
    <div className="relative w-full max-w-md mx-auto">
      <div className="relative aspect-[4/3] bg-slate-900 rounded-2xl overflow-hidden shadow-xl">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: "scaleX(-1)" }}
        />

        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none"
        >
          <defs>
            <mask id="vitals-face-mask">
              <rect width="100" height="100" fill="white" />
              <path d={FACE_GUIDE} fill="black" />
            </mask>
            <filter id="vitals-glow">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect
            width="100" height="100"
            fill="black" fillOpacity="0.5"
            mask="url(#vitals-face-mask)"
          />

          <path
            d={FACE_GUIDE}
            fill="none"
            stroke={glowColor}
            strokeWidth="3"
            filter="url(#vitals-glow)"
            style={{ transition: "stroke 300ms ease" }}
          />

          <path
            d={FACE_GUIDE}
            fill="none"
            stroke={guideColor}
            strokeWidth="0.6"
            strokeLinejoin="round"
            style={{ transition: "stroke 300ms ease" }}
          />

          {state === "positioning" && faceQuality === "none" && (
            <g opacity="0.3" stroke="#94a3b8" strokeWidth="0.3" fill="none">
              <line x1="34" y1="38" x2="44" y2="38" />
              <line x1="56" y1="38" x2="66" y2="38" />
              <line x1="50" y1="42" x2="50" y2="55" />
              <line x1="40" y1="65" x2="60" y2="65" />
            </g>
          )}

          {state === "scanning" && (
            <path
              d={FACE_GUIDE}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeDasharray={pathLen}
              strokeDashoffset={dashOffset}
              style={{ transition: "stroke-dashoffset 0.3s linear" }}
            />
          )}

          <g stroke={guideColor} strokeWidth="0.5" fill="none" opacity="0.6" style={{ transition: "stroke 300ms ease" }}>
            <polyline points="28,18 24,18 24,26" />
            <polyline points="72,18 76,18 76,26" />
            <polyline points="28,82 24,82 24,74" />
            <polyline points="72,82 76,82 76,74" />
          </g>
        </svg>

        {state === "scanning" && (
          <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm text-white rounded-full px-3.5 py-1.5 font-mono text-sm font-semibold border border-white/10">
            {countdown}s
          </div>
        )}

        {state === "scanning" && (
          <div className="absolute bottom-3 left-3 bg-black/55 backdrop-blur-sm text-white rounded-lg px-2.5 py-1 text-xs font-mono border border-white/10">
            {framesProcessed} frames
          </div>
        )}

        <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/55 backdrop-blur-sm rounded-full px-2.5 py-1 border border-white/10">
          <div
            className="w-2 h-2 rounded-full"
            style={{
              backgroundColor: guideColor,
              boxShadow: `0 0 6px ${guideColor}`,
              transition: "background-color 300ms ease, box-shadow 300ms ease",
            }}
          />
          <span className="text-[10px] font-medium text-white/80">
            {faceQuality === "good" ? "Locked" : faceQuality === "poor" ? "Adjusting" : "Searching"}
          </span>
        </div>
      </div>

      <p
        className="mt-4 text-center text-sm font-semibold min-h-[1.25rem] transition-colors duration-300"
        style={{ color: guideColor }}
        aria-live="polite"
      >
        {coaching}
      </p>

      <p className="mt-2 text-center text-xs text-muted">
        Video stays on your device. Only anonymised signal data is sent.
      </p>
    </div>
  );
}
