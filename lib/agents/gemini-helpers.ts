import { generateTextGeminiFirst } from "./llm";

export interface ProfileForSummary {
  age: number;
  gender: string;
  weight: number;
  height: number;
  bloodGroup: string;
  city?: string;
  state?: string;
  country?: string;
  knownConditions: string[];
  allergies: string[];
  currentMedications: string[];
}

export interface ConsultationForSummary {
  date: string;
  source: "doctor" | "ai";
  symptoms: string;
  severity: string;
  diagnosis: string;
  medicines: string;
  advice?: string;
  drugSafetyNote?: string;
  feedback?: string;
}

function stripThinkTags(text: string): string {
  if (text.includes("<think>")) return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  return text;
}

export async function generateProfileSummary(
  patientName: string,
  profile: ProfileForSummary,
): Promise<string> {
  const prompt = `You are a clinical data summarizer. Generate a concise patient profile summary from the data below. Write in third person, clinical tone, 3-5 sentences. Include demographics, BMI category, known conditions, allergies, and current medication regimen. Do NOT invent information not present in the data.

Patient Name: ${patientName}
Age: ${profile.age}, Gender: ${profile.gender}
Weight: ${profile.weight}kg, Height: ${profile.height}cm (BMI: ${(profile.weight / ((profile.height / 100) ** 2)).toFixed(1)})
Blood Group: ${profile.bloodGroup}
Location: ${[profile.city, profile.state, profile.country].filter(Boolean).join(", ") || "not specified"}
Known Conditions: ${profile.knownConditions.length ? profile.knownConditions.join(", ") : "None reported"}
Allergies: ${profile.allergies.length ? profile.allergies.join(", ") : "None reported"}
Current Medications: ${profile.currentMedications.length ? profile.currentMedications.join(", ") : "None"}

Return ONLY the summary text. No JSON, no markdown, no headings, no bullet points, no quotes.`;

  const r = await generateTextGeminiFirst(prompt);
  return stripThinkTags(r.text);
}

export async function generateRunningSummary(
  patientName: string,
  profile: ProfileForSummary,
  profileSummary: string,
  consultations: ConsultationForSummary[],
): Promise<string> {
  if (consultations.length === 0) {
    return "No consultations on record yet. Running summary will be generated after the first consultation.";
  }

  const consultationLines = consultations.map((c, i) => {
    const parts = [
      `${i + 1}. [${c.date}] (${c.source === "ai" ? "AI Doctor" : "Doctor"})`,
      `   Symptoms: ${c.symptoms} | Severity: ${c.severity}`,
      `   Diagnosis: ${c.diagnosis}`,
      `   Prescribed: ${c.medicines || "none"}`,
    ];
    if (c.advice) parts.push(`   Advice: ${c.advice}`);
    if (c.drugSafetyNote) parts.push(`   Drug Safety: ${c.drugSafetyNote}`);
    if (c.feedback) parts.push(`   Patient Feedback: ${c.feedback}`);
    return parts.join("\n");
  }).join("\n\n");

  const prompt = `You are a clinical decision support system. Generate a RUNNING CLINICAL SUMMARY for a doctor who is about to see this patient. This summary will appear on the doctor's prescription page to give them quick context.

Patient Profile Summary:
${profileSummary || `${patientName}, ${profile.age}yo ${profile.gender}, ${profile.knownConditions.join(", ") || "no known conditions"}`}

Allergies: ${profile.allergies.length ? profile.allergies.join(", ") : "None"}
Current Medications: ${profile.currentMedications.length ? profile.currentMedications.join(", ") : "None"}

Full Consultation History (${consultations.length} consultation${consultations.length > 1 ? "s" : ""}):
${consultationLines}

Instructions:
Write a comprehensive running clinical summary in paragraph form (NOT bullet points). Include:
1. A brief patient overview (demographics, conditions, allergies)
2. A chronological narrative of their consultation history — what they came in for each time, what was diagnosed, what was prescribed
3. Medication changes over time (new long-term meds added, dose changes)
4. Treatment outcomes from patient feedback (what worked, what didn't)
5. Active concerns, patterns, or trends (recurring issues, worsening conditions, unresolved problems)
6. Any suspected or confirmed new allergies discovered during consultations
7. Current medication regimen after all changes

The summary should be 150-300 words — detailed enough to be clinically useful, not a one-liner. Write in third-person clinical narrative. Do NOT invent information not present in the data.

Return ONLY the summary text. No JSON, no markdown, no headings, no bullet points.`;

  const r = await generateTextGeminiFirst(prompt);
  return stripThinkTags(r.text);
}
