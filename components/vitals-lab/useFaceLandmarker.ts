"use client";

import { useEffect, useState } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

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
    };
  }, []);

  return { landmarker, isLoading, error };
}
