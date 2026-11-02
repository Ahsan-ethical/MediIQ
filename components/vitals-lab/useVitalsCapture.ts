"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import type { FaceQuality } from "@/types/vitals";
import { assessFaceQuality } from "./roiExtraction";

const TARGET_FPS          = 30;
const SCAN_DURATION       = 45;               // 30→45s: more frames = better SNR
const FRAME_INTERVAL_MS   = 1000 / TARGET_FPS;
const STEADY_BEFORE_START = 3;
const FACE_LOSS_PAUSE_MS  = 2000;
const FACE_CROP_SIZE      = 72;               // 36→72: 4x more spatial detail

type CaptureState = "idle" | "positioning" | "scanning" | "complete" | "error";

interface UseVitalsCaptureReturn {
  state:            CaptureState;
  faceQuality:      FaceQuality;
  countdown:        number;
  framesProcessed:  number;
  framesRejected:   number;
  faceCrops:        Uint8Array | null;
  actualFps:        number;
  errorMessage:     string | null;
  start:            () => void;
  cancel:           () => void;
}

export function useVitalsCapture(
  videoRef:   RefObject<HTMLVideoElement | null>,
  landmarker: FaceLandmarker | null,
): UseVitalsCaptureReturn {
  const [state, setState]             = useState<CaptureState>("idle");
  const [faceQuality, setFQ]          = useState<FaceQuality>("none");
  const [countdown, setCountdown]     = useState(SCAN_DURATION);
  const [framesProcessed, setFP]      = useState(0);
  const [framesRejected, setFR]       = useState(0);
  const [faceCrops, setFaceCrops]     = useState<Uint8Array | null>(null);
  const [actualFps, setActualFps]     = useState(TARGET_FPS);
  const [errorMessage, setEM]         = useState<string | null>(null);

  const rafRef         = useRef<number | null>(null);
  const lastFrameMs    = useRef(0);
  const scanStartMs    = useRef(0);
  const goodSinceMs    = useRef<number | null>(null);
  const lastFaceMs     = useRef(performance.now());
  const stateRef       = useRef<CaptureState>("idle");
  const cropBufferRef  = useRef<Uint8Array[]>([]);
  const canvasRef      = useRef<HTMLCanvasElement | null>(null);
  const ctxRef         = useRef<CanvasRenderingContext2D | null>(null);
  const cropCanvasRef  = useRef<HTMLCanvasElement | null>(null);
  const cropCtxRef     = useRef<CanvasRenderingContext2D | null>(null);
  const landmarkerRef  = useRef<FaceLandmarker | null>(null);

  useEffect(() => { landmarkerRef.current = landmarker; }, [landmarker]);
  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    const c = document.createElement("canvas");
    c.width = 640; c.height = 480;
    canvasRef.current = c;
    ctxRef.current = c.getContext("2d", { willReadFrequently: true });

    const cc = document.createElement("canvas");
    cc.width = FACE_CROP_SIZE; cc.height = FACE_CROP_SIZE;
    cropCanvasRef.current = cc;
    cropCtxRef.current = cc.getContext("2d", { willReadFrequently: true });
  }, []);

  const reset = useCallback(() => {
    cropBufferRef.current = [];
    setFP(0); setFR(0);
    setCountdown(SCAN_DURATION);
    setFaceCrops(null);
    setEM(null);
    goodSinceMs.current = null;
  }, []);

  const cancel = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    reset();
    setState("idle");
    setFQ("none");
  }, [reset]);

  const tick = useCallback(() => {
    rafRef.current = requestAnimationFrame(tick);

    const videoEl = videoRef.current;
    if (!videoEl || !canvasRef.current || !ctxRef.current) return;
    if (videoEl.readyState < 2) return;

    const lm = landmarkerRef.current;
    if (!lm) return;

    const now = performance.now();
    if (now - lastFrameMs.current < FRAME_INTERVAL_MS) return;
    lastFrameMs.current = now;

    const c = canvasRef.current;
    const ctx = ctxRef.current;

    if (c.width !== videoEl.videoWidth || c.height !== videoEl.videoHeight) {
      c.width = videoEl.videoWidth || 640;
      c.height = videoEl.videoHeight || 480;
    }

    ctx.drawImage(videoEl, 0, 0, c.width, c.height);

    let landmarks: { x: number; y: number; z: number }[] | null = null;
    try {
      const res = lm.detectForVideo(c, now);
      landmarks = res?.faceLandmarks?.[0] ?? null;
    } catch { /* ignore */ }

    const quality = assessFaceQuality(landmarks, c.width, c.height);
    setFQ(quality);
    if (quality !== "none") lastFaceMs.current = now;

    // POSITIONING
    if (stateRef.current === "positioning") {
      if (quality === "good") {
        if (goodSinceMs.current === null) goodSinceMs.current = now;
        if (now - goodSinceMs.current >= STEADY_BEFORE_START * 1000) {
          scanStartMs.current = now;
          cropBufferRef.current = [];
          setFP(0); setFR(0); setCountdown(SCAN_DURATION);
          setState("scanning");
        }
      } else {
        goodSinceMs.current = null;
      }
      return;
    }

    // SCANNING
    if (stateRef.current !== "scanning") return;
    if (!landmarks || now - lastFaceMs.current > FACE_LOSS_PAUSE_MS) return;

    const crop = extractFaceCrop(ctx, c, landmarks);
    if (crop) {
      cropBufferRef.current.push(crop);
      setFP(cropBufferRef.current.length);
    } else {
      setFR(prev => prev + 1);
    }

    const elapsedSec = (now - scanStartMs.current) / 1000;
    setCountdown(Math.max(0, Math.ceil(SCAN_DURATION - elapsedSec)));

    if (elapsedSec >= SCAN_DURATION) {
      const n = cropBufferRef.current.length;
      const minNeeded = TARGET_FPS * 10;
      if (n < minNeeded) {
        setEM(`Only ${n} valid frames captured. Try again with steadier framing and better lighting.`);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        setState("error");
        return;
      }

      setActualFps(n / elapsedSec);

      const bytesPerFrame = FACE_CROP_SIZE * FACE_CROP_SIZE * 3;
      const combined = new Uint8Array(n * bytesPerFrame);
      for (let i = 0; i < n; i++) {
        combined.set(cropBufferRef.current[i], i * bytesPerFrame);
      }
      setFaceCrops(combined);

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      setState("complete");
    }
  }, [videoRef]);

  const start = useCallback(() => {
    if (!videoRef.current || !landmarkerRef.current) {
      setEM("Camera or face model not ready");
      setState("error");
      return;
    }
    reset();
    setState("positioning");
    lastFrameMs.current = 0;
    lastFaceMs.current = performance.now();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
  }, [videoRef, reset, tick]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  return {
    state, faceQuality, countdown, framesProcessed, framesRejected,
    faceCrops, actualFps, errorMessage, start, cancel,
  };
}

function extractFaceCrop(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  landmarks: { x: number; y: number; z: number }[],
): Uint8Array | null {
  if (landmarks.length < 468) return null;

  const W = canvas.width;
  const H = canvas.height;

  let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
  for (const lm of landmarks) {
    const px = lm.x * W;
    const py = lm.y * H;
    if (px < xMin) xMin = px;
    if (py < yMin) yMin = py;
    if (px > xMax) xMax = px;
    if (py > yMax) yMax = py;
  }

  const faceW = xMax - xMin;
  const faceH = yMax - yMin;
  const pad = 0.25;
  const sx = Math.max(0, Math.floor(xMin - faceW * pad));
  const sy = Math.max(0, Math.floor(yMin - faceH * pad));
  const sw = Math.min(W - sx, Math.ceil(faceW * (1 + 2 * pad)));
  const sh = Math.min(H - sy, Math.ceil(faceH * (1 + 2 * pad)));

  if (sw < 10 || sh < 10) return null;

  const offscreen = document.createElement("canvas");
  offscreen.width = FACE_CROP_SIZE;
  offscreen.height = FACE_CROP_SIZE;
  const octx = offscreen.getContext("2d");
  if (!octx) return null;

  octx.drawImage(canvas, sx, sy, sw, sh, 0, 0, FACE_CROP_SIZE, FACE_CROP_SIZE);
  const imgData = octx.getImageData(0, 0, FACE_CROP_SIZE, FACE_CROP_SIZE);

  const rgb = new Uint8Array(FACE_CROP_SIZE * FACE_CROP_SIZE * 3);
  for (let i = 0; i < FACE_CROP_SIZE * FACE_CROP_SIZE; i++) {
    rgb[i * 3]     = imgData.data[i * 4];
    rgb[i * 3 + 1] = imgData.data[i * 4 + 1];
    rgb[i * 3 + 2] = imgData.data[i * 4 + 2];
  }

  return rgb;
}
