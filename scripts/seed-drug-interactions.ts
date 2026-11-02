/**
 * One-time seed: loads DDInter drug-drug interaction CSVs into a
 * "DrugInteractions" MongoDB collection with normalized drug names.
 *
 * Run with:  npx tsx scripts/seed-drug-interactions.ts
 * Requires:  .env.local with MONGODB_URI
 */

import fs from "fs";
import path from "path";
import mongoose from "mongoose";

// ── Load .env.local ──────────────────────────────────────────────────────────
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

// ── CSV parser (handles quoted fields with commas inside) ────────────────────

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

// ── Normalize drug name (for indexed lookup) ─────────────────────────────────

function normDrug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, "")  // strip parenthetical qualifiers like "(topical)"
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);
  console.log("✓ Connected\n");

  const db = mongoose.connection.db!;
  const col = db.collection("DrugInteractions");

  // Idempotent: wipe existing
  const deleted = await col.deleteMany({});
  if (deleted.deletedCount > 0) {
    console.log(`Wiped ${deleted.deletedCount} existing DrugInteractions documents`);
  }

  // Load all CSVs
  const dirPath = path.join(__dirname, "../Medical Data/DDInter");
  const csvFiles = fs.readdirSync(dirPath).filter((f) => f.endsWith(".csv"));
  console.log(`Found ${csvFiles.length} CSV files\n`);

  const VALID_LEVELS = new Set(["Major", "Moderate", "Minor"]);
  const batch: Array<{
    drug_a: string;
    drug_b: string;
    drug_a_norm: string;
    drug_b_norm: string;
    level: string;
    ddi_id_a: string;
    ddi_id_b: string;
  }> = [];

  let totalClean = 0;
  let totalSkipped = 0;
  const levelCounts: Record<string, number> = { Major: 0, Moderate: 0, Minor: 0 };

  for (const file of csvFiles) {
    const filePath = path.join(dirPath, file);
    const lines = fs.readFileSync(filePath, "utf-8").split("\n").filter(Boolean);
    let fileClean = 0;
    let fileSkipped = 0;

    for (let i = 1; i < lines.length; i++) {
      const fields = parseCSVLine(lines[i]);
      if (fields.length < 5) { fileSkipped++; continue; }

      const [ddiIdA, drugA, ddiIdB, drugB, level] = fields;
      const lvl = level?.trim();

      if (!VALID_LEVELS.has(lvl) || !drugA || !drugB) {
        fileSkipped++;
        continue;
      }

      batch.push({
        drug_a: drugA,
        drug_b: drugB,
        drug_a_norm: normDrug(drugA),
        drug_b_norm: normDrug(drugB),
        level: lvl,
        ddi_id_a: ddiIdA,
        ddi_id_b: ddiIdB,
      });

      levelCounts[lvl]++;
      fileClean++;

      // Batch insert every 5000
      if (batch.length >= 5000) {
        await col.insertMany(batch);
        batch.length = 0;
      }
    }

    totalClean += fileClean;
    totalSkipped += fileSkipped;
    console.log(`  ${file}: ${fileClean} clean, ${fileSkipped} skipped`);
  }

  // Insert remaining
  if (batch.length > 0) {
    await col.insertMany(batch);
  }

  // Create compound index for fast pair lookup (both directions)
  await col.createIndex({ drug_a_norm: 1, drug_b_norm: 1 }, { name: "idx_pair_ab" });
  await col.createIndex({ drug_b_norm: 1, drug_a_norm: 1 }, { name: "idx_pair_ba" });

  // Verify
  const docCount = await col.countDocuments();

  // Sample queries
  const sample1 = await col.findOne({ drug_a_norm: "metformin" });
  const sample2 = await col.findOne({ drug_a_norm: "amlodipine" });
  const sample3 = await col.findOne({ drug_a_norm: "azithromycin" });

  console.log("\n========================================");
  console.log("DRUG INTERACTIONS SEED COMPLETE");
  console.log(`  Documents inserted : ${docCount}`);
  console.log(`  Major interactions : ${levelCounts.Major}`);
  console.log(`  Moderate           : ${levelCounts.Moderate}`);
  console.log(`  Minor              : ${levelCounts.Minor}`);
  console.log(`  Skipped (bad CSV)  : ${totalSkipped}`);
  console.log(`  Indexes created    : idx_pair_ab, idx_pair_ba`);
  console.log("\n  Sample lookups:");
  if (sample1) console.log(`    metformin ↔ ${sample1.drug_b} → ${sample1.level}`);
  if (sample2) console.log(`    amlodipine ↔ ${sample2.drug_b} → ${sample2.level}`);
  if (sample3) console.log(`    azithromycin ↔ ${sample3.drug_b} → ${sample3.level}`);
  console.log("========================================\n");

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("SEED FAILED:", e);
  process.exit(1);
});
