"""
Lab-only BP prediction using a 1D ResNet pretrained on MIMIC-III.

Improvements over base:
  - Adaptive bandpass filter (narrowed to detected HR ± 0.5 Hz)
  - Confidence-weighted sliding windows (noisy windows count less)
  - NHANES population curves (real CDC data instead of linear formula)

This is COMPLETELY ISOLATED from the production XGBoost pipeline.
"""

from __future__ import annotations

import numpy as np
import torch
import torch.nn as nn
from pathlib import Path
from scipy.signal import butter, filtfilt, detrend, welch

_MODEL_PATH = Path(__file__).resolve().parent.parent / "models" / "lab" / "1d_resnet_bp.pth"

_WINDOW_LEN = 437
_STEP_SIZE  = 80


# ──────────────────────────────────────────────────────────────────────────────
# NHANES population BP curves (CDC NHANES 2017-2020, mean by age/sex)
# ──────────────────────────────────────────────────────────────────────────────

_NHANES_MALE = [
    (18, 117.5, 68.8),
    (25, 119.4, 70.1),
    (35, 121.8, 74.5),
    (45, 124.7, 77.2),
    (55, 129.3, 78.1),
    (65, 133.9, 74.8),
    (75, 137.2, 70.4),
    (85, 139.5, 67.8),
]

_NHANES_FEMALE = [
    (18, 110.8, 66.2),
    (25, 112.3, 67.8),
    (35, 114.9, 71.2),
    (45, 120.1, 74.1),
    (55, 127.8, 75.3),
    (65, 134.2, 72.1),
    (75, 139.1, 68.3),
    (85, 142.8, 65.7),
]


def _nhanes_prior(age: int, sex: str, height: float | None, weight: float | None) -> tuple[float, float]:
    table = _NHANES_MALE if sex.upper() in ("M", "MALE") else _NHANES_FEMALE
    clamped = max(table[0][0], min(table[-1][0], age))

    for i in range(len(table) - 1):
        a0, s0, d0 = table[i]
        a1, s1, d1 = table[i + 1]
        if a0 <= clamped <= a1:
            t = (clamped - a0) / (a1 - a0)
            sbp = s0 + t * (s1 - s0)
            dbp = d0 + t * (d1 - d0)
            break
    else:
        sbp, dbp = table[-1][1], table[-1][2]

    if height and weight:
        bmi = weight / (height / 100.0) ** 2
        if bmi > 25:
            sbp += (bmi - 25) * 0.7
            dbp += (bmi - 25) * 0.35
        elif bmi < 18.5:
            sbp -= (18.5 - bmi) * 0.5
            dbp -= (18.5 - bmi) * 0.3

    return sbp, dbp


# ──────────────────────────────────────────────────────────────────────────────
# 1D ResNet architecture (matches pretrained weights exactly)
# ──────────────────────────────────────────────────────────────────────────────

class _ResidualBlock1D(nn.Module):
    def __init__(self, in_ch, out_ch, stride=1, downsample=None):
        super().__init__()
        self.conv1 = nn.Conv1d(in_ch, out_ch, 3, stride=stride, padding=1)
        self.bn1 = nn.BatchNorm1d(out_ch)
        self.relu = nn.ReLU(inplace=True)
        self.conv2 = nn.Conv1d(out_ch, out_ch, 3, padding=1)
        self.bn2 = nn.BatchNorm1d(out_ch)
        self.downsample = downsample

    def forward(self, x):
        identity = x
        out = self.relu(self.bn1(self.conv1(x)))
        out = self.bn2(self.conv2(out))
        if self.downsample:
            identity = self.downsample(x)
        out += identity
        return self.relu(out)


class _ResNet1D(nn.Module):
    def __init__(self, in_channels=1, num_classes=2):
        super().__init__()
        self.layer0 = nn.Sequential(
            nn.Conv1d(in_channels, 64, 7, stride=2, padding=3),
            nn.BatchNorm1d(64), nn.ReLU(),
            nn.MaxPool1d(3, stride=2, padding=1),
        )
        self.layer1 = self._make_layer(64, 64, 3)
        self.layer2 = self._make_layer(64, 128, 3, stride=2)
        self.layer3 = self._make_layer(128, 256, 3, stride=2)
        self.layer4 = self._make_layer(256, 512, 3, stride=2)
        self.global_pool = nn.AdaptiveAvgPool1d(1)
        self.fc = nn.Linear(512, num_classes)

    def _make_layer(self, in_ch, out_ch, blocks, stride=1):
        ds = None
        if stride != 1 or in_ch != out_ch:
            ds = nn.Sequential(nn.Conv1d(in_ch, out_ch, 1, stride=stride), nn.BatchNorm1d(out_ch))
        layers = [_ResidualBlock1D(in_ch, out_ch, stride, ds)]
        for _ in range(1, blocks):
            layers.append(_ResidualBlock1D(out_ch, out_ch))
        return nn.Sequential(*layers)

    def forward(self, x):
        x = self.layer0(x)
        x = self.layer1(x)
        x = self.layer2(x)
        x = self.layer3(x)
        x = self.layer4(x)
        x = self.global_pool(x)
        x = torch.flatten(x, 1)
        return self.fc(x)


_model: _ResNet1D | None = None


def _ensure_loaded() -> _ResNet1D:
    global _model
    if _model is not None:
        return _model
    if not _MODEL_PATH.exists():
        raise FileNotFoundError(f"Lab BP model not found: {_MODEL_PATH}")
    _model = _ResNet1D(in_channels=1, num_classes=2)
    _model.load_state_dict(torch.load(_MODEL_PATH, map_location="cpu", weights_only=True))
    _model.eval()
    return _model


# ──────────────────────────────────────────────────────────────────────────────
# Adaptive bandpass filter
# ──────────────────────────────────────────────────────────────────────────────

def _adaptive_bandpass(sig: np.ndarray, fs: float, detected_hr: float | None) -> np.ndarray:
    if detected_hr and 40 < detected_hr < 200:
        hr_hz = detected_hr / 60.0
        low = max(0.5, hr_hz - 0.5)
        high = min(fs / 2.0 - 0.1, hr_hz + 0.5)
    else:
        low, high = 0.7, 3.0

    nyq = fs / 2.0
    lo = low / nyq
    hi = min(high / nyq, 0.99)
    if lo >= hi:
        lo, hi = 0.7 / nyq, min(3.0 / nyq, 0.99)
    b, a = butter(4, [lo, hi], btype="band")
    return filtfilt(b, a, sig)


# ──────────────────────────────────────────────────────────────────────────────
# Per-window signal quality scoring
# ──────────────────────────────────────────────────────────────────────────────

def _window_quality(window: np.ndarray, fs: float) -> float:
    if np.std(window) < 1e-8:
        return 0.0
    nperseg = min(len(window), 128)
    freqs, psd = welch(window, fs=fs, nperseg=nperseg)
    pulse = (freqs >= 0.7) & (freqs <= 3.0)
    total = psd.sum()
    if total < 1e-12:
        return 0.0
    return float(psd[pulse].sum() / total)


# ──────────────────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────────────────

def predict_bp_resnet(
    bvp_signal: np.ndarray,
    fs: float,
    age: int,
    sex: str,
    height: float | None = None,
    weight: float | None = None,
    signal_quality: float = 1.0,
    detected_hr: float | None = None,
) -> dict:
    model = _ensure_loaded()

    sig = detrend(bvp_signal)
    sig = _adaptive_bandpass(sig, fs, detected_hr)

    smin, smax = sig.min(), sig.max()
    if smax - smin > 1e-8:
        sig = (sig - smin) / (smax - smin)

    if len(sig) < _WINDOW_LEN:
        raise ValueError(f"Signal too short ({len(sig)} < {_WINDOW_LEN})")

    sbp_preds = []
    dbp_preds = []
    qualities = []

    for start in range(0, len(sig) - _WINDOW_LEN + 1, _STEP_SIZE):
        window = sig[start : start + _WINDOW_LEN]
        q = _window_quality(window, fs)
        tensor = torch.tensor(window, dtype=torch.float32).unsqueeze(0).unsqueeze(0)

        with torch.no_grad():
            pred = model(tensor)

        sbp_preds.append(float(pred[0, 0]))
        dbp_preds.append(float(pred[0, 1]))
        qualities.append(q)

    sbp_arr = np.array(sbp_preds)
    dbp_arr = np.array(dbp_preds)
    q_arr = np.array(qualities)

    q_sum = q_arr.sum()
    if q_sum > 1e-8:
        weights = q_arr / q_sum
        sbp_raw = float(np.dot(weights, sbp_arr))
        dbp_raw = float(np.dot(weights, dbp_arr))
    else:
        sbp_raw = float(np.median(sbp_arr))
        dbp_raw = float(np.median(dbp_arr))

    sbp_q05 = float(np.percentile(sbp_preds, 5))
    sbp_q95 = float(np.percentile(sbp_preds, 95))
    dbp_q05 = float(np.percentile(dbp_preds, 5))
    dbp_q95 = float(np.percentile(dbp_preds, 95))

    sbp_prior, dbp_prior = _nhanes_prior(age, sex, height, weight)

    blend = min(0.85, max(0.0, float(signal_quality)))
    used_fallback = blend < 0.5

    sbp_final = blend * sbp_raw + (1.0 - blend) * sbp_prior
    dbp_final = blend * dbp_raw + (1.0 - blend) * dbp_prior
    sbp_lower = blend * sbp_q05 + (1.0 - blend) * sbp_prior
    sbp_upper = blend * sbp_q95 + (1.0 - blend) * sbp_prior
    dbp_lower = blend * dbp_q05 + (1.0 - blend) * dbp_prior
    dbp_upper = blend * dbp_q95 + (1.0 - blend) * dbp_prior

    from classifier import classify_bp
    bp_class = classify_bp(sbp_final, dbp_final)

    return {
        "blood_pressure": {
            "systolic":  {"value": round(sbp_final, 1), "lower": round(sbp_lower, 1), "upper": round(sbp_upper, 1)},
            "diastolic": {"value": round(dbp_final, 1), "lower": round(dbp_lower, 1), "upper": round(dbp_upper, 1)},
            "unit": "mmHg",
        },
        "classification": {"bp": bp_class},
        "signal_source": "camera" if not used_fallback else "fallback",
        "model_info": {
            "name": "1D-ResNet (MIMIC-III)",
            "windows_evaluated": len(sbp_preds),
            "raw_sbp": round(sbp_raw, 1),
            "raw_dbp": round(dbp_raw, 1),
            "nhanes_sbp": round(sbp_prior, 1),
            "nhanes_dbp": round(dbp_prior, 1),
            "blend": round(blend, 2),
            "mean_window_quality": round(float(q_arr.mean()), 3) if len(q_arr) else 0,
            "adaptive_hr": round(detected_hr, 1) if detected_hr else None,
        },
    }
