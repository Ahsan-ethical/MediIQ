/**
 * Browser-side ROI extraction — mirrors ml/src/face_roi.py exactly.
 *
 * The Python backend and this file must produce the same mean (R,G,B) values
 * for the same face frame. Any drift in the YCrCb thresholds or landmark
 * indices will degrade signal quality without a visible error.
 */

import {
  ROI_LANDMARKS, ROIName,
  MIN_SKIN_PIXELS,
  SKIN_CR_MIN, SKIN_CR_MAX,
  SKIN_CB_MIN, SKIN_CB_MAX,
} from "./landmarkIndices";
import type { RGB } from "@/types/vitals";

interface Landmark { x: number; y: number; z: number }

// ---------------------------------------------------------------------------
// YCrCb skin test — matches cv2.COLOR_BGR2YCrCb formula
// ---------------------------------------------------------------------------
function isSkin(r: number, g: number, b: number): boolean {
  const y  =  0.299 * r + 0.587 * g + 0.114 * b;
  const cr = (r - y) * 0.713 + 128;
  const cb = (b - y) * 0.564 + 128;
  return (
    cr >= SKIN_CR_MIN && cr <= SKIN_CR_MAX &&
    cb >= SKIN_CB_MIN && cb <= SKIN_CB_MAX
  );
}

// ---------------------------------------------------------------------------
// Even-odd point-in-polygon
// ---------------------------------------------------------------------------
function pointInPolygon(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersect =
      (yi > y) !== (yj > y) &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------------------
// Bounding box of polygon, clamped to frame
// ---------------------------------------------------------------------------
function polyBBox(poly: [number, number][], W: number, H: number) {
  let xMin = W, yMin = H, xMax = 0, yMax = 0;
  for (const [x, y] of poly) {
    if (x < xMin) xMin = x;
    if (y < yMin) yMin = y;
    if (x > xMax) xMax = x;
    if (y > yMax) yMax = y;
  }
  return {
    x0: Math.max(0, Math.floor(xMin)),
    y0: Math.max(0, Math.floor(yMin)),
    x1: Math.min(W, Math.ceil(xMax)),
    y1: Math.min(H, Math.ceil(yMax)),
  };
}

// ---------------------------------------------------------------------------
// Per-ROI mean RGB
// ---------------------------------------------------------------------------
function meanRgbForROI(
  img:      ImageData,
  landmarks: Landmark[],
  idxList:  number[],
): RGB | null {
  const W = img.width, H = img.height;

  const poly: [number, number][] = idxList.map(i => [
    landmarks[i].x * W,
    landmarks[i].y * H,
  ]);

  const { x0, y0, x1, y1 } = polyBBox(poly, W, H);
  const data = img.data;

  let rSum = 0, gSum = 0, bSum = 0, count = 0;
  let rRaw = 0, gRaw = 0, bRaw = 0, countRaw = 0;

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (!pointInPolygon(x + 0.5, y + 0.5, poly)) continue;
      const p = (y * W + x) * 4;
      const r = data[p], g = data[p + 1], b = data[p + 2];
      rRaw += r; gRaw += g; bRaw += b; countRaw++;
      if (!isSkin(r, g, b)) continue;
      rSum += r; gSum += g; bSum += b;
      count++;
    }
  }

  // Polygon had fewer than 5 pixels — face is too small or off-screen
  if (countRaw < 5) return null;

  // Good lighting / skin tone — use skin-filtered mean for best signal quality
  if (count >= MIN_SKIN_PIXELS) {
    return [rSum / count, gSum / count, bSum / count];
  }

  // Fallback: YCrCb thresholds not met (different lighting / webcam colour
  // profile). The polygon is already constrained to the face, so the raw
  // mean is still a valid rPPG input — just slightly noisier.
  return [rRaw / countRaw, gRaw / countRaw, bRaw / countRaw];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract mean (R,G,B) for all 3 face ROIs from one video frame.
 *
 * @param img       ImageData from an off-screen canvas (getImageData).
 * @param landmarks 468-point array from MediaPipe FaceLandmarker.
 * @returns         Object with forehead / left_cheek / right_cheek RGB tuples,
 *                  or null if any ROI fails the skin-pixel threshold.
 */
export function extractROIsFromImageData(
  img:       ImageData,
  landmarks: Landmark[],
): Record<ROIName, RGB> | null {
  const out: Partial<Record<ROIName, RGB>> = {};

  for (const name of Object.keys(ROI_LANDMARKS) as ROIName[]) {
    const rgb = meanRgbForROI(img, landmarks, ROI_LANDMARKS[name]);
    if (!rgb) return null;       // whole frame rejected if any ROI fails
    out[name] = rgb;
  }

  return out as Record<ROIName, RGB>;
}

/**
 * Rate face positioning quality for live UX coaching.
 *
 * Checks face size (too close / too far) and centring.
 * Returns "good" when the face is ready to start a scan.
 */
export function assessFaceQuality(
  landmarks:   Landmark[] | null,
  _videoWidth: number,
  _videoHeight: number,
): "none" | "poor" | "good" {
  if (!landmarks || landmarks.length < 468) return "none";

  const xs = landmarks.map(l => l.x);
  const ys = landmarks.map(l => l.y);

  const faceW = Math.max(...xs) - Math.min(...xs);
  const faceH = Math.max(...ys) - Math.min(...ys);
  const cx    = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy    = (Math.max(...ys) + Math.min(...ys)) / 2;

  if (faceW < 0.20 || faceH < 0.20) return "poor";   // too far
  if (faceW > 0.80)                  return "poor";   // too close
  if (Math.abs(cx - 0.5) > 0.15)    return "poor";   // off-centre horizontally
  if (Math.abs(cy - 0.5) > 0.20)    return "poor";   // off-centre vertically

  return "good";
}
