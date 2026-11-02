/**
 * One-time seed: embeds MedlinePlus conditions + openFDA common drugs into a
 * single "medicalContext" collection for Agent 4 RAG.
 *
 * Run with:  npx tsx scripts/seed-medical-context.ts
 * Requires:  .env.local with MONGODB_URI and GEMINI_API_KEY
 */

import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "../.env.local") });

const MONGODB_URI = process.env.MONGODB_URI!;
const GEMINI_KEY = process.env.GEMINI_API_KEY!;

if (!MONGODB_URI || !GEMINI_KEY) {
  console.error("Missing MONGODB_URI or GEMINI_API_KEY in .env.local");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

const DELAY_MS = 350;
const WORD_CAP = 400;
const BATCH_INSERT = 50;

// ── Inline schema ────────────────────────────────────────────────────────────

const MedicalContextSchema = new mongoose.Schema(
  {
    source: { type: String, required: true, enum: ["medlineplus", "openfda"] },
    type: {
      type: String,
      required: true,
      enum: ["condition", "indication", "dosage", "contraindication", "warning", "interaction"],
    },
    name: { type: String, required: true },
    embed_text: { type: String, required: true },
    display_text: { type: String, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    embedding: { type: [Number], required: true },
  },
  { timestamps: true },
);

const MedicalContext =
  mongoose.models.MedicalContext ||
  mongoose.model("MedicalContext", MedicalContextSchema);

// ── Helpers ──────────────────────────────────────────────────────────────────

async function embed(text: string): Promise<number[]> {
  const result = await embeddingModel.embedContent(text);
  return result.embedding.values;
}

function capWords(text: string, max: number): string {
  const words = text.split(/\s+/);
  if (words.length <= max) return text;
  return words.slice(0, max).join(" ") + "…";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── MedlinePlus chunking ─────────────────────────────────────────────────────

interface MedlinePlusTopic {
  id: string;
  title: string;
  url: string;
  summary: string;
  also_called: string[];
  groups: string[];
  mesh: string[];
  related_topics: string[];
}

interface Chunk {
  source: "medlineplus" | "openfda";
  type: string;
  name: string;
  embed_text: string;
  display_text: string;
  metadata: Record<string, unknown>;
}

const QUESTION_RE = /(?=(?:What is|What are|What causes|What happens|How is|How are|How do|Who is|Who gets|When should|Can I|Do I|Is there|Are there|Should I)[\s?])/i;

function chunkMedlinePlus(topic: MedlinePlusTopic): Chunk[] {
  const alsoKnown = topic.also_called?.length ? topic.also_called.join(", ") : "none";
  const categories = topic.groups?.length ? topic.groups.join(", ") : "General";
  const headerPrefix = `Condition: ${topic.title}. Also known as: ${alsoKnown}. Category: ${categories}.`;

  const summary = (topic.summary ?? "").trim();
  if (!summary) return [];

  const wordCount = summary.split(/\s+/).length;
  const meta = {
    url: topic.url,
    groups: topic.groups ?? [],
    also_called: topic.also_called ?? [],
    mesh: topic.mesh ?? [],
  };

  // Short/medium topics → single chunk
  if (wordCount <= WORD_CAP || !QUESTION_RE.test(summary)) {
    return [
      {
        source: "medlineplus",
        type: "condition",
        name: topic.title,
        embed_text: `${headerPrefix} ${summary}`,
        display_text: summary,
        metadata: meta,
      },
    ];
  }

  // Long structured topics → split at question headers
  const sections = summary.split(QUESTION_RE).filter((s) => s.trim().length > 20);

  if (sections.length <= 1) {
    return [
      {
        source: "medlineplus",
        type: "condition",
        name: topic.title,
        embed_text: `${headerPrefix} ${summary}`,
        display_text: summary,
        metadata: meta,
      },
    ];
  }

  return sections.map((section) => {
    const trimmed = section.trim();
    const firstSentence = trimmed.split(/[.?!]/)[0] ?? "";
    const sectionLabel = firstSentence.slice(0, 80);
    return {
      source: "medlineplus" as const,
      type: "condition",
      name: topic.title,
      embed_text: `${headerPrefix} [${sectionLabel}] ${trimmed}`,
      display_text: trimmed,
      metadata: meta,
    };
  });
}

// ── openFDA chunking ─────────────────────────────────────────────────────────

interface OpenFDADrug {
  generic_name: string;
  brand_name: string;
  rxcui: string[];
  route: string[];
  indications?: string;
  dosage?: string;
  contraindications?: string;
  warnings?: string;
  boxed_warning?: string;
  drug_interactions?: string;
}

const OPENFDA_FIELDS: { key: keyof OpenFDADrug; type: string; label: string }[] = [
  { key: "indications", type: "indication", label: "Indications" },
  { key: "dosage", type: "dosage", label: "Dosage" },
  { key: "contraindications", type: "contraindication", label: "Contraindications" },
  { key: "warnings", type: "warning", label: "Warnings" },
  { key: "boxed_warning", type: "warning", label: "Boxed Warning" },
  { key: "drug_interactions", type: "interaction", label: "Drug Interactions" },
];

function chunkOpenFDA(drug: OpenFDADrug): Chunk[] {
  const chunks: Chunk[] = [];
  const name = drug.generic_name ?? "";
  if (!name) return [];

  const meta = {
    rxcui: drug.rxcui ?? [],
    brand_name: drug.brand_name ?? "",
    route: drug.route ?? [],
  };

  for (const field of OPENFDA_FIELDS) {
    const raw = drug[field.key] as string | undefined;
    if (!raw || !raw.trim()) continue;

    // Strip the FDA section header noise (e.g. "INDICATIONS AND USAGE")
    const cleaned = raw
      .replace(/^[A-Z\s]+AND\s+[A-Z\s]+/m, "")
      .replace(/^\s*\d+(\.\d+)?\s+/gm, "")
      .trim();

    const capped = capWords(cleaned, WORD_CAP);

    chunks.push({
      source: "openfda",
      type: field.type,
      name,
      embed_text: `Drug: ${name}. ${field.label}: ${capped}`,
      display_text: capped,
      metadata: meta,
    });
  }

  return chunks;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);
  console.log("✓ Connected\n");

  // Idempotent: wipe existing data
  const deleted = await MedicalContext.deleteMany({});
  if (deleted.deletedCount > 0) {
    console.log(`Wiped ${deleted.deletedCount} existing medicalContext documents`);
  }

  // ── Load sources ───────────────────────────────────────────────────────────
  const mlPath = path.join(__dirname, "../Medical Data/MedinePlus/medlineplus_clean.json");
  const fdaPath = path.join(__dirname, "../Medical Data/OpenFDA Drug Labels/openfda_common_drugs.json");

  const mlTopics: MedlinePlusTopic[] = JSON.parse(fs.readFileSync(mlPath, "utf-8"));
  const fdaDrugs: OpenFDADrug[] = JSON.parse(fs.readFileSync(fdaPath, "utf-8"));

  console.log(`MedlinePlus topics loaded: ${mlTopics.length}`);
  console.log(`openFDA common drugs loaded: ${fdaDrugs.length}\n`);

  // ── Chunk ──────────────────────────────────────────────────────────────────
  const allChunks: Chunk[] = [];

  for (const topic of mlTopics) {
    allChunks.push(...chunkMedlinePlus(topic));
  }
  const mlChunkCount = allChunks.length;
  console.log(`MedlinePlus chunks: ${mlChunkCount} (from ${mlTopics.length} topics)`);

  for (const drug of fdaDrugs) {
    allChunks.push(...chunkOpenFDA(drug));
  }
  const fdaChunkCount = allChunks.length - mlChunkCount;
  console.log(`openFDA chunks: ${fdaChunkCount} (from ${fdaDrugs.length} drugs)`);
  console.log(`Total chunks to embed: ${allChunks.length}\n`);

  // ── Embed + insert ─────────────────────────────────────────────────────────
  let embedded = 0;
  let failures = 0;
  const failedChunks: string[] = [];
  const insertBatch: Record<string, unknown>[] = [];
  let totalInserted = 0;

  for (let i = 0; i < allChunks.length; i++) {
    const chunk = allChunks[i];

    try {
      const embedding = await embed(chunk.embed_text);
      insertBatch.push({ ...chunk, embedding });
      embedded++;
    } catch (err) {
      failures++;
      const msg = err instanceof Error ? err.message : String(err);
      failedChunks.push(`[${chunk.source}] ${chunk.name} (${chunk.type}): ${msg}`);
    }

    // Progress log
    if ((i + 1) % 50 === 0 || i === allChunks.length - 1) {
      console.log(`  Embedded ${i + 1}/${allChunks.length} (${failures} failures)`);
    }

    // Batch insert
    if (insertBatch.length >= BATCH_INSERT || i === allChunks.length - 1) {
      if (insertBatch.length > 0) {
        await MedicalContext.insertMany(insertBatch);
        totalInserted += insertBatch.length;
        insertBatch.length = 0;
      }
    }

    // Rate limit
    if (i < allChunks.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  // Verify dimension
  const sample = await MedicalContext.findOne().select("embedding").lean();
  const dim = (sample as Record<string, unknown>)?.embedding
    ? ((sample as Record<string, unknown>).embedding as number[]).length
    : 0;

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("\n========================================");
  console.log("MEDICAL CONTEXT SEED COMPLETE");
  console.log(`  MedlinePlus chunks : ${mlChunkCount}`);
  console.log(`  openFDA chunks     : ${fdaChunkCount}`);
  console.log(`  Total inserted     : ${totalInserted}`);
  console.log(`  Embedding dimension: ${dim}`);
  console.log(`  Failures           : ${failures}`);
  if (failedChunks.length > 0) {
    console.log("\n  Failed chunks:");
    failedChunks.forEach((f) => console.log(`    ${f}`));
  }
  console.log("========================================\n");

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("SEED FAILED:", e);
  process.exit(1);
});
