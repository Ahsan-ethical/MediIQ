"""
MediIQ Vitals API — exposes predict_bp() over HTTP.

Browser sends pre-extracted ROI RGB signals (3 floats × 3 ROIs × ~900 frames).
Backend runs POS + resample + feature extraction + XGBoost inference.
No video data ever transits this endpoint.
"""

import os
os.environ["KERAS_BACKEND"] = "jax"

import sys
import time
import logging
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

# Make ml/src/ importable regardless of working directory
_ML_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ML_ROOT / "src"))

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
os.environ.setdefault("GLOG_minloglevel", "3")

from predict import predict_bp, _ensure_loaded
from rppg_pipeline import rgb_signals_to_features

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("vitals_api")

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="MediIQ Vitals API",
    version="1.0.0",
    description=(
        "Browser-driven rPPG vitals prediction. "
        "Only anonymised RGB signal data is received — no video stored."
    ),
)

# CORS — allow dev localhost + any Vercel deployment + any ngrok tunnel.
# Override by setting ALLOWED_ORIGINS="url1,url2" in the environment.
# Use ALLOWED_ORIGINS="*" to allow every origin (useful behind ngrok).
_env_origins = os.environ.get("ALLOWED_ORIGINS", "")

if _env_origins.strip() == "*":
    _allow_origins = ["*"]
else:
    _defaults = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    _extra = [o.strip() for o in _env_origins.split(",") if o.strip()]
    _allow_origins = list(dict.fromkeys(_defaults + _extra))   # deduplicated

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_origin_regex=r"https://(.*\.vercel\.app|.*\.ngrok.*)",  # catch all Vercel + ngrok URLs
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------
SexLiteral = Literal["M", "F", "MALE", "FEMALE", "Male", "Female", "male", "female"]


class Demographics(BaseModel):
    age:    int           = Field(..., ge=1, le=120)
    sex:    SexLiteral
    height: float | None  = Field(None, ge=50, le=250)
    weight: float | None  = Field(None, ge=20, le=300)


class ROISignals(BaseModel):
    forehead:    list[list[float]]
    left_cheek:  list[list[float]]
    right_cheek: list[list[float]]

    @field_validator("forehead", "left_cheek", "right_cheek")
    @classmethod
    def _check_roi(cls, v: list[list[float]]) -> list[list[float]]:
        if len(v) < 60:
            raise ValueError(f"Need ≥ 60 frames per ROI, got {len(v)}")
        if len(v) > 1800:
            raise ValueError(f"Max 1800 frames per ROI, got {len(v)}")
        for i, row in enumerate(v):
            if len(row) != 3:
                raise ValueError(f"Frame {i} must be [R,G,B], got length {len(row)}")
            for c in row:
                if not (0.0 <= c <= 255.0):
                    raise ValueError(f"Frame {i} has out-of-range value {c}")
        return v


class VitalsRequest(BaseModel):
    rgb_signals:  ROISignals
    fps:          float        = Field(30.0, ge=10.0, le=60.0)
    demographics: Demographics

    @field_validator("rgb_signals")
    @classmethod
    def _equal_lengths(cls, v: ROISignals) -> ROISignals:
        n = len(v.forehead)
        lc, rc = len(v.left_cheek), len(v.right_cheek)
        if lc != n or rc != n:
            raise ValueError(
                f"All ROIs must have equal length. "
                f"forehead={n}, left_cheek={lc}, right_cheek={rc}"
            )
        return v


# ---------------------------------------------------------------------------
# Startup: warm up models so first request isn't slow
# ---------------------------------------------------------------------------
@app.on_event("startup")
def _startup() -> None:
    try:
        _ensure_loaded()
        log.info("XGBoost models loaded — service ready")
    except Exception as exc:
        log.error(f"Model load failed at startup: {exc}")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/api/v1/health")
def health() -> dict:
    """Health check — confirms models are loaded and service is ready."""
    from predict import _MODELS
    loaded = _MODELS is not None
    return {
        "status":        "ok" if loaded else "degraded",
        "models_loaded": loaded,
        "version":       "1.0.0",
    }


@app.post("/api/v1/vitals/predict-rgb")
def predict_rgb(req: VitalsRequest) -> dict:
    """
    Predict BP and HR from pre-extracted face ROI RGB signals.

    Accepts ~900 frames × 3 ROIs × 3 float values ≈ 30 KB JSON.
    Returns systolic/diastolic BP with 90% intervals, HR, AHA classification.
    """
    t0 = time.time()
    n_frames = len(req.rgb_signals.forehead)

    log.info(
        f"Request | frames={n_frames} fps={req.fps:.1f} "
        f"age={req.demographics.age} sex={req.demographics.sex[0].upper()}"
    )

    # 1. rPPG pipeline: POS → resample → features
    rgb_dict = {
        "forehead":    req.rgb_signals.forehead,
        "left_cheek":  req.rgb_signals.left_cheek,
        "right_cheek": req.rgb_signals.right_cheek,
    }

    try:
        pipeline = rgb_signals_to_features(rgb_dict, fps=req.fps)
    except Exception:
        log.exception("Pipeline crashed unexpectedly")
        raise HTTPException(status_code=500, detail="Vitals pipeline failed")

    if pipeline.get("error"):
        log.warning(f"Pipeline rejected: {pipeline['error']}")
        raise HTTPException(status_code=422, detail=pipeline["error"])

    # 2. BP / HR prediction
    try:
        result = predict_bp(
            features       = pipeline["features"],
            age            = req.demographics.age,
            sex            = req.demographics.sex,
            height         = req.demographics.height,
            weight         = req.demographics.weight,
            signal_quality = pipeline["signal_quality"],
        )
    except Exception:
        log.exception("predict_bp crashed")
        raise HTTPException(status_code=500, detail="Prediction model failed")

    elapsed_ms = int((time.time() - t0) * 1000)
    log.info(
        f"OK | sq={pipeline['signal_quality']} "
        f"bp={result['classification']['bp']} latency={elapsed_ms}ms"
    )

    result["diagnostics"] = {
        "frames_processed": pipeline["frames_processed"],
        "duration_sec":     pipeline["duration_sec"],
        "signal_quality":   pipeline["signal_quality"],
        "latency_ms":       elapsed_ms,
    }
    return result


# Generic handler — never leak Python tracebacks to the browser
# Lab router — experimental rPPG endpoint (isolated from production)
try:
    from lab_router import router as lab_router
    app.include_router(lab_router)
except ImportError:
    pass


@app.exception_handler(Exception)
async def _unhandled(_request: Request, exc: Exception) -> JSONResponse:
    log.exception("Unhandled exception")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )
