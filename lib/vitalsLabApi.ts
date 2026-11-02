import type { VitalsDemographics } from "@/types/vitals";

const API_BASE = process.env.NEXT_PUBLIC_VITALS_API_URL ?? "http://localhost:8000";

export interface LabVitalsResult {
  heart_rate: { value: number; unit: string };
  blood_pressure: {
    systolic:  { value: number; lower: number; upper: number };
    diastolic: { value: number; lower: number; upper: number };
    unit: string;
  } | null;
  classification: { bp: string; hr: string };
  confidence: number;
  signal_source: "camera" | "fallback" | "unknown";
  diagnostics: {
    frames_processed: number;
    duration_sec: number;
    signal_quality: number;
    latency_ms: number;
    model: string;
    engine: string;
    bp_error: string | null;
    bp_model_info?: {
      name: string;
      windows_evaluated: number;
      raw_sbp: number;
      raw_dbp: number;
      nhanes_sbp: number;
      nhanes_dbp: number;
      blend: number;
      mean_window_quality: number;
      adaptive_hr: number | null;
    } | null;
    ensemble?: Record<string, { hr: number; sqi: number }>;
    best_model?: string;
  };
  hrv: {
    sdnn: number | null;
    rmssd: number | null;
    pnn50: number | null;
    lf_hf: number | null;
    breathing_rate: number | null;
  };
}

export async function predictVitalsLab(
  faceCrops: Uint8Array,
  nFrames: number,
  cropSize: number,
  demographics: VitalsDemographics,
  fps: number,
): Promise<LabVitalsResult> {
  const url = `${API_BASE}/api/v1/lab/predict-faces`;

  const compressed = await compressGzip(faceCrops);
  const b64 = uint8ToBase64(compressed);

  console.log("[VitalsLab] POST", url);
  console.log("[VitalsLab] Frames:", nFrames, "CropSize:", cropSize, "Compressed:", compressed.length, "bytes -> b64:", b64.length);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "1",
      },
      body: JSON.stringify({
        face_frames_b64: b64,
        n_frames: nFrames,
        crop_size: cropSize,
        fps,
        demographics,
      }),
    });
  } catch (fetchErr) {
    const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    throw new Error(`Network error: ${msg} (URL: ${url})`);
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status} ${res.statusText}`;
    try {
      const text = await res.text();
      try {
        const err = JSON.parse(text);
        if (err.detail) detail = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail);
      } catch { detail += ` | ${text.slice(0, 300)}`; }
    } catch {}
    throw new Error(detail);
  }

  return (await res.json()) as LabVitalsResult;
}

export async function checkLabHealth(): Promise<{ ok: boolean; model?: string }> {
  const url = `${API_BASE}/api/v1/lab/health`;
  console.log("[VitalsLab] Health check:", url);
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "ngrok-skip-browser-warning": "1" },
    });
    console.log("[VitalsLab] Health status:", res.status, res.headers.get("content-type"));
    if (!res.ok) {
      console.log("[VitalsLab] Health not ok:", res.status, res.statusText);
      return { ok: false };
    }
    const text = await res.text();
    console.log("[VitalsLab] Health body:", text.slice(0, 500));
    try {
      const data = JSON.parse(text);
      return { ok: data.status === "ok", model: data.model };
    } catch {
      console.error("[VitalsLab] Health response not JSON:", text.slice(0, 200));
      return { ok: false };
    }
  } catch (err) {
    console.error("[VitalsLab] Health fetch error:", err);
    return { ok: false };
  }
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function compressGzip(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  writer.write(new Uint8Array(data.buffer, data.byteOffset, data.byteLength) as unknown as BufferSource);
  writer.close();

  const reader = cs.readable.getReader();
  const chunks: Uint8Array[] = [];
  let totalLen = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLen += value.length;
  }

  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
