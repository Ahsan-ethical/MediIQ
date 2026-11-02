/**
 * One-time seed: loads condition→ICD10 mappings into a "ConditionLookUp" collection
 * with a normalized match-key for exact lookup.
 *
 * Run with:  npx tsx scripts/seed-condition-lookup.ts
 * Requires:  .env.local with MONGODB_URI
 */

import fs from "fs";
import path from "path";
import mongoose from "mongoose";

// ── Load .env.local manually (same pattern as seed-admin.ts) ─────────────────
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const MONGODB_URI = process.env.MONGODB_URI ?? "";
if (!MONGODB_URI) {
  console.error("MONGODB_URI not found in .env.local");
  process.exit(1);
}

// ── Normalize function (pure, self-contained — Agent 4 will reuse this) ──────

export function normalizeCondition(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, " ")       // punctuation → spaces
    .replace(/\s+/g, " ")           // collapse multiple spaces
    .trim()
    .split(" ")
    .sort()                          // alphabetical word sort
    .join(" ");
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);
  console.log("✓ Connected\n");

  // Load source JSON
  const jsonPath = path.join(__dirname, "../Medical Data/Conditon ic10 Codes/condition_icd10_seed.json");
  const raw: Record<string, string> = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  const entries = Object.entries(raw);
  console.log(`Loaded ${entries.length} condition→ICD10 entries\n`);

  // Build documents
  const docs: { condition: string; condition_norm: string; code: string }[] = [];
  const normMap = new Map<string, string[]>();

  for (const [condition, code] of entries) {
    const norm = normalizeCondition(condition);
    docs.push({ condition, condition_norm: norm, code });

    const existing = normMap.get(norm);
    if (existing) {
      existing.push(condition);
    } else {
      normMap.set(norm, [condition]);
    }
  }

  // Detect normalization collisions
  const collisions: { norm: string; originals: string[] }[] = [];
  for (const [norm, originals] of normMap) {
    if (originals.length > 1) {
      collisions.push({ norm, originals });
    }
  }

  if (collisions.length > 0) {
    console.log(`⚠ Found ${collisions.length} normalization collision(s):`);
    for (const c of collisions) {
      console.log(`  "${c.norm}" ← ${c.originals.map(o => `"${o}"`).join(", ")}`);
    }
    console.log();
  }

  // Idempotent: clear existing data
  const db = mongoose.connection.db!;
  const collection = db.collection("ConditionLookUp");
  const deleted = await collection.deleteMany({});
  if (deleted.deletedCount > 0) {
    console.log(`Wiped ${deleted.deletedCount} existing ConditionLookUp documents`);
  }

  // Insert all
  await collection.insertMany(docs);
  console.log(`Inserted ${docs.length} documents`);

  // Create index (non-unique since collisions may exist)
  const useUnique = collisions.length === 0;
  await collection.createIndex(
    { condition_norm: 1 },
    { unique: useUnique, name: "idx_condition_norm" },
  );
  console.log(`Index created on condition_norm (unique: ${useUnique})`);

  // Summary
  const samples = docs.slice(0, 3);
  console.log("\n========================================");
  console.log("CONDITION LOOKUP SEED COMPLETE");
  console.log(`  Total entries loaded  : ${docs.length}`);
  console.log(`  Index created         : yes (condition_norm, unique: ${useUnique})`);
  console.log(`  Norm collisions found : ${collisions.length}`);
  console.log("\n  Sample documents:");
  for (const s of samples) {
    console.log(`    condition      : "${s.condition}"`);
    console.log(`    condition_norm : "${s.condition_norm}"`);
    console.log(`    code           : "${s.code}"`);
    console.log();
  }
  console.log("========================================\n");

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("SEED FAILED:", e);
  process.exit(1);
});
