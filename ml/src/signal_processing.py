"""
Phase 2 — PPG signal preprocessing pipeline.

All functions operate on 1-D numpy arrays. Designed to be composable:
    raw → bandpass_filter → detrend_signal → normalize_signal
or  raw → preprocess_ppg (runs all three in order)
"""

import numpy as np
from scipy.signal import butter, filtfilt


def bandpass_filter(
    signal: np.ndarray,
    fs: float = 1000.0,
    low: float = 0.5,
    high: float = 8.0,
    order: int = 4,
) -> np.ndarray:
    """
    Zero-phase Butterworth bandpass filter.

    Args:
        signal: 1-D raw PPG array (ADC counts or volts).
        fs:     Sampling frequency in Hz.
        low:    Lower cutoff in Hz (removes very slow drift).
        high:   Upper cutoff in Hz (removes high-freq noise above 8 Hz).
        order:  Filter order. 4 gives a good roll-off without ringing.

    Returns:
        Filtered signal, same length as input.
    """
    nyquist = fs / 2.0
    b, a = butter(order, [low / nyquist, high / nyquist], btype="band")
    return filtfilt(b, a, signal)


def detrend_signal(
    signal: np.ndarray,
    window_size: int | None = None,
) -> np.ndarray:
    """
    Remove slow baseline wander via moving-average subtraction.

    Args:
        signal:      1-D PPG array (already bandpass filtered).
        window_size: Length of moving-average window in samples.
                     Defaults to 25 % of signal length, clamped to ≥ 3.

    Returns:
        Detrended signal.
    """
    n = len(signal)
    if window_size is None:
        window_size = max(3, n // 4)
    # Pad edges so the convolution doesn't shrink
    kernel = np.ones(window_size) / window_size
    baseline = np.convolve(signal, kernel, mode="same")
    return signal - baseline


def normalize_signal(signal: np.ndarray) -> np.ndarray:
    """
    Standardise to zero mean and unit variance.

    Args:
        signal: 1-D PPG array.

    Returns:
        Normalised signal. If std ≈ 0 (flat line), returns zero-centred signal.
    """
    mean = np.mean(signal)
    std = np.std(signal)
    if std < 1e-8:
        return signal - mean
    return (signal - mean) / std


def preprocess_ppg(
    raw_signal: np.ndarray | list,
    fs: float = 1000.0,
) -> np.ndarray:
    """
    Full preprocessing pipeline: bandpass → detrend → normalize.

    Args:
        raw_signal: Raw PPG samples (list or 1-D array).
        fs:         Sampling frequency in Hz.

    Returns:
        Preprocessed signal as float64 numpy array.
    """
    sig = np.asarray(raw_signal, dtype=np.float64)
    sig = bandpass_filter(sig, fs=fs)
    sig = detrend_signal(sig)
    sig = normalize_signal(sig)
    return sig
