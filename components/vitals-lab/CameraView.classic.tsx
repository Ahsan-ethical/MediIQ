"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  none_pos:  "Position your face inside the oval",
  poor_pos:  "Move closer and centre your face",
  good_pos:  "Hold steady — starting scan...",
  none_scan: "Look at the camera",
  poor_scan: "Hold still and stay centred",
  good_scan: "Hold still — measuring your pulse...",
};

export function CameraViewClassic({
  videoRef, faceQuality, state, countdown, framesProcessed, scanDurationSec,
}: Props) {
  const [coaching, setCoaching] = useState("Position your face inside the oval");

  useEffect(() => {
    const key = `${faceQuality}_${state === "scanning" ? "scan" : "pos"}`;
    const t = setTimeout(() => setCoaching(COACHING[key] ?? ""), 400);
    return () => clearTimeout(t);
  }, [faceQuality, state]);

  const ovalColor = useMemo(() => ({
    good: "#10b981",
    poor: "#f59e0b",
    none: "#ef4444",
  }[faceQuality]), [faceQuality]);

  const progress = state === "scanning"
    ? Math.min(1, (scanDurationSec - countdown) / scanDurationSec)
    : 0;

  const cx = 50, cy = 50, rx = 28, ry = 38;
  const circumference = 2 * Math.PI * Math.sqrt((rx * rx + ry * ry) / 2);
  const dashOffset    = circumference * (1 - progress);

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
            <mask id="vitals-lab-oval-mask-classic">
              <rect width="100" height="100" fill="white" />
              <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="black" />
            </mask>
          </defs>

          <rect
            width="100" height="100"
            fill="black" fillOpacity="0.48"
            mask="url(#vitals-lab-oval-mask-classic)"
          />

          <ellipse
            cx={cx} cy={cy} rx={rx} ry={ry}
            fill="none"
            stroke={ovalColor}
            strokeWidth="0.7"
            style={{ transition: "stroke 200ms ease" }}
          />

          {state === "scanning" && (
            <ellipse
              cx={cx} cy={cy} rx={rx} ry={ry}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform={`rotate(-90 ${cx} ${cy})`}
              style={{ transition: "stroke-dashoffset 0.25s linear" }}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {state === "scanning" && (
          <div className="absolute top-3 right-3 bg-black/60 text-white rounded-full px-3 py-1 font-mono text-sm font-semibold">
            {countdown}s
          </div>
        )}

        {state === "scanning" && (
          <div className="absolute bottom-3 left-3 bg-black/55 text-white rounded-lg px-2 py-1 text-xs font-mono">
            {framesProcessed} frames
          </div>
        )}
      </div>

      <p
        className="mt-4 text-center text-sm font-semibold min-h-[1.25rem] transition-colors duration-300"
        style={{ color: ovalColor }}
        aria-live="polite"
      >
        {coaching}
      </p>

      <p className="mt-2 text-center text-xs text-muted">
        Lab mode — Video stays on your device. Only anonymised signal data is sent.
      </p>
    </div>
  );
}
