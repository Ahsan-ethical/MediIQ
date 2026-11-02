import { GoogleGenerativeAI } from "@google/generative-ai";
import type { IAppointment, IPrescription } from "./models/Appointment";

export type PrescriptionResult = IPrescription & { historySummary?: string };

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildPatientContext(appt: IAppointment, patientProfile: Record<string, unknown>): string {
  const p  = patientProfile;
  const pc = appt.preConsultation;
  const v  = pc?.vitals;

  return [
    `Patient: ${p.age}yo ${p.gender}, ${p.weight}kg, ${p.height}cm, Blood Group: ${p.bloodGroup ?? "unknown"}`,
    `Known Conditions: ${(p.knownConditions as string[])?.join(", ") || "none"}`,
    `Allergies: ${(p.allergies as string[])?.join(", ") || "none"}`,
    `Current Medications (profile): ${(p.currentMedications as string[])?.join(", ") || "none"}`,
    `Chief Complaint: ${pc?.symptoms ?? "not provided"}`,
    `Duration: ${pc?.duration ?? "not provided"}`,
    `Severity: ${pc?.severity ?? "not provided"}`,
    `Medications mentioned in form: ${pc?.currentMedications || "none"}`,
    `Additional Notes: ${pc?.additionalNotes || "none"}`,
    v
      ? `Vitals: BP ${v.sbp}/${v.dbp} mmHg (${v.bp_classification}), HR ${v.hr} bpm (${v.hr_classification})`
      : "Vitals: not measured",
  ].join("\n");
}

function parseJsonBlock(text: string): unknown {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? text.match(/\{[\s\S]*\}/);
  const raw   = match ? (match[1] ?? match[0]) : text;
  return JSON.parse(raw.trim());
}

// ── Pre-call AI Report ────────────────────────────────────────────────────────

export async function generateAiReport(
  appt: IAppointment,
  patientProfile: Record<string, unknown>,
) {
  // Use shared LLM helper (Gemini + Ollama parallel race) for reliability
  const { generateText } = await import("@/lib/agents/llm");

  const prompt = `You are a clinical support assistant helping a doctor prepare for a consultation.
Based on the patient data below, provide:
1. A concise summary (2–3 sentences) of the patient's likely condition.
2. A list of probable diseases/conditions with one-line reasoning each.
3. 3–5 specific diagnostic questions the doctor should ask to confirm or rule out conditions.

Patient Data:
${buildPatientContext(appt, patientProfile)}

Respond ONLY with valid JSON (no markdown, no backticks):
{
  "summary": "...",
  "conditions": ["Condition — reasoning", "..."],
  "questions": ["Question 1?", "..."]
}`;

  const r = await generateText(prompt);
  let text = r.text;
  if (text.includes("<think>")) text = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const parsed = parseJsonBlock(text) as { summary: string; conditions: string[]; questions: string[] };

  console.log(`[AiReport] Generated via ${r.provider} — summary: ${parsed.summary?.slice(0, 60)}...`);

  return {
    summary:    parsed.summary    ?? "",
    conditions: parsed.conditions ?? [],
    questions:  parsed.questions  ?? [],
    generatedAt: new Date(),
  };
}

// ── Post-call Prescription Pipeline ──────────────────────────────────────────

export async function generatePostCallPrescription(
  appt: IAppointment,
  patientProfile: Record<string, unknown>,
  similarCases: Array<Record<string, unknown>>,
  patientHistory: Array<Record<string, unknown>> = [],
): Promise<PrescriptionResult> {
  const { generateTextGeminiFirst } = await import("@/lib/agents/llm");

  const historyText = patientHistory.length
    ? patientHistory.map((h, i) => {
        const meds = typeof h.medicines === "string"
          ? h.medicines
          : (h.medicines as Array<Record<string,unknown>>)?.map(m => `${m.medicine} ${m.dosage ?? ""}`.trim()).join(", ") || "none";
        const feedbackLine = h.feedback ? `\n     └ Patient feedback: ${h.feedback}` : "";
        return `  ${i+1}. ${h.date} | ${h.source === "ai" ? "AI" : "Doctor"} | ${h.symptoms} (${h.severity}) → ${h.diagnosis} → Rx: ${meds}${feedbackLine}`;
      }).join("\n")
    : "  No prior consultations on record.";

  const pastCasesText = similarCases.length
    ? similarCases.map((c, i) => {
        const pt = c.patient as Record<string,unknown>;
        return `Case ${i+1}: ${pt?.age}yo ${pt?.sex}, comorbidities: ${(pt?.knownConditions as string[])?.join(", ") || "none"}
  Symptoms: ${c.symptoms} (${c.duration}, ${c.severity})
  Diagnosis: ${c.diagnosis}
  Prescribed: ${(c.prescription as Array<Record<string,unknown>>)?.map(m => `${m.medicine} ${m.dosage}`).join(", ")}`;
      }).join("\n\n")
    : "No similar historical cases available.";

  const prompt = `You are an expert clinical decision support assistant. A doctor has just finished a consultation with a patient.

## Patient Data
${buildPatientContext(appt, patientProfile)}

## Call Transcript
${appt.transcript || "No transcript available."}

## This Patient's Consultation History (WEAK REFERENCE — chronological)
${historyText}
If the same symptom is recurring or worsening across visits, consider a chronic condition or specialist referral. Do NOT prescribe the same medicines just because they were given before — assess whether prior treatment was effective.

## Similar Cases from Other Patients (WEAK REFERENCE ONLY)
${pastCasesText}

## CRITICAL INSTRUCTIONS:
1. The similar cases above are EPIDEMIOLOGICAL REFERENCES ONLY — they show symptom patterns from this clinic's history. Do NOT copy their prescriptions.
2. Apply independent clinical reasoning based on THIS patient's specific presentation, age, comorbidities, allergies, and current medications.
3. The similar cases may have different demographics — a diabetic patient's case is not directly applicable to a non-diabetic, and vice versa.
4. For medicines that are conditional (pain spikes, nausea episodes, SOS use), populate the "condition" field explaining WHEN to take it (e.g., "take only if vomiting persists", "use if pain does not subside in 30 minutes").
5. Check for interactions with the patient's listed current medications.
6. Avoid NSAIDs (ibuprofen, diclofenac) for patients with diabetes or kidney risk — prefer paracetamol.
7. Include SOS/as-needed medicines where clinically appropriate.

Respond ONLY with valid JSON:
\`\`\`json
{
  "diagnosis": "...",
  "medicines": [
    {
      "medicine": "...",
      "dosage": "...",
      "timing": "before food | after food | with food | at bedtime | as needed",
      "frequency": "once daily | twice daily | thrice daily | as needed",
      "duration": "...",
      "condition": "leave empty string for regular medicines, or explain when to take for SOS (e.g. take only if vomiting occurs)",
      "purpose": "Brief plain-language reason for this medicine in max 7 words (e.g. To reduce fever and relieve pain)"
    }
  ],
  "advice": [
    "Brief practical point 1 (max 10 words)",
    "Brief practical point 2",
    "Brief practical point 3",
    "Brief practical point 4",
    "Brief practical point 5"
  ],
  "drugSafetyNote": "One-line note about any drug interactions or safety concerns with the patient's current medications, or empty string if none",
  "historySummary": "One sentence clinical insight from patient history (e.g. recurring pattern, treatment response, or specialist referral indication), or empty string if no prior history"
}
\`\`\`
Advice must be exactly 5 short practical points — no headings, no "Do:/Don't:" prefixes, no markdown.`;

  const r      = await generateTextGeminiFirst(prompt, 60_000, { task: "prescription" });
  const text   = r.text;
  const parsed = parseJsonBlock(text) as {
    diagnosis?: string;
    medicines?: Record<string,unknown>[];
    advice?: string | string[];
    drugSafetyNote?: string;
    historySummary?: string;
  };

  return {
    diagnosis: parsed.diagnosis ?? "Awaiting doctor review",
    medicines: (parsed.medicines ?? []).map(m => ({
      medicine:  String(m.medicine  ?? ""),
      dosage:    String(m.dosage    ?? ""),
      timing:    String(m.timing    ?? ""),
      frequency: String(m.frequency ?? ""),
      duration:  String(m.duration  ?? ""),
      condition: String(m.condition ?? ""),
      purpose:   String(m.purpose   ?? ""),
    })),
    advice: Array.isArray(parsed.advice)
      ? parsed.advice.slice(0, 5).join("\n")
      : (parsed.advice ?? ""),
    drugSafetyNote: parsed.drugSafetyNote ?? "",
    historySummary: parsed.historySummary ?? "",
  };
}

// ── Text Embedding (3072-dim, for Atlas Vector Search) ────────────────────────
// Model: gemini-embedding-001 — confirmed working, 3072 dimensions
// Atlas index must use numDimensions: 3072

export async function embedText(text: string): Promise<number[]> {
  const model  = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

// Symptom-only embedding — used for RAG retrieval.
// Deliberately excludes demographics so similarity is based on symptom profile, not patient history.
export function buildSymptomsEmbeddingText(opts: {
  symptoms: string;
  duration?: string;
  severity?: string;
  additionalNotes?: string;
}): string {
  return [
    `SYMPTOMS: ${opts.symptoms}`,
    opts.duration        ? `DURATION: ${opts.duration}`        : null,
    opts.severity        ? `SEVERITY: ${opts.severity}`        : null,
    opts.additionalNotes ? `NOTES: ${opts.additionalNotes}`    : null,
  ].filter(Boolean).join("\n");
}

// Clean structured embedding — no transcript noise.
// Pass diagnosis only when storing a case (not when querying).
export function buildMedicalEmbeddingText(opts: {
  symptoms: string;
  duration?: string;
  severity?: string;
  age?: number;
  sex?: string;
  comorbidities?: string[];
  allergies?: string[];
  currentMedications?: string[];
  bloodGroup?: string;
  additionalNotes?: string;
  diagnosis?: string;
}): string {
  const ageLabel = opts.age
    ? `${opts.age < 13 ? "child" : opts.age < 18 ? "teen" : opts.age < 60 ? "adult" : "elderly"} (${opts.age}yo)`
    : null;
  return [
    `SYMPTOMS: ${opts.symptoms}`,
    opts.duration        ? `DURATION: ${opts.duration}`        : null,
    opts.severity        ? `SEVERITY: ${opts.severity}`        : null,
    ageLabel             ? `AGE_GROUP: ${ageLabel}`            : null,
    opts.sex             ? `SEX: ${opts.sex}`                  : null,
    `COMORBIDITIES: ${opts.comorbidities?.join(", ") || "none"}`,
    `ALLERGIES: ${opts.allergies?.join(", ") || "none"}`,
    `CURRENT_MEDICATIONS: ${opts.currentMedications?.join(", ") || "none"}`,
    opts.bloodGroup      ? `BLOOD_GROUP: ${opts.bloodGroup}`   : null,
    opts.additionalNotes ? `NOTES: ${opts.additionalNotes}`    : null,
    opts.diagnosis       ? `DIAGNOSIS: ${opts.diagnosis}`      : null,
  ].filter(Boolean).join("\n");
}
