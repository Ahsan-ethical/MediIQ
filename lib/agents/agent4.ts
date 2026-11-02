import type {
  AgentFn,
  Agent4Input,
  Agent4Output,
  Agent4ConditionEntry,
  Agent4RetrievedChunk,
  Agent4EvidenceSummary,
} from "./types";
import { connectDB } from "@/lib/mongodb";
import { embedText } from "@/lib/gemini";
import {
  resolveConditionCode,
  fetchMedlinePlusConnect,
} from "./condition-resolver";
import { generateText } from "./llm";
import {
  getCache,
  setCache,
  buildFullOutputKey,
  buildRetrievalQueryKey,
  buildQueryEmbeddingKey,
} from "@/lib/models/Agent4MedicalContextCache";
import mongoose from "mongoose";
import crypto from "crypto";

// Tracks the actual TEXT-LLM provider used for reasoning (gemini/deepseek/ollama).
// Note: vector search always uses Gemini EMBEDDINGS — that's a separate requirement,
// not the reasoning model. The provider badge should reflect the reasoning LLM.
let _agent4LlmProvider = "llm";

// ── Query type filters for vector search ────────────────────────────────────

const QUERY_TYPE_FILTERS: Record<number, string[]> = {
  0: ["condition"],                          // Q1: symptom management
  1: ["contraindication", "warning"],        // Q2: prescribing cautions
  2: ["condition"],                          // Q3: symptoms + conditions
  3: ["interaction", "contraindication"],     // Q4: drug safety
  4: ["warning", "condition"],               // Q5: red flags
};

const MIN_SCORE = 0.80;
const PER_QUERY_LIMIT = 6;
const FINAL_CHUNK_LIMIT = 15;
const MIN_MEDLINEPLUS_DOCS = 5;
const COMBO_COMMA_THRESHOLD = 2;
const COMBO_PENALTY = 0.04;

// ── Helpers ─────────────────────────────────────────────────────────────────

function textHash(text: string): string {
  return crypto.createHash("md5").update(text.trim().toLowerCase()).digest("hex");
}

function isComboProduct(name: string): boolean {
  const commaCount = (name.match(/,/g) ?? []).length;
  return commaCount >= COMBO_COMMA_THRESHOLD;
}

// ── Step 3: Per-condition Gemini summary ─────────────────────────────────────

async function condenseWithGemini(
  title: string,
  code: string | null,
  summary: string,
): Promise<string> {
  const r = await generateText(
    `You are a medical knowledge condenser. Given the official MedlinePlus content below for the condition '${title}' (ICD-10 ${code ?? "unresolved"}), produce a concise clinical summary in plain text covering, in this order:
- Overview (1–2 sentences)
- Key symptoms
- Common causes
- Major complications
- Treatment & management essentials
Be precise. Do NOT add information not present in the source. No markdown.

Source:
${summary}`,
  );
  return r.text;
}

// ── Step 4.1: NLM wsearch for phrasing hints ────────────────────────────────

async function wsearchHints(symptoms: string[]): Promise<string[]> {
  try {
    const term = symptoms.join(" ");
    const url = `https://wsearch.nlm.nih.gov/ws/query?db=healthTopics&term=${encodeURIComponent(term)}&retmax=3`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const text = await res.text();
    const titles: string[] = [];
    const regex = /<content name="title">([^<]+)<\/content>/g;
    let m;
    while ((m = regex.exec(text)) !== null && titles.length < 3) {
      titles.push(m[1].trim());
    }
    return titles;
  } catch {
    return [];
  }
}

// ── Step 4.2: Generate 5 retrieval queries ──────────────────────────────────

async function generateRetrievalQueries(
  symptoms: string[],
  conditions: string[],
  wsearchTopics: string[],
): Promise<string[]> {
  const sympJoined = symptoms.join(", ");
  const condJoined = conditions.length ? conditions.join(", ") : "general patient";
  const hints = wsearchTopics.length
    ? `\nNLM topic hints (for wording inspiration only): ${wsearchTopics.join("; ")}`
    : "";

  const prompt = `Generate exactly 5 medical retrieval queries as a JSON array of strings.

Patient symptoms: ${sympJoined}
Known conditions: ${condJoined}${hints}

Follow this fixed slot pattern:
Q1 — Symptom management: "management of <symptoms joined naturally>"
Q2 — Prescribing cautions: "prescribing considerations and drugs to avoid in ${condJoined}"
Q3 — Intersection: "treating <symptom theme> in patients with ${condJoined}"
Q4 — Drug safety: "drug interactions and contraindications for medications used for <symptoms> in ${condJoined}"
Q5 — Red flags: "warning signs and referral criteria for <symptoms> in ${condJoined}"

${conditions.length === 0 ? "No known conditions: replace Q2/Q3/Q4 with general symptom-only variants but still produce 5 distinct queries." : ""}

Rules:
- Return ONLY a JSON array of exactly 5 strings. No markdown.
- Each query must be at least 6 words.
- No exact duplicates.`;

  try {
    const r = await generateText(prompt);
    const match = r.text.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]) as string[];
      const valid = parsed.filter((q) => typeof q === "string" && q.split(/\s+/).length >= 6);
      const unique = [...new Set(valid)];
      if (unique.length === 5) return unique;
    }
  } catch { /* fall through */ }

  return [
    `management of ${sympJoined}`,
    `prescribing considerations and drugs to avoid in ${condJoined}`,
    `treating ${symptoms[0] ?? "symptoms"} in patients with ${condJoined}`,
    `drug interactions and contraindications for ${sympJoined} medications in ${condJoined}`,
    `warning signs and referral criteria for ${sympJoined} in ${condJoined}`,
  ];
}

// ── Step 5: Filtered vector search with quality controls ────────────────────

interface SearchStats {
  queriesRun: number;
  queryEmbeddingCacheHits: number;
  queryEmbeddingCacheMisses: number;
  rawResults: number;
  afterScoreFilter: number;
  afterTextDedup: number;
  afterSourceBalance: number;
}

async function searchKnowledgeLibrary(
  queries: string[],
  logs: string[],
): Promise<{ chunks: Agent4RetrievedChunk[]; stats: SearchStats }> {
  const db = mongoose.connection.db!;
  const col = db.collection("medicalcontexts");
  const textSeen = new Map<string, Agent4RetrievedChunk & { maxScore: number }>();
  const stats: SearchStats = {
    queriesRun: 0,
    queryEmbeddingCacheHits: 0,
    queryEmbeddingCacheMisses: 0,
    rawResults: 0,
    afterScoreFilter: 0,
    afterTextDedup: 0,
    afterSourceBalance: 0,
  };

  for (let qi = 0; qi < queries.length; qi++) {
    const query = queries[qi];
    const typeFilter = QUERY_TYPE_FILTERS[qi] ?? [];

    try {
      // Embedding cache
      const embKey = buildQueryEmbeddingKey(query);
      const cachedEmb = await getCache("query_embedding", embKey);
      let embedding: number[];
      if (cachedEmb?.vector) {
        embedding = cachedEmb.vector as number[];
        stats.queryEmbeddingCacheHits++;
      } else {
        embedding = await embedText(query);
        await setCache("query_embedding", embKey, { vector: embedding });
        stats.queryEmbeddingCacheMisses++;
      }
      stats.queriesRun++;

      // Build vector search pipeline with type filter
      const searchStage: Record<string, unknown> = {
        index: "medicalcontext_vector_index",
        path: "embedding",
        queryVector: embedding,
        numCandidates: 50,
        limit: PER_QUERY_LIMIT,
      };
      if (typeFilter.length > 0) {
        searchStage.filter = typeFilter.length === 1
          ? { type: typeFilter[0] }
          : { type: { $in: typeFilter } };
      }

      const results = await col.aggregate([
        { $vectorSearch: searchStage },
        { $addFields: { score: { $meta: "vectorSearchScore" } } },
        { $project: { embedding: 0, embed_text: 0 } },
      ]).toArray();

      for (const doc of results) {
        stats.rawResults++;
        let score = (doc.score as number) ?? 0;

        if (score < MIN_SCORE) continue;
        stats.afterScoreFilter++;

        // Combo drug penalty
        const docName = (doc.name as string) ?? "";
        if (isComboProduct(docName)) {
          score -= COMBO_PENALTY;
          if (score < MIN_SCORE) continue;
        }

        const displayText = (doc.display_text as string) ?? "";
        const hash = textHash(displayText);
        const existing = textSeen.get(hash);

        if (existing) {
          if (score > existing.maxScore) existing.maxScore = score;
        } else {
          textSeen.set(hash, {
            text: displayText,
            score,
            source: (doc.source as "openfda" | "medlineplus") ?? "medlineplus",
            sourceMeta: {
              type: doc.type,
              name: docName,
            },
            maxScore: score,
          });
        }
      }
    } catch (err) {
      console.error(`[Agent4] Library search Q${qi + 1} failed:`, err);
    }
  }

  stats.afterTextDedup = textSeen.size;
  logs.push(`Retrieval raw: ${stats.rawResults}, after score ≥${MIN_SCORE}: ${stats.afterScoreFilter}, after text dedup: ${stats.afterTextDedup}`);

  // Source balancing
  const allChunks = [...textSeen.values()].sort((a, b) => b.maxScore - a.maxScore);
  const medlineDocs = allChunks.filter(c => c.source === "medlineplus");
  const openfdaDocs = allChunks.filter(c => c.source === "openfda");

  let balanced: typeof allChunks;
  if (medlineDocs.length >= MIN_MEDLINEPLUS_DOCS) {
    balanced = allChunks.slice(0, FINAL_CHUNK_LIMIT);
  } else {
    const medlineSlice = medlineDocs.slice(0, MIN_MEDLINEPLUS_DOCS);
    const medlineHashes = new Set(medlineSlice.map(c => textHash(c.text)));
    const remaining = openfdaDocs
      .filter(c => !medlineHashes.has(textHash(c.text)))
      .slice(0, FINAL_CHUNK_LIMIT - medlineSlice.length);
    balanced = [...medlineSlice, ...remaining].sort((a, b) => b.maxScore - a.maxScore);
  }

  stats.afterSourceBalance = balanced.length;
  const mlCount = balanced.filter(c => c.source === "medlineplus").length;
  const fdaCount = balanced.filter(c => c.source === "openfda").length;
  logs.push(`Source balance: ${mlCount} medlineplus + ${fdaCount} openfda = ${balanced.length} final chunks`);

  const finalChunks = balanced.map(({ maxScore, ...rest }) => ({ ...rest, score: maxScore }));
  return { chunks: finalChunks, stats };
}

// ── Step 6: Evidence summarization ───────────────────────────────────────────

async function summarizeEvidence(
  chunks: Agent4RetrievedChunk[],
  conditions: string[],
  symptoms: string[],
): Promise<Agent4EvidenceSummary> {
  const topChunks = chunks.slice(0, 10);
  const chunkTexts = topChunks
    .map((c, i) => `[${i + 1}] (${c.source}/${c.sourceMeta.type ?? "?"}) ${c.text.slice(0, 300)}`)
    .join("\n\n");

  const prompt = `You are a clinical evidence summarizer. You MUST extract information from the chunks below and produce a structured JSON summary. Every key MUST have at least 1 bullet if there is any relevant information in the chunks.

Keys (each maps to an array of short, specific bullet strings):
- findings: Key medical facts from the chunks relevant to this patient's symptoms and conditions
- possibleDiagnoses: Conditions suggested by the symptoms, supported by the chunk content
- differentials: Other conditions to rule out, based on the chunk content
- redFlags: Any warnings, contraindications, or danger signs from the chunks — preserve these VERBATIM
- managementConsiderations: Treatment approaches, drug choices, dosing considerations from the chunks
- clinicalInsights: Observations specific to the intersection of this patient's symptoms AND their known conditions

Hard rules:
- Extract from the chunks. If a chunk mentions a drug interaction, contraindication, warning, treatment approach, or clinical fact relevant to this patient — include it.
- Preserve every caution verbatim — phrases like "avoid X in diabetics", "contraindicated in Y", "reduce dose in Z" MUST survive intact.
- Drug label chunks (openfda) contain contraindications, interactions, and dosing — extract the relevant parts.
- MedlinePlus chunks contain condition info and management — extract key points.
- Do NOT add information not found in the chunks.

Patient context:
Known conditions: ${conditions.join(", ") || "none"}
Symptoms (from booking): ${symptoms.join(", ")}

Chunks (source/type noted):
${chunkTexts}

Respond ONLY with valid JSON (no markdown, no backticks). Every array must have at least 1 item.`;

  let parsed: Partial<Agent4EvidenceSummary> = {};
  try {
    const r = await generateText(prompt);
    _agent4LlmProvider = r.provider;
    let raw = r.text;
    if (raw.includes("```")) raw = raw.replace(/```(?:json)?\s*/g, "").replace(/```/g, "");
    if (raw.includes("<think>")) raw = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]) as Agent4EvidenceSummary;
  } catch (err) {
    console.error("[Agent4] Evidence parse error:", err instanceof Error ? err.message : err);
  }

  return {
    findings: parsed.findings ?? [],
    possibleDiagnoses: parsed.possibleDiagnoses ?? [],
    differentials: parsed.differentials ?? [],
    redFlags: parsed.redFlags ?? [],
    managementConsiderations: parsed.managementConsiderations ?? [],
    clinicalInsights: parsed.clinicalInsights ?? [],
  };
}

// ── Agent orchestrator ───────────────────────────────────────────────────────

export const runMedicalContextAgent: AgentFn<Agent4Input, Agent4Output> = async (input) => {
  const start = Date.now();
  const logs: string[] = [];
  const timings: Record<string, number> = {};
  let conditionLookupCacheHits = 0;
  let nihApiCalls = 0;
  let connectCalls = 0;
  let wsearchCalls = 0;
  let fullOutputCacheHit = false;
  let medlineSummaryCacheHits = 0;
  let medlineSummaryCacheMisses = 0;
  let retrievalQueryCacheHit = false;
  let queryEmbeddingCacheHits = 0;
  let queryEmbeddingCacheMisses = 0;

  const { knownConditions, bookingSymptoms } = input;

  if (!bookingSymptoms?.length) {
    return {
      agentId: 4, agentName: "Medical Context Agent", status: "error",
      input, output: null, feedsInto: [6, 7], triggeredBy: [2],
      logs: ["No bookingSymptoms provided"], durationMs: Date.now() - start,
      error: "Missing bookingSymptoms",
    };
  }

  try {
    await connectDB();
    logs.push("Connected to MongoDB");

    // ── L1: Full output cache ─────────────────────────────────────────────────
    const fullKey = buildFullOutputKey(bookingSymptoms, knownConditions ?? []);
    logs.push(`Full output cache key: ${fullKey}`);
    const cachedFull = await getCache("full_output", fullKey);
    if (cachedFull) {
      fullOutputCacheHit = true;
      logs.push("FULL OUTPUT CACHE HIT — returning cached result");
      return {
        agentId: 4, agentName: "Medical Context Agent", status: "ok",
        input, output: { ...(cachedFull as unknown as Agent4Output), provider: "cache", cacheStatus: "hit" },
        feedsInto: [6, 7], triggeredBy: [2], logs, durationMs: Date.now() - start,
      };
    }
    logs.push("Full output cache miss — running pipeline");

    // ── Steps 1-3: Resolve conditions + MedlinePlus + Gemini condensation ────
    const t1 = Date.now();
    const conditions: Agent4ConditionEntry[] = [];

    for (const name of (knownConditions ?? [])) {
      const resolved = await resolveConditionCode(name);
      if (resolved.codeSource === "lookup") conditionLookupCacheHits++;
      if (resolved.codeSource === "nih_api") nihApiCalls++;

      // L2: MedlinePlus summary cache
      let conditionSummary: string;
      let mlTitle: string | null = null;
      let mlUrl: string | null = null;
      let mlSummary: string | null = null;

      if (resolved.icd10Code) {
        const mlCacheKey = resolved.icd10Code;
        const cachedMl = await getCache("medline_summary", mlCacheKey);

        if (cachedMl?.condensedSummary) {
          medlineSummaryCacheHits++;
          conditionSummary = cachedMl.condensedSummary as string;
          mlTitle = (cachedMl.title as string) ?? null;
          mlUrl = (cachedMl.url as string) ?? null;
          mlSummary = (cachedMl.rawSummary as string) ?? null;
          logs.push(`Condition "${name}" → ${resolved.codeSource} (${resolved.icd10Code}) → MedlinePlus CACHE HIT → summary ${conditionSummary.length} chars`);
        } else {
          medlineSummaryCacheMisses++;
          const mlEntry = await fetchMedlinePlusConnect(resolved.icd10Code);
          connectCalls++;
          mlTitle = mlEntry.title;
          mlUrl = mlEntry.url;
          mlSummary = mlEntry.summary;

          if (mlEntry.summary) {
            try {
              conditionSummary = await condenseWithGemini(mlEntry.title ?? name, resolved.icd10Code, mlEntry.summary);
            } catch {
              conditionSummary = mlEntry.summary.slice(0, 500);
              logs.push(`  Gemini condense failed for "${name}", using raw snippet`);
            }
          } else {
            conditionSummary = `No MedlinePlus Connect entry was found for ${name} (code ${resolved.icd10Code}).`;
          }

          await setCache("medline_summary", mlCacheKey, {
            conditionName: name,
            icd10Code: resolved.icd10Code,
            title: mlTitle,
            url: mlUrl,
            rawSummary: mlSummary,
            condensedSummary: conditionSummary,
          });
          logs.push(`Condition "${name}" → ${resolved.codeSource} (${resolved.icd10Code}) → MedlinePlus fetched+cached → summary ${conditionSummary.length} chars`);
        }
      } else {
        conditionSummary = `No MedlinePlus Connect entry was found for ${name} (code unresolved).`;
        logs.push(`Condition "${name}" → ${resolved.codeSource} → no ICD-10 code`);
      }

      conditions.push({
        inputName: name,
        normalized: resolved.normalized,
        icd10Code: resolved.icd10Code,
        codeSource: resolved.codeSource,
        medlinePlusUrl: mlUrl,
        medlinePlusTitle: mlTitle,
        medlinePlusSummary: mlSummary,
        conditionSummary,
      });
    }
    timings.steps1to3 = Date.now() - t1;

    // ── Step 4: Build 5 retrieval queries ────────────────────────────────────
    const t4 = Date.now();
    logs.push("Fetching NLM wsearch hints...");
    const wsTopics = await wsearchHints(bookingSymptoms);
    if (wsTopics.length) wsearchCalls++;
    logs.push(`wsearch topics: ${wsTopics.length ? wsTopics.join("; ") : "(none)"}`);

    const condNames = conditions.map((c) => c.inputName);

    // L3: Retrieval query cache
    const rqKey = buildRetrievalQueryKey(bookingSymptoms, condNames);
    const cachedRQ = await getCache("retrieval_queries", rqKey);
    let retrievalQueries: string[];
    if (cachedRQ?.queries && Array.isArray(cachedRQ.queries) && cachedRQ.queries.length === 5) {
      retrievalQueries = cachedRQ.queries as string[];
      retrievalQueryCacheHit = true;
      logs.push(`Retrieval queries CACHE HIT: ${retrievalQueries.map((q, i) => `Q${i + 1}: "${q}"`).join(" | ")}`);
    } else {
      logs.push("Generating 5 retrieval queries via LLM...");
      retrievalQueries = await generateRetrievalQueries(bookingSymptoms, condNames, wsTopics);
      await setCache("retrieval_queries", rqKey, { queries: retrievalQueries });
      logs.push(`Queries generated+cached: ${retrievalQueries.map((q, i) => `Q${i + 1}: "${q}"`).join(" | ")}`);
    }
    timings.step4 = Date.now() - t4;

    // ── Step 5: Filtered vector search ──────────────────────────────────────
    const t5 = Date.now();
    logs.push("Searching knowledge library (5 filtered vector queries)...");
    const { chunks, stats: searchStats } = await searchKnowledgeLibrary(retrievalQueries, logs);
    queryEmbeddingCacheHits = searchStats.queryEmbeddingCacheHits;
    queryEmbeddingCacheMisses = searchStats.queryEmbeddingCacheMisses;
    logs.push(`Library: ${searchStats.queriesRun} queries (${queryEmbeddingCacheHits} emb cache hits) → ${chunks.length} final chunks`);
    timings.step5 = Date.now() - t5;

    if (chunks.length === 0) {
      logs.push("WARNING: No chunks retrieved from knowledge library");
    }

    // ── Step 6: Evidence summarization ───────────────────────────────────────
    const t6 = Date.now();
    let evidenceSummary: Agent4EvidenceSummary;
    if (chunks.length > 0) {
      logs.push("Summarizing evidence via LLM...");
      evidenceSummary = await summarizeEvidence(chunks, condNames, bookingSymptoms);
      const total = Object.values(evidenceSummary).reduce((s, a) => s + a.length, 0);
      logs.push(
        `Evidence: ${total} items — ` +
        `${evidenceSummary.findings.length} findings, ` +
        `${evidenceSummary.possibleDiagnoses.length} diagnoses, ` +
        `${evidenceSummary.redFlags.length} red flags, ` +
        `${evidenceSummary.managementConsiderations.length} mgmt, ` +
        `${evidenceSummary.clinicalInsights.length} insights`,
      );
    } else {
      evidenceSummary = {
        findings: [], possibleDiagnoses: [], differentials: [],
        redFlags: [], managementConsiderations: [], clinicalInsights: [],
      };
    }
    timings.step6 = Date.now() - t6;

    // ── Assemble output ─────────────────────────────────────────────────────
    const output: Agent4Output = {
      conditions,
      retrievalQueries,
      retrievedChunks: chunks,
      evidenceSummary,
      trace: {
        cacheHits: conditionLookupCacheHits,
        nihApiCalls,
        connectCalls,
        wsearchCalls,
        libraryQueriesRun: searchStats.queriesRun,
        timings,
        fullOutputCacheHit: fullOutputCacheHit ? 1 : 0,
        medlineSummaryCacheHits,
        medlineSummaryCacheMisses,
        retrievalQueryCacheHit: retrievalQueryCacheHit ? 1 : 0,
        queryEmbeddingCacheHits,
        queryEmbeddingCacheMisses,
      },
    };

    // ── Save full output to L1 cache ────────────────────────────────────────
    await setCache("full_output", fullKey, output as unknown as Record<string, unknown>);
    logs.push("Full output cached with 30-day sliding TTL");

    return {
      agentId: 4, agentName: "Medical Context Agent", status: "ok",
      input, output: { ...output, provider: `${_agent4LlmProvider} + medlineplus + vector`, cacheStatus: "miss" },
      feedsInto: [6, 7], triggeredBy: [2], logs, durationMs: Date.now() - start,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logs.push(`ERROR: ${msg}`);
    return {
      agentId: 4, agentName: "Medical Context Agent", status: "error",
      input, output: null, feedsInto: [6, 7], triggeredBy: [2],
      logs, durationMs: Date.now() - start, error: msg,
    };
  }
};
