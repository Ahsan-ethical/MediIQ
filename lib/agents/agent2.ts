import type { AgentFn, TranscriptResult, MedicationMention } from "./types";
import { generateTextGeminiFirst } from "./llm";
import {
  getCache,
  setCache,
  normDrugKey,
} from "@/lib/models/Agent8AllergyCheckCache";

export interface Agent2Input {
  rawTranscript: string;
}

interface GeminiExtractionResult {
  structuredTranscript: { speaker: "doctor" | "patient"; text: string }[];
  chiefComplaint: string;
  mentionedSymptoms: string[];
  mentionedMedications: string[];
  mentionedAllergies: string[];
  duration: string;
  severity: "mild" | "moderate" | "severe";
}

// ── RxNorm lookup (cached in Agent 8's collection, parallel) ────────────────

const RXNORM_BASE = "https://rxnav.nlm.nih.gov/REST";

async function rxFetch(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

interface RxNormResult {
  rxCUI: string | null;
  rxNormName: string | null;
  cached: boolean;
}

async function lookupRxNormCached(drugName: string): Promise<RxNormResult> {
  const drugNameOnly = drugName.replace(/\d+\s*mg/gi, "").trim();
  const key = normDrugKey(drugNameOnly);

  // Check cache — Agent 8 may have written { rxcui } or Agent 2 may have written { rxcui, rxNormName }
  const cached = await getCache("rxcui_resolution", key);
  if (cached?.rxcui && cached.rxNormName) {
    return { rxCUI: cached.rxcui as string, rxNormName: cached.rxNormName as string, cached: true };
  }

  // Cache miss or partial (Agent 8 wrote rxcui without rxNormName) — do full lookup
  // 1. Exact name search
  const exactData = await rxFetch(
    `${RXNORM_BASE}/rxcui.json?name=${encodeURIComponent(drugNameOnly)}&search=2`,
  ) as { idGroup?: { rxnormId?: string[] } } | null;

  const exactId = exactData?.idGroup?.rxnormId?.[0];
  if (exactId) {
    const propData = await rxFetch(
      `${RXNORM_BASE}/rxcui/${exactId}/properties.json`,
    ) as { properties?: { rxcui: string; name: string } } | null;
    if (propData?.properties) {
      const result = { rxCUI: propData.properties.rxcui, rxNormName: propData.properties.name };
      await setCache("rxcui_resolution", key, { rxcui: result.rxCUI, rxNormName: result.rxNormName });
      return { ...result, cached: false };
    }
  }

  // 2. Approximate term (handles misspellings)
  const approxData = await rxFetch(
    `${RXNORM_BASE}/approximateTerm.json?term=${encodeURIComponent(drugNameOnly)}&maxEntries=1`,
  ) as { approximateGroup?: { candidate?: { rxcui: string; name: string }[] } } | null;

  const candidate = approxData?.approximateGroup?.candidate?.[0];
  if (candidate?.rxcui && candidate.name) {
    const result = { rxCUI: candidate.rxcui, rxNormName: candidate.name };
    await setCache("rxcui_resolution", key, { rxcui: result.rxCUI, rxNormName: result.rxNormName });
    return { ...result, cached: false };
  }

  // No match — cache negative result
  await setCache("rxcui_resolution", key, { rxcui: null, rxNormName: null });
  return { rxCUI: null, rxNormName: null, cached: false };
}

// ── Agent implementation ─────────────────────────────────────────────────────

export const runTranscribeAgent: AgentFn<Agent2Input, TranscriptResult> = async (input) => {
  const start = Date.now();
  const logs: string[] = [];
  const { rawTranscript } = input;

  if (!rawTranscript || !rawTranscript.trim()) {
    return {
      agentId: 2, agentName: "Transcribe Agent", status: "error",
      input, output: null, feedsInto: [4, 5, 6], triggeredBy: [], logs: ["No transcript provided"],
      durationMs: Date.now() - start, error: "Missing rawTranscript",
    };
  }

  try {
    // Step 1: Use LLM to structure the transcript
    logs.push(`Received transcript (${rawTranscript.length} chars)`);
    logs.push("Calling LLM to structure transcript (Gemini first, 60s timeout)...");

    const prompt = `You are a medical transcript structurer. Given a raw consultation transcript between a doctor and patient, extract structured clinical data.

## Raw Transcript
${rawTranscript}

## Instructions
Parse the transcript and extract:
1. structuredTranscript: Array of {speaker, text} segments. speaker is "doctor" or "patient". Each turn of speech is one segment.
2. chiefComplaint: A one-line clinical summary of why the patient is here (e.g. "Fever (101°F) for 2 days with productive cough")
3. mentionedSymptoms: Array of specific symptoms with details (duration, severity qualifiers) — e.g. ["Fever 101°F (2 days)", "Productive cough with yellow phlegm (3 days)"]
4. mentionedMedications: Array of drug names the patient mentions taking or being asked about (just the drug name + dosage if stated) — e.g. ["Metformin 500mg", "Paracetamol"]. Include both current ongoing medications and any new/recent drugs mentioned.
5. mentionedAllergies: Array of any allergies mentioned in the conversation. If none mentioned, return empty array.
6. duration: How long the main symptoms have lasted (e.g. "2-3 days", "1 week")
7. severity: Classify as "mild", "moderate", or "severe" based on symptom description

Respond ONLY with valid JSON (no markdown, no backticks):
{
  "structuredTranscript": [{"speaker": "doctor", "text": "..."}],
  "chiefComplaint": "...",
  "mentionedSymptoms": ["..."],
  "mentionedMedications": ["..."],
  "mentionedAllergies": ["..."],
  "duration": "...",
  "severity": "mild|moderate|severe"
}`;

    const llmResult = await generateTextGeminiFirst(prompt);
    let rawText = llmResult.text;
    if (rawText.includes("```")) rawText = rawText.replace(/```(?:json)?\s*/g, "").replace(/```/g, "");
    if (rawText.includes("<think>")) rawText = rawText.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText) as GeminiExtractionResult;

    logs.push(`LLM extraction via ${llmResult.provider} in ${Date.now() - start}ms`);
    logs.push(`Structured: ${parsed.structuredTranscript?.length ?? 0} segments`);
    logs.push(`Chief complaint: ${parsed.chiefComplaint}`);
    logs.push(`Symptoms found: ${parsed.mentionedSymptoms?.length ?? 0}`);
    logs.push(`Medications mentioned: ${parsed.mentionedMedications?.length ?? 0}`);
    logs.push(`Allergies mentioned: ${parsed.mentionedAllergies?.length ?? 0}`);

    // Step 2: Parallel RxNorm normalization (cached)
    const rawMeds = parsed.mentionedMedications ?? [];
    let normalizedMeds: MedicationMention[] = [];
    let rxCacheHits = 0;
    let rxCacheMisses = 0;

    if (rawMeds.length === 0) {
      logs.push("No medications mentioned — skipping RxNorm");
    } else {
      logs.push(`Running RxNorm normalization for ${rawMeds.length} medication(s) (parallel, cached)...`);
      const t2 = Date.now();

      const results = await Promise.all(
        rawMeds.map((rawDrug) => lookupRxNormCached(rawDrug)),
      );

      normalizedMeds = rawMeds.map((rawDrug, i) => {
        const result = results[i];
        if (result.cached) rxCacheHits++; else rxCacheMisses++;

        if (result.rxCUI && result.rxNormName) {
          logs.push(`  ✓ "${rawDrug}" → ${result.rxNormName} (RxCUI: ${result.rxCUI})${result.cached ? " [cached]" : ""}`);
          return {
            raw: rawDrug,
            rxNormName: result.rxNormName,
            rxCUI: result.rxCUI,
            status: "matched" as const,
          };
        } else {
          logs.push(`  ⚠ "${rawDrug}" → UNRECOGNIZED${result.cached ? " [cached negative]" : ""}`);
          return {
            raw: rawDrug,
            rxNormName: null,
            rxCUI: null,
            status: "unrecognized" as const,
          };
        }
      });

      const matchedCount = normalizedMeds.filter((m) => m.status === "matched").length;
      logs.push(`RxNorm complete in ${Date.now() - t2}ms: ${matchedCount} matched, ${normalizedMeds.length - matchedCount} unrecognized (${rxCacheHits} cache hits, ${rxCacheMisses} API lookups)`);
    }

    // Step 3: Build output
    const output: TranscriptResult = {
      structuredTranscript: parsed.structuredTranscript ?? [],
      chiefComplaint: parsed.chiefComplaint ?? "",
      mentionedSymptoms: parsed.mentionedSymptoms ?? [],
      mentionedMedications: normalizedMeds,
      mentionedAllergies: parsed.mentionedAllergies ?? [],
      duration: parsed.duration ?? "",
      severity: parsed.severity ?? "moderate",
    };

    const hasUnrecognized = normalizedMeds.some((m) => m.status === "unrecognized");

    return {
      agentId: 2, agentName: "Transcribe Agent",
      status: hasUnrecognized ? "flag" : "ok",
      input, output: { ...output, provider: llmResult.provider }, feedsInto: [4, 5, 6], triggeredBy: [],
      logs, durationMs: Date.now() - start,
      error: hasUnrecognized ? "Some medications could not be matched in RxNorm" : undefined,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logs.push(`ERROR: ${msg}`);
    return {
      agentId: 2, agentName: "Transcribe Agent", status: "error",
      input, output: null, feedsInto: [4, 5, 6], triggeredBy: [],
      logs, durationMs: Date.now() - start, error: msg,
    };
  }
};
