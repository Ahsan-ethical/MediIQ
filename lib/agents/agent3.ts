import type { AgentFn, SimilarCase, SimilarCasesOutput } from "./types";
import { connectDB } from "@/lib/mongodb";
import Case from "@/lib/models/Case";
import Agent3SimilarCasesCache, { buildCacheKey, newExpiresAt } from "@/lib/models/Agent3SimilarCasesCache";
import { embedText, buildSymptomsEmbeddingText } from "@/lib/gemini";
import { generateText, generateTextGeminiFirst, type LlmProvider } from "./llm";

export interface Agent3Input {
  symptoms: string;
  duration?: string;
  severity?: string;
  additionalNotes?: string;
  patientAge?: number;
  patientConditions?: string[];
}

// ── Step 0: Smart symptom cleaning ─────────────────────────────────────────────
// Only call Gemini if the input looks messy (typos, abbreviations, slang).
// Clean clinical text like "Fever, Headache" skips the LLM call entirely.

const CLEAN_PATTERN = /^[A-Za-z\s,.\-()]+$/;
const NEEDS_CLEANING = /[0-9]{2,}|[A-Z]{4,}|w\/|b\/c|dont|cant|shud|tht|bcoz|plz|pls/;

function looksClean(text: string): boolean {
  return CLEAN_PATTERN.test(text) && !NEEDS_CLEANING.test(text);
}

async function cleanSymptoms(raw: string): Promise<{ cleaned: string; wasLlmCleaned: boolean }> {
  if (looksClean(raw)) {
    return { cleaned: raw.trim(), wasLlmCleaned: false };
  }

  const r = await generateText(
    `You are a medical term normalizer. Fix typos, expand abbreviations, and normalize the symptom text below into clean clinical English. Do NOT add symptoms that aren't mentioned. Do NOT diagnose. Just clean the text.

Input: "${raw}"

Return ONLY the cleaned symptom text, nothing else. No markdown, no quotes, no explanation.`,
  );
  let text = r.text;
  if (text.includes("<think>")) text = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  return { cleaned: text, wasLlmCleaned: true };
}

// ── Step 1: Vector-only search ─────────────────────────────────────────────────

async function vectorSearch(
  cleanedSymptoms: string,
  duration?: string,
  severity?: string,
  additionalNotes?: string,
): Promise<Record<string, unknown>[]> {
  const embText = buildSymptomsEmbeddingText({
    symptoms: cleanedSymptoms,
    duration,
    severity,
    additionalNotes,
  });
  const embedding = await embedText(embText);

  const results = await Case.aggregate([
    {
      $vectorSearch: {
        index: "case_vector_index",
        path: "embedding",
        queryVector: embedding,
        numCandidates: 150,
        limit: 50,
      },
    },
    { $project: { embedding: 0 } },
  ]);

  return results as Record<string, unknown>[];
}

// ── Step 2: Demographic boost ──────────────────────────────────────────────────

function applyDemographicBoost(
  candidates: Record<string, unknown>[],
  patientAge?: number,
  patientConditions?: string[],
): Record<string, unknown>[] {
  return candidates.map((c, rank) => {
    let boost = 0;
    const casePatient = c.patient as Record<string, unknown> | undefined;

    if (patientConditions?.length && casePatient) {
      const caseConditions = (casePatient.knownConditions as string[]) ?? [];
      const overlap = patientConditions.filter((pc) =>
        caseConditions.some((cc) => cc.toLowerCase().includes(pc.toLowerCase()) || pc.toLowerCase().includes(cc.toLowerCase())),
      );
      boost += overlap.length * 0.15;
    }

    if (patientAge && casePatient?.age) {
      const ageDiff = Math.abs(patientAge - (casePatient.age as number));
      if (ageDiff <= 10) boost += 0.05;
    }

    const baseScore = 1 / (1 + rank);
    return { ...c, _score: baseScore + boost };
  }).sort((a, b) => (b._score as number) - (a._score as number));
}

// ── Step 3: Rerank + relevanceNote in ONE Gemini call ──────────────────────────

interface RerankResult {
  indices: number[];
  relevanceNotes: Record<number, string>;
  provider: LlmProvider;
}

async function rerankWithRelevance(
  candidates: Record<string, unknown>[],
  cleanedSymptoms: string,
): Promise<RerankResult> {
  const top15 = candidates.slice(0, 15);

  const caseSummaries = top15.map((c, i) => {
    const p = c.patient as Record<string, unknown> | undefined;
    const meds = (c.prescription as Array<Record<string, unknown>>)
      ?.map((m) => m.medicine)
      .join(", ") ?? "";
    return `[${i}] ${p?.age ?? "?"}yo ${p?.sex ?? "?"}, conditions: ${(p?.knownConditions as string[])?.join(", ") || "none"} | Symptoms: ${c.symptoms} | Dx: ${c.diagnosis} | Rx: ${meds}`;
  }).join("\n");

  try {
    const r = await generateTextGeminiFirst(
      `You are a clinical case relevance ranker. Given a patient's symptoms and 15 candidate similar cases, select the 10 MOST clinically relevant, ordered by relevance.

Patient symptoms: "${cleanedSymptoms}"

Candidate cases:
${caseSummaries}

Consider: symptom overlap, diagnostic similarity, treatment relevance, comorbidity match. Cases with different diagnoses are still relevant (differential diagnosis).

Return ONLY valid JSON in this exact format, no markdown, no explanation:
{"ranked":[{"idx":3,"why":"brief 1-sentence reason"},{"idx":0,"why":"..."},...]}`);

    let text = r.text;
    if (text.includes("<think>")) text = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

    const jsonMatch = text.match(/\{[\s\S]*"ranked"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { ranked: Array<{ idx: number; why: string }> };
      const indices: number[] = [];
      const notes: Record<number, string> = {};
      for (const entry of parsed.ranked) {
        if (entry.idx >= 0 && entry.idx < top15.length && !indices.includes(entry.idx)) {
          indices.push(entry.idx);
          notes[entry.idx] = entry.why ?? "";
        }
      }
      if (indices.length >= 5) {
        return { indices: indices.slice(0, 10), relevanceNotes: notes, provider: r.provider };
      }
    }
  } catch { /* fall through to default */ }

  return {
    indices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter(i => i < candidates.length),
    relevanceNotes: {},
    provider: "gemini",
  };
}

// ── Step 4: Build overall summary from top 10 ──────────────────────────────────

async function buildOverallSummary(
  cases: SimilarCase[],
  cleanedSymptoms: string,
): Promise<{ summary: string; provider: LlmProvider }> {
  const caseLines = cases.map((c, i) =>
    `${i + 1}. ${c.age}yo ${c.gender}, conditions: ${c.knownConditions.join(", ") || "none"} | Symptoms: ${c.symptoms} | Dx: ${c.diagnosis} | Rx: ${c.medicines.join(", ")} | Advice: ${c.advice}`,
  ).join("\n");

  const r = await generateTextGeminiFirst(
    `You are a clinical pattern summarizer. Given 10 similar past cases for a patient presenting with "${cleanedSymptoms}", write a brief aggregate pattern summary (4-6 sentences).

Cases:
${caseLines}

Include:
- Most common diagnoses across these cases (with counts)
- Dominant treatment pattern (most frequently prescribed drugs)
- Any safety concerns or patterns to watch for (e.g. recurring drug interactions, certain drugs avoided)
- Age/condition patterns if relevant

This is suggestive precedent, NOT a recommendation. Write in clinical third-person tone. Do NOT reference individual case numbers. Return ONLY the summary text, no markdown, no headings, no bullet points.`,
  );

  let text = r.text;
  if (text.includes("<think>")) text = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  return { summary: text, provider: r.provider };
}

// ── Agent implementation ─────────────────────────────────────────────────────

export const runSimilarCasesAgent: AgentFn<Agent3Input, SimilarCasesOutput> = async (input) => {
  const start = Date.now();
  const logs: string[] = [];

  if (!input.symptoms?.trim()) {
    return {
      agentId: 3, agentName: "Similar Cases Agent", status: "error",
      input, output: null, feedsInto: [6], triggeredBy: [], logs: ["No symptoms provided"],
      durationMs: Date.now() - start, error: "Missing symptoms",
    };
  }

  try {
    await connectDB();
    logs.push("Connected to MongoDB");

    // ── Cache lookup ──────────────────────────────────────────────────────────
    const cacheKey = buildCacheKey(input.symptoms, input.patientAge, input.patientConditions);
    logs.push(`Cache key: ${cacheKey}`);

    const cached = await Agent3SimilarCasesCache.findOne({ cacheKey });
    if (cached) {
      await Agent3SimilarCasesCache.updateOne(
        { _id: cached._id },
        { $set: { expiresAt: newExpiresAt() }, $inc: { hitCount: 1 } },
      );
      logs.push(`CACHE HIT — sliding TTL extended, hit #${cached.hitCount + 1}, returning cached result`);

      return {
        agentId: 3, agentName: "Similar Cases Agent", status: "ok",
        input, output: { ...cached.result as SimilarCasesOutput, provider: "cache", cacheStatus: "hit" },
        feedsInto: [6], triggeredBy: [], logs, durationMs: Date.now() - start,
      };
    }
    logs.push("Cache miss — running full pipeline");

    // ── Step 0: Smart symptom cleaning ────────────────────────────────────────
    logs.push(`Raw symptoms: "${input.symptoms}"`);
    const { cleaned: cleanedSymptoms, wasLlmCleaned } = await cleanSymptoms(input.symptoms);
    logs.push(wasLlmCleaned
      ? `Cleaned via LLM: "${cleanedSymptoms}"`
      : `Input clean — skipped LLM cleaning: "${cleanedSymptoms}"`);

    // ── Step 1: Vector search ─────────────────────────────────────────────────
    logs.push("Running vector search (numCandidates: 150, limit: 50)...");
    const t1 = Date.now();
    const candidates = await vectorSearch(
      cleanedSymptoms,
      input.duration,
      input.severity,
      input.additionalNotes,
    );
    logs.push(`Vector search: ${candidates.length} candidates (${Date.now() - t1}ms)`);

    if (candidates.length === 0) {
      logs.push("No candidates found — returning empty result");
      const emptyOutput: SimilarCasesOutput = {
        cleanedSymptoms,
        topCases: [],
        overallSummary: "No similar cases found in the case library.",
        searchStats: { vectorCandidates: 0, keywordCandidates: 0, afterDemographicBoost: 0, afterRerank: 0 },
      };
      return {
        agentId: 3, agentName: "Similar Cases Agent", status: "ok",
        input, output: { ...emptyOutput, provider: "gemini+vector" },
        feedsInto: [6], triggeredBy: [], logs, durationMs: Date.now() - start,
      };
    }

    // ── Step 2: Demographic boost ─────────────────────────────────────────────
    const boosted = applyDemographicBoost(candidates, input.patientAge, input.patientConditions);
    logs.push(`Demographic boost applied (age: ${input.patientAge ?? "n/a"}, conditions: ${input.patientConditions?.join(", ") || "none"})`);

    // ── Step 3: Rerank top 15 → top 10 with relevance notes ───────────────────
    logs.push("Reranking top 15 → 10 (Gemini first, Ollama fallback, 60s timeout)...");
    const t3 = Date.now();
    const { indices: rerankedIndices, relevanceNotes, provider: rerankProvider } = await rerankWithRelevance(boosted, cleanedSymptoms);
    logs.push(`Rerank complete via ${rerankProvider}: selected [${rerankedIndices.join(",")}], ${Object.keys(relevanceNotes).length} relevance notes (${Date.now() - t3}ms)`);

    const topCases: SimilarCase[] = rerankedIndices.map((idx, rank) => {
      const c = boosted[idx];
      const p = c.patient as Record<string, unknown> | undefined;
      const meds = (c.prescription as Array<Record<string, unknown>>)
        ?.map((m) => `${m.medicine} ${m.dosage ?? ""}`.trim()) ?? [];

      return {
        caseId: `CASE-${String(c._id).slice(-6).toUpperCase()}`,
        similarity: Math.round((1 - rank * 0.03) * 100) / 100,
        age: (p?.age as number) ?? 0,
        gender: (p?.sex as string) ?? "",
        symptoms: String(c.symptoms ?? ""),
        duration: String(c.duration ?? ""),
        severity: String(c.severity ?? ""),
        diagnosis: String(c.diagnosis ?? ""),
        medicines: meds,
        advice: String(c.advice ?? ""),
        knownConditions: (p?.knownConditions as string[]) ?? [],
        relevanceNote: relevanceNotes[idx] ?? "",
      };
    });

    logs.push(`Top ${topCases.length} cases built (de-identified)`);

    // ── Step 4: Overall summary ───────────────────────────────────────────────
    logs.push("Generating overall pattern summary (Gemini first, Ollama fallback, 60s timeout)...");
    const t4 = Date.now();
    const { summary: overallSummary, provider: summaryProvider } = await buildOverallSummary(topCases, cleanedSymptoms);
    logs.push(`Overall summary generated via ${summaryProvider} (${overallSummary.length} chars, ${Date.now() - t4}ms)`);

    const providerLabel = rerankProvider === summaryProvider
      ? `${rerankProvider}+vector`
      : `${rerankProvider}+${summaryProvider}+vector`;

    const output: SimilarCasesOutput = {
      cleanedSymptoms,
      topCases,
      overallSummary,
      searchStats: {
        vectorCandidates: candidates.length,
        keywordCandidates: 0,
        afterDemographicBoost: boosted.length,
        afterRerank: topCases.length,
      },
    };

    // ── Write cache ───────────────────────────────────────────────────────────
    await Agent3SimilarCasesCache.updateOne(
      { cacheKey },
      {
        $set: {
          cacheKey,
          symptoms: input.symptoms,
          ageBucket: input.patientAge ? `${Math.floor(input.patientAge / 10) * 10}s` : "",
          conditionsHash: (input.patientConditions ?? []).sort().join("|") || "none",
          result: output,
          expiresAt: newExpiresAt(),
          hitCount: 0,
        },
      },
      { upsert: true },
    );
    logs.push("Result cached with 30-day sliding TTL");

    return {
      agentId: 3, agentName: "Similar Cases Agent", status: "ok",
      input, output: { ...output, provider: providerLabel, cacheStatus: "miss" }, feedsInto: [6], triggeredBy: [],
      logs, durationMs: Date.now() - start,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logs.push(`ERROR: ${msg}`);
    return {
      agentId: 3, agentName: "Similar Cases Agent", status: "error",
      input, output: null, feedsInto: [6], triggeredBy: [],
      logs, durationMs: Date.now() - start, error: msg,
    };
  }
};
