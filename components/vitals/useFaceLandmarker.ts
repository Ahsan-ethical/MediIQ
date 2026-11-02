"use client";

import { useEffect, useState } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// MediaPipe WASM emits INFO-level messages to stderr during normal inference.
// Next.js dev mode captures all stderr as console.error, making them appear
// as errors. Filter them out here where MediaPipe is loaded.
if (typeof window !== "undefined") {
  const _origError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const msg = typeof args[0] === "string" ? args[0] : "";
    if (
      msg.includes("TensorFlow Lite") ||
      msg.includes("XNNPACK") ||
      msg.includes("Created TensorFlow")
    ) return;
    _origError(...args);
  };
}

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";

// ---------------------------------------------------------------------------
// Module-level singleton — created once per browser session.
// This survives React StrictMode double-mount/unmount, which would otherwise
// close and re-open the landmarker on every dev-mode render, triggering the
// "INFO: Created TensorFlow Lite XNNPACK delegate" log on each cleanup.
// ---------------------------------------------------------------------------
let _promise: Promise<FaceLandmarker> | null = null;

function getSharedLandmarker(): Promise<FaceLandmarker> {
  if (!_promise) {
    _promise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
      return FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: "GPU",
        },
        runningMode:                        "VIDEO",
        numFaces:                           1,
        outputFaceBlendshapes:              false,
        outputFacialTransformationMatrixes: false,
      });
    })().catch(err => {
      // Reset so the next mount can retry
      _promise = null;
      throw err;
    });
  }
  return _promise;
}

export function useFaceLandmarker() {
  const [landmarker, setLandmarker] = useState<FaceLandmarker | null>(null);
  const [isLoading, setIsLoading]   = useState(true);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    getSharedLandmarker()
      .then(lm => {
        if (mounted) {
          setLandmarker(lm);
          setIsLoading(false);
        }
      })
      .catch(e => {
        if (mounted) {
          setError(e instanceof Error ? e.message : "Failed to load face model");
          setIsLoading(false);
        }
      });

    return () => {
      mounted = false;
      // Intentionally NOT calling lm.close() here.
      // The singleton lives for the app session; closing it on every
      // component unmount (esp. in StrictMode) causes WASM log noise
      // and forces an expensive reload on the next open.
    };
  }, []);

  return { landmarker, isLoading, error };
}
