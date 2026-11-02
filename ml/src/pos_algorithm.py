"""
Phase 5 — POS (Plane-Orthogonal-to-Skin) rPPG algorithm.

Reference:
    Wang W, den Brinker AC, Stuijk S, de Haan G.
    "Algorithmic Principles of Remote PPG." IEEE TBME 64(7), 2017.

The POS algorithm exploits the fact that skin-colour changes due to
blood-volume pulse lie in a specific 2D plane (orthogonal to the skin
locus), while illumination changes and motion artefacts are suppressed
by projecting out of the skin-tone direction.

Input:  rgb_signals (N, 3) — per-frame mean [R, G, B] from one skin ROI
Output: 1D rPPG waveform (N,) — zero-mean, unit-variance
"""

from __future__ import annotations

import numpy as np
from scipy.signal import butter, filtfilt, welch


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def pos_algorithm(
    rgb_signals: np.ndarray,
    fs: float = 30.0,
) -> np.ndarray:
    """
    Extract an rPPG waveform from a sequence of mean skin-region RGB values.

    Args:
        rgb_signals: Shape (N, 3), columns = [R, G, B].
                     Each row is the mean colour of one video frame's skin ROI.
        fs:          Frame rate in Hz (default 30).

    Returns:
        1D numpy array shape (N,) — filtered, normalised rPPG signal.
        Returns a zero array if the signal is degenerate (all-constant channel).
    """
    sig = np.asarray(rgb_signals, dtype=np.float64)
    if sig.ndim != 2 or sig.shape[1] != 3:
        raise ValueError(f"rgb_signals must be (N, 3), got {sig.shape}")

    N = sig.shape[0]

    # --- Step 1: Per-channel mean normalisation ---
    # C_n = C / mean(C) - 1   → removes slow DC illumination drift
    means = sig.mean(axis=0)                 # shape (3,)
    if np.any(means < 1e-6):
        return np.zeros(N)

    C_n = sig / means - 1.0                  # shape (N, 3)

    R_n, G_n, B_n = C_n[:, 0], C_n[:, 1], C_n[:, 2]

    # --- Step 2: Project onto two skin-orthogonal planes ---
    X = R_n - G_n
    Y = 0.5 * R_n + 0.5 * G_n - B_n

    # --- Step 3: Combine planes with std-ratio weighting ---
    std_x = float(np.std(X))
    std_y = float(np.std(Y))

    if std_y < 1e-8:
        raw = X
    else:
        alpha = std_x / std_y
        raw   = X + alpha * Y

    # --- Step 4: Bandpass 0.7–4 Hz (heart-rate band) ---
    nyq  = fs / 2.0
    low  = 0.7 / nyq
    high = min(4.0 / nyq, 0.99)             # clamp below Nyquist
    b, a = butter(4, [low, high], btype="band")

    if N < 3 * max(len(a), len(b)):         # signal too short for filtfilt
        return np.zeros(N)

    filtered = filtfilt(b, a, raw)

    # --- Step 5: Normalise to zero mean, unit variance ---
    std_f = float(np.std(filtered))
    if std_f < 1e-8:
        return np.zeros(N)

    return (filtered - filtered.mean()) / std_f


def compute_snr(
    signal: np.ndarray,
    fs: float = 30.0,
) -> float:
    """
    Estimate signal quality as the fraction of PSD power in the pulse band.

    The pulse band 0.7–4 Hz captures heart rates from 42–240 bpm.
    A value above ~0.3 generally indicates a usable rPPG signal.

    Args:
        signal: 1D rPPG waveform (already filtered & normalised).
        fs:     Sampling rate in Hz.

    Returns:
        SNR in [0, 1] — ratio of pulse-band power to total power.
        Returns 0.0 for degenerate (flat) signals.
    """
    sig = np.asarray(signal, dtype=np.float64)
    if sig.std() < 1e-8:
        return 0.0

    nperseg = min(len(sig), 256)
    freqs, psd = welch(sig, fs=fs, nperseg=nperseg)

    pulse_mask  = (freqs >= 0.7) & (freqs <= 4.0)
    total_power = float(psd.sum())

    if total_power < 1e-12:
        return 0.0

    return float(psd[pulse_mask].sum() / total_power)
