"""
Vitals Lab API — experimental rPPG endpoint using open-rppg deep learning models.

This is completely isolated from the production predict-rgb endpoint.
It receives pre-cropped face frames from the browser, runs the open-rppg
neural network for BVP extraction, then feeds features into the existing
XGBoost models for BP prediction.

Production endpoint: /api/v1/vitals/predict-rgb  (POS algorithm — UNTOUCHED)
Lab endpoint:        /api/v1/lab/predict-faces    (open-rppg DL model)
"""

import os
os.environ["KERAS_BACKEND"] = "jax"

import time
import gzip
import logging
import base64
from io import BytesIO
from typing import Literal

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

log = logging.getLogger("vitals_lab")

router = APIRouter(prefix="/api/v1/lab", tags=["vitals-lab"])

_ENSEMBLE_NAMES = ["FacePhys.rlap", "PhysNet.rlap", "EfficientPhys.rlap"]
_rppg_models: dict | None = None

def _get_rppg_models() -> dict:
    global _rppg_models
    if _rppg_models is None:
        import rppg
        _rppg_models = {}
        for name in _ENSEMBLE_NAMES:
            try:
                _rppg_models[name] = rppg.Model(name)
                log.info(f"open-rppg {name} loaded")
            except Exception as exc:
                log.warning(f"Failed to load {name}: {exc}")
        if not _rppg_models:
            raise RuntimeError("No open-rppg models could be loaded")
    return _rppg_models


SexLiteral = Literal["M", "F", "MALE", "FEMALE", "Male", "Female", "male", "female"]


class LabDemographics(BaseModel):
    age:    int          = Field(..., ge=1, le=120)
    sex:    SexLiteral
    height: float | None = Field(None, ge=50, le=250)
    weight: float | None = Field(None, ge=20, le=300)


class LabVitalsRequest(BaseModel):
    face_frames_b64: str = Field(..., description="Base64-encoded gzipped uint8 numpy array of face crops (N, H, H, 3)")
    n_frames:        int = Field(..., ge=60, le=2700)
    crop_size:       int = Field(72, ge=32, le=128)
    fps:             float = Field(30.0, ge=10.0, le=60.0)
    demographics:    LabDemographics


@router.get("/health")
def lab_health() -> dict:
    try:
        import rppg  # noqa: F401
        loaded = list(_rppg_models.keys()) if _rppg_models else []
        return {
            "status": "ok",
            "model": "Ensemble: " + ", ".join(_ENSEMBLE_NAMES),
            "engine": "open-rppg",
            "models_loaded": loaded,
        }
    except ImportError:
        return {"status": "error", "detail": "open-rppg not installed"}


@router.post("/predict-faces")
def predict_faces(req: LabVitalsRequest) -> dict:
    t0 = time.time()

    log.info(
        f"Lab request | frames={req.n_frames} fps={req.fps:.1f} "
        f"age={req.demographics.age} sex={req.demographics.sex[0].upper()}"
    )

    # 1. Decode face frames
    try:
        raw_bytes = base64.b64decode(req.face_frames_b64)
        decompressed = gzip.decompress(raw_bytes)
        cs = req.crop_size
        faces = np.frombuffer(decompressed, dtype=np.uint8).reshape(req.n_frames, cs, cs, 3)
    except Exception as exc:
        log.error(f"Frame decode failed: {exc}")
        raise HTTPException(status_code=422, detail=f"Failed to decode face frames: {exc}")

    log.info(f"Decoded face tensor: {faces.shape} {faces.dtype}")

    # 1b. Temporal frame averaging (pairs of consecutive frames) to reduce noise
    if faces.shape[0] >= 4:
        n_pairs = faces.shape[0] // 2
        faces_f32 = faces.astype(np.float32)
        averaged = ((faces_f32[0::2][:n_pairs] + faces_f32[1::2][:n_pairs]) / 2.0).astype(np.uint8)
        effective_fps = req.fps / 2.0
        log.info(f"Frame averaging: {faces.shape[0]} -> {averaged.shape[0]} frames, fps {req.fps:.1f} -> {effective_fps:.1f}")
        faces = averaged
    else:
        effective_fps = req.fps

    # 2. Run ensemble of open-rppg models
    try:
        models = _get_rppg_models()
    except Exception as exc:
        log.exception("open-rppg model loading failed")
        raise HTTPException(status_code=500, detail=f"rPPG model load failed: {exc}")

    bvp_list: list[np.ndarray] = []
    snr_list: list[float] = []
    ensemble_results: dict[str, dict] = {}

    for name, mdl in models.items():
        try:
            mdl.process_faces_tensor(faces.copy(), fps=effective_fps)
            bvp_i, _ = mdl.bvp()
            hr_i = mdl.hr(return_hrv=True)
            hr_val = hr_i.get("hr")
            sqi_val = hr_i.get("SQI")
            if hr_val is None or sqi_val is None or np.isnan(float(hr_val)):
                log.warning(f"  {name}: returned None/NaN — skipping")
                continue
            sqi_i = float(sqi_val)
            bvp_list.append(bvp_i)
            snr_list.append(max(sqi_i, 0.01))
            ensemble_results[name] = {"hr": round(float(hr_val), 1), "sqi": round(sqi_i, 3)}
            log.info(f"  {name}: HR={float(hr_val):.1f} SQI={sqi_i:.3f}")
        except Exception as exc:
            log.warning(f"  {name} failed: {exc}")

    if not bvp_list:
        raise HTTPException(status_code=500, detail="All ensemble models failed")

    # 3. SNR-weighted BVP average
    total_snr = sum(snr_list)
    weights_arr = [s / total_snr for s in snr_list]
    min_len = min(len(b) for b in bvp_list)
    bvp_signal = np.zeros(min_len)
    for w, bvp_i in zip(weights_arr, bvp_list):
        bvp_signal += w * bvp_i[:min_len]

    # Use the best model's HR/HRV as the primary HR source
    best_idx = int(np.argmax(snr_list))
    best_name = list(models.keys())[best_idx]
    best_model = list(models.values())[best_idx]
    try:
        hr_result = best_model.hr(return_hrv=True)
    except Exception:
        hr_result = {"hr": 0, "SQI": 0, "hrv": {}}

    sqi = float(np.mean(snr_list))
    hr_bpm = float(hr_result.get("hr", 0.0))
    hrv_data = hr_result.get("hrv", {})

    log.info(f"open-rppg output: HR={hr_bpm:.1f} SQI={sqi:.3f}")

    if sqi < 0.1:
        raise HTTPException(
            status_code=422,
            detail=f"Signal quality too low (SQI={sqi:.3f}). Try better lighting and hold still."
        )

    # 4. Run BVP through MIMIC-III pretrained ResNet for BP (lab-only model)
    bp_result = None
    bp_error = None
    try:
        from lab_bp_model import predict_bp_resnet

        bp_result = predict_bp_resnet(
            bvp_signal=bvp_signal,
            fs=effective_fps,
            age=req.demographics.age,
            sex=req.demographics.sex,
            height=req.demographics.height,
            weight=req.demographics.weight,
            signal_quality=min(1.0, sqi),
            detected_hr=hr_bpm if hr_bpm > 0 else None,
        )
    except Exception as exc:
        bp_error = str(exc)
        log.warning(f"ResNet BP prediction failed (non-fatal): {exc}")

    elapsed_ms = int((time.time() - t0) * 1000)

    hr_class = "Bradycardia" if hr_bpm < 60 else "Tachycardia" if hr_bpm > 100 else "Normal"

    result = {
        "heart_rate": {
            "value": round(hr_bpm, 1),
            "unit": "bpm",
        },
        "blood_pressure": bp_result.get("blood_pressure") if bp_result else None,
        "classification": {
            "bp": bp_result.get("classification", {}).get("bp", "N/A") if bp_result else "N/A",
            "hr": hr_class,
        },
        "confidence": round(min(1.0, sqi * 1.1), 2),
        "signal_source": bp_result.get("signal_source", "unknown") if bp_result else "fallback",
        "diagnostics": {
            "frames_processed": req.n_frames,
            "duration_sec": round(req.n_frames / req.fps, 1),
            "signal_quality": round(sqi, 3),
            "latency_ms": elapsed_ms,
            "model": f"Ensemble({len(bvp_list)}) + ResNet-MIMIC-III",
            "engine": "open-rppg + PyTorch",
            "bp_error": bp_error,
            "bp_model_info": bp_result.get("model_info") if bp_result else None,
            "ensemble": ensemble_results,
            "best_model": best_name,
        },
        "hrv": {
            "sdnn": round(float(hrv_data.get("sdnn", 0)), 2) if hrv_data.get("sdnn") else None,
            "rmssd": round(float(hrv_data.get("rmssd", 0)), 2) if hrv_data.get("rmssd") else None,
            "pnn50": round(float(hrv_data.get("pnn50", 0)), 2) if hrv_data.get("pnn50") else None,
            "lf_hf": round(float(hrv_data.get("LF/HF", 0)), 2) if hrv_data.get("LF/HF") else None,
            "breathing_rate": round(float(hrv_data.get("breathingrate", 0)), 1) if hrv_data.get("breathingrate") else None,
        },
    }

    log.info(f"Lab OK | HR={hr_bpm:.1f} SQI={sqi:.3f} latency={elapsed_ms}ms")
    return result
