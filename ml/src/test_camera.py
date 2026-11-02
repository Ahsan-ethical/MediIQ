"""
Phase 5 — End-to-end camera pipeline test.

Usage:
    cd ml/
    python src/test_camera.py <path_to_video>
    python src/test_camera.py                     # defaults to test_videos/sample.mp4

The script runs the full pipeline:
    video -> face ROI extraction -> POS algorithm -> resample -> features -> predict_bp()

Demographics are hardcoded for development testing.
Replace with your actual values when running your own video.
"""

from __future__ import annotations

import sys
import os
import time
from pathlib import Path

# Suppress mediapipe / TF log noise before any imports
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
os.environ["GLOG_minloglevel"]      = "3"

# Add src/ to path so sibling imports work
sys.path.insert(0, str(Path(__file__).parent))

from rppg_pipeline import video_to_features
from predict import predict_bp
from classifier import classify_bp

# ---------------------------------------------------------------------------
# Test demographics — change these to match whoever recorded the video
# ---------------------------------------------------------------------------
TEST_DEMOGRAPHICS = {
    "age":    25,
    "sex":    "M",
    "height": 175.0,   # cm
    "weight": 70.0,    # kg
}

DEFAULT_VIDEO = Path(__file__).resolve().parent.parent / "test_videos" / "sample.mp4"


# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------

def _sep(char: str = "=", width: int = 60) -> str:
    return char * width


def _print_prediction(result: dict, sq: float, diag: dict) -> None:
    bp    = result["blood_pressure"]
    hr    = result["heart_rate"]
    cls   = result["classification"]
    conf  = result["confidence"]

    sbp   = bp["systolic"]
    dbp   = bp["diastolic"]

    print(_sep())
    print("  VITALS PREDICTION")
    print(_sep())
    print(f"  Blood Pressure")
    print(f"    Systolic  : {sbp['value']} mmHg"
          f"  (90% range: {sbp['lower']} – {sbp['upper']})")
    print(f"    Diastolic : {dbp['value']} mmHg"
          f"  (90% range: {dbp['lower']} – {dbp['upper']})")
    print(f"    Category  : {cls['bp']}")
    print()
    print(f"  Heart Rate  : {hr['value']} bpm  ({cls['hr']})")
    print()
    print(f"  Confidence  : {conf}  (signal quality: {sq})")
    print()
    print(_sep("-"))
    print("  DIAGNOSTICS")
    print(_sep("-"))
    print(f"  Frames processed : {diag['frames_processed']}")
    print(f"  Frames rejected  : {diag['frames_rejected']}"
          f"  ({diag['frames_rejected'] / max(1, diag['frames_processed'] + diag['frames_rejected']) * 100:.1f}%)")
    print(f"  Duration         : {diag['duration_sec']} s")
    print(f"  Signal quality   : {sq}")

    # Show key features
    if diag.get("features"):
        feats = diag["features"]
        print()
        print("  Key PPG features:")
        for key in ("hr_final", "rmssd", "sdnn", "pulse_width",
                    "rise_time", "aug_index", "notch_ratio"):
            val = feats.get(key)
            if val is not None:
                print(f"    {key:<16} {val:.3f}")
    print(_sep())


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    # --- Resolve video path ---
    if len(sys.argv) > 1:
        video_path = sys.argv[1]
    else:
        video_path = str(DEFAULT_VIDEO)

    if not Path(video_path).exists():
        print(f"ERROR: Video file not found: {video_path}")
        print()
        print("To record a test video, see the instructions at the bottom of")
        print("this script, or record directly in the terminal with:")
        print()
        print("  ffmpeg -f dshow -i video='<your webcam name>' "
              "-t 30 test_videos/sample.mp4")
        sys.exit(1)

    print(_sep())
    print("  MediIQ rPPG Pipeline — Phase 5 Test")
    print(_sep())
    print(f"  Video  : {video_path}")
    print(f"  Subject: Age {TEST_DEMOGRAPHICS['age']}  "
          f"Sex {TEST_DEMOGRAPHICS['sex']}  "
          f"Height {TEST_DEMOGRAPHICS['height']} cm  "
          f"Weight {TEST_DEMOGRAPHICS['weight']} kg")
    print(_sep())

    # --- Run pipeline ---
    t0 = time.time()
    print("Processing video...")
    pipeline_out = video_to_features(video_path)
    elapsed = time.time() - t0
    print(f"  Pipeline finished in {elapsed:.1f}s")

    # --- Check for errors ---
    if pipeline_out["error"]:
        print()
        print(f"  ERROR: {pipeline_out['error']}")
        print(f"  Frames processed : {pipeline_out['frames_processed']}")
        print(f"  Frames rejected  : {pipeline_out['frames_rejected']}")
        sys.exit(1)

    features       = pipeline_out["features"]
    signal_quality = pipeline_out["signal_quality"]

    # --- Run BP prediction ---
    print("\nRunning BP prediction...")
    prediction = predict_bp(
        features       = features,
        signal_quality = signal_quality,
        **TEST_DEMOGRAPHICS,
    )

    # --- Print results ---
    print()
    _print_prediction(
        result = prediction,
        sq     = signal_quality,
        diag   = pipeline_out,
    )


if __name__ == "__main__":
    main()


# ---------------------------------------------------------------------------
# HOW TO RECORD YOUR TEST VIDEO
# ---------------------------------------------------------------------------
# Requirements:
#   - 30 seconds, stable lighting (natural or bright indoor)
#   - Face fills ~30-50% of frame, looking directly at camera
#   - Keep still — avoid turning head or moving in/out of frame
#   - Save as test_videos/sample.mp4
#
# Option A — Windows Camera app:
#   Open Camera app -> Video mode -> Record 30s -> Save to test_videos/
#
# Option B — OBS Studio (free):
#   Sources -> Video Capture Device -> Record 30s -> Remux to mp4
#
# Option C — PowerShell + ffmpeg (if ffmpeg is installed):
#   ffmpeg -f dshow -i video="Integrated Camera" -t 30 test_videos/sample.mp4
#   (replace "Integrated Camera" with your webcam name from: ffmpeg -list_devices true -f dshow -i dummy)
#
# Option D — Python one-liner (opencv):
#   python -c "
#   import cv2, time
#   cap = cv2.VideoCapture(0)
#   out = cv2.VideoWriter('test_videos/sample.mp4',
#         cv2.VideoWriter_fourcc(*'mp4v'), 30, (640,480))
#   t0 = time.time()
#   while time.time()-t0 < 30:
#       ret,f = cap.read()
#       if ret: out.write(f); cv2.imshow('Recording',f); cv2.waitKey(1)
#   cap.release(); out.release(); cv2.destroyAllWindows()
#   print('Saved test_videos/sample.mp4')
#   "
#
# Then run:
#   cd ml/
#   python src/test_camera.py test_videos/sample.mp4
# ---------------------------------------------------------------------------
