import type {
  AgentFn,
  Agent5Input,
  Agent5Output,
  AllergyEntry,
  ExpandedAllergyBlock,
  AllergySeverity,
  AllergyStatus,
} from "./types";
import { connectDB } from "@/lib/mongodb";
import PatientProfile from "@/lib/models/PatientProfile";
import { embedText } from "@/lib/gemini";
import {
  getCache,
  setCache,
  buildFullOutputKey,
  buildAllergenExpansionKey,
  buildQueryEmbeddingKey,
} from "@/lib/models/Agent5AllergyContextCache";
import mongoose from "mongoose";

// ── Profile-level cache (pre-computed on profile save) ──────────────────────

interface ProfileCachedExpansion {
  allergen: string;
  drugClass: string | null;
  classId: string | null;
  avoidDrugs: string[];
}

async function getProfileCachedExpansion(
  patientRef: string | undefined,
  allergen: string,
): Promise<ProfileCachedExpansion | null> {
  if (!patientRef) return null;
  try {
    const profile = await PatientProfile.findOne({ userRef: patientRef })
      .select("allergyExpansionCache").lean();
    const cache = profile?.allergyExpansionCache as { expansions?: ProfileCachedExpansion[] } | null;
    if (!cache?.expansions) return null;
    return cache.expansions.find(
      (e) => e.allergen.toLowerCase() === allergen.toLowerCase(),
    ) ?? null;
  } catch { return null; }
}

// ── RxClass API ─────────────────────────────────────────────────────────────

const RXCLASS_BASE = "https://rxnav.nlm.nih.gov/REST/rxclass";

const ALLERGEN_TO_DRUG: Record<string, string> = {
  penicillin: "amoxicillin",
  sulfonamide: "sulfamethoxazole",
  sulfonamides: "sulfamethoxazole",
  sulfa: "sulfamethoxazole",
  cephalosporin: "cephalexin",
  cephalosporins: "cephalexin",
  nsaid: "ibuprofen",
  nsaids: "ibuprofen",
  aspirin: "aspirin",
  tetracycline: "doxycycline",
  fluoroquinolone: "ciprofloxacin",
  macrolide: "azithromycin",
  statin: "atorvastatin",
  ace_inhibitor: "lisinopril",
};

async function rxFetch(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

interface RxClassInfo { className: string; classId: string }

async function findDrugClass(drugName: string): Promise<RxClassInfo | null> {
  const url = `${RXCLASS_BASE}/class/byDrugName.json?drugName=${encodeURIComponent(drugName)}&relaSource=ATC`;
  const data = await rxFetch(url) as {
    rxclassDrugInfoList?: {
      rxclassDrugInfo?: Array<{ rxclassMinConceptItem?: { className?: string; classId?: string } }>;
    };
  } | null;

  const entries = data?.rxclassDrugInfoList?.rxclassDrugInfo;
  if (!entries?.length) return null;

  const candidates = entries
    .map((e) => e.rxclassMinConceptItem)
    .filter((c): c is RxClassInfo => !!c?.className && !!c?.classId);

  const preferred = candidates.find((c) => /^[A-Z]\d{2}[A-Z]{1,2}$/i.test(c.classId) && !c.className.toLowerCase().includes("combination"));
  return preferred ?? candidates[0] ?? null;
}

async function getClassMembers(classId: string): Promise<string[]> {
  const url = `${RXCLASS_BASE}/classMembers.json?classId=${encodeURIComponent(classId)}&relaSource=ATC`;
  const data = await rxFetch(url) as {
    drugMemberGroup?: { drugMember?: Array<{ minConcept?: { name?: string } }> };
  } | null;

  const members = data?.drugMemberGroup?.drugMember;
  if (!members?.length) return [];

  const names = new Set<string>();
  for (const m of members) {
    const name = m.minConcept?.name;
    if (name) names.add(name);
  }
  return [...names].slice(0, 30);
}

// ── Cross-reactivity knowledge ──────────────────────────────────────────────

const CROSS_REACTIVITY: Record<string, { classes: string[]; note: string }> = {
  penicillin: {
    classes: ["Cephalosporins (1st gen)", "Carbapenems"],
    note: "Penicillin allergy: ~2% cross-reactivity with cephalosporins (higher with 1st-gen); ~1% with carbapenems. Avoid 1st-gen cephalosporins; 3rd/4th-gen generally safe.",
  },
  amoxicillin: {
    classes: ["Cephalosporins (1st gen)", "Carbapenems"],
    note: "Amoxicillin is a penicillin — same cross-reactivity profile as penicillin class.",
  },
  sulfonamide: {
    classes: ["Non-antibiotic sulfonamides (Furosemide, Thiazides)"],
    note: "Sulfonamide antibiotic allergy has low but documented cross-reactivity with non-antibiotic sulfonamides (furosemide, hydrochlorothiazide). Document and monitor.",
  },
  sulfa: {
    classes: ["Non-antibiotic sulfonamides (Furosemide, Thiazides)"],
    note: "Sulfa allergy — same as sulfonamide. Low cross-reactivity with thiazide diuretics.",
  },
  aspirin: {
    classes: ["NSAIDs"],
    note: "Aspirin allergy: cross-reactivity with all COX-1 inhibiting NSAIDs (ibuprofen, naproxen). COX-2 selective (celecoxib) may be tolerated.",
  },
  ibuprofen: {
    classes: ["Other NSAIDs", "Aspirin"],
    note: "NSAID allergy may cross-react with other NSAIDs and aspirin.",
  },
};

// ── Severity → avoid level ──────────────────────────────────────────────────

function computeAvoidLevel(
  severity: AllergySeverity,
  status: AllergyStatus,
): ExpandedAllergyBlock["avoidLevel"] {
  if (status === "confirmed" && severity === "severe") return "hard_block";
  if (status === "confirmed" && severity === "mild") return "strong_caution";
  if (status === "suspected" && severity === "severe") return "likely_block";
  return "monitor";
}

// ── Cached embedding helper ─────────────────────────────────────────────────

async function getCachedEmbedding(query: string): Promise<{ vector: number[]; cached: boolean }> {
  const key = buildQueryEmbeddingKey(query);
  const hit = await getCache("query_embedding", key);
  if (hit?.vector) return { vector: hit.vector as number[], cached: true };
  const vector = await embedText(query);
  await setCache("query_embedding", key, { vector });
  return { vector, cached: false };
}

// ── Vector search helpers (with embedding cache) ────────────────────────────

interface VectorSearchStats {
  embeddingCacheHits: number;
  embeddingCacheMisses: number;
}

async function fetchSafeAlternatives(
  allergen: string,
  stats: VectorSearchStats,
): Promise<string[]> {
  try {
    const db = mongoose.connection.db!;
    const col = db.collection("medicalcontexts");
    const query = `safe antibiotic alternatives for ${allergen} allergic patients`;
    const { vector, cached } = await getCachedEmbedding(query);
    if (cached) stats.embeddingCacheHits++; else stats.embeddingCacheMisses++;

    const results = await col.aggregate([
      {
        $vectorSearch: {
          index: "medicalcontext_vector_index",
          path: "embedding",
          queryVector: vector,
          numCandidates: 20,
          limit: 3,
        },
      },
      { $addFields: { score: { $meta: "vectorSearchScore" } } },
      { $project: { embedding: 0, embed_text: 0 } },
    ]).toArray();

    return results
      .filter(d => ((d.score as number) ?? 0) > 0.75)
      .map(d => ((d.display_text as string) ?? "").slice(0, 200))
      .filter(t => t.length > 20);
  } catch { return []; }
}

async function checkOpenFdaCrossReactivity(
  allergen: string,
  stats: VectorSearchStats,
): Promise<string[]> {
  try {
    const db = mongoose.connection.db!;
    const col = db.collection("medicalcontexts");
    const query = `cross-reactivity contraindication ${allergen} allergy`;
    const { vector, cached } = await getCachedEmbedding(query);
    if (cached) stats.embeddingCacheHits++; else stats.embeddingCacheMisses++;

    const results = await col.aggregate([
      {
        $vectorSearch: {
          index: "medicalcontext_vector_index",
          path: "embedding",
          queryVector: vector,
          filter: { source: "openfda", type: "contraindication" },
          numCandidates: 20,
          limit: 3,
        },
      },
      { $addFields: { score: { $meta: "vectorSearchScore" } } },
      { $project: { embedding: 0, embed_text: 0 } },
    ]).toArray();

    return results
      .filter((d) => ((d.score as number) ?? 0) > 0.75)
      .map((d) => `${d.name}: ${String(d.display_text ?? "").slice(0, 150)}`);
  } catch { return []; }
}

// ── Agent implementation ─────────────────────────────────────────────────────

export const runAllergyContextAgent: AgentFn<Agent5Input, Agent5Output> = async (input) => {
  const start = Date.now();
  const logs: string[] = [];
  const timings: Record<string, number> = {};
  let rxClassCalls = 0;
  let libraryQueries = 0;
  let fullOutputCacheHit = false;
  let allergenExpansionCacheHits = 0;
  let allergenExpansionCacheMisses = 0;
  let profileCacheHits = 0;
  const vectorStats: VectorSearchStats = { embeddingCacheHits: 0, embeddingCacheMisses: 0 };

  try {
    await connectDB();
    logs.push("Connected to MongoDB");

    // ── L1: Full output cache ─────────────────────────────────────────────────
    const fullKey = buildFullOutputKey(input);
    logs.push(`Full output cache key: ${fullKey}`);
    const cachedFull = await getCache("full_output", fullKey);
    if (cachedFull) {
      fullOutputCacheHit = true;
      logs.push("FULL OUTPUT CACHE HIT — returning cached result");
      return {
        agentId: 5, agentName: "Allergy Context Agent", status: "ok",
        input, output: { ...(cachedFull as unknown as Agent5Output), provider: "cache", cacheStatus: "hit" },
        feedsInto: [6, 8], triggeredBy: [2], logs, durationMs: Date.now() - start,
      };
    }
    logs.push("Full output cache miss — running pipeline");

    // ── Step 1: Collect all allergies ─────────────────────────────────────────
    const t1 = Date.now();
    const allAllergies: AllergyEntry[] = [];

    for (const a of (input.knownAllergies ?? [])) {
      allAllergies.push(a);
    }
    for (const mention of (input.consultationMentions ?? [])) {
      if (!allAllergies.some((a) => a.allergen.toLowerCase() === mention.toLowerCase())) {
        allAllergies.push({ allergen: mention, severity: "mild", status: "suspected", source: "consultation_mention" });
      }
    }
    for (const s of (input.suspectedFromFeedback ?? [])) {
      if (!allAllergies.some((a) => a.allergen.toLowerCase() === s.allergen.toLowerCase())) {
        allAllergies.push(s);
      }
    }

    logs.push(`Collected ${allAllergies.length} allergy entries: ${allAllergies.map((a) => `${a.allergen} (${a.status}/${a.severity})`).join(", ")}`);
    timings.step1_collect = Date.now() - t1;

    if (allAllergies.length === 0) {
      logs.push("No allergies to expand — returning empty output");
      const emptyOutput: Agent5Output = {
        allAllergies: [], expanded: [], crossReactivityFlags: [],
        safeAlternativesSummary: {},
        trace: { rxClassCalls: 0, rxNormCalls: 0, libraryQueries: 0, timings },
      };
      return {
        agentId: 5, agentName: "Allergy Context Agent", status: "ok",
        input, output: { ...emptyOutput, provider: "rxclass", cacheStatus: "miss" },
        feedsInto: [6, 8], triggeredBy: [2], logs, durationMs: Date.now() - start,
      };
    }

    // ── Step 2: Expand each allergy ──────────────────────────────────────────
    const t2 = Date.now();
    const expanded: ExpandedAllergyBlock[] = [];
    const crossReactivityFlags: string[] = [];
    const safeAlternativesSummary: Record<string, string[]> = {};

    for (const allergy of allAllergies) {
      const name = allergy.allergen;
      const nameLower = name.toLowerCase();
      logs.push(`\nExpanding: "${name}" (${allergy.status}/${allergy.severity})`);

      // ── L2: Per-allergen expansion cache (Agent 5's own collection) ────────
      const expKey = buildAllergenExpansionKey(name);
      const cachedExp = await getCache("allergen_expansion", expKey);

      if (cachedExp?.expanded) {
        allergenExpansionCacheHits++;
        const block = cachedExp.expanded as unknown as ExpandedAllergyBlock;
        // Re-apply current severity/status (may differ from cached)
        block.severity = allergy.severity;
        block.status = allergy.status;
        block.source = allergy.source;
        block.avoidLevel = computeAvoidLevel(allergy.severity, allergy.status);
        expanded.push(block);

        if (cachedExp.crossReactivityNotes) {
          crossReactivityFlags.push(...(cachedExp.crossReactivityNotes as string[]));
        }
        if (cachedExp.safeAlts && Array.isArray(cachedExp.safeAlts) && (cachedExp.safeAlts as string[]).length > 0) {
          safeAlternativesSummary[name] = cachedExp.safeAlts as string[];
        }
        logs.push(`  L2 CACHE HIT: ${block.drugClass ?? "no class"}, ${block.avoidDrugs.length} avoid drugs, ${block.crossReactivity.length} cross-react, ${block.safeAlternatives.length} alternatives`);
        continue;
      }
      allergenExpansionCacheMisses++;

      // ── Profile cache (pre-computed drug class + members) ──────────────────
      const profileCached = await getProfileCachedExpansion(input.patientRef, name);
      let classInfo: RxClassInfo | null = null;
      let avoidDrugs: string[] = [];

      if (profileCached && profileCached.avoidDrugs.length > 1) {
        classInfo = profileCached.drugClass && profileCached.classId
          ? { className: profileCached.drugClass, classId: profileCached.classId }
          : null;
        avoidDrugs = profileCached.avoidDrugs;
        profileCacheHits++;
        logs.push(`  Profile cache HIT: ${profileCached.drugClass ?? "no class"} (${avoidDrugs.length} drugs)`);
      } else {
        const lookupName = ALLERGEN_TO_DRUG[nameLower] ?? name;
        classInfo = await findDrugClass(lookupName);
        rxClassCalls++;

        if (!classInfo && lookupName !== name) {
          classInfo = await findDrugClass(name);
          rxClassCalls++;
        }

        if (classInfo) {
          logs.push(`  RxClass: ${classInfo.className} (${classInfo.classId})`);
          avoidDrugs = await getClassMembers(classInfo.classId);
          rxClassCalls++;
          logs.push(`  Members: ${avoidDrugs.length} drugs in class`);
        } else {
          logs.push(`  RxClass: no class found for "${name}" — using allergen name only`);
          avoidDrugs = [name];
        }
      }

      // ── Cross-reactivity (hardcoded) ──────────────────────────────────────
      const crossReact: string[] = [];
      const crNotes: string[] = [];
      const crData = CROSS_REACTIVITY[nameLower];
      if (crData) {
        crossReact.push(...crData.classes);
        crNotes.push(crData.note);
        crossReactivityFlags.push(crData.note);
        logs.push(`  Cross-reactivity: ${crData.classes.join(", ")}`);
      }

      // ── openFDA + safe alternatives (PARALLEL) ───────────────────────────
      const [fdaCross, alternatives] = await Promise.all([
        checkOpenFdaCrossReactivity(name, vectorStats),
        fetchSafeAlternatives(name, vectorStats),
      ]);
      libraryQueries += 2;

      if (fdaCross.length) {
        crossReact.push(...fdaCross.map((c) => c.slice(0, 100)));
        logs.push(`  openFDA cross-reactivity: ${fdaCross.length} entries`);
      }

      const avoidLevel = computeAvoidLevel(allergy.severity, allergy.status);
      logs.push(`  Avoid level: ${avoidLevel}`);

      if (alternatives.length) {
        safeAlternativesSummary[name] = alternatives;
        logs.push(`  Safe alternatives: ${alternatives.length} found`);
      }

      const block: ExpandedAllergyBlock = {
        allergen: name,
        severity: allergy.severity,
        status: allergy.status,
        source: allergy.source,
        drugClass: classInfo?.className ?? null,
        classId: classInfo?.classId ?? null,
        avoidDrugs,
        avoidLevel,
        crossReactivity: crossReact,
        safeAlternatives: alternatives,
      };
      expanded.push(block);

      // ── Save to L2 cache ──────────────────────────────────────────────────
      await setCache("allergen_expansion", expKey, {
        expanded: block,
        crossReactivityNotes: crNotes,
        safeAlts: alternatives,
      });
      logs.push(`  Cached expansion for "${name}" with 30-day sliding TTL`);
    }

    timings.step2_expand = Date.now() - t2;

    // ── Assemble output ─────────────────────────────────────────────────────
    const output: Agent5Output = {
      allAllergies,
      expanded,
      crossReactivityFlags: [...new Set(crossReactivityFlags)],
      safeAlternativesSummary,
      trace: {
        rxClassCalls,
        rxNormCalls: 0,
        libraryQueries,
        timings,
        fullOutputCacheHit: fullOutputCacheHit ? 1 : 0,
        allergenExpansionCacheHits,
        allergenExpansionCacheMisses,
        profileCacheHits,
        embeddingCacheHits: vectorStats.embeddingCacheHits,
        embeddingCacheMisses: vectorStats.embeddingCacheMisses,
      } as Agent5Output["trace"],
    };

    logs.push(`\nDone: ${expanded.length} allergies expanded, ${crossReactivityFlags.length} cross-reactivity flags`);

    // ── Save full output to L1 cache ────────────────────────────────────────
    await setCache("full_output", fullKey, output as unknown as Record<string, unknown>);
    logs.push("Full output cached with 30-day sliding TTL");

    return {
      agentId: 5, agentName: "Allergy Context Agent", status: "ok",
      input, output: { ...output, provider: "rxclass", cacheStatus: "miss" },
      feedsInto: [6, 8], triggeredBy: [2], logs, durationMs: Date.now() - start,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logs.push(`ERROR: ${msg}`);
    return {
      agentId: 5, agentName: "Allergy Context Agent", status: "error",
      input, output: null, feedsInto: [6, 8], triggeredBy: [2],
      logs, durationMs: Date.now() - start, error: msg,
    };
  }
};
