/**
 * Seed script — inserts 100 realistic cases into MongoDB with symptom-only embeddings.
 * Run with: npx tsx scripts/seed-cases.ts
 * Requires .env.local with MONGODB_URI and GEMINI_API_KEY
 */
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "../.env.local") });

const MONGODB_URI  = process.env.MONGODB_URI!;
const GEMINI_KEY   = process.env.GEMINI_API_KEY!;
const SEED_OID     = new mongoose.Types.ObjectId("000000000000000000000001");
const DELAY_MS     = 300; // stay under Gemini rate limit

if (!MONGODB_URI || !GEMINI_KEY) {
  console.error("Missing MONGODB_URI or GEMINI_API_KEY in .env.local");
  process.exit(1);
}

// ── Inline Case schema (avoids Next.js module issues) ──────────────────────
const MedSchema = new mongoose.Schema(
  { medicine: String, dosage: String, timing: String, frequency: String, duration: String, condition: String },
  { _id: false }
);
const CaseSchema = new mongoose.Schema({
  appointmentRef: { type: mongoose.Schema.Types.ObjectId, required: true },
  patientRef:     { type: mongoose.Schema.Types.ObjectId, required: true },
  doctorRef:      { type: mongoose.Schema.Types.ObjectId, required: true },
  patient: {
    age: Number, sex: String, weight: Number, height: Number,
    bloodGroup: String,
    knownConditions: [String], allergies: [String], currentMedications: [String],
  },
  symptoms: String, duration: String, severity: String,
  additionalNotes: String, currentMedications: String,
  transcript: { type: String, default: "" },
  diagnosis: String,
  prescription: [MedSchema],
  advice: String,
  patientRating: Number,
  embedding: [Number],
  isSeedData: { type: Boolean, default: true },
}, { timestamps: true });

function buildSymptomsText(c: SeedCase): string {
  return [
    `SYMPTOMS: ${c.symptoms}`,
    c.duration        ? `DURATION: ${c.duration}`     : null,
    c.severity        ? `SEVERITY: ${c.severity}`     : null,
    c.additionalNotes ? `NOTES: ${c.additionalNotes}` : null,
  ].filter(Boolean).join("\n");
}

interface SeedCase {
  patient: {
    age: number; sex: string; weight: number; height: number;
    bloodGroup: string; knownConditions: string[];
    allergies: string[]; currentMedications: string[];
  };
  symptoms: string; duration: string; severity: string;
  additionalNotes: string; currentMedications: string;
  diagnosis: string;
  prescription: Array<{
    medicine: string; dosage: string; timing: string;
    frequency: string; duration: string; condition?: string;
  }>;
  advice: string;
}

async function embedText(genAI: GoogleGenerativeAI, text: string): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const seedPath = path.join(__dirname, "../data/seed-cases.json");
  if (!fs.existsSync(seedPath)) {
    console.error("seed-cases.json not found at", seedPath);
    process.exit(1);
  }
  const cases: SeedCase[] = JSON.parse(fs.readFileSync(seedPath, "utf-8"));
  console.log(`Loaded ${cases.length} cases from seed-cases.json`);

  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB");

  const CaseModel = mongoose.models.Case || mongoose.model("Case", CaseSchema);

  // Remove old seed data
  const deleted = await CaseModel.deleteMany({ isSeedData: true });
  console.log(`Removed ${deleted.deletedCount} existing seed cases`);

  const genAI = new GoogleGenerativeAI(GEMINI_KEY);
  let inserted = 0;

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    console.log(`[${i + 1}/${cases.length}] Embedding: ${c.symptoms.slice(0, 50)}…`);
    try {
      const embedding = await embedText(genAI, buildSymptomsText(c));
      await CaseModel.create({
        appointmentRef: SEED_OID,
        patientRef:     SEED_OID,
        doctorRef:      SEED_OID,
        patient:        c.patient,
        symptoms:       c.symptoms,
        duration:       c.duration,
        severity:       c.severity,
        additionalNotes: c.additionalNotes,
        currentMedications: c.currentMedications,
        transcript: "",
        diagnosis:  c.diagnosis,
        prescription: c.prescription,
        advice:     c.advice,
        patientRating: Math.floor(4 + Math.random() * 2),
        embedding,
        isSeedData: true,
      });
      inserted++;
    } catch (err) {
      console.error(`  Failed for case ${i + 1}:`, (err as Error).message);
    }
    await sleep(DELAY_MS);
  }

  console.log(`\nInserted ${inserted}/${cases.length} seed cases`);
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
