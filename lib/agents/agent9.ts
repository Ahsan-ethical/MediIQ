import type {
  AgentFn,
  Agent9Input,
  Agent9Output,
  SystemDetectedFinding,
  Prescription,
} from "./types";
import { connectDB } from "@/lib/mongodb";
import { generateTextGeminiFirst } from "./llm";
import SystemDetected from "@/lib/models/SystemDetected";
import PatientProfile, { type ILastConsultationSummary } from "@/lib/models/PatientProfile";
import mongoose from "mongoose";

// ══════════════════════════════════════════════════════════════════════════════
// Agent 9 — Finding Detector
// ONE LLM call: feed it the prescription + transcript + existing record,
// ask it to detect new lifelong meds and new allergies.
// Findings go to SystemDetected collection as "pending".
// ══════════════════════════════════════════════════════════════════════════════

export const runFindingDetectorAgent: AgentFn<Agent9Input, Agent9Output> = async (input) => {
  const start = Date.now();
  const logs: string[] = [];

  if (!input.prescription || !input.patientUserId) {
    return {
      agentId: 9, agentName: "Finding Detector Agent", status: "error",
      input, output: null, feedsInto: [], triggeredBy: [7, 8],
      logs: ["Missing prescription or patientUserId"],
      durationMs: Date.now() - start, error: "Missing required input",
    };
  }

  try {
    await connectDB();
    logs.push("Connected to MongoDB");

    const meds = input.prescription.medicines;
    const transcript = input.transcript;

    // Build context for the LLM
    const medsText = meds.map((m) =>
      `${m.medicine} ${m.dosage} ${m.frequency} for ${m.duration}${m.condition ? ` (${m.condition})` : ""} — ${m.purpose}`
    ).join("\n");

    const transcriptMentions: string[] = [];
    if (transcript?.structuredTranscript) {
      for (const seg of transcript.structuredTranscript) {
        const lower = seg.text.toLowerCase();
        if (lower.includes("allerg") || lower.includes("rash") || lower.includes("reaction") ||
            lower.includes("itching") || lower.includes("swelling") || lower.includes("hives")) {
          transcriptMentions.push(`${seg.speaker}: ${seg.text}`);
        }
      }
    }

    const transcriptAllergyText = transcriptMentions.length
      ? `Allergy/reaction mentions in transcript:\n${transcriptMentions.join("\n")}`
      : "No allergy/reaction mentions found in transcript.";

    const mentionedAllergies = transcript?.mentionedAllergies?.length
      ? `Allergies explicitly mentioned in consultation: ${transcript.mentionedAllergies.join(", ")}`
      : "";

    logs.push(`Prescribed medicines: ${meds.length}`);
    logs.push(`Existing allergies: ${input.existingAllergies.join(", ") || "none"}`);
    logs.push(`Existing medications: ${input.existingMedications.join(", ") || "none"}`);
    logs.push(`Transcript allergy mentions: ${transcriptMentions.length}`);

    // ONE LLM call to detect everything
    logs.push("Calling LLM for finding detection...");
    const t1 = Date.now();

    const r = await generateTextGeminiFirst(
      `You are a clinical finding detector. After a consultation, you check if there are any NEW lifelong medications or NEW allergies that should be added to the patient's permanent record.

EXISTING PATIENT RECORD:
- Current allergies: ${input.existingAllergies.join(", ") || "none"}
- Current medications: ${input.existingMedications.join(", ") || "none"}

THIS CONSULTATION'S PRESCRIPTION:
${medsText}

Diagnosis: ${input.prescription.diagnosis}
Drug safety note: ${input.prescription.drugSafetyNote}

${transcriptAllergyText}
${mentionedAllergies}
${input.feedbackNotes ? `Patient feedback notes: ${input.feedbackNotes}` : ""}

DETECT TWO THINGS:

1. NEW LIFELONG MEDICATIONS:
   - A medicine prescribed as "ongoing", "long-term", "daily", "lifelong", or with no end date = LIFELONG
   - A medicine prescribed for "5 days", "7 days", "2 weeks" etc. = SHORT COURSE → IGNORE
   - Only flag meds NOT already in the patient's existing medications list
   - When unsure if lifelong, include it (patient will confirm)

2. NEW ALLERGIES:
   - Any drug reaction, rash, hives, swelling, breathing difficulty mentioned in the transcript or noted in the consultation
   - Any drug the safety note says the patient reacted to
   - Only flag allergies NOT already in the patient's existing allergies list
   - Tag each as severity: "severe" or "mild" and status: "confirmed" or "suspected"

Return ONLY valid JSON (no markdown):
{
  "newLifelongMeds": [
    {"value": "drug name", "reason": "why this is lifelong", "source": "prescription / transcript"}
  ],
  "newAllergies": [
    {"value": "allergen name", "severity": "severe or mild", "status": "confirmed or suspected", "reason": "what happened", "source": "transcript / feedback / drug safety note"}
  ]
}

If nothing new detected, return empty arrays. Do NOT include items already in the existing record.`);

    logs.push(`LLM responded via ${r.provider} in ${Date.now() - t1}ms`);

    // Parse response
    let raw = r.text;
    if (raw.includes("<think>")) raw = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    if (raw.includes("```")) raw = raw.replace(/```(?:json)?\s*/g, "").replace(/```/g, "");

    interface DetectedMed { value?: string; reason?: string; source?: string }
    interface DetectedAllergy { value?: string; severity?: string; status?: string; reason?: string; source?: string }

    let parsed: { newLifelongMeds?: DetectedMed[]; newAllergies?: DetectedAllergy[] } = {};
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      parsed = JSON.parse(match[0]);
    }

    // Build findings
    const findings: SystemDetectedFinding[] = [];

    for (const med of (parsed.newLifelongMeds ?? [])) {
      if (!med.value) continue;
      // Double-check it's not already in existing meds
      const exists = input.existingMedications.some((m) =>
        m.toLowerCase().includes(med.value!.toLowerCase()) || med.value!.toLowerCase().includes(m.toLowerCase()),
      );
      if (exists) { logs.push(`  Skip lifelong med "${med.value}" — already in record`); continue; }

      findings.push({
        type: "lifelong_med",
        value: med.value,
        reason: med.reason ?? "Prescribed as ongoing/lifelong medication",
        source: med.source ?? "prescription",
        status: "pending",
      });
      logs.push(`  🔔 NEW lifelong med: ${med.value} — ${med.reason}`);
    }

    for (const allergy of (parsed.newAllergies ?? [])) {
      if (!allergy.value) continue;
      const exists = input.existingAllergies.some((a) =>
        a.toLowerCase() === allergy.value!.toLowerCase(),
      );
      if (exists) { logs.push(`  Skip allergy "${allergy.value}" — already in record`); continue; }

      findings.push({
        type: "allergy",
        value: allergy.value,
        severity: (allergy.severity === "severe" ? "severe" : "mild") as "severe" | "mild",
        allergyStatus: (allergy.status === "confirmed" ? "confirmed" : "suspected") as "confirmed" | "suspected",
        reason: allergy.reason ?? "Detected from consultation",
        source: allergy.source ?? "consultation",
        status: "pending",
      });
      logs.push(`  🔔 NEW allergy: ${allergy.value} (${allergy.severity}/${allergy.status}) — ${allergy.reason}`);
    }

    // Write findings to SystemDetected collection (parallel)
    if (findings.length > 0) {
      const patientOid = new mongoose.Types.ObjectId(input.patientUserId);

      const writeResults = await Promise.allSettled(
        findings.map((f) =>
          SystemDetected.updateOne(
            { patientRef: patientOid, type: f.type, value: f.value },
            {
              $setOnInsert: {
                patientRef: patientOid,
                type: f.type,
                value: f.value,
                severity: f.severity,
                allergyStatus: f.allergyStatus,
                reason: f.reason,
                source: f.source,
                status: "pending",
              },
            },
            { upsert: true },
          ),
        ),
      );

      const failed = writeResults.filter((r) => r.status === "rejected");
      if (failed.length > 0) {
        for (const f of failed) logs.push(`  DB write failed: ${(f as PromiseRejectedResult).reason}`);
      }
      logs.push(`\nWrote ${findings.length - failed.length}/${findings.length} finding(s) to SystemDetected (pending patient confirmation)`);
    } else {
      logs.push("\nNo new findings detected — patient record is up to date");
    }

    const output: Agent9Output = {
      findings,
      newLifelongMeds: findings.filter((f) => f.type === "lifelong_med").length,
      newAllergies: findings.filter((f) => f.type === "allergy").length,
    };

    return {
      agentId: 9, agentName: "Finding Detector Agent",
      status: findings.length > 0 ? "flag" : "ok",
      input, output, feedsInto: [], triggeredBy: [7, 8],
      logs, durationMs: Date.now() - start,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logs.push(`ERROR: ${msg}`);
    return {
      agentId: 9, agentName: "Finding Detector Agent", status: "error",
      input, output: null, feedsInto: [], triggeredBy: [7, 8],
      logs, durationMs: Date.now() - start, error: msg,
    };
  }
};


// ══════════════════════════════════════════════════════════════════════════════
// Post-consultation: generate lastConsultationSummary for chatbot context
// Called alongside finding detection in the prescription route
// ══════════════════════════════════════════════════════════════════════════════

interface ConsultationSummaryInput {
  patientUserId: string;
  appointmentId: string;
  doctorName: string;
  date: string;
  symptoms: string;
  prescription: Prescription;
  flaggedDrugs: { drug: string; reason: string; flaggedBy: string }[];
  transcript?: string;
}

export async function generateLastConsultationSummary(input: ConsultationSummaryInput): Promise<void> {
  await connectDB();

  const drugs = input.prescription.medicines.map(m => ({
    name: m.medicine,
    dosage: m.dosage,
    frequency: m.frequency,
    duration: m.duration,
  }));

  const warnings: string[] = [];
  if (input.flaggedDrugs.length > 0) {
    for (const f of input.flaggedDrugs) {
      warnings.push(`${f.drug} was flagged by ${f.flaggedBy}: ${f.reason}`);
    }
  }
  if (input.prescription.drugSafetyNote) {
    warnings.push(input.prescription.drugSafetyNote);
  }

  let transcriptSummary = "";
  if (input.transcript && input.transcript.length > 50) {
    try {
      const r = await generateTextGeminiFirst(
        `Summarize this doctor-patient consultation transcript in 3-4 sentences. Focus on: what the doctor diagnosed, key advice given, any concerns raised, and follow-up instructions.\n\nTranscript:\n${input.transcript.slice(0, 4000)}`
      );
      transcriptSummary = r.text.trim();
    } catch {
      transcriptSummary = "Transcript summary unavailable.";
    }
  }

  const summary: ILastConsultationSummary = {
    appointmentId: input.appointmentId,
    date: input.date,
    doctorName: input.doctorName,
    symptoms: input.symptoms,
    diagnosis: input.prescription.diagnosis,
    prescribedDrugs: drugs,
    flaggedDrugs: input.flaggedDrugs,
    keyAdvice: Array.isArray(input.prescription.advice) ? input.prescription.advice.join(". ") : input.prescription.advice,
    warnings,
    transcriptSummary,
    generatedAt: new Date(),
  };

  await PatientProfile.updateOne(
    { userRef: new mongoose.Types.ObjectId(input.patientUserId) },
    { $set: { lastConsultationSummary: summary } },
  );
}
