import {
  ROI_LANDMARKS, ROIName,
  MIN_SKIN_PIXELS,
  SKIN_CR_MIN, SKIN_CR_MAX,
  SKIN_CB_MIN, SKIN_CB_MAX,
} from "./landmarkIndices";
import type { RGB } from "@/types/vitals";

interface Landmark { x: number; y: number; z: number }

function isSkin(r: number, g: number, b: number): boolean {
  const y  =  0.299 * r + 0.587 * g + 0.114 * b;
  const cr = (r - y) * 0.713 + 128;
  const cb = (b - y) * 0.564 + 128;
  return (
    cr >= SKIN_CR_MIN && cr <= SKIN_CR_MAX &&
    cb >= SKIN_CB_MIN && cb <= SKIN_CB_MAX
  );
}

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

  if (countRaw < 5) return null;

  if (count >= MIN_SKIN_PIXELS) {
    return [rSum / count, gSum / count, bSum / count];
  }

  return [rRaw / countRaw, gRaw / countRaw, bRaw / countRaw];
}

export function extractROIsFromImageData(
  img:       ImageData,
  landmarks: Landmark[],
): Record<ROIName, RGB> | null {
  const out: Partial<Record<ROIName, RGB>> = {};

  for (const name of Object.keys(ROI_LANDMARKS) as ROIName[]) {
    const rgb = meanRgbForROI(img, landmarks, ROI_LANDMARKS[name]);
    if (!rgb) return null;
    out[name] = rgb;
  }

  return out as Record<ROIName, RGB>;
}

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

  if (faceW < 0.20 || faceH < 0.20) return "poor";
  if (faceW > 0.80)                  return "poor";
  if (Math.abs(cx - 0.5) > 0.15)    return "poor";
  if (Math.abs(cy - 0.5) > 0.20)    return "poor";

  return "good";
}
