"""
Phase 4 — Inference test across 5 deliberately diverse BP subjects.

Selects one subject from each BP tier (low-normal, normal/elevated boundary,
stage 1, stage 2) plus one random subject, then calls predict_bp() and
prints a clean side-by-side comparison against ground-truth labels.

Usage:
    cd ml/
    python src/test_inference.py
"""

import sys
import numpy as np
import pandas as pd
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from predict import predict_bp
from classifier import classify_bp

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ML_ROOT  = Path(__file__).resolve().parent.parent
FEAT_CSV = ML_ROOT / "data" / "processed" / "features.csv"

# PPG feature keys produced by feature_extraction.extract_features()
PPG_FEATURE_KEYS = [
    "hr_fft", "hr_peaks", "hr_final",
    "rmssd", "sdnn", "pnn50",
    "pulse_width", "rise_time", "fall_time",
    "peak_amplitude", "notch_ratio", "aug_index",
    "signal_quality", "peak_count", "signal_std",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def select_subjects(df: pd.DataFrame) -> list[pd.Series]:
    """
    Pick 5 subjects spanning the clinical BP range.

    Tiers:
        1. SBP < 110             — Normal-low
        2. 110 <= SBP <= 130     — Normal / Elevated boundary
        3. 130 < SBP <= 150      — Stage 1 Hypertension
        4. SBP > 160             — Stage 2 Hypertension
        5. Random (any)          — Wild card
    """
    rng = np.random.default_rng(seed=99)

    def _pick(mask: pd.Series) -> pd.Series | None:
        pool = df[mask]
        return pool.iloc[0] if len(pool) else None

    t1 = _pick(df["sbp"] < 110)
    t2 = _pick((df["sbp"] >= 110) & (df["sbp"] <= 130))
    t3 = _pick((df["sbp"] > 130) & (df["sbp"] <= 150))
    t4 = _pick(df["sbp"] > 160)
    t5 = df.iloc[int(rng.integers(0, len(df)))]

    subjects = []
    labels   = []
    for tier, label, row in [
        (1, "Normal-low (SBP < 110)",         t1),
        (2, "Normal/Elevated (SBP 110-130)",  t2),
        (3, "Stage 1 (SBP 130-150)",          t3),
        (4, "Stage 2 (SBP > 160)",            t4),
        (5, "Random",                          t5),
    ]:
        if row is not None:
            subjects.append((label, row))
        else:
            print(f"  WARNING: No subject found for tier {tier} ({label}) — skipping.")

    return subjects


def row_to_features(row: pd.Series) -> dict:
    """Extract the 15 PPG feature values from a CSV row into a plain dict."""
    return {k: float(row[k]) for k in PPG_FEATURE_KEYS if k in row.index}


def sex_label(sex_bin: int) -> str:
    return "Male" if sex_bin == 1 else "Female"


def sex_code(sex_bin: int) -> str:
    return "M" if sex_bin == 1 else "F"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    if not FEAT_CSV.exists():
        print(f"ERROR: {FEAT_CSV} not found. Run build_dataset.py first.")
        sys.exit(1)

    df = pd.read_csv(FEAT_CSV)
    print(f"Loaded {len(df)} subjects from features.csv\n")

    subjects = select_subjects(df)
    if not subjects:
        print("ERROR: Could not select any subjects.")
        sys.exit(1)

    sbp_errors, dbp_errors, class_matches = [], [], []

    sep = "=" * 62

    for tier_label, row in subjects:
        subject_id  = int(row["subject_id"])
        age         = int(row["age"])
        sex_bin     = int(row["sex"])
        height      = float(row["height"]) if pd.notna(row.get("height")) else None
        weight      = float(row["weight"]) if pd.notna(row.get("weight")) else None
        true_sbp    = float(row["sbp"])
        true_dbp    = float(row["dbp"])
        sig_quality = float(row["signal_quality"])

        features = row_to_features(row)

        result = predict_bp(
            features      = features,
            age           = age,
            sex           = sex_code(sex_bin),
            height        = height,
            weight        = weight,
            signal_quality= sig_quality,
        )

        pred_sbp = result["blood_pressure"]["systolic"]["value"]
        pred_dbp = result["blood_pressure"]["diastolic"]["value"]
        sbp_lo   = result["blood_pressure"]["systolic"]["lower"]
        sbp_hi   = result["blood_pressure"]["systolic"]["upper"]
        dbp_lo   = result["blood_pressure"]["diastolic"]["lower"]
        dbp_hi   = result["blood_pressure"]["diastolic"]["upper"]
        pred_hr  = result["heart_rate"]["value"]
        bp_class = result["classification"]["bp"]
        hr_class = result["classification"]["hr"]
        conf     = result["confidence"]

        true_class = classify_bp(true_sbp, true_dbp)
        sbp_err    = pred_sbp - true_sbp
        dbp_err    = pred_dbp - true_dbp
        match      = bp_class == true_class

        sbp_errors.append(abs(sbp_err))
        dbp_errors.append(abs(dbp_err))
        class_matches.append(match)

        # ------------------------------------------------------------------
        # Formatted output
        # ------------------------------------------------------------------
        print(sep)
        print(f"  Tier   : {tier_label}")
        print(f"  Subject {subject_id}  |  Age {age}  |  {sex_label(sex_bin)}", end="")
        if height and weight:
            bmi = weight / (height / 100) ** 2
            print(f"  |  BMI {bmi:.1f}", end="")
        print()
        print(sep)

        print(f"  Actual    : {true_sbp:.0f} / {true_dbp:.0f} mmHg"
              f"  ({true_class})")
        print(f"  Predicted : {pred_sbp} / {pred_dbp} mmHg"
              f"  ({bp_class})")
        print(f"  Range     : {sbp_lo}-{sbp_hi} / {dbp_lo}-{dbp_hi} mmHg")
        print(f"  Heart Rate: {pred_hr} bpm  ({hr_class})")
        print(f"  Confidence: {conf}")
        print(f"  Sig. Qual : {sig_quality:.3f}")
        print(f"  Errors    : SBP {sbp_err:+.1f}  DBP {dbp_err:+.1f} mmHg")
        print(f"  Match     : {'YES' if match else 'NO'}"
              f"  (classification {'agrees' if match else 'differs'})")
        print()

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    print(sep)
    print("  SUMMARY")
    print(sep)
    n = len(sbp_errors)
    print(f"  Subjects tested          : {n}")
    print(f"  Mean absolute SBP error  : {np.mean(sbp_errors):.2f} mmHg")
    print(f"  Mean absolute DBP error  : {np.mean(dbp_errors):.2f} mmHg")
    print(f"  Classification match     : {sum(class_matches)} / {n}")
    print(sep)


if __name__ == "__main__":
    main()
