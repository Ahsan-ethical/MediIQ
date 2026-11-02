"""
Phase 5 — Full video-to-features pipeline.

Takes a webcam recording and returns a features dict compatible with predict_bp().

Pipeline:
    video file
      → cv2 frame extraction (downsampled to target_fs)
      → MediaPipe face detection + YCrCb skin ROI extraction (per frame)
      → linear interpolation of missing frames
      → POS algorithm on each ROI → 3 waveforms at ~30 Hz
      → SNR-weighted average → single rPPG waveform at ~30 Hz
      → scipy.signal.resample → 1000 Hz (matches training data)
      → feature_extraction.extract_features(signal, fs=1000)
      → return dict with features + diagnostics

The critical resampling step ensures the 30 fps camera signal matches the
1000 Hz assumption baked into the XGBoost models during Phase 3 training.
"""

from __future__ import annotations

import sys
import os
import numpy as np
import cv2
from pathlib import Path
from scipy.signal import resample

# Sibling imports
sys.path.insert(0, str(Path(__file__).parent))
from face_roi import init_face_mesh, extract_rois
from pos_algorithm import pos_algorithm, compute_snr
from feature_extraction import extract_features
from signal_processing import preprocess_ppg

# Suppress mediapipe / TF log spam
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
os.environ.setdefault("GLOG_minloglevel", "3")

# Quality thresholds
_MIN_SNR       = 0.30    # reject if best ROI SNR is below this
_MAX_MISS_FRAC = 0.30    # reject if >30% frames had no face
_TARGET_FS     = 30.0    # camera FPS we normalise to
_RESAMPLE_FS   = 1000.0  # Hz — must match feature_extraction training

ROI_NAMES = ["forehead", "left_cheek", "right_cheek"]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _read_frames(
    video_path: str,
    target_fs: float,
) -> tuple[list[np.ndarray], float]:
    """
    Read all frames from a video file, downsampling to target_fs if needed.

    Returns:
        (frames, effective_fps) where effective_fps = target_fs after down-
        sampling (or actual fps if already <= target_fs).
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise IOError(f"Cannot open video: {video_path}")

    actual_fps = cap.get(cv2.CAP_PROP_FPS) or target_fs
    step       = max(1, round(actual_fps / target_fs))   # subsample stride
    effective_fps = actual_fps / step

    frames = []
    idx    = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if idx % step == 0:
            frames.append(frame)
        idx += 1

    cap.release()
    return frames, effective_fps


def _interpolate_missing(signals: np.ndarray) -> np.ndarray:
    """
    Linearly interpolate NaN rows in an (N, 3) RGB signal array.

    Rows where all 3 channels are NaN represent frames with no face detected.
    Edge NaNs are filled by forward/backward fill rather than extrapolation.
    """
    out = signals.copy()
    for ch in range(3):
        col  = out[:, ch]
        nans = np.isnan(col)
        if not nans.any():
            continue
        idx_valid = np.where(~nans)[0]
        if len(idx_valid) == 0:
            out[:, ch] = 0.0
            continue
        # numpy interpolation handles edges via nearest valid value
        out[:, ch] = np.interp(
            np.arange(len(col)),
            idx_valid,
            col[idx_valid],
        )
    return out


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def video_to_features(
    video_path: str,
    target_fs: float = _TARGET_FS,
) -> dict:
    """
    Process a face video and return a features dict for predict_bp().

    Args:
        video_path: Path to .mp4 / .webm / .avi file.
        target_fs:  Frame rate to normalise the video to (default 30).

    Returns:
        {
            'features':          dict  — 15 PPG features (may be None on error),
            'signal_quality':    float — SNR in [0, 1],
            'frames_processed':  int,
            'frames_rejected':   int,
            'duration_sec':      float,
            'error':             str | None
        }
    """
    result_template = {
        "features":         None,
        "signal_quality":   0.0,
        "frames_processed": 0,
        "frames_rejected":  0,
        "duration_sec":     0.0,
        "error":            None,
    }

    # ------------------------------------------------------------------
    # 1. Load frames
    # ------------------------------------------------------------------
    try:
        frames, effective_fps = _read_frames(video_path, target_fs)
    except IOError as e:
        return {**result_template, "error": str(e)}

    n_frames = len(frames)
    if n_frames < 30:
        return {**result_template,
                "error": f"Video too short ({n_frames} frames). Need >= 30."}

    duration_sec = n_frames / effective_fps
    print(f"  Video: {n_frames} frames at {effective_fps:.1f} fps "
          f"({duration_sec:.1f}s)")

    # ------------------------------------------------------------------
    # 2. Extract ROI signals frame by frame
    # ------------------------------------------------------------------
    # roi_signals[roi_name] → (N, 3) array; NaN rows = face not detected
    roi_signals = {name: np.full((n_frames, 3), np.nan) for name in ROI_NAMES}
    n_rejected  = 0

    face_mesh = init_face_mesh()
    try:
        print(f"  Extracting ROIs from {n_frames} frames...", end="", flush=True)
        for i, frame in enumerate(frames):
            rois = extract_rois(frame, face_mesh)
            if rois is None:
                n_rejected += 1
                continue
            for name in ROI_NAMES:
                if name in rois:
                    roi_signals[name][i, :] = rois[name]
                else:
                    n_rejected += 1  # only count once per frame
                    break
        print(" done")
    finally:
        face_mesh.close()

    miss_frac = n_rejected / n_frames
    print(f"  Frames rejected (no/partial face): {n_rejected} "
          f"({miss_frac*100:.1f}%)")

    if miss_frac > _MAX_MISS_FRAC:
        return {
            **result_template,
            "frames_processed": n_frames - n_rejected,
            "frames_rejected":  n_rejected,
            "duration_sec":     duration_sec,
            "error": "Face not consistently visible "
                     f"({miss_frac*100:.0f}% frames missing). "
                     "Ensure stable lighting and look directly at the camera.",
        }

    # ------------------------------------------------------------------
    # 3. Interpolate brief detection gaps then run POS per ROI
    # ------------------------------------------------------------------
    rppg_waves: dict[str, np.ndarray] = {}
    snrs:       dict[str, float]      = {}

    for name in ROI_NAMES:
        sig_clean = _interpolate_missing(roi_signals[name])

        # Skip ROI if still mostly NaN (e.g. face partially out of frame)
        if np.isnan(sig_clean).any():
            continue

        wave = pos_algorithm(sig_clean, fs=effective_fps)
        snr  = compute_snr(wave, fs=effective_fps)

        rppg_waves[name] = wave
        snrs[name]       = snr

    if not rppg_waves:
        return {
            **result_template,
            "frames_processed": n_frames - n_rejected,
            "frames_rejected":  n_rejected,
            "duration_sec":     duration_sec,
            "error": "Could not extract any valid ROI signals.",
        }

    # ------------------------------------------------------------------
    # 4. SNR-weighted average across ROIs
    # ------------------------------------------------------------------
    total_snr = sum(snrs.values())
    if total_snr < 1e-8:
        weights = {k: 1.0 / len(rppg_waves) for k in rppg_waves}
    else:
        weights = {k: snrs[k] / total_snr for k in rppg_waves}

    combined = np.zeros(n_frames)
    for name, wave in rppg_waves.items():
        combined += weights[name] * wave

    mean_snr = float(np.mean(list(snrs.values())))
    print(f"  ROI SNRs: " +
          ", ".join(f"{k}={snrs[k]:.3f}" for k in snrs) +
          f"  (mean={mean_snr:.3f})")

    if mean_snr < _MIN_SNR:
        return {
            **result_template,
            "frames_processed": n_frames - n_rejected,
            "frames_rejected":  n_rejected,
            "duration_sec":     duration_sec,
            "signal_quality":   round(mean_snr, 3),
            "error": f"Signal quality too low (SNR={mean_snr:.3f} < {_MIN_SNR}). "
                     "Please rescan in better lighting.",
        }

    # ------------------------------------------------------------------
    # 5. Resample ~30 Hz → 1000 Hz to match training-time feature extraction
    # ------------------------------------------------------------------
    n_out = int(round(n_frames / effective_fps * _RESAMPLE_FS))
    rppg_1000hz = resample(combined, n_out)
    print(f"  Resampled: {n_frames} frames @ {effective_fps:.1f} Hz "
          f"-> {n_out} samples @ {_RESAMPLE_FS:.0f} Hz")

    # ------------------------------------------------------------------
    # 6. Extract features at 1000 Hz
    # ------------------------------------------------------------------
    print("  Extracting PPG features...", end="", flush=True)
    try:
        features = extract_features(rppg_1000hz, fs=_RESAMPLE_FS)
    except Exception as exc:
        return {
            **result_template,
            "frames_processed": n_frames - n_rejected,
            "frames_rejected":  n_rejected,
            "duration_sec":     duration_sec,
            "signal_quality":   round(mean_snr, 3),
            "error": f"Feature extraction failed: {exc}",
        }
    print(" done")

    return {
        "features":         features,
        "signal_quality":   round(mean_snr, 3),
        "frames_processed": n_frames - n_rejected,
        "frames_rejected":  n_rejected,
        "duration_sec":     round(duration_sec, 1),
        "error":            None,
    }


# ---------------------------------------------------------------------------
# Shared helper: SNR-weighted combination + resample + feature extraction
# Used by both video_to_features() and rgb_signals_to_features()
# ---------------------------------------------------------------------------

def _combine_and_extract(
    roi_waveforms: dict[str, np.ndarray],
    snrs: dict[str, float],
    fps: float,
    total_frames: int,
) -> dict:
    """
    Combine per-ROI waveforms (SNR-weighted), resample to 1000 Hz, extract features.

    Args:
        roi_waveforms: {roi_name: 1D waveform (N,)} from pos_algorithm()
        snrs:          {roi_name: float} from compute_snr()
        fps:           capture frame rate in Hz
        total_frames:  N (number of frames / samples in each waveform)

    Returns:
        Same structure as video_to_features() / rgb_signals_to_features().
    """
    # SNR-weighted average
    total_snr = sum(snrs.values())
    if total_snr < 1e-8:
        weights = {k: 1.0 / len(roi_waveforms) for k in roi_waveforms}
    else:
        weights = {k: snrs[k] / total_snr for k in roi_waveforms}

    combined = np.zeros(total_frames)
    for name, wave in roi_waveforms.items():
        combined += weights[name] * wave

    mean_snr = float(np.mean(list(snrs.values())))

    if mean_snr < _MIN_SNR:
        return {
            "features":         None,
            "signal_quality":   round(mean_snr, 3),
            "frames_processed": total_frames,
            "frames_rejected":  0,
            "duration_sec":     round(total_frames / fps, 1),
            "error": (
                f"Signal quality too low (SNR={mean_snr:.3f} < {_MIN_SNR}). "
                "Please rescan in better lighting."
            ),
        }

    # Resample fps → 1000 Hz
    n_out = int(round(total_frames / fps * _RESAMPLE_FS))
    resampled = resample(combined, n_out)

    try:
        features = extract_features(resampled, fs=_RESAMPLE_FS)
    except Exception as exc:
        return {
            "features":         None,
            "signal_quality":   round(mean_snr, 3),
            "frames_processed": total_frames,
            "frames_rejected":  0,
            "duration_sec":     round(total_frames / fps, 1),
            "error":            f"Feature extraction failed: {exc}",
        }

    return {
        "features":         features,
        "signal_quality":   round(mean_snr, 3),
        "frames_processed": total_frames,
        "frames_rejected":  0,
        "duration_sec":     round(total_frames / fps, 1),
        "error":            None,
    }


# ---------------------------------------------------------------------------
# Public API — browser-driven path (no video file needed)
# ---------------------------------------------------------------------------

def rgb_signals_to_features(rgb_dict: dict, fps: float = 30.0) -> dict:
    """
    Process pre-extracted ROI RGB signals sent from the browser.

    The browser runs face detection + skin masking (mirroring face_roi.py) and
    sends only per-frame mean RGB values — no video data ever leaves the device.

    Args:
        rgb_dict: {
            'forehead':    [[r, g, b], ...],   # N rows, floats 0-255
            'left_cheek':  [[r, g, b], ...],
            'right_cheek': [[r, g, b], ...]
        }
        fps: Frame rate of the original capture (typically 30).

    Returns:
        Same structure as video_to_features():
        {
            'features':          dict | None,
            'signal_quality':    float,
            'frames_processed':  int,
            'frames_rejected':   int,
            'duration_sec':      float,
            'error':             str | None
        }
    """
    _error_base = {
        "features": None, "signal_quality": 0.0,
        "frames_processed": 0, "frames_rejected": 0,
        "duration_sec": 0.0,
    }

    try:
        # ------------------------------------------------------------------
        # 1. Validate input
        # ------------------------------------------------------------------
        required_keys = ("forehead", "left_cheek", "right_cheek")
        for key in required_keys:
            if key not in rgb_dict:
                return {**_error_base, "error": f"Missing ROI key: '{key}'"}

        lengths = {k: len(rgb_dict[k]) for k in required_keys}
        if len(set(lengths.values())) != 1:
            return {**_error_base,
                    "error": f"ROI lengths differ: {lengths}. All must be equal."}

        N = lengths["forehead"]
        if N < 60:
            return {**_error_base,
                    "error": f"Need at least 60 frames (2s), got {N}."}

        for key in required_keys:
            for i, row in enumerate(rgb_dict[key]):
                if len(row) != 3:
                    return {**_error_base,
                            "error": f"{key}[{i}] must be [R,G,B], got length {len(row)}"}
                for c in row:
                    if not (0.0 <= float(c) <= 255.0):
                        return {**_error_base,
                                "error": f"{key}[{i}] has out-of-range value {c}"}

        # ------------------------------------------------------------------
        # 2. Run POS on each ROI
        # ------------------------------------------------------------------
        roi_waveforms: dict[str, np.ndarray] = {}
        snrs: dict[str, float] = {}

        for name in required_keys:
            arr  = np.array(rgb_dict[name], dtype=np.float64)   # (N, 3)
            wave = pos_algorithm(arr, fs=fps)
            snr  = compute_snr(wave, fs=fps)
            roi_waveforms[name] = wave
            snrs[name]          = snr

        # ------------------------------------------------------------------
        # 3. Combine, resample, extract features (shared helper)
        # ------------------------------------------------------------------
        return _combine_and_extract(roi_waveforms, snrs, fps, N)

    except Exception as exc:
        return {**_error_base, "error": f"Pipeline failed: {exc}"}
