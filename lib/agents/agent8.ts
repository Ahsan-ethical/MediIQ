import type {
  AgentFn,
  Agent8Input,
  Agent8Output,
  Agent8DrugCheck,
  ExpandedAllergyBlock,
} from "./types";
import {
  getCache,
  setCache,
  normDrugKey,
} from "@/lib/models/Agent8AllergyCheckCache";

const RXNORM_BASE = "https://rxnav.nlm.nih.gov/REST";

// ── RxNorm: resolve drug name → RxCUI (MongoDB cached, permanent) ───────────

interface RxCUIResult {
  rxcui: string | null;
  cached: boolean;
}

async function getRxCUI(drugName: string): Promise<RxCUIResult> {
  const key = normDrugKey(drugName);

  const cached = await getCache("rxcui_resolution", key);
  if (cached) {
    return { rxcui: (cached.rxcui as string) ?? null, cached: true };
  }

  try {
    const url = `${RXNORM_BASE}/rxcui.json?name=${encodeURIComponent(drugName)}&search=2`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) {
      await setCache("rxcui_resolution", key, { rxcui: null });
      return { rxcui: null, cached: false };
    }
    const data = await res.json() as { idGroup?: { rxnormId?: string[] } };
    const rxcui = data.idGroup?.rxnormId?.[0] ?? null;
    await setCache("rxcui_resolution", key, { rxcui });
    return { rxcui, cached: false };
  } catch {
    await setCache("rxcui_resolution", key, { rxcui: null });
    return { rxcui: null, cached: false };
  }
}

// ── RxClass: get class members (RxCUIs) — MongoDB cached, permanent ─────────

interface ClassMemberResult {
  cuis: Set<string>;
  cached: boolean;
}

async function getClassMemberCUIs(classId: string): Promise<ClassMemberResult> {
  const cached = await getCache("class_member_cuis", classId);
  if (cached?.cuis) {
    return { cuis: new Set(cached.cuis as string[]), cached: true };
  }

  try {
    const url = `${RXNORM_BASE}/rxclass/classMembers.json?classId=${encodeURIComponent(classId)}&relaSource=ATC`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      await setCache("class_member_cuis", classId, { cuis: [] });
      return { cuis: new Set(), cached: false };
    }
    const data = await res.json() as {
      drugMemberGroup?: { drugMember?: Array<{ minConcept?: { rxcui?: string } }> };
    };
    const members = data.drugMemberGroup?.drugMember ?? [];
    const cuis = new Set<string>();
    for (const m of members) {
      if (m.minConcept?.rxcui) cuis.add(m.minConcept.rxcui);
    }
    await setCache("class_member_cuis", classId, { cuis: [...cuis] });
    return { cuis, cached: false };
  } catch {
    await setCache("class_member_cuis", classId, { cuis: [] });
    return { cuis: new Set(), cached: false };
  }
}

// ── Build a name-based avoid set from the allergy blocks ─────────────────────

function buildNameAvoidSet(blocks: ExpandedAllergyBlock[]): Map<string, ExpandedAllergyBlock> {
  const map = new Map<string, ExpandedAllergyBlock>();
  for (const block of blocks) {
    map.set(block.allergen.toLowerCase(), block);
    for (const drug of block.avoidDrugs) {
      map.set(drug.toLowerCase(), block);
    }
  }
  return map;
}

// ── Determine verdict from avoid level ───────────────────────────────────────

function avoidLevelToVerdict(level: ExpandedAllergyBlock["avoidLevel"]): Agent8DrugCheck["verdict"] {
  switch (level) {
    case "hard_block": return "HARD_BLOCK";
    case "strong_caution": return "STRONG_CAUTION";
    case "likely_block": return "LIKELY_BLOCK";
    case "monitor": return "MONITOR";
    default: return "MONITOR";
  }
}

// ── Cross-reactivity name check ──────────────────────────────────────────────

function checkCrossReactivity(
  drugName: string,
  blocks: ExpandedAllergyBlock[],
): ExpandedAllergyBlock | null {
  const lower = drugName.toLowerCase();
  for (const block of blocks) {
    for (const cr of block.crossReactivity) {
      if (cr.toLowerCase().includes(lower) || lower.includes(cr.toLowerCase().split(" ")[0])) {
        return block;
      }
    }
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════════════
// Agent implementation — VERIFY ONLY, no replacements
// ══════════════════════════════════════════════════════════════════════════════

export const runAllergyAgent: AgentFn<Agent8Input, Agent8Output> = async (input) => {
  const start = Date.now();
  const logs: string[] = [];
  let rxcuiCacheHits = 0;
  let rxcuiCacheMisses = 0;
  let classCacheHits = 0;
  let classCacheMisses = 0;

  if (!input.prescription?.medicines?.length) {
    return {
      agentId: 8, agentName: "Allergy Agent", status: "error",
      input, output: null, feedsInto: [6, 9], triggeredBy: [6],
      logs: ["No prescription to check"], durationMs: Date.now() - start, error: "Missing prescription",
    };
  }

  const blocks = input.allergyBlocks ?? [];
  if (blocks.length === 0) {
    logs.push("No allergy blocks provided — all drugs PASS by default");
    const checks: Agent8DrugCheck[] = input.prescription.medicines.map((m) => ({
      drug: m.medicine, violates: null, classMatch: null,
      allergySeverity: null, allergyStatus: null, verdict: "PASS" as const, replacement: null,
    }));
    return {
      agentId: 8, agentName: "Allergy Agent", status: "ok",
      input,
      output: { status: "PASS", checks, revisedPrescription: null, flaggedCount: 0, passedCount: checks.length },
      feedsInto: [6, 9], triggeredBy: [6], logs, durationMs: Date.now() - start,
    };
  }

  logs.push(`Checking ${input.prescription.medicines.length} drugs against ${blocks.length} allergy block(s)`);

  // ── Step 1: Build avoid sets ───────────────────────────────────────────────
  const t1 = Date.now();
  const nameAvoidSet = buildNameAvoidSet(blocks);
  logs.push(`Name-based avoid set: ${nameAvoidSet.size} entries`);

  const cuiAvoidMap = new Map<string, ExpandedAllergyBlock>();
  const classBlocks = blocks.filter((b) => b.classId);

  const classResults = await Promise.all(
    classBlocks.map((b) => getClassMemberCUIs(b.classId!)),
  );

  for (let i = 0; i < classBlocks.length; i++) {
    if (classResults[i].cached) classCacheHits++; else classCacheMisses++;
    for (const cui of classResults[i].cuis) {
      cuiAvoidMap.set(cui, classBlocks[i]);
    }
  }
  logs.push(`RxCUI-based avoid set: ${cuiAvoidMap.size} CUIs from ${classBlocks.length} class(es) (${classCacheHits} cache hits, ${classCacheMisses} API calls)`);
  logs.push(`Avoid sets built in ${Date.now() - t1}ms`);

  // ── Step 2: Check each drug ───────────────────────────────────────────────
  const t2 = Date.now();
  const meds = input.prescription.medicines;
  const checks: Agent8DrugCheck[] = [];

  // First pass: name-based check (instant, no API)
  const nameResults: (ExpandedAllergyBlock | null)[] = [];
  const needsRxCUI: number[] = [];

  for (let i = 0; i < meds.length; i++) {
    const drugLower = meds[i].medicine.toLowerCase();
    const nameHit = nameAvoidSet.get(drugLower);
    nameResults.push(nameHit ?? null);
    if (!nameHit) {
      needsRxCUI.push(i);
    }
  }

  logs.push(`Name check: ${meds.length - needsRxCUI.length} matched, ${needsRxCUI.length} need RxCUI resolution`);

  // Second pass: resolve RxCUI ONLY for drugs that passed name check
  const rxcuiResults = new Map<number, string | null>();
  if (needsRxCUI.length > 0 && cuiAvoidMap.size > 0) {
    const resolutions = await Promise.all(
      needsRxCUI.map((idx) => getRxCUI(meds[idx].medicine)),
    );
    for (let j = 0; j < needsRxCUI.length; j++) {
      const result = resolutions[j];
      if (result.cached) rxcuiCacheHits++; else rxcuiCacheMisses++;
      rxcuiResults.set(needsRxCUI[j], result.rxcui);
    }
    logs.push(`RxCUI resolved: ${rxcuiCacheHits} cache hits, ${rxcuiCacheMisses} API calls`);
  }

  // Build final verdicts
  for (let i = 0; i < meds.length; i++) {
    const drug = meds[i].medicine;
    let violated: ExpandedAllergyBlock | null = null;
    let matchType = "";

    // Check 1: Name match (already done)
    if (nameResults[i]) {
      violated = nameResults[i];
      matchType = `name match in ${violated!.allergen} avoid list`;
    }

    // Check 2: RxCUI class match (only if name check passed)
    if (!violated && rxcuiResults.has(i)) {
      const drugCUI = rxcuiResults.get(i);
      if (drugCUI) {
        const cuiHit = cuiAvoidMap.get(drugCUI);
        if (cuiHit) {
          violated = cuiHit;
          matchType = `RxCUI ${drugCUI} in ${cuiHit.allergen} class (${cuiHit.classId})`;
        }
      }
    }

    // Check 3: Cross-reactivity (only if checks 1+2 passed)
    if (!violated) {
      const crHit = checkCrossReactivity(drug, blocks);
      if (crHit) {
        violated = crHit;
        matchType = `cross-reactivity with ${crHit.allergen}`;
      }
    }

    if (violated) {
      const verdict = avoidLevelToVerdict(violated.avoidLevel);
      logs.push(`  ❌ ${drug}: ${verdict} — ${matchType}`);
      checks.push({
        drug,
        violates: `${violated.allergen} allergy (${violated.status}, ${violated.severity})`,
        classMatch: violated.drugClass ?? violated.allergen,
        allergySeverity: violated.severity,
        allergyStatus: violated.status,
        verdict,
        replacement: null,
      });
    } else {
      logs.push(`  ✅ ${drug}: PASS`);
      checks.push({
        drug, violates: null, classMatch: null,
        allergySeverity: null, allergyStatus: null, verdict: "PASS", replacement: null,
      });
    }
  }

  logs.push(`Allergy checks done in ${Date.now() - t2}ms`);

  // ── Final output ──────────────────────────────────────────────────────────
  const flagged = checks.filter((c) => c.verdict !== "PASS");
  const status = flagged.length === 0 ? "PASS" : "FLAG";

  if (status === "PASS") logs.push("\n✅ All medicines SAFE — no allergy violations");
  else logs.push(`\n⚠ ${flagged.length} allergy violation(s) found — returning to Agent 6 for replacement`);

  logs.push(`\nCache stats: RxCUI ${rxcuiCacheHits}h/${rxcuiCacheMisses}m | ClassMembers ${classCacheHits}h/${classCacheMisses}m`);

  const output: Agent8Output = {
    status,
    checks,
    revisedPrescription: null,
    flaggedCount: flagged.length,
    passedCount: checks.length - flagged.length,
  };

  return {
    agentId: 8, agentName: "Allergy Agent",
    status: status === "PASS" ? "ok" : "flag",
    input, output: { ...output, provider: "rxclass", cacheStatus: "miss" }, feedsInto: [6, 9], triggeredBy: [6],
    logs, durationMs: Date.now() - start,
  };
};
