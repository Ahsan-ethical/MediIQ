"""
Phase 2 — Extract 15 interpretable features from a preprocessed PPG segment.

Signal assumptions:
  - Already preprocessed (bandpass + detrend + normalize)
  - Sampled at fs Hz (default 1000)
  - Duration: ~2.1 s (2100 samples) → expect 2–3 peaks at resting HR

Feature groups:
  Heart rate  : hr_fft, hr_peaks, hr_final
  HRV         : rmssd, sdnn, pnn50
  Morphology  : pulse_width, rise_time, fall_time, peak_amplitude,
                notch_ratio, aug_index
  Quality     : signal_quality, peak_count, signal_std
"""

import numpy as np
from scipy.signal import find_peaks, welch
from scipy.fft import rfft, rfftfreq


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _find_feet(signal: np.ndarray, peaks: np.ndarray) -> list[int]:
    """
    Return the index of the local minimum (foot) immediately before each peak.
    Searches between the previous peak and the current peak.
    """
    feet = []
    n = len(signal)
    for i, pk in enumerate(peaks):
        start = peaks[i - 1] if i > 0 else 0
        segment = signal[start:pk]
        if len(segment) == 0:
            feet.append(start)
        else:
            feet.append(int(start + np.argmin(segment)))
    return feet


def _morphology_per_pulse(
    signal: np.ndarray,
    peaks: np.ndarray,
    fs: float,
) -> dict:
    """
    Compute pulse-by-pulse morphology features and return their averages.
    Skips pulses where amplitude is too small to be reliable.
    """
    n = len(signal)
    feet = _find_feet(signal, peaks)

    pulse_widths, rise_times, fall_times = [], [], []
    amplitudes, notch_ratios, aug_indices = [], [], []

    for i, pk in enumerate(peaks):
        foot_idx = feet[i]

        # Next foot = min between this peak and the next peak (or end)
        end = peaks[i + 1] if i < len(peaks) - 1 else n - 1
        after_seg = signal[pk:end]
        next_foot_idx = int(pk + np.argmin(after_seg)) if len(after_seg) else end

        foot_amp = signal[foot_idx]
        peak_amp = signal[pk]
        pulse_amp = peak_amp - foot_amp

        if pulse_amp < 0.05:          # normalised signal: skip flat/noisy pulses
            continue

        amplitudes.append(float(peak_amp))
        rise_times.append((pk - foot_idx) / fs)
        fall_times.append((next_foot_idx - pk) / fs)

        # --- Pulse width at 50 % amplitude ---
        half = foot_amp + 0.5 * pulse_amp
        left_cross = next(
            (j for j in range(foot_idx, pk) if signal[j] >= half), None
        )
        right_cross = next(
            (j for j in range(pk, next_foot_idx) if signal[j] <= half), None
        )
        if left_cross is not None and right_cross is not None:
            pulse_widths.append((right_cross - left_cross) / fs)

        # --- Dicrotic notch via acceleration PPG (2nd derivative) ---
        descent = signal[pk:next_foot_idx]
        if len(descent) > 5:
            d2 = np.diff(np.diff(descent))
            # First positive-going inflection in descent = notch
            pos_idx = np.where(d2 > 0)[0]
            if len(pos_idx):
                notch_local = int(pos_idx[0]) + 1       # +1 for two diff()s
                notch_idx = pk + notch_local
                notch_amp = signal[notch_idx] - foot_amp

                if 0 < notch_amp < pulse_amp:           # sanity check
                    notch_ratios.append(notch_amp / pulse_amp)
                    # Augmentation index = (P2 - P1) / pulse_amp
                    # P2 = notch (diastolic reflection), P1 = systolic peak
                    aug_indices.append((signal[notch_idx] - peak_amp) / pulse_amp)

    def _avg(lst):
        return float(np.mean(lst)) if lst else np.nan

    return {
        "pulse_width":    _avg(pulse_widths),
        "rise_time":      _avg(rise_times),
        "fall_time":      _avg(fall_times),
        "peak_amplitude": _avg(amplitudes),
        "notch_ratio":    _avg(notch_ratios),
        "aug_index":      _avg(aug_indices),
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def extract_features(ppg_signal: np.ndarray, fs: float = 1000.0) -> dict:
    """
    Extract 15 features from a preprocessed, normalised PPG segment.

    Args:
        ppg_signal: 1-D numpy array, already run through preprocess_ppg().
        fs:         Sampling frequency in Hz (default 1000).

    Returns:
        Dict with keys: hr_fft, hr_peaks, hr_final, rmssd, sdnn, pnn50,
        pulse_width, rise_time, fall_time, peak_amplitude, notch_ratio,
        aug_index, signal_quality, peak_count, signal_std.
        Any feature that cannot be computed is returned as np.nan.
    """
    sig = np.asarray(ppg_signal, dtype=np.float64)
    n = len(sig)

    # ------------------------------------------------------------------
    # 1. Heart rate via FFT
    # ------------------------------------------------------------------
    freqs = rfftfreq(n, d=1.0 / fs)
    fft_mag = np.abs(rfft(sig))
    pulse_band = (freqs >= 0.7) & (freqs <= 4.0)

    if pulse_band.any():
        peak_freq = freqs[pulse_band][np.argmax(fft_mag[pulse_band])]
        hr_fft = float(peak_freq * 60.0)
    else:
        hr_fft = np.nan

    # ------------------------------------------------------------------
    # 2. Heart rate via peak detection
    # ------------------------------------------------------------------
    min_dist = int(fs * 0.4)                        # 400 ms minimum between peaks
    height_thresh = float(np.percentile(sig, 50))   # ignore sub-median peaks

    peaks, _ = find_peaks(sig, distance=min_dist, height=height_thresh)
    peak_count = int(len(peaks))

    if peak_count >= 2:
        rr_s = np.diff(peaks) / fs                  # RR in seconds
        rr_ms = rr_s * 1000.0                       # RR in ms

        hr_peaks = float(60.0 / np.mean(rr_s))

        # HRV features
        successive_diff_ms = np.diff(rr_ms)
        rmssd = float(np.sqrt(np.mean(successive_diff_ms ** 2)))
        sdnn  = float(np.std(rr_ms, ddof=1) if len(rr_ms) > 1 else np.nan)
        pnn50 = float(np.mean(np.abs(successive_diff_ms) > 50.0) * 100.0) \
                if len(successive_diff_ms) else np.nan
    else:
        hr_peaks = rmssd = sdnn = pnn50 = np.nan

    hr_final = float(np.nanmean([hr_fft, hr_peaks])) \
               if not (np.isnan(hr_fft) and np.isnan(hr_peaks)) else np.nan

    # ------------------------------------------------------------------
    # 3. Morphology features (computed per pulse, then averaged)
    # ------------------------------------------------------------------
    if peak_count >= 2:
        morph = _morphology_per_pulse(sig, peaks, fs)
    else:
        morph = {k: np.nan for k in
                 ("pulse_width", "rise_time", "fall_time",
                  "peak_amplitude", "notch_ratio", "aug_index")}

    # ------------------------------------------------------------------
    # 4. Signal quality (pulse-band power fraction via Welch PSD)
    # ------------------------------------------------------------------
    nperseg = min(n, 256)
    f_psd, psd = welch(sig, fs=fs, nperseg=nperseg)
    pulse_mask = (f_psd >= 0.7) & (f_psd <= 4.0)
    total_power = float(psd.sum())

    signal_quality = float(psd[pulse_mask].sum() / total_power) \
                     if total_power > 1e-12 and pulse_mask.any() else np.nan

    # ------------------------------------------------------------------
    # Assemble output
    # ------------------------------------------------------------------
    return {
        # Heart rate
        "hr_fft":         hr_fft,
        "hr_peaks":       hr_peaks,
        "hr_final":       hr_final,
        # HRV
        "rmssd":          rmssd,
        "sdnn":           sdnn,
        "pnn50":          pnn50,
        # Morphology
        "pulse_width":    morph["pulse_width"],
        "rise_time":      morph["rise_time"],
        "fall_time":      morph["fall_time"],
        "peak_amplitude": morph["peak_amplitude"],
        "notch_ratio":    morph["notch_ratio"],
        "aug_index":      morph["aug_index"],
        # Quality / meta
        "signal_quality": signal_quality,
        "peak_count":     float(peak_count),
        "signal_std":     float(np.std(sig)),
    }
