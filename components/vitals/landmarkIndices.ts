// ⚠ These values MUST match ml/src/face_roi.py exactly.
// If you change them here, change them there too (and retrain isn't needed,
// but signal quality will drift if the regions diverge).

export const FOREHEAD_IDX    = [10, 67, 69, 104, 108, 151, 337, 338, 297, 299];
export const LEFT_CHEEK_IDX  = [116, 117, 118, 119, 120, 100, 47, 126, 142];
export const RIGHT_CHEEK_IDX = [345, 346, 347, 348, 349, 329, 277, 355, 371];

export const ROI_NAMES = ["forehead", "left_cheek", "right_cheek"] as const;
export type ROIName = (typeof ROI_NAMES)[number];

export const ROI_LANDMARKS: Record<ROIName, number[]> = {
  forehead:    FOREHEAD_IDX,
  left_cheek:  LEFT_CHEEK_IDX,
  right_cheek: RIGHT_CHEEK_IDX,
};

// YCrCb skin segmentation bounds — must match Python cv2 inRange call
export const SKIN_CR_MIN = 133;
export const SKIN_CR_MAX = 173;
export const SKIN_CB_MIN = 77;
export const SKIN_CB_MAX = 127;

// Reject ROI if fewer than this many valid skin pixels survive
export const MIN_SKIN_PIXELS = 50;
