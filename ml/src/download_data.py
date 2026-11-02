"""
Phase 1 — Download and extract the PPG-BP dataset from Figshare.

Dataset: PPG-BP (Figures.com article 5459299)
  - 219 subjects
  - Excel file with demographics + BP labels
  - One or more .txt files per subject (raw PPG at 1000 Hz)

Usage:
    python src/download_data.py
"""

import os
import sys
import zipfile
import requests
from pathlib import Path
from tqdm import tqdm
import pandas as pd

# Paths are relative to the ml/ directory
ML_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ML_ROOT / "data" / "raw" / "ppg_bp"
FIGSHARE_API  = "https://api.figshare.com/v2/articles/5459299/files"
FIGSHARE_URL  = "https://ndownloader.figshare.com/files/9441097"   # resolved via API
ZIP_PATH = RAW_DIR / "ppg_bp.zip"


def download_file(url: str, dest: Path) -> None:
    """Stream-download a file with a progress bar."""
    print(f"Downloading: {url}")
    headers = {"User-Agent": "Mozilla/5.0 (compatible; mediiq-ml/1.0)"}
    try:
        response = requests.get(url, stream=True, timeout=120,
                                headers=headers, allow_redirects=True)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        print(f"ERROR: Download failed — {e}")
        sys.exit(1)

    total = int(response.headers.get("content-length", 0))
    dest.parent.mkdir(parents=True, exist_ok=True)

    with open(dest, "wb") as f, tqdm(
        desc=dest.name,
        total=total,
        unit="B",
        unit_scale=True,
        unit_divisor=1024,
    ) as bar:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)
            bar.update(len(chunk))

    print(f"Saved to: {dest}  ({dest.stat().st_size / 1e6:.1f} MB)")


def extract_zip(zip_path: Path, extract_to: Path) -> None:
    """Extract zip file, flattening nested single-directory zips."""
    print(f"\nExtracting {zip_path.name} ...")
    with zipfile.ZipFile(zip_path, "r") as zf:
        members = zf.namelist()
        print(f"  Archive contains {len(members)} entries")
        zf.extractall(extract_to)
    print(f"Extracted to: {extract_to}")


def summarise(raw_dir: Path) -> None:
    """Print a dataset summary after extraction."""
    print("\n" + "=" * 60)
    print("DATASET SUMMARY")
    print("=" * 60)

    # Find Excel file
    xlsx_files = list(raw_dir.rglob("*.xlsx"))
    if not xlsx_files:
        print("WARNING: No .xlsx file found — check extraction path.")
        return

    xlsx_path = xlsx_files[0]
    print(f"\nExcel file : {xlsx_path.relative_to(ML_ROOT)}")

    df = pd.read_excel(xlsx_path, engine="openpyxl")
    print(f"Rows       : {len(df)}")
    print(f"Columns    : {list(df.columns)}")

    # Count TXT signal files
    txt_files = list(raw_dir.rglob("*.txt"))
    print(f"\nPPG signal files (.txt) : {len(txt_files)}")

    if txt_files:
        # Show a few filenames
        print("Sample filenames:")
        for f in sorted(txt_files)[:5]:
            print(f"  {f.name}")

    # BP distribution
    sbp_col = next((c for c in df.columns if "SBP" in str(c).upper() or "sys" in str(c).lower()), None)
    dbp_col = next((c for c in df.columns if "DBP" in str(c).upper() or "dia" in str(c).lower()), None)

    if sbp_col and dbp_col:
        print(f"\nSBP ({sbp_col}): mean={df[sbp_col].mean():.1f}  "
              f"std={df[sbp_col].std():.1f}  "
              f"min={df[sbp_col].min()}  max={df[sbp_col].max()}")
        print(f"DBP ({dbp_col}): mean={df[dbp_col].mean():.1f}  "
              f"std={df[dbp_col].std():.1f}  "
              f"min={df[dbp_col].min()}  max={df[dbp_col].max()}")

    print("\nFirst 5 rows of Excel:")
    print(df.head().to_string(index=False))
    print("=" * 60)


def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    # Delete corrupt/empty zip from a previous failed download
    if ZIP_PATH.exists() and ZIP_PATH.stat().st_size < 10_000:
        print(f"Found corrupt/empty zip ({ZIP_PATH.stat().st_size} bytes) — deleting and re-downloading.")
        ZIP_PATH.unlink()

    if ZIP_PATH.exists():
        print(f"Zip already exists ({ZIP_PATH.stat().st_size / 1e6:.1f} MB) — skipping download.")
    else:
        download_file(FIGSHARE_URL, ZIP_PATH)

    # Skip extraction if Excel already present
    xlsx_files = list(RAW_DIR.rglob("*.xlsx"))
    if xlsx_files:
        print("Data already extracted — skipping unzip.")
    else:
        extract_zip(ZIP_PATH, RAW_DIR)

    summarise(RAW_DIR)


if __name__ == "__main__":
    main()
