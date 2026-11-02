"""
A7 — Smoke test: send real ROI signals through the HTTP endpoint.

Extracts ROI RGB from a video with face_roi.py, posts to the FastAPI server,
and prints the prediction response.

Usage (server must be running first):
    cd ml/
    python api/run.py          # terminal 1
    python api/test_client.py test_videos/sample.mp4   # terminal 2
"""

import sys
import json
import cv2
import requests
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

import os
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
os.environ.setdefault("GLOG_minloglevel", "3")

from face_roi import init_face_mesh, extract_rois

API_URL = "http://localhost:8000/api/v1/vitals/predict-rgb"

TEST_DEMOGRAPHICS = {"age": 25, "sex": "M", "height": 175.0, "weight": 70.0}


def extract_rgb_from_video(video_path: str) -> tuple[dict, float]:
    """Read all frames, run face detection, return ROI RGB lists + effective fps."""
    cap  = cv2.VideoCapture(video_path)
    fps  = cap.get(cv2.CAP_PROP_FPS) or 30.0
    step = max(1, round(fps / 30.0))
    effective_fps = fps / step

    forehead, left_cheek, right_cheek = [], [], []
    fm  = init_face_mesh()
    idx = 0

    print(f"  Extracting ROIs from {video_path} ...", end="", flush=True)
    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            if idx % step == 0:
                rois = extract_rois(frame, fm)
                if rois:
                    forehead.append(list(rois.get("forehead",    (0.0, 0.0, 0.0))))
                    left_cheek.append(list(rois.get("left_cheek", (0.0, 0.0, 0.0))))
                    right_cheek.append(list(rois.get("right_cheek",(0.0, 0.0, 0.0))))
            idx += 1
    finally:
        fm.close()
        cap.release()

    n = min(len(forehead), len(left_cheek), len(right_cheek))
    print(f" {n} frames")

    return {
        "forehead":    forehead[:n],
        "left_cheek":  left_cheek[:n],
        "right_cheek": right_cheek[:n],
    }, effective_fps


def main() -> None:
    video = sys.argv[1] if len(sys.argv) > 1 else "test_videos/sample.mp4"
    if not Path(video).exists():
        print(f"ERROR: Video not found: {video}")
        sys.exit(1)

    # Check server health
    try:
        health = requests.get("http://localhost:8000/api/v1/health", timeout=3).json()
        print(f"Server: {health}")
        if not health.get("models_loaded"):
            print("WARNING: Models not loaded on server — predictions may fail")
    except requests.exceptions.ConnectionError:
        print("ERROR: Server not reachable. Start it with: python api/run.py")
        sys.exit(1)

    rgb, fps = extract_rgb_from_video(video)
    n = len(rgb["forehead"])
    print(f"  {n} frames @ {fps:.1f} fps — payload ~{n * 9 * 4 / 1024:.1f} KB")

    payload = {
        "rgb_signals":  rgb,
        "fps":          fps,
        "demographics": TEST_DEMOGRAPHICS,
    }

    print(f"\nPOST {API_URL} ...")
    try:
        resp = requests.post(API_URL, json=payload, timeout=30)
    except requests.exceptions.Timeout:
        print("ERROR: Request timed out (>30s)")
        sys.exit(1)

    print(f"Status: {resp.status_code}")
    if resp.ok:
        print(json.dumps(resp.json(), indent=2))
    else:
        print(f"Error body: {resp.text}")
        sys.exit(1)


if __name__ == "__main__":
    main()
