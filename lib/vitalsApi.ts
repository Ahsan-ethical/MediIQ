import type { RGBSignals, VitalsDemographics, VitalsResult } from "@/types/vitals";

const API_BASE = process.env.NEXT_PUBLIC_VITALS_API_URL ?? "http://localhost:8000";

// ─── Legacy RGB-based prediction (POS + XGBoost) — kept as fallback ─────────

export async function predictVitals(
  rgbSignals:   RGBSignals,
  demographics: VitalsDemographics,
  fps:          number,
): Promise<VitalsResult> {
  const url = `${API_BASE}/api/v1/vitals/predict-rgb`;
  console.log("[vitalsApi] POST", url);

  let res: Response;
  try {
    res = await fetch(url, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "1",
      },
      body: JSON.stringify({ rgb_signals: rgbSignals, fps, demographics }),
    });
  } catch (fetchErr) {
    const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    throw new Error(`Network error: ${msg} (URL: ${url})`);
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status} ${res.statusText}`;
    try {
      const text = await res.text();
      if (text.includes("ngrok") && text.includes("Visit Site")) {
        detail = "ngrok interstitial page returned instead of API response. Visit the ngrok URL in browser first.";
      } else {
        try {
          const err = JSON.parse(text);
          if (err.detail)
            detail = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail);
        } catch { detail += ` | Body: ${text.slice(0, 200)}`; }
      }
    } catch {}
    throw new Error(detail);
  }

  return (await res.json()) as VitalsResult;
}

// ─── DL-based prediction (open-rppg ensemble + ResNet MIMIC-III) ────────────

export async function predictVitalsDL(
  faceCrops:    Uint8Array,
  nFrames:      number,
  cropSize:     number,
  demographics: VitalsDemographics,
  fps:          number,
): Promise<VitalsResult> {
  const url = `${API_BASE}/api/v1/lab/predict-faces`;

  const compressed = await compressGzip(faceCrops);
  const b64 = uint8ToBase64(compressed);

  console.log("[vitalsApi] DL POST", url, "frames:", nFrames, "compressed:", compressed.length);

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

  const data = await res.json();

  const result: VitalsResult = {
    heart_rate: data.heart_rate,
    blood_pressure: data.blood_pressure ?? {
      systolic:  { value: 0, lower: 0, upper: 0 },
      diastolic: { value: 0, lower: 0, upper: 0 },
      unit: "mmHg",
    },
    classification: data.classification,
    confidence: data.confidence,
    diagnostics: {
      frames_processed: data.diagnostics?.frames_processed ?? nFrames,
      duration_sec:     data.diagnostics?.duration_sec ?? 0,
      signal_quality:   data.diagnostics?.signal_quality ?? 0,
      latency_ms:       data.diagnostics?.latency_ms ?? 0,
    },
  };

  console.log("[vitalsApi] DL SUCCESS — HR:", result.heart_rate.value, "BP:", result.blood_pressure.systolic.value);
  return result;
}

// ─── Health checks ──────────────────────────────────────────────────────────

export async function checkVitalsHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/health`, {
      cache: "no-store",
      headers: { "ngrok-skip-browser-warning": "1" },
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.status === "ok" && data.models_loaded === true;
  } catch {
    return false;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

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
