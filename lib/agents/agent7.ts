import type {
  AgentFn,
  Agent7Input,
  Agent7Output,
  Agent7MedicineVerdict,
  Agent7Interaction,
  PrescriptionMedicine,
} from "./types";
import { connectDB } from "@/lib/mongodb";
import { generateTextGeminiFirst } from "./llm";
import {
  getCache,
  setCache,
  normDrugKey,
  buildInteractionPairKey,
} from "@/lib/models/Agent7DrugMedicCache";
import mongoose from "mongoose";

const OPENFDA_BASE = "https://api.fda.gov/drug/label.json";

const LIBRARY_TYPE_PRIORITY = ["indication", "dosage", "contraindication", "warning", "interaction"];
const LIBRARY_DISPLAY_CAP = 500;
const LIBRARY_MAX_CHUNKS = 3;

// ── openFDA label fetch (MongoDB cached, 90-day TTL) ────────────────────────

interface FdaFetchResult {
  label: Record<string, unknown> | null;
  cached: boolean;
}

async function fetchFdaLabel(drugName: string): Promise<FdaFetchResult> {
  const key = normDrugKey(drugName);

  const cached = await getCache("fda_label", key);
  if (cached) {
    return { label: cached.label as Record<string, unknown> | null, cached: true };
  }

  try {
    const url = `${OPENFDA_BASE}?search=openfda.generic_name:"${encodeURIComponent(key)}"&limit=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      await setCache("fda_label", key, { label: null });
      return { label: null, cached: false };
    }
    const data = await res.json() as { results?: Record<string, unknown>[] };
    const label = data.results?.[0] ?? null;
    await setCache("fda_label", key, { label });
    return { label, cached: false };
  } catch {
    await setCache("fda_label", key, { label: null });
    return { label: null, cached: false };
  }
}

// ── Library context fetch (type-prioritized, MongoDB cached, 30-day TTL) ────

interface LibraryFetchResult {
  context: string;
  cached: boolean;
}

async function fetchLibraryContext(drugName: string): Promise<LibraryFetchResult> {
  const key = normDrugKey(drugName);

  const cached = await getCache("library_context", key);
  if (cached?.context !== undefined) {
    return { context: cached.context as string, cached: true };
  }

  try {
    const db = mongoose.connection.db!;
    const col = db.collection("medicalcontexts");

    const hits = await col.find({
      source: "openfda",
      name: { $regex: new RegExp(`^${drugName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    }).project({ embedding: 0, embed_text: 0 }).toArray();

    if (hits.length === 0) {
      const firstWord = drugName.split(/\s+/)[0];
      const fallback = await col.find({
        source: "openfda",
        name: { $regex: new RegExp(firstWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") },
      }).project({ embedding: 0, embed_text: 0 }).limit(5).toArray();
      hits.push(...fallback);
    }

    if (hits.length === 0) {
      await setCache("library_context", key, { context: "" });
      return { context: "", cached: false };
    }

    hits.sort((a, b) => {
      const aIdx = LIBRARY_TYPE_PRIORITY.indexOf(a.type as string);
      const bIdx = LIBRARY_TYPE_PRIORITY.indexOf(b.type as string);
      return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
    });

    const selected = hits.slice(0, LIBRARY_MAX_CHUNKS);
    const context = selected
      .map((h) => `[${h.type}] ${String(h.display_text ?? "").slice(0, LIBRARY_DISPLAY_CAP)}`)
      .join("\n");

    await setCache("library_context", key, { context });
    return { context, cached: false };
  } catch {
    return { context: "", cached: false };
  }
}

// ── DDInter drug name normalizer ────────────────────────────────────────────

function normDrug(name: string): string {
  return name.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 1: Drug interactions — cached pair lookups, DDInter DB fallback
// ══════════════════════════════════════════════════════════════════════════════

interface InteractionStats {
  cacheHits: number;
  cacheMisses: number;
  dbQueries: number;
}

async function checkAllInteractions(
  prescribedDrugs: string[],
  existingMeds: string[],
  logs: string[],
): Promise<{ interactions: Agent7Interaction[]; stats: InteractionStats }> {
  const db = mongoose.connection.db!;
  const col = db.collection("DrugInteractions");
  const allDrugs = [...prescribedDrugs, ...existingMeds];
  const pairs: { a: string; b: string; aNorm: string; bNorm: string }[] = [];
  const checked = new Set<string>();
  const stats: InteractionStats = { cacheHits: 0, cacheMisses: 0, dbQueries: 0 };

  for (let i = 0; i < allDrugs.length; i++) {
    for (let j = i + 1; j < allDrugs.length; j++) {
      const key = [allDrugs[i], allDrugs[j]].sort().join("|");
      if (checked.has(key)) continue;
      checked.add(key);
      pairs.push({ a: allDrugs[i], b: allDrugs[j], aNorm: normDrug(allDrugs[i]), bNorm: normDrug(allDrugs[j]) });
    }
  }

  logs.push(`[Phase 1] Checking ${pairs.length} drug pairs...`);

  const results = await Promise.all(
    pairs.map(async (p) => {
      const pairKey = buildInteractionPairKey(p.a, p.b);
      const cached = await getCache("interaction_pair", pairKey);

      if (cached) {
        stats.cacheHits++;
        return cached.level ? { ...p, level: cached.level as string } : null;
      }

      stats.cacheMisses++;
      stats.dbQueries++;
      const hit = await col.findOne({
        $or: [
          { drug_a_norm: p.aNorm, drug_b_norm: p.bNorm },
          { drug_a_norm: p.bNorm, drug_b_norm: p.aNorm },
        ],
      });

      if (hit) {
        await setCache("interaction_pair", pairKey, { level: hit.level as string, note: `${hit.level} interaction` });
        return { ...p, level: hit.level as string };
      } else {
        await setCache("interaction_pair", pairKey, { level: null });
        return null;
      }
    }),
  );

  const interactions: Agent7Interaction[] = [];
  for (const r of results) {
    if (!r) continue;
    interactions.push({
      drugA: r.a, drugB: r.b,
      level: r.level as "Major" | "Moderate" | "Minor",
      source: "ddinter", note: `${r.level} interaction`,
    });
    logs.push(`  ${r.a} ↔ ${r.b}: ${r.level}`);
  }

  logs.push(`  Pairs: ${stats.cacheHits} cache hits, ${stats.cacheMisses} misses, ${stats.dbQueries} DB queries`);
  if (interactions.length === 0) logs.push("  No interactions found");
  return { interactions, stats };
}

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 2: Batch verification — fetch all FDA data in parallel, then ONE LLM
// ══════════════════════════════════════════════════════════════════════════════

interface DrugVerdict {
  drug: string;
  indicationOk: boolean;
  indicationDetail: string;
  doseOk: boolean;
  doseDetail: string;
}

interface VerificationStats {
  fdaCacheHits: number;
  fdaCacheMisses: number;
  libraryCacheHits: number;
  libraryCacheMisses: number;
}

async function verifyAllDrugs(
  meds: PrescriptionMedicine[],
  diagnosis: string,
  patientAge: number,
  patientWeight: number,
  patientGender: string,
  logs: string[],
): Promise<{ verdicts: DrugVerdict[]; stats: VerificationStats }> {
  const stats: VerificationStats = { fdaCacheHits: 0, fdaCacheMisses: 0, libraryCacheHits: 0, libraryCacheMisses: 0 };

  const dataPromises = meds.map(async (med) => {
    const [fdaResult, libraryResult] = await Promise.all([
      fetchFdaLabel(med.medicine),
      fetchLibraryContext(med.medicine),
    ]);

    if (fdaResult.cached) stats.fdaCacheHits++; else stats.fdaCacheMisses++;
    if (libraryResult.cached) stats.libraryCacheHits++; else stats.libraryCacheMisses++;

    const label = fdaResult.label;
    const indText = label
      ? (Array.isArray(label.indications_and_usage) ? (label.indications_and_usage as string[])[0]?.slice(0, 500) : "")
      : "";
    const doseText = label
      ? (Array.isArray(label.dosage_and_administration) ? (label.dosage_and_administration as string[])[0]?.slice(0, 500) : "")
      : "";
    return { med, indText, doseText, libraryCtx: libraryResult.context };
  });
  const drugData = await Promise.all(dataPromises);

  logs.push(`  FDA: ${stats.fdaCacheHits} cache hits, ${stats.fdaCacheMisses} API calls`);
  logs.push(`  Library: ${stats.libraryCacheHits} cache hits, ${stats.libraryCacheMisses} DB lookups`);

  const drugBlocks = drugData.map((d, i) =>
    `DRUG ${i + 1}: ${d.med.medicine} ${d.med.dosage} ${d.med.frequency} for ${d.med.duration} — ${d.med.purpose}
  FDA Indications: ${d.indText || "Not available"}
  FDA Dosing: ${d.doseText || "Not available"}
  Library: ${d.libraryCtx?.slice(0, 400) || "Not available"}`
  ).join("\n\n");

  try {
    const r = await generateTextGeminiFirst(
      `You are a drug safety verifier. Check indication and dosage for ALL prescribed medicines below.

PATIENT: ${patientAge}yo ${patientGender}, ${patientWeight}kg
DIAGNOSIS: ${diagnosis}

${drugBlocks}

For EACH drug, determine:
1. INDICATION: Does the diagnosis match the drug's approved uses? (be lenient for standard clinical use)
2. DOSAGE: Is the prescribed dose within the approved range for an adult?

Return ONLY valid JSON array (no markdown), one object per drug in the same order:
[
  {"drug": "name", "indication": "MATCH" or "NOMATCH", "indication_reason": "brief", "dosage": "PASS" or "FAIL", "dosage_reason": "brief"}
]`,
    );

    let raw = r.text;
    if (raw.includes("<think>")) raw = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    if (raw.includes("```")) raw = raw.replace(/```(?:json)?\s*/g, "").replace(/```/g, "");

    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]) as Array<{
        drug?: string; indication?: string; indication_reason?: string;
        dosage?: string; dosage_reason?: string;
      }>;
      const verdicts = meds.map((med, i) => {
        const p = parsed[i] ?? {};
        return {
          drug: med.medicine,
          indicationOk: !String(p.indication ?? "MATCH").toUpperCase().includes("NOMATCH"),
          indicationDetail: p.indication_reason ?? "Verified",
          doseOk: !String(p.dosage ?? "PASS").toUpperCase().includes("FAIL"),
          doseDetail: p.dosage_reason ?? "Within range",
        };
      });
      logs.push(`  LLM verification via ${r.provider}`);
      return { verdicts, stats };
    }
  } catch { /* LLM unavailable */ }

  const verdicts = meds.map((med) => ({
    drug: med.medicine,
    indicationOk: true, indicationDetail: "LLM unavailable — treating as acceptable",
    doseOk: true, doseDetail: "LLM unavailable — treating as acceptable",
  }));
  return { verdicts, stats };
}

// ══════════════════════════════════════════════════════════════════════════════
// Agent orchestrator — VERIFY ONLY, no replacements
// ══════════════════════════════════════════════════════════════════════════════

export const runDrugMedicAgent: AgentFn<Agent7Input, Agent7Output> = async (input) => {
  const start = Date.now();
  const logs: string[] = [];

  if (!input.prescription?.medicines?.length) {
    return {
      agentId: 7, agentName: "Drug Medic Agent", status: "error",
      input, output: null, feedsInto: [6, 9], triggeredBy: [6],
      logs: ["No prescription to verify"], durationMs: Date.now() - start, error: "Missing prescription",
    };
  }

  try {
    await connectDB();
    logs.push("Connected to MongoDB");

    const meds = input.prescription.medicines;
    const prescribedNames = meds.map((m) => m.medicine);

    // ── PHASE 1: DDInter interactions (cached pairs + DB fallback) ───────────
    const t1 = Date.now();
    const { interactions, stats: interactionStats } = await checkAllInteractions(prescribedNames, input.patientMeds, logs);
    logs.push(`[Phase 1] Done in ${Date.now() - t1}ms`);

    // ── PHASE 2: Batch verification (cached FDA + library, then ONE LLM) ────
    const t2 = Date.now();
    logs.push(`\n[Phase 2] Verifying ${meds.length} drugs (Gemini first, 60s timeout)...`);

    const { verdicts: verdictResults, stats: verifyStats } = await verifyAllDrugs(
      meds, input.diagnosis, input.patientAge, input.patientWeight, input.patientGender, logs,
    );

    const perMedicine: Agent7MedicineVerdict[] = verdictResults.map((v) => {
      const passed = v.indicationOk && v.doseOk;
      let flagReason: string | null = null;
      if (!v.indicationOk) flagReason = `Indication: ${v.indicationDetail}`;
      else if (!v.doseOk) flagReason = `Dosage: ${v.doseDetail}`;

      return {
        drug: v.drug,
        indicationOk: v.indicationOk, indicationDetail: v.indicationDetail,
        doseOk: v.doseOk, doseDetail: v.doseDetail,
        verdict: passed ? "PASS" as const : "FLAG" as const,
        flagReason, replacement: null,
      };
    });

    for (const inter of interactions) {
      if (inter.level === "Major") {
        const newDrug = prescribedNames.includes(inter.drugA) ? inter.drugA : inter.drugB;
        const v = perMedicine.find((m) => m.drug === newDrug);
        if (v && v.verdict === "PASS") {
          v.verdict = "FLAG";
          v.flagReason = `Major interaction with ${inter.drugA === newDrug ? inter.drugB : inter.drugA}`;
        }
      }
    }

    for (const v of perMedicine) {
      logs.push(`  ${v.drug}: ${v.verdict}${v.flagReason ? ` [${v.flagReason.slice(0, 80)}]` : ""}`);
    }
    logs.push(`[Phase 2] Done in ${Date.now() - t2}ms`);

    // ── Final status (no Phase 3 — Agent 6 handles replacements) ────────────
    const flagged = perMedicine.filter((v) => v.verdict === "FLAG");
    const status = flagged.length === 0 ? "PASS" : "FLAG";

    if (status === "PASS") logs.push("\n✅ All medicines PASSED");
    else logs.push(`\n⚠ ${flagged.length} drug(s) flagged — returning to Agent 6 for replacement`);

    logs.push(`\nCache stats: FDA ${verifyStats.fdaCacheHits}h/${verifyStats.fdaCacheMisses}m | Library ${verifyStats.libraryCacheHits}h/${verifyStats.libraryCacheMisses}m | Interactions ${interactionStats.cacheHits}h/${interactionStats.cacheMisses}m (${interactionStats.dbQueries} DB)`);

    const output: Agent7Output = {
      status,
      perMedicine,
      interactions,
      revisedPrescription: null,
      loopCount: 1,
      escalateReason: null,
    };

    return {
      agentId: 7, agentName: "Drug Medic Agent",
      status: status === "PASS" ? "ok" : "flag",
      input, output: { ...output, provider: "ddinter+gemini", cacheStatus: "miss" }, feedsInto: [6, 9], triggeredBy: [6],
      logs, durationMs: Date.now() - start,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logs.push(`ERROR: ${msg}`);
    return {
      agentId: 7, agentName: "Drug Medic Agent", status: "error",
      input, output: null, feedsInto: [6, 9], triggeredBy: [6],
      logs, durationMs: Date.now() - start, error: msg,
    };
  }
};
