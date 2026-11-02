export interface VitalsResult {
  heart_rate: { value: number; unit: string };
  blood_pressure: {
    systolic:  { value: number; lower: number; upper: number };
    diastolic: { value: number; lower: number; upper: number };
    unit: string;
  };
  classification: { bp: string; hr: string };
  confidence: number;
  diagnostics?: {
    frames_processed: number;
    duration_sec: number;
    signal_quality: number;
    latency_ms: number;
  };
}

export type RGB = [number, number, number];

export interface RGBSignals {
  forehead:    RGB[];
  left_cheek:  RGB[];
  right_cheek: RGB[];
}

export interface VitalsDemographics {
  age: number;
  sex: "M" | "F" | "MALE" | "FEMALE" | "Male" | "Female";
  height?: number;
  weight?: number;
}

export type FaceQuality = "none" | "poor" | "good";

export type ScanState =
  | "intro"
  | "permission"
  | "brightness"
  | "positioning"
  | "scanning"
  | "processing"
  | "done"
  | "error";
