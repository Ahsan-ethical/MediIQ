"""
Phase 4 — Public inference API for PPG-based BP prediction.

Lazy-loads all 6 trained XGBoost quantile models on the first call and
caches them as module-level globals so subsequent calls have zero I/O cost.

Typical usage:
    from predict import predict_bp
    result = predict_bp(features, age=45, sex='F', height=162, weight=65)

The `features` dict is the raw output of feature_extraction.extract_features().
Demographics (age, sex, height, weight) are passed as separate keyword args
so the caller does not need to know the internal feature column order.
"""

from __future__ import annotations

import sys
import numpy as np
import joblib
from pathlib import Path
from typing import Optional

# Sibling import — works whether run as a script or imported as a module
sys.path.insert(0, str(Path(__file__).parent))
from classifier import classify_bp, classify_hr

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
_ML_ROOT   = Path(__file__).resolve().parent.parent
_MODEL_DIR = _ML_ROOT / "models"

_MODEL_KEYS = [
    "sbp_q05", "sbp_q50", "sbp_q95",
    "dbp_q05", "dbp_q50", "dbp_q95",
]

# ---------------------------------------------------------------------------
# Module-level cache (populated on first call to predict_bp)
# ---------------------------------------------------------------------------
_MODELS:       dict | None = None
_FEATURE_COLS: list | None = None


def _ensure_loaded() -> None:
    """Lazy-load models and feature column list into module globals."""
    global _MODELS, _FEATURE_COLS

    if _MODELS is not None:
        return  # already loaded

    missing = [k for k in _MODEL_KEYS if not (_MODEL_DIR / f"{k}.pkl").exists()]
    if missing:
        raise FileNotFoundError(
            f"Missing model files: {missing}\n"
            f"  Expected in: {_MODEL_DIR}\n"
            f"  Run src/train.py first."
        )

    feat_path = _MODEL_DIR / "feature_columns.pkl"
    if not feat_path.exists():
        raise FileNotFoundError(
            f"feature_columns.pkl not found in {_MODEL_DIR}. "
            "Run src/train.py first."
        )

    _MODELS = {k: joblib.load(_MODEL_DIR / f"{k}.pkl") for k in _MODEL_KEYS}
    _FEATURE_COLS = joblib.load(feat_path)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _extract_hr(features: dict) -> float:
    """Return the best available HR estimate; prefer hr_final > hr_peaks > hr_fft."""
    for key in ("hr_final", "hr_peaks", "hr_fft"):
        val = features.get(key, np.nan)
        if val is not None and not np.isnan(float(val)):
            return float(val)
    return float("nan")


def _build_feature_vector(
    features: dict,
    age: int,
    sex_bin: int,
    height: Optional[float],
    weight: Optional[float],
    bmi: float,
) -> np.ndarray:
    """
    Assemble a 1-row numpy array in the exact order defined by feature_columns.pkl.

    Any column missing from the combined dict is filled with np.nan —
    XGBoost handles NaN natively via its split-finding algorithm.
    """
    combined = {
        "age":    float(age),
        "sex":    float(sex_bin),
        "height": float(height) if height is not None else np.nan,
        "weight": float(weight) if weight is not None else np.nan,
        "bmi":    float(bmi),
        **{k: float(v) if v is not None else np.nan for k, v in features.items()},
    }
    row = [combined.get(col, np.nan) for col in _FEATURE_COLS]
    return np.array([row], dtype=np.float64)


def _demographic_prior(
    age: int,
    sex: str,
    height: Optional[float],
    weight: Optional[float],
) -> tuple[float, float]:
    """
    Compute epidemiological baseline SBP / DBP from demographic factors.

    Derived from NHANES population mean regression (age, sex, BMI).

    Returns:
        (sbp_prior, dbp_prior) in mmHg.
    """
    if sex.upper() in ("M", "MALE"):
        sbp_prior = 115.0 + max(0, age - 30) * 0.4
        dbp_prior =  75.0 + max(0, age - 30) * 0.2
    else:
        sbp_prior = 110.0 + max(0, age - 30) * 0.5
        dbp_prior =  72.0 + max(0, age - 30) * 0.25

    if height and weight:
        bmi = weight / (height / 100.0) ** 2
        if bmi > 25:
            sbp_prior += (bmi - 25) * 0.8
            dbp_prior += (bmi - 25) * 0.4

    return sbp_prior, dbp_prior


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def predict_bp(
    features: dict,
    age: int,
    sex: str,
    height: Optional[float] = None,
    weight: Optional[float] = None,
    signal_quality: float = 1.0,
) -> dict:
    """
    Predict systolic and diastolic blood pressure from PPG features.

    Args:
        features:       Dict returned by feature_extraction.extract_features().
                        Must contain the 15 standard PPG feature keys.
        age:            Subject age in years.
        sex:            'M' / 'MALE' or 'F' / 'FEMALE' (case-insensitive).
        height:         Height in cm (optional but improves accuracy via BMI).
        weight:         Weight in kg (optional).
        signal_quality: rPPG SNR score in [0, 1]. Used to blend ML prediction
                        with the demographic prior. Higher = trust the signal more.
                        Defaults to 1.0 (full trust in signal, no prior blend).

    Returns:
        {
            "heart_rate": {"value": float, "unit": "bpm"},
            "blood_pressure": {
                "systolic":  {"value": float, "lower": float, "upper": float},
                "diastolic": {"value": float, "lower": float, "upper": float},
                "unit": "mmHg"
            },
            "classification": {"bp": str, "hr": str},
            "confidence": float   # 0–1
        }
    """
    _ensure_loaded()

    # --- Encode sex ---
    sex_bin = 1 if sex.upper() in ("M", "MALE") else 0

    # --- BMI ---
    bmi = float("nan")
    if height and weight:
        bmi = weight / (height / 100.0) ** 2

    # --- Build feature vector ---
    X = _build_feature_vector(features, age, sex_bin, height, weight, bmi)

    # --- Raw quantile predictions from all 6 models ---
    sbp_q05_pred = float(_MODELS["sbp_q05"].predict(X)[0])
    sbp_q50_pred = float(_MODELS["sbp_q50"].predict(X)[0])
    sbp_q95_pred = float(_MODELS["sbp_q95"].predict(X)[0])
    dbp_q05_pred = float(_MODELS["dbp_q05"].predict(X)[0])
    dbp_q50_pred = float(_MODELS["dbp_q50"].predict(X)[0])
    dbp_q95_pred = float(_MODELS["dbp_q95"].predict(X)[0])

    # --- Demographic prior ---
    sbp_prior, dbp_prior = _demographic_prior(age, sex, height, weight)

    # --- Quality-weighted blend (applied to all three quantiles) ---
    blend = min(0.85, max(0.0, float(signal_quality)))

    sbp_final = blend * sbp_q50_pred + (1.0 - blend) * sbp_prior
    sbp_lower = blend * sbp_q05_pred + (1.0 - blend) * sbp_prior
    sbp_upper = blend * sbp_q95_pred + (1.0 - blend) * sbp_prior

    dbp_final = blend * dbp_q50_pred + (1.0 - blend) * dbp_prior
    dbp_lower = blend * dbp_q05_pred + (1.0 - blend) * dbp_prior
    dbp_upper = blend * dbp_q95_pred + (1.0 - blend) * dbp_prior

    # --- Heart rate (best available) ---
    hr = _extract_hr(features)

    # --- Confidence ---
    confidence = min(1.0, float(signal_quality) * 1.1)

    return {
        "heart_rate": {
            "value": round(hr, 1),
            "unit":  "bpm",
        },
        "blood_pressure": {
            "systolic": {
                "value": round(sbp_final, 1),
                "lower": round(sbp_lower, 1),
                "upper": round(sbp_upper, 1),
            },
            "diastolic": {
                "value": round(dbp_final, 1),
                "lower": round(dbp_lower, 1),
                "upper": round(dbp_upper, 1),
            },
            "unit": "mmHg",
        },
        "classification": {
            "bp": classify_bp(sbp_final, dbp_final),
            "hr": classify_hr(hr) if not np.isnan(hr) else "Unknown",
        },
        "confidence": round(confidence, 2),
    }
