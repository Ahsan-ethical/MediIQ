"""
Phase 2 — Build features.csv from the raw PPG-BP dataset.

Steps:
  1. Load subject metadata + BP labels from Excel (header row 1).
  2. For each subject, find all matching .txt PPG recordings.
  3. Load each recording (single-line, tab-separated samples).
  4. Preprocess signal and extract 15 features.
  5. If multiple recordings exist, average features across them.
  6. Skip bad recordings: peak_count < 2 or signal_quality < 0.1.
  7. Combine with demographics (age, sex encoded, height, weight, BMI).
  8. Save to data/processed/features.csv.
  9. Print distribution summary.

Usage:
    cd ml/
    python src/build_dataset.py
"""

import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from tqdm import tqdm

# Sibling imports
sys.path.insert(0, str(Path(__file__).parent))
from signal_processing import preprocess_ppg
from feature_extraction import extract_features

warnings.filterwarnings("ignore")

# ---------------------------------------------------------------------------
# Paths (relative to ml/)
# ---------------------------------------------------------------------------
ML_ROOT   = Path(__file__).resolve().parent.parent
RAW_DIR   = ML_ROOT / "data" / "raw" / "ppg_bp"
PROC_DIR  = ML_ROOT / "data" / "processed"
OUT_CSV   = PROC_DIR / "features.csv"
FS        = 1000.0   # Hz

# Quality thresholds
MIN_PEAKS   = 2
MIN_QUALITY = 0.10


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_excel(raw_dir: Path) -> pd.DataFrame:
    """Load the PPG-BP Excel file, using row 1 as column headers."""
    xlsx_files = list(raw_dir.rglob("*.xlsx"))
    if not xlsx_files:
        raise FileNotFoundError(f"No .xlsx found under {raw_dir}")
    xlsx = xlsx_files[0]
    df = pd.read_excel(xlsx, header=1, engine="openpyxl")
    # Drop any fully-NaN rows (artefact of merged cells at top)
    df = df.dropna(how="all").reset_index(drop=True)
    return df


def load_ppg_txt(path: Path) -> np.ndarray | None:
    """
    Load a single PPG recording.
    Format: one line, tab-separated float values.

    Returns None if the file is empty or unreadable.
    """
    try:
        content = path.read_text(encoding="utf-8", errors="ignore").strip()
        if not content:
            return None
        values = [float(v) for v in content.split("\t") if v.strip()]
        if len(values) < 100:     # too short to be a valid recording
            return None
        return np.array(values, dtype=np.float64)
    except Exception:
        return None


def find_txt_files(raw_dir: Path, subject_id: int | str) -> list[Path]:
    """Return all .txt files whose stem starts with '<subject_id>_'."""
    prefix = f"{int(subject_id)}_"
    return sorted(raw_dir.rglob(f"{prefix}*.txt"))


def process_subject(txt_files: list[Path]) -> dict | None:
    """
    Extract features from all recordings of one subject and return their mean.
    Returns None if no valid recording exists.
    """
    all_feats = []

    for fp in txt_files:
        raw = load_ppg_txt(fp)
        if raw is None:
            continue

        try:
            processed = preprocess_ppg(raw, fs=FS)
            feats = extract_features(processed, fs=FS)
        except Exception:
            continue

        # Quality filter
        if feats["peak_count"] < MIN_PEAKS:
            continue
        if np.isnan(feats["signal_quality"]) or feats["signal_quality"] < MIN_QUALITY:
            continue

        all_feats.append(feats)

    if not all_feats:
        return None

    # Average across recordings
    keys = list(all_feats[0].keys())
    averaged = {}
    for k in keys:
        vals = [f[k] for f in all_feats if not np.isnan(f[k])]
        averaged[k] = float(np.mean(vals)) if vals else np.nan

    return averaged


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    PROC_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Load Excel
    print("Loading Excel metadata …")
    meta = load_excel(RAW_DIR)

    # Normalise column names for reliable access
    col_map = {
        "subject_ID":                     "subject_id",
        "Sex(M/F)":                       "sex",
        "Age(year)":                       "age",
        "Height(cm)":                     "height",
        "Weight(kg)":                     "weight",
        "Systolic Blood Pressure(mmHg)":  "sbp",
        "Diastolic Blood Pressure(mmHg)": "dbp",
        "Heart Rate(b/m)":                "hr_label",
        "BMI(kg/m^2)":                    "bmi",
        "Hypertension":                   "hypertension",
    }
    meta = meta.rename(columns=col_map)

    required = ["subject_id", "sex", "age", "sbp", "dbp"]
    missing = [c for c in required if c not in meta.columns]
    if missing:
        print(f"ERROR: Missing columns after rename: {missing}")
        print("Available columns:", list(meta.columns))
        sys.exit(1)

    meta = meta.dropna(subset=["subject_id", "sbp", "dbp"]).copy()
    meta["subject_id"] = meta["subject_id"].astype(int)
    meta["sex_bin"] = (meta["sex"].str.strip().str.upper() == "MALE").astype(int)

    print(f"  {len(meta)} subjects with valid BP labels")

    # 2. Process each subject
    rows = []
    skipped = 0

    for _, row in tqdm(meta.iterrows(), total=len(meta), desc="Subjects"):
        sid = int(row["subject_id"])
        txt_files = find_txt_files(RAW_DIR, sid)

        if not txt_files:
            skipped += 1
            continue

        feats = process_subject(txt_files)
        if feats is None:
            skipped += 1
            continue

        record = {
            "subject_id": sid,
            # Demographics
            "age":        float(row["age"])     if pd.notna(row["age"])    else np.nan,
            "sex":        int(row["sex_bin"]),
            "height":     float(row["height"])  if pd.notna(row.get("height")) else np.nan,
            "weight":     float(row["weight"])  if pd.notna(row.get("weight")) else np.nan,
            "bmi":        float(row["bmi"])     if pd.notna(row.get("bmi"))    else np.nan,
            # PPG features
            **feats,
            # Targets
            "sbp":        float(row["sbp"]),
            "dbp":        float(row["dbp"]),
        }
        rows.append(record)

    print(f"\n  Processed : {len(rows)} subjects")
    print(f"  Skipped   : {skipped} (no valid signal)")

    if not rows:
        print("ERROR: No valid rows — check signal paths or quality thresholds.")
        sys.exit(1)

    # 3. Build DataFrame
    df = pd.DataFrame(rows)

    # 4. Save
    df.to_csv(OUT_CSV, index=False)
    print(f"\nSaved: {OUT_CSV}  ({len(df)} rows x {df.shape[1]} columns)")

    # 5. Summary statistics
    print("\n" + "=" * 65)
    print("FEATURE DISTRIBUTION SUMMARY")
    print("=" * 65)

    nan_counts = df.isna().sum()
    nan_cols = nan_counts[nan_counts > 0]
    if nan_cols.empty:
        print("NaN counts: none — all features complete!")
    else:
        print("\nNaN counts per column:")
        print(nan_cols.to_string())

    target_cols = ["sbp", "dbp"]
    feature_cols = [c for c in df.columns
                    if c not in ["subject_id", "sbp", "dbp"]]

    print("\nTarget distributions:")
    for tc in target_cols:
        s = df[tc]
        print(f"  {tc.upper()}: mean={s.mean():.1f}  std={s.std():.1f}  "
              f"min={s.min():.0f}  max={s.max():.0f}")

    print("\nFeature statistics (mean ± std):")
    for fc in feature_cols:
        s = df[fc].dropna()
        if len(s):
            print(f"  {fc:<18} {s.mean():>8.3f} ± {s.std():.3f}  "
                  f"[{s.min():.3f}, {s.max():.3f}]")

    print("\nFirst 5 rows:")
    print(df.head().to_string(index=False))
    print("=" * 65)


if __name__ == "__main__":
    main()
