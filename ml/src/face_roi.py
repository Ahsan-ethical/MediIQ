"""
Phase 5 — Face landmark detection and skin ROI extraction.

Uses MediaPipe FaceMesh to locate three skin regions (forehead, left cheek,
right cheek) in each video frame, applies YCrCb skin segmentation within
each polygon, and returns mean (R, G, B) tuples for the surviving pixels.

The three-region approach reduces hair/shadow contamination versus using the
full face bounding box, and averaging them later (SNR-weighted) in the
pipeline gives a more robust rPPG signal.
"""

from __future__ import annotations

import cv2
import numpy as np
import mediapipe as mp

# ---------------------------------------------------------------------------
# MediaPipe landmark index groups for each ROI
# Indices reference the 468-point FaceMesh canonical model
# ---------------------------------------------------------------------------
_FOREHEAD_IDX   = [10, 67, 69, 104, 108, 151, 337, 338, 297, 299]
_LEFT_CHEEK_IDX = [116, 117, 118, 119, 120, 100, 47, 126, 142]
_RIGHT_CHEEK_IDX = [345, 346, 347, 348, 349, 329, 277, 355, 371]

# YCrCb skin-colour bounds (works well under indoor lighting)
_SKIN_LOWER = np.array([0,   133,  77], dtype=np.uint8)   # (Y, Cr, Cb)
_SKIN_UPPER = np.array([255, 173, 127], dtype=np.uint8)

_MIN_SKIN_PIXELS = 50   # discard ROI if fewer valid pixels than this


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def init_face_mesh() -> mp.solutions.face_mesh.FaceMesh:
    """
    Initialise a MediaPipe FaceMesh instance for video-mode tracking.

    Returns:
        Configured FaceMesh context manager (use with `with` or call .close()).
    """
    return mp.solutions.face_mesh.FaceMesh(
        static_image_mode       = False,   # video mode: track across frames
        max_num_faces           = 1,
        refine_landmarks        = False,   # 468 landmarks, not 478
        min_detection_confidence= 0.5,
        min_tracking_confidence = 0.5,
    )


def extract_rois(
    frame_bgr: np.ndarray,
    face_mesh: mp.solutions.face_mesh.FaceMesh,
) -> dict | None:
    """
    Detect face landmarks in one BGR frame and return mean RGB per skin ROI.

    Args:
        frame_bgr: BGR frame from cv2.VideoCapture (H x W x 3, uint8).
        face_mesh: Initialised FaceMesh instance from init_face_mesh().

    Returns:
        Dict with keys 'forehead', 'left_cheek', 'right_cheek'.
        Each value is a (R, G, B) float tuple — mean over valid skin pixels.
        Returns None if no face is detected or all ROIs are invalid.
    """
    h, w = frame_bgr.shape[:2]

    # MediaPipe requires RGB input
    frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    results   = face_mesh.process(frame_rgb)

    if not results.multi_face_landmarks:
        return None

    landmarks = results.multi_face_landmarks[0].landmark

    # Pre-compute YCrCb skin mask for the full frame
    ycrcb     = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2YCrCb)
    skin_mask = cv2.inRange(ycrcb, _SKIN_LOWER, _SKIN_UPPER)  # uint8 255/0

    rois: dict = {}
    for roi_name, idx_list in [
        ("forehead",    _FOREHEAD_IDX),
        ("left_cheek",  _LEFT_CHEEK_IDX),
        ("right_cheek", _RIGHT_CHEEK_IDX),
    ]:
        rgb = _roi_mean_rgb(frame_bgr, landmarks, idx_list, skin_mask, h, w)
        if rgb is None:
            continue
        rois[roi_name] = rgb

    return rois if rois else None


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _landmark_pixels(
    landmarks,
    idx_list: list[int],
    h: int,
    w: int,
) -> np.ndarray:
    """Convert normalised landmark coords to integer pixel (x, y) array."""
    pts = []
    for i in idx_list:
        lm = landmarks[i]
        pts.append([int(lm.x * w), int(lm.y * h)])
    return np.array(pts, dtype=np.int32)


def _roi_mean_rgb(
    frame_bgr: np.ndarray,
    landmarks,
    idx_list: list[int],
    skin_mask: np.ndarray,
    h: int,
    w: int,
) -> tuple[float, float, float] | None:
    """
    Build a polygon mask from landmark indices, intersect with the skin mask,
    and return mean (R, G, B) over the surviving pixels.

    Returns None if fewer than _MIN_SKIN_PIXELS pixels survive.
    """
    pts = _landmark_pixels(landmarks, idx_list, h, w)

    # Polygon mask for this ROI
    poly_mask = np.zeros((h, w), dtype=np.uint8)
    cv2.fillPoly(poly_mask, [pts], 255)

    # Intersection with skin-colour mask
    combined = cv2.bitwise_and(poly_mask, skin_mask)
    valid    = combined > 0

    if valid.sum() < _MIN_SKIN_PIXELS:
        return None

    # frame_bgr channels: B=0, G=1, R=2
    r = float(frame_bgr[:, :, 2][valid].mean())
    g = float(frame_bgr[:, :, 1][valid].mean())
    b = float(frame_bgr[:, :, 0][valid].mean())

    return (r, g, b)
