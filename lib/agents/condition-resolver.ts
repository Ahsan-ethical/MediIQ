import mongoose from "mongoose";

// ── Normalize (pure, reusable by seed scripts and Agent 4) ───────────────────

export function normalizeCondition(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .sort()
    .join(" ");
}

function tokenOverlap(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  let hits = 0;
  for (const w of setA) if (setB.has(w)) hits++;
  return hits;
}

// ── Step 1: Resolve ICD-10 code ──────────────────────────────────────────────

export interface ResolvedCondition {
  inputName: string;
  normalized: string;
  icd10Code: string | null;
  codeSource: "lookup" | "nih_api" | "unresolved";
}

export async function resolveConditionCode(
  name: string,
): Promise<ResolvedCondition> {
  const normalized = normalizeCondition(name);
  const db = mongoose.connection.db!;
  const col = db.collection("ConditionLookUp");

  // Ensure index (idempotent)
  await col.createIndex({ condition_norm: 1 }, { unique: true }).catch(() => {});

  // 1.2 Lookup
  const row = await col.findOne({ condition_norm: normalized });
  if (row) {
    return {
      inputName: name,
      normalized,
      icd10Code: row.code as string,
      codeSource: "lookup",
    };
  }

  // 1.4 NIH Clinical Tables fallback
  try {
    const url = `https://clinicaltables.nlm.nih.gov/api/conditions/v3/search?terms=${encodeURIComponent(name)}&ef=icd10cm`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`NIH status ${res.status}`);

    // Response shape: [count, ids[], {icd10cm: [[{code,name}]]}, [[displayName]]]
    const data = await res.json() as [
      number,
      string[],
      { icd10cm?: Array<Array<{ code: string; name: string }>> },
      string[][],
    ];

    const count = data[0] ?? 0;
    const icd10Entries = data[2]?.icd10cm ?? [];
    const displayNames = data[3] ?? [];

    if (count === 0 || icd10Entries.length === 0) {
      return { inputName: name, normalized, icd10Code: null, codeSource: "unresolved" };
    }

    // 1.5 Safety gate: token overlap check against display name
    const matchedName = displayNames[0]?.[0] ?? "";
    const overlap = tokenOverlap(normalized, matchedName);
    if (overlap === 0) {
      return { inputName: name, normalized, icd10Code: null, codeSource: "unresolved" };
    }

    const code = icd10Entries[0]?.[0]?.code;
    if (!code) {
      return { inputName: name, normalized, icd10Code: null, codeSource: "unresolved" };
    }

    // 1.6 Cache-back
    await col.updateOne(
      { condition_norm: normalized },
      { $setOnInsert: { condition: name, condition_norm: normalized, code } },
      { upsert: true },
    ).catch(() => {});

    return { inputName: name, normalized, icd10Code: code, codeSource: "nih_api" };
  } catch {
    return { inputName: name, normalized, icd10Code: null, codeSource: "unresolved" };
  }
}

// ── Step 2: MedlinePlus Connect ──────────────────────────────────────────────

export interface MedlinePlusEntry {
  title: string | null;
  url: string | null;
  summary: string | null;
}

const connectCache = new Map<string, { entry: MedlinePlusEntry; ts: number }>();
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

export async function fetchMedlinePlusConnect(
  icd10Code: string,
): Promise<MedlinePlusEntry> {
  const cached = connectCache.get(icd10Code);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.entry;
  }

  try {
    const url =
      `https://connect.medlineplus.gov/service` +
      `?mainSearchCriteria.v.cs=2.16.840.1.113883.6.90` +
      `&mainSearchCriteria.v.c=${encodeURIComponent(icd10Code)}` +
      `&knowledgeResponseType=application/json` +
      `&informationRecipient.languageCode.c=en`;

    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`Connect status ${res.status}`);

    const data = await res.json() as {
      feed?: {
        entry?: Array<{
          title?: { _value?: string };
          link?: Array<{ href?: string }>;
          summary?: { _value?: string };
        }>;
      };
    };

    const entry = data.feed?.entry?.[0];
    if (!entry) {
      const empty: MedlinePlusEntry = { title: null, url: null, summary: null };
      connectCache.set(icd10Code, { entry: empty, ts: Date.now() });
      return empty;
    }

    const result: MedlinePlusEntry = {
      title: entry.title?._value ?? null,
      url: entry.link?.[0]?.href ?? null,
      summary: entry.summary?._value ?? null,
    };

    // Strip HTML tags from summary
    if (result.summary) {
      result.summary = result.summary.replace(/<[^>]*>/g, "").trim();
    }

    connectCache.set(icd10Code, { entry: result, ts: Date.now() });
    return result;
  } catch {
    return { title: null, url: null, summary: null };
  }
}
