import type { AgentFn, Agent6Input, Agent6Output, Prescription } from "./types";
import { generateTextGeminiFirst, generateTextStreaming } from "./llm";

// ── Build the mega-prompt from all 5 agent outputs ───────────────────────────

function buildPrompt(input: Agent6Input): string {
  const p = input.patient;
  const t = input.transcript;
  const sc = input.similarCases;
  const mc = input.medicalContext;
  const ac = input.allergyContext;

  // ── Section 1: Patient profile ─────────────────────────────────────────────
  const patientSection = `## PATIENT PROFILE
Name: ${p.name} | Age: ${p.age} | Gender: ${p.gender} | Blood Group: ${p.bloodGroup}
Weight: ${p.weight}kg | Height: ${p.height}cm | BMI: ${(p.weight / ((p.height / 100) ** 2)).toFixed(1)}
Known Conditions: ${p.knownConditions.join(", ") || "none"}
Current Medications: ${p.currentMedications.join(", ") || "none"}
Allergies: ${p.allergies.join(", ") || "none"}

Profile Summary: ${p.profileSummary || "not available"}

Running Clinical Summary (from past consultations):
${p.runningSummary || "No prior consultations on record."}`;

  // ── Section 2: Past consultations ──────────────────────────────────────────
  const pastSection = p.pastConsultations.length
    ? `## PAST CONSULTATIONS (${p.pastConsultations.length})
${p.pastConsultations.map((c, i) =>
  `${i + 1}. [${c.date}] (${c.type}) Symptoms: ${c.symptoms} → Dx: ${c.diagnosis} → Rx: ${c.medicines.join(", ")}`
).join("\n")}`
    : "## PAST CONSULTATIONS\nNone on record.";

  // ── Section 3: Current consultation transcript ─────────────────────────────
  const transcriptText = t.structuredTranscript
    .map((s) => `${s.speaker === "doctor" ? "Doctor" : "Patient"}: ${s.text}`)
    .join("\n");

  const transcriptSection = `## CURRENT CONSULTATION
Chief Complaint: ${t.chiefComplaint}
Duration: ${t.duration} | Severity: ${t.severity}
Symptoms: ${t.mentionedSymptoms.join("; ")}
Medications mentioned: ${t.mentionedMedications.map((m) => `${m.raw}${m.rxNormName ? ` (${m.rxNormName})` : ""}`).join(", ") || "none"}
Allergies mentioned in consultation: ${t.mentionedAllergies.join(", ") || "none"}

Transcript:
${transcriptText}`;

  // ── Section 4: Similar cases ───────────────────────────────────────────────
  const casesText = sc.topCases.slice(0, 5).map((c, i) =>
    `${i + 1}. ${c.age}yo ${c.gender}, conditions: ${c.knownConditions.join(", ") || "none"} | Symptoms: ${c.symptoms} | Dx: ${c.diagnosis} | Rx: ${c.medicines.join(", ")} | Advice: ${c.advice}`,
  ).join("\n");

  const casesSection = `## SIMILAR PAST CASES (WEAK REFERENCE ONLY — do NOT copy prescriptions)
${casesText || "No similar cases found."}

Pattern Summary: ${sc.overallSummary || "none"}`;

  // ── Section 5: Medical context ─────────────────────────────────────────────
  const condSummaries = mc.conditionSummaries
    .map((c) => `• ${c.name}: ${c.summary}`)
    .join("\n");

  const ev = mc.evidenceSummary;
  const evidenceLines: string[] = [];
  if (ev.findings.length) evidenceLines.push(`Findings: ${ev.findings.join("; ")}`);
  if (ev.possibleDiagnoses.length) evidenceLines.push(`Possible diagnoses: ${ev.possibleDiagnoses.join("; ")}`);
  if (ev.differentials.length) evidenceLines.push(`Differentials to consider: ${ev.differentials.join("; ")}`);
  if (ev.redFlags.length) evidenceLines.push(`RED FLAGS: ${ev.redFlags.join("; ")}`);
  if (ev.managementConsiderations.length) evidenceLines.push(`Management: ${ev.managementConsiderations.join("; ")}`);
  if (ev.clinicalInsights.length) evidenceLines.push(`Clinical insights: ${ev.clinicalInsights.join("; ")}`);

  const medContextSection = `## MEDICAL KNOWLEDGE (from guidelines + drug database)
${condSummaries || "No condition summaries available."}

Evidence Summary:
${evidenceLines.join("\n") || "No evidence retrieved."}`;

  // ── Section 6: Allergy context ─────────────────────────────────────────────
  const allergyLines = ac.expanded.map((a) => {
    const level = a.avoidLevel === "hard_block" ? "❌ HARD BLOCK"
      : a.avoidLevel === "strong_caution" ? "⚠ STRONG CAUTION"
      : a.avoidLevel === "likely_block" ? "⚠ LIKELY BLOCK"
      : "⚠ MONITOR";
    const drugs = a.avoidDrugs.slice(0, 10).join(", ");
    return `• ${a.allergen} (${a.status}/${a.severity}) → ${level}
    Drug class: ${a.drugClass || "unknown"} | Avoid: ${drugs}
    Cross-reactivity: ${a.crossReactivity.filter((c) => c.length < 80).join("; ") || "none noted"}`;
  }).join("\n");

  const safeAltLines = Object.entries(ac.safeAlternatives)
    .map(([allergen, alts]) => `• ${allergen} allergy → consider: ${alts.slice(0, 3).map((a) => a.slice(0, 80)).join("; ")}`)
    .join("\n");

  const allergySection = `## ALLERGY CONTEXT (from Agent 5 — MUST RESPECT)
${allergyLines || "No allergies on record."}

Cross-reactivity flags:
${ac.crossReactivityFlags.join("\n") || "None."}

Safe alternatives:
${safeAltLines || "None identified."}`;

  // ── Section 7: Loop context (only on re-run) ──────────────────────────────
  let loopSection = "";
  if (input.loopContext && input.loopContext.flaggedDrugs.length > 0) {
    const lc = input.loopContext;
    const flagLines = lc.flaggedDrugs.map((f) => {
      const source = f.flaggedBy === "agent7" ? "Drug Interaction Check" : "Allergy Safety Check";
      const alt = f.suggestedAlternative ? ` → Suggested replacement: ${f.suggestedAlternative}` : "";
      return `• ❌ ${f.drug} — REJECTED by ${source}: ${f.reason}${alt}`;
    }).join("\n");

    loopSection = `

## ⚠ REVISION REQUIRED (Loop ${lc.loopNumber})
Your previous prescription was checked by safety agents and the following drugs were REJECTED:

${flagLines}

You MUST:
1. DO NOT prescribe any of the rejected drugs listed above
2. Replace each rejected drug with a safe alternative from a DIFFERENT drug class
3. If a suggested replacement was provided, prefer using it
4. Ensure the replacement still treats the same condition
5. Update the drug safety note to explain why the replacement was chosen`;
  }

  // ── Final prompt ───────────────────────────────────────────────────────────
  return `You are MediIQ's clinical reasoning engine. You are generating a PRESCRIPTION SUGGESTION for a doctor to review. The doctor makes the final decision — your job is to provide the best possible evidence-grounded suggestion.

${patientSection}

${pastSection}

${transcriptSection}

${casesSection}

${medContextSection}

${allergySection}${loopSection}

## YOUR TASK
Based on ALL the information above, generate a complete prescription suggestion. You MUST:

1. DIAGNOSE: Provide a specific primary diagnosis with brief clinical reasoning.

2. PRESCRIBE MEDICINES: Each medicine must include:
   - medicine: generic drug name
   - dosage: e.g. "500mg"
   - timing: "before food" | "after food" | "with food" | "at bedtime" | "as needed"
   - frequency: "once daily" | "twice daily" | "thrice daily" | "as needed"
   - duration: e.g. "5 days" | "ongoing"
   - condition: empty for regular medicines, or SOS instructions like "Take only if temperature > 100.4°F"
   - purpose: brief plain-language reason in max 10 words

3. ADVICE: Exactly 5 practical advice points (short, actionable, max 15 words each).

4. DRUG SAFETY NOTE: One paragraph covering:
   - Why specific drugs were chosen or avoided (allergy, condition, interaction)
   - Any monitoring needed
   - Key interaction warnings

5. HISTORY SUMMARY: One-sentence clinical insight from the patient's consultation history (patterns, recurring issues, trends).

## HARD SAFETY RULES (NEVER violate these)
- NEVER prescribe a drug from a HARD BLOCK allergy class
- NEVER prescribe NSAIDs (ibuprofen, diclofenac, naproxen) to a patient with BOTH diabetes AND hypertension — use paracetamol instead
- ALWAYS choose a drug OUTSIDE the patient's allergy classes when alternatives exist
- The similar cases are WEAK REFERENCES ONLY — do NOT blindly copy their prescriptions
- If the evidence summary contains a RED FLAG, address it in advice or drug safety note
- Prescribe the minimum effective number of medicines — do not over-prescribe
${input.loopContext ? "- DO NOT prescribe any drug listed in the REVISION REQUIRED section above" : ""}

Respond ONLY with valid JSON matching this exact structure (no markdown, no backticks):
{
  "diagnosis": "Primary diagnosis with brief reasoning",
  "medicines": [
    {
      "medicine": "Drug name (generic)",
      "dosage": "e.g. 500mg",
      "timing": "before food | after food | with food | at bedtime",
      "frequency": "once daily | twice daily | thrice daily",
      "duration": "e.g. 5 days",
      "condition": "" or "SOS instruction",
      "purpose": "Brief reason in max 10 words"
    }
  ],
  "advice": ["point 1", "point 2", "point 3", "point 4", "point 5"],
  "drugSafetyNote": "One paragraph on drug choices, allergies avoided, interactions",
  "historySummary": "One-sentence clinical pattern from patient history",
  "reasoning": "2-3 sentences explaining your clinical reasoning process",
  "confidenceNotes": ["any uncertainty or flag for the doctor to consider"]
}`;
}

// ── Agent implementation ─────────────────────────────────────────────────────

export const runReasoningAgent: AgentFn<Agent6Input, Agent6Output> = async (input, onPartial?: (partialText: string) => void) => {
  const start = Date.now();
  const logs: string[] = [];
  const isLoop = !!input.loopContext;

  if (!input.patient || !input.transcript) {
    return {
      agentId: 6, agentName: "Reasoning Agent", status: "error",
      input, output: null, feedsInto: [7, 8], triggeredBy: [1, 2, 3, 4, 5],
      logs: ["Missing required input (patient or transcript)"],
      durationMs: Date.now() - start, error: "Missing patient or transcript data",
    };
  }

  try {
    logs.push(`Patient: ${input.patient.name}, ${input.patient.age}yo ${input.patient.gender}`);
    logs.push(`Conditions: ${input.patient.knownConditions.join(", ") || "none"}`);
    logs.push(`Allergies: ${input.patient.allergies.join(", ") || "none"}`);
    logs.push(`Chief complaint: ${input.transcript.chiefComplaint}`);
    logs.push(`Similar cases: ${input.similarCases?.topCases?.length ?? 0}`);
    logs.push(`Condition summaries: ${input.medicalContext?.conditionSummaries?.length ?? 0}`);
    logs.push(`Allergy blocks: ${input.allergyContext?.expanded?.length ?? 0}`);

    if (isLoop) {
      const lc = input.loopContext!;
      logs.push(`LOOP ${lc.loopNumber}: Re-running with ${lc.flaggedDrugs.length} flagged drug(s): ${lc.flaggedDrugs.map(f => `${f.drug} (${f.flaggedBy})`).join(", ")}`);
    }

    const prompt = buildPrompt(input);
    logs.push(`Prompt built (${prompt.length} chars)${isLoop ? " — includes REVISION REQUIRED section" : ""}`);

    logs.push(onPartial
      ? "Calling LLM (streaming via Gemini, Ollama fallback)..."
      : "Calling LLM (Gemini first, 60s timeout, Ollama fallback)...");
    const t1 = Date.now();
    const r = onPartial
      ? await generateTextStreaming(prompt, onPartial, { task: "prescription" })
      : await generateTextGeminiFirst(prompt, 60_000, { task: "prescription" });
    logs.push(`LLM responded via ${r.provider} in ${Date.now() - t1}ms (${r.text.length} chars)`);

    let raw = r.text;
    if (raw.includes("```")) raw = raw.replace(/```(?:json)?\s*/g, "").replace(/```/g, "");
    if (raw.includes("<think>")) raw = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      logs.push("ERROR: No JSON found in LLM response");
      return {
        agentId: 6, agentName: "Reasoning Agent", status: "error",
        input, output: null, feedsInto: [7, 8], triggeredBy: [1, 2, 3, 4, 5],
        logs, durationMs: Date.now() - start, error: "Failed to parse prescription JSON from LLM",
      };
    }

    const parsed = JSON.parse(match[0]) as {
      diagnosis?: string;
      medicines?: Array<{
        medicine?: string; dosage?: string; timing?: string;
        frequency?: string; duration?: string; condition?: string; purpose?: string;
      }>;
      advice?: string | string[];
      drugSafetyNote?: string;
      historySummary?: string;
      reasoning?: string;
      confidenceNotes?: string[];
    };

    let advice: string[];
    if (Array.isArray(parsed.advice)) {
      advice = parsed.advice.slice(0, 5);
    } else if (typeof parsed.advice === "string") {
      advice = parsed.advice.split("\n").filter(Boolean).slice(0, 5);
    } else {
      advice = [];
    }
    while (advice.length < 5) advice.push("");

    const prescription: Prescription = {
      diagnosis: parsed.diagnosis ?? "",
      medicines: (parsed.medicines ?? []).map((m) => ({
        medicine: m.medicine ?? "",
        dosage: m.dosage ?? "",
        timing: m.timing ?? "",
        frequency: m.frequency ?? "",
        duration: m.duration ?? "",
        condition: m.condition ?? "",
        purpose: m.purpose ?? "",
      })),
      advice,
      drugSafetyNote: parsed.drugSafetyNote ?? "",
      historySummary: parsed.historySummary ?? "",
    };

    // Verify loop compliance: check if any flagged drugs were re-prescribed
    if (isLoop) {
      const flaggedNames = input.loopContext!.flaggedDrugs.map(f => f.drug.toLowerCase());
      const prescribed = prescription.medicines.map(m => m.medicine.toLowerCase());
      const violations = prescribed.filter(m => flaggedNames.some(f => m.includes(f.split(" ")[0])));
      if (violations.length > 0) {
        logs.push(`WARNING: Loop ${input.loopContext!.loopNumber} — LLM re-prescribed flagged drug(s): ${violations.join(", ")}`);
      } else {
        logs.push(`Loop ${input.loopContext!.loopNumber} — all flagged drugs successfully replaced`);
      }
    }

    logs.push(`Prescription parsed: ${prescription.medicines.length} medicines`);
    logs.push(`Diagnosis: ${prescription.diagnosis.slice(0, 100)}`);
    prescription.medicines.forEach((m) =>
      logs.push(`  → ${m.medicine} ${m.dosage} ${m.frequency} ${m.duration} | ${m.purpose}`),
    );
    logs.push(`Drug safety note: ${prescription.drugSafetyNote.slice(0, 100)}...`);

    const geminiFailed = r.provider !== "gemini" && !!r.geminiError;
    if (geminiFailed) {
      logs.push(`NOTE: Gemini unavailable (${r.geminiError}) — ${r.provider} generated this prescription`);
    }

    const output: Agent6Output = {
      prescription,
      reasoning: parsed.reasoning ?? "",
      confidenceNotes: parsed.confidenceNotes ?? [],
      provider: r.provider,
      geminiFailed,
      geminiError: r.geminiError,
    };

    return {
      agentId: 6, agentName: "Reasoning Agent", status: "ok",
      input, output, feedsInto: [7, 8], triggeredBy: [1, 2, 3, 4, 5],
      logs, durationMs: Date.now() - start,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logs.push(`ERROR: ${msg}`);
    return {
      agentId: 6, agentName: "Reasoning Agent", status: "error",
      input, output: null, feedsInto: [7, 8], triggeredBy: [1, 2, 3, 4, 5],
      logs, durationMs: Date.now() - start, error: msg,
    };
  }
};
