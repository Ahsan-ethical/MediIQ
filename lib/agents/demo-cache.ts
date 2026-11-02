/**
 * Demo Mode Cache — pre-built agent outputs for two presentation scenarios.
 * NO LLM calls, NO vector search, NO API calls. Pure static data.
 *
 * Scenario A: Simple clean flow (fever/URTI, no flags, no loops)
 * Scenario B: Complex flow (drug reaction, Agent 7 flags, loop, Agent 8 flags, Agent 9 detects allergy)
 *
 * Triggered by matching the symptoms field (lowercase, trimmed, spaces collapsed).
 */

// ── Trigger matching ─────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export function matchDemoScenario(symptoms: string): "A" | "B" | null {
  const norm = normalize(symptoms);
  if (norm === "fever, body ache, sore throat") return "A";
  if (norm === "itchy skin rash on arms") return "B";
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO A — Simple Clean Flow
// Patient: DevPatient (54M, T2DM, HTN, Penicillin allergy)
// Symptoms: Fever, body ache, sore throat (3 days, moderate)
// Result: Clean prescription, no flags, no loops, no Agent 9 findings
// ═══════════════════════════════════════════════════════════════════════════════

export const SCENARIO_A = {
  trigger: "fever, body ache, sore throat",

  agent2: {
    structuredTranscript: [
      { speaker: "doctor", text: "Good morning. What brings you in today?" },
      { speaker: "patient", text: "Good morning doctor. I've had a fever for about 3 days now, along with body aches all over and a sore throat." },
      { speaker: "doctor", text: "How high has the fever been?" },
      { speaker: "patient", text: "Around 100 to 101 degrees. It comes and goes. I've been taking Paracetamol but it only helps for a few hours." },
      { speaker: "doctor", text: "Any cough, runny nose, or difficulty breathing?" },
      { speaker: "patient", text: "No real cough, just the sore throat. Nose is a bit stuffy." },
      { speaker: "doctor", text: "Are you still taking your regular medications — Metformin and Amlodipine?" },
      { speaker: "patient", text: "Yes, I haven't missed any doses." },
      { speaker: "doctor", text: "How's your blood sugar been?" },
      { speaker: "patient", text: "A little higher than usual, around 160 fasting." },
      { speaker: "doctor", text: "Any known allergies?" },
      { speaker: "patient", text: "Yes, I'm allergic to Penicillin." },
      { speaker: "doctor", text: "Alright. Let me examine you and prescribe something." },
    ],
    chiefComplaint: "Fever (100-101°F) for 3 days with body aches and sore throat",
    mentionedSymptoms: [
      "Fever 100-101°F (3 days)",
      "Body aches (generalized)",
      "Sore throat",
      "Nasal stuffiness",
      "Elevated fasting blood sugar (160 mg/dL)",
    ],
    mentionedMedications: [
      { raw: "Paracetamol", rxNormName: "acetaminophen", rxCUI: "161", status: "matched" },
      { raw: "Metformin", rxNormName: "metformin", rxCUI: "6809", status: "matched" },
      { raw: "Amlodipine", rxNormName: "amlodipine", rxCUI: "17767", status: "matched" },
    ],
    mentionedAllergies: ["Penicillin"],
    duration: "3 days",
    severity: "moderate",
  },

  agent3: {
    topCases: [
      {
        caseId: "CASE-7B3E91", similarity: 0.93, age: 50, gender: "M",
        symptoms: "Fever, sore throat, body ache, fatigue", duration: "3 days", severity: "moderate",
        diagnosis: "Acute viral upper respiratory tract infection",
        medicines: ["Azithromycin 500mg", "Paracetamol 650mg", "Cetirizine 10mg"],
        advice: "Rest, warm fluids, complete antibiotic course",
        knownConditions: ["Hypertension"], relevanceNote: "",
      },
      {
        caseId: "CASE-4D2F8A", similarity: 0.89, age: 55, gender: "M",
        symptoms: "High fever, body pain, mild sore throat", duration: "2 days", severity: "moderate",
        diagnosis: "Acute pharyngitis with viral fever",
        medicines: ["Paracetamol 650mg", "Chlorpheniramine 4mg", "Betadine gargle"],
        advice: "Gargle with warm salt water. Hydrate well.",
        knownConditions: ["Type 2 Diabetes"], relevanceNote: "",
      },
      {
        caseId: "CASE-A1C6D4", similarity: 0.85, age: 48, gender: "F",
        symptoms: "Fever, headache, body ache, nasal congestion", duration: "4 days", severity: "moderate",
        diagnosis: "Influenza-like illness",
        medicines: ["Oseltamivir 75mg", "Paracetamol 500mg", "ORS"],
        advice: "Rest. Monitor for worsening symptoms.",
        knownConditions: [], relevanceNote: "",
      },
    ],
    overallSummary: "The majority of similar cases present with acute viral upper respiratory infections. Dominant treatment involves antipyretics (paracetamol), antihistamines (cetirizine/chlorpheniramine), and macrolide antibiotics (azithromycin) when bacterial superinfection is suspected. NSAIDs are consistently avoided in patients with diabetes and hypertension.",
  },

  agent4: {
    conditions: [
      { inputName: "Type 2 Diabetes", conditionSummary: "Type 2 diabetes is a chronic metabolic disorder characterized by insulin resistance and impaired glucose regulation. During acute infections, blood sugar levels often rise. Monitor glucose more frequently. Prefer paracetamol over NSAIDs. Metformin can be continued unless severe dehydration occurs." },
      { inputName: "Hypertension", conditionSummary: "Hypertension is sustained elevated blood pressure. During febrile illness, BP may fluctuate. Continue antihypertensives. Avoid NSAIDs and decongestants containing pseudoephedrine as they raise blood pressure." },
    ],
    evidenceSummary: {
      findings: [
        "Acute URTI is the most common cause of fever with sore throat and body aches in adults",
        "Diabetic patients are at slightly higher risk for bacterial superinfection",
      ],
      possibleDiagnoses: ["Acute viral upper respiratory tract infection", "Acute pharyngitis"],
      differentials: ["Influenza", "Streptococcal pharyngitis", "Early COVID-19"],
      redFlags: [
        "Avoid NSAIDs (ibuprofen, diclofenac) — patient has diabetes AND hypertension",
        "Avoid all penicillin-class antibiotics — confirmed severe allergy",
      ],
      managementConsiderations: [
        "Azithromycin is the preferred antibiotic for penicillin-allergic patients with suspected bacterial URTI",
        "Paracetamol is safe for fever in diabetic and hypertensive patients",
        "Monitor blood sugar more frequently during infection — hyperglycemia is expected",
      ],
      clinicalInsights: [
        "Elevated fasting glucose (160 mg/dL) during infection is expected and does not require medication change unless persistent",
      ],
    },
  },

  agent5: {
    allAllergies: [
      { allergen: "Penicillin", severity: "severe", status: "confirmed", source: "patient_record" },
    ],
    expanded: [
      {
        allergen: "Penicillin", severity: "severe", status: "confirmed", source: "patient_record",
        drugClass: "Penicillins with extended spectrum", classId: "J01CA",
        avoidDrugs: ["amoxicillin", "ampicillin", "piperacillin", "ticarcillin", "carbenicillin", "bacampicillin"],
        avoidLevel: "hard_block",
        crossReactivity: ["Cephalosporins (1st gen)", "Carbapenems"],
        safeAlternatives: ["Macrolides (Azithromycin, Clarithromycin)", "Fluoroquinolones (Levofloxacin)"],
      },
    ],
    crossReactivityFlags: [
      "Penicillin allergy: ~2% cross-reactivity with cephalosporins (higher with 1st-gen); ~1% with carbapenems. Avoid 1st-gen cephalosporins; 3rd/4th-gen generally safe.",
    ],
    safeAlternativesSummary: {
      Penicillin: ["Macrolides (Azithromycin)", "Fluoroquinolones (Levofloxacin)", "Doxycycline"],
    },
  },

  agent6: {
    prescription: {
      diagnosis: "Acute viral upper respiratory tract infection with pharyngitis in a Type 2 Diabetic and Hypertensive patient",
      medicines: [
        { medicine: "Azithromycin", dosage: "500mg", timing: "after food", frequency: "once daily", duration: "3 days", condition: "", purpose: "Macrolide antibiotic — safe for penicillin allergy" },
        { medicine: "Paracetamol", dosage: "650mg", timing: "after food", frequency: "thrice daily", duration: "5 days", condition: "SOS: Take only if temperature > 100°F", purpose: "Reduce fever and relieve body ache" },
        { medicine: "Cetirizine", dosage: "10mg", timing: "at bedtime", frequency: "once daily", duration: "5 days", condition: "", purpose: "Relieve sore throat and nasal stuffiness" },
      ],
      advice: [
        "Monitor blood sugar more frequently during the infection",
        "Continue Metformin and Amlodipine without changes",
        "Stay well hydrated — aim for 2.5 to 3 litres of fluids daily",
        "Gargle with warm salt water for sore throat relief",
        "Return if fever persists beyond 5 days or breathing difficulty develops",
      ],
      drugSafetyNote: "Azithromycin chosen over Amoxicillin due to confirmed severe Penicillin allergy. Paracetamol used instead of NSAIDs to avoid renal and cardiovascular risks in a diabetic and hypertensive patient. No significant drug interactions with current medications (Metformin, Amlodipine).",
      historySummary: "Patient has a history of suboptimal diabetes control and stable hypertension. Previous URTI in February 2026 resolved with similar conservative management.",
    },
    reasoning: "Patient presents with classic acute URTI symptoms. Given confirmed Penicillin allergy, Azithromycin is the safe first-line antibiotic. NSAIDs avoided due to dual diabetes + hypertension. Short-course treatment with supportive care.",
    confidenceNotes: [],
    provider: "gemini",
  },

  agent7: {
    status: "PASS",
    perMedicine: [
      { drug: "Azithromycin", indicationOk: true, indicationDetail: "Macrolide antibiotic indicated for upper respiratory infections", doseOk: true, doseDetail: "500mg once daily for 3 days is standard adult dosing", verdict: "PASS", flagReason: null, replacement: null },
      { drug: "Paracetamol", indicationOk: true, indicationDetail: "Indicated for fever and pain relief", doseOk: true, doseDetail: "650mg thrice daily is within approved range (max 4g/day)", verdict: "PASS", flagReason: null, replacement: null },
      { drug: "Cetirizine", indicationOk: true, indicationDetail: "Antihistamine indicated for allergic symptoms and congestion", doseOk: true, doseDetail: "10mg once daily is standard adult dose", verdict: "PASS", flagReason: null, replacement: null },
    ],
    interactions: [],
    revisedPrescription: null,
    loopCount: 1,
    escalateReason: null,
  },

  agent8: {
    status: "PASS",
    checks: [
      { drug: "Azithromycin", violates: null, classMatch: null, allergySeverity: null, allergyStatus: null, verdict: "PASS", replacement: null },
      { drug: "Paracetamol", violates: null, classMatch: null, allergySeverity: null, allergyStatus: null, verdict: "PASS", replacement: null },
      { drug: "Cetirizine", violates: null, classMatch: null, allergySeverity: null, allergyStatus: null, verdict: "PASS", replacement: null },
    ],
    revisedPrescription: null,
    flaggedCount: 0,
    passedCount: 3,
  },

  agent9: {
    findings: [],
    newLifelongMeds: 0,
    newAllergies: 0,
  },

  flaggedDrugs: [],
};

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO B — Complex Flow (Flags + Loop + Agent 9 Findings)
// Patient: DevPatient (54M, T2DM, HTN, Penicillin allergy)
// Symptoms: Itchy skin rash on arms (after sulfa antibiotic)
// Result: Agent 7 flags Amoxicillin → loop → Agent 8 flags Cephalexin → red marks
//         Agent 9 detects new Sulfonamides allergy → System Detected banner
// ═══════════════════════════════════════════════════════════════════════════════

export const SCENARIO_B = {
  trigger: "itchy skin rash on arms",

  agent2: {
    structuredTranscript: [
      { speaker: "doctor", text: "Hello. What's going on today?" },
      { speaker: "patient", text: "Doctor, I developed an itchy rash on both arms about 2 days ago. It's red and very uncomfortable." },
      { speaker: "doctor", text: "Did anything change recently — new soap, food, or medication?" },
      { speaker: "patient", text: "Yes, I took Cotrimoxazole from a local pharmacy about 3 days ago for a mild infection. The rash started the next day." },
      { speaker: "doctor", text: "Cotrimoxazole is a sulfa antibiotic. This could be a drug reaction. Have you had a reaction to sulfa drugs before?" },
      { speaker: "patient", text: "No, this is the first time. But the rash is really itchy and spreading." },
      { speaker: "doctor", text: "Any breathing difficulty, swelling of lips or tongue, or fever?" },
      { speaker: "patient", text: "No breathing issues. No swelling. Just the rash and itching." },
      { speaker: "doctor", text: "Are you still taking your regular medications?" },
      { speaker: "patient", text: "Yes — Metformin 500mg and Amlodipine 5mg daily." },
      { speaker: "doctor", text: "And you're allergic to Penicillin, correct?" },
      { speaker: "patient", text: "Yes, confirmed Penicillin allergy." },
      { speaker: "doctor", text: "OK. Stop the Cotrimoxazole immediately. I'll prescribe something to treat the rash and we'll note this as a possible sulfa allergy." },
    ],
    chiefComplaint: "Itchy skin rash on both arms for 2 days, onset after taking Cotrimoxazole (sulfa antibiotic)",
    mentionedSymptoms: [
      "Itchy rash on arms (2 days)",
      "Redness on skin",
      "Spreading rash",
      "Started after Cotrimoxazole use",
    ],
    mentionedMedications: [
      { raw: "Cotrimoxazole", rxNormName: "trimethoprim / sulfamethoxazole", rxCUI: "10180", status: "matched" },
      { raw: "Metformin 500mg", rxNormName: "metformin", rxCUI: "6809", status: "matched" },
      { raw: "Amlodipine 5mg", rxNormName: "amlodipine", rxCUI: "17767", status: "matched" },
    ],
    mentionedAllergies: ["Penicillin"],
    duration: "2 days",
    severity: "mild",
  },

  agent3: {
    topCases: [
      {
        caseId: "CASE-E8F2B7", similarity: 0.91, age: 43, gender: "F",
        symptoms: "Itchy skin rash on arms and trunk, hives, swelling, redness", duration: "2 days", severity: "moderate",
        diagnosis: "Contact dermatitis — allergic reaction to topical product",
        medicines: ["Levocetirizine 5mg", "Mometasone cream 0.1%", "Calamine lotion"],
        advice: "Discontinue offending agent. Fragrance-free soap. Cotton clothing.",
        knownConditions: [], relevanceNote: "",
      },
      {
        caseId: "CASE-5C9DA3", similarity: 0.87, age: 38, gender: "M",
        symptoms: "Drug rash after antibiotic, itchy red patches on arms and chest", duration: "3 days", severity: "moderate",
        diagnosis: "Drug-induced maculopapular rash — suspected antibiotic reaction",
        medicines: ["Levocetirizine 5mg", "Prednisolone 20mg tapering", "Calamine lotion"],
        advice: "Stop the causative drug immediately. Monitor for progression. Return if blistering occurs.",
        knownConditions: ["Hypertension"], relevanceNote: "",
      },
      {
        caseId: "CASE-3F7E62", similarity: 0.82, age: 52, gender: "M",
        symptoms: "Itchy welts on arms and legs after new medication", duration: "1 day", severity: "mild",
        diagnosis: "Acute urticaria — drug hypersensitivity reaction",
        medicines: ["Cetirizine 10mg", "Calamine lotion"],
        advice: "Stop suspect drug. OTC antihistamine. Seek ER if throat swelling.",
        knownConditions: ["Type 2 Diabetes"], relevanceNote: "",
      },
    ],
    overallSummary: "The similar cases predominantly involve drug-induced skin reactions and allergic dermatitis. Antihistamines (levocetirizine, cetirizine) are universally prescribed. Topical calamine provides symptomatic itch relief. In moderate reactions, short-course oral corticosteroids (prednisolone) are added. All cases emphasize immediate discontinuation of the offending agent.",
  },

  agent4: {
    conditions: [
      { inputName: "Type 2 Diabetes", conditionSummary: "Type 2 diabetes requires careful drug selection. Corticosteroids (prednisolone) may elevate blood sugar — monitor closely if prescribed. NSAIDs should be avoided. Skin healing may be slower in diabetic patients." },
      { inputName: "Hypertension", conditionSummary: "Hypertension is sustained elevated blood pressure. Continue current antihypertensives. Some antihistamines are safe. Avoid decongestants with pseudoephedrine." },
    ],
    evidenceSummary: {
      findings: [
        "Sulfonamide antibiotics (Cotrimoxazole) are a known cause of drug-induced skin rash",
        "Timing of rash onset (1 day after drug exposure) is consistent with Type IV hypersensitivity reaction",
        "Patient has confirmed Penicillin allergy — increases vigilance for other drug sensitivities",
      ],
      possibleDiagnoses: ["Drug-induced maculopapular rash (sulfonamide reaction)", "Acute urticaria"],
      differentials: ["Contact dermatitis", "Viral exanthem", "Stevens-Johnson syndrome (if progresses)"],
      redFlags: [
        "Avoid NSAIDs — patient has diabetes AND hypertension",
        "Avoid all penicillin-class antibiotics — confirmed severe allergy",
        "Avoid sulfonamide antibiotics — suspected new allergy from this reaction",
        "Monitor for Stevens-Johnson syndrome progression: blistering, mucosal involvement, fever",
      ],
      managementConsiderations: [
        "Immediate discontinuation of Cotrimoxazole (already done)",
        "Antihistamines (levocetirizine/cetirizine) for itch relief",
        "Calamine lotion for topical symptomatic relief",
        "If reaction is moderate-severe, short-course low-dose Prednisolone may help",
      ],
      clinicalInsights: [
        "Drug rash in a diabetic patient: corticosteroids may elevate blood sugar — monitor if prescribed",
        "Flag Sulfonamides as a suspected allergy for future consultations",
      ],
    },
  },

  agent5: {
    allAllergies: [
      { allergen: "Penicillin", severity: "severe", status: "confirmed", source: "patient_record" },
      { allergen: "Sulfonamides", severity: "mild", status: "suspected", source: "consultation_mention" },
    ],
    expanded: [
      {
        allergen: "Penicillin", severity: "severe", status: "confirmed", source: "patient_record",
        drugClass: "Penicillins with extended spectrum", classId: "J01CA",
        avoidDrugs: ["amoxicillin", "ampicillin", "piperacillin", "ticarcillin", "bacampicillin"],
        avoidLevel: "hard_block",
        crossReactivity: ["Cephalosporins (1st gen)", "Carbapenems"],
        safeAlternatives: ["Macrolides (Azithromycin)", "Fluoroquinolones (Levofloxacin)", "Doxycycline"],
      },
      {
        allergen: "Sulfonamides", severity: "mild", status: "suspected", source: "consultation_mention",
        drugClass: "Intermediate-acting sulfonamides", classId: "J01EC",
        avoidDrugs: ["sulfamethoxazole", "sulfadiazine", "sulfamoxole"],
        avoidLevel: "monitor",
        crossReactivity: ["Non-antibiotic sulfonamides (Furosemide, Thiazides) — low cross-reactivity but document"],
        safeAlternatives: ["Azithromycin", "Doxycycline", "Nitrofurantoin"],
      },
    ],
    crossReactivityFlags: [
      "Penicillin allergy: ~2% cross-reactivity with cephalosporins (higher with 1st-gen); ~1% with carbapenems.",
      "Sulfonamide antibiotic allergy has low but documented cross-reactivity with non-antibiotic sulfonamides (furosemide, hydrochlorothiazide).",
    ],
    safeAlternativesSummary: {
      Penicillin: ["Macrolides (Azithromycin)", "Fluoroquinolones", "Doxycycline"],
      Sulfonamides: ["Azithromycin", "Doxycycline", "Nitrofurantoin"],
    },
  },

  // ── Agent 6 FIRST PASS (deliberately includes Amoxicillin — will be caught) ──
  agent6_pass1: {
    prescription: {
      diagnosis: "Suspected sulfonamide drug reaction — allergic maculopapular rash in a Type 2 Diabetic and Hypertensive patient",
      medicines: [
        { medicine: "Amoxicillin", dosage: "500mg", timing: "after food", frequency: "thrice daily", duration: "5 days", condition: "", purpose: "Antibiotic for secondary skin infection prevention" },
        { medicine: "Levocetirizine", dosage: "5mg", timing: "at bedtime", frequency: "once daily", duration: "7 days", condition: "", purpose: "Antihistamine to control allergic rash and itching" },
        { medicine: "Calamine lotion", dosage: "topical", timing: "as needed", frequency: "twice daily", duration: "7 days", condition: "Apply to affected skin areas only", purpose: "Soothe itching and cool inflamed skin" },
      ],
      advice: [
        "STOP Cotrimoxazole immediately — suspected cause of the rash",
        "Monitor blood sugar — illness and stress may elevate glucose",
        "Wear loose cotton clothing to reduce skin irritation",
        "Return immediately if rash spreads, blisters form, or breathing difficulty",
        "Continue regular medications (Metformin, Amlodipine) without changes",
      ],
      drugSafetyNote: "Amoxicillin prescribed for secondary infection prevention. Paracetamol can be used if pain/fever develops. NSAIDs avoided due to diabetes and hypertension.",
      historySummary: "Patient has recurring drug sensitivities — confirmed Penicillin allergy on record. This new sulfa reaction warrants documentation.",
    },
    reasoning: "Patient has a drug-induced rash from Cotrimoxazole. Need antihistamine for symptoms, topical calamine for itch, and prophylactic antibiotic.",
    confidenceNotes: ["Consider documenting suspected Sulfonamide allergy"],
    provider: "gemini",
  },

  // ── Agent 7 FIRST PASS — catches Amoxicillin ──────────────────────────────
  agent7_pass1: {
    status: "FLAG",
    perMedicine: [
      {
        drug: "Amoxicillin", indicationOk: false, indicationDetail: "Amoxicillin is a PENICILLIN — patient has confirmed severe Penicillin allergy. This drug is in the hard-block avoid list.",
        doseOk: true, doseDetail: "500mg thrice daily is standard dosing",
        verdict: "FLAG",
        flagReason: "CRITICAL: Amoxicillin is a Penicillin-class drug. Patient has confirmed SEVERE Penicillin allergy. This is a hard block — must use alternative.",
        replacement: { medicine: "Azithromycin", dosage: "500mg", timing: "after food", frequency: "once daily", duration: "3 days", condition: "", purpose: "Macrolide antibiotic — safe for penicillin allergy" },
      },
      { drug: "Levocetirizine", indicationOk: true, indicationDetail: "Antihistamine indicated for allergic rash", doseOk: true, doseDetail: "5mg once daily is standard", verdict: "PASS", flagReason: null, replacement: null },
      { drug: "Calamine lotion", indicationOk: true, indicationDetail: "Topical for itch relief", doseOk: true, doseDetail: "Topical application as needed", verdict: "PASS", flagReason: null, replacement: null },
    ],
    interactions: [
      { drugA: "Amoxicillin", drugB: "Metformin", level: "Moderate", source: "ddinter", note: "Moderate interaction — amoxicillin may increase metformin effect" },
    ],
    revisedPrescription: null,
    loopCount: 1,
    escalateReason: null,
  },

  // ── Agent 6 SECOND PASS (revised — Azithromycin replaces Amoxicillin, adds Cephalexin) ──
  agent6_pass2: {
    prescription: {
      diagnosis: "Suspected sulfonamide drug reaction — allergic maculopapular rash in a Type 2 Diabetic and Hypertensive patient",
      medicines: [
        { medicine: "Azithromycin", dosage: "500mg", timing: "after food", frequency: "once daily", duration: "3 days", condition: "", purpose: "Macrolide antibiotic — safe for penicillin allergy" },
        { medicine: "Cephalexin", dosage: "500mg", timing: "after food", frequency: "twice daily", duration: "5 days", condition: "", purpose: "Cephalosporin for secondary skin infection prevention" },
        { medicine: "Levocetirizine", dosage: "5mg", timing: "at bedtime", frequency: "once daily", duration: "7 days", condition: "", purpose: "Antihistamine to control allergic rash" },
        { medicine: "Calamine lotion", dosage: "topical", timing: "as needed", frequency: "twice daily", duration: "7 days", condition: "Apply to affected skin areas only", purpose: "Soothe itching and cool inflamed skin" },
      ],
      advice: [
        "STOP Cotrimoxazole immediately — suspected cause of the rash",
        "Monitor blood sugar — illness and stress may elevate glucose",
        "Wear loose cotton clothing to reduce skin irritation",
        "Return immediately if rash spreads, blisters form, or breathing difficulty",
        "Continue regular medications (Metformin, Amlodipine) without changes",
      ],
      drugSafetyNote: "Azithromycin replaces Amoxicillin (penicillin allergy). Cephalexin added for skin infection coverage. NSAIDs avoided due to diabetes and hypertension.",
      historySummary: "Patient has confirmed Penicillin allergy and now suspected Sulfonamide allergy. Drug sensitivities are a recurring concern.",
    },
    reasoning: "Revised after Agent 7 flagged Amoxicillin. Replaced with Azithromycin (macrolide, safe). Added Cephalexin for broader skin infection coverage.",
    confidenceNotes: ["Cephalexin is a 1st-gen cephalosporin — may have cross-reactivity with penicillin allergy"],
    provider: "gemini",
  },

  // ── Agent 7 SECOND PASS — all clear from drug interaction perspective ──────
  agent7_pass2: {
    status: "PASS",
    perMedicine: [
      { drug: "Azithromycin", indicationOk: true, indicationDetail: "Macrolide antibiotic indicated for infection prophylaxis", doseOk: true, doseDetail: "500mg once daily for 3 days — standard", verdict: "PASS", flagReason: null, replacement: null },
      { drug: "Cephalexin", indicationOk: true, indicationDetail: "Cephalosporin indicated for skin infection", doseOk: true, doseDetail: "500mg twice daily — standard", verdict: "PASS", flagReason: null, replacement: null },
      { drug: "Levocetirizine", indicationOk: true, indicationDetail: "Antihistamine for allergic rash", doseOk: true, doseDetail: "5mg once daily — standard", verdict: "PASS", flagReason: null, replacement: null },
      { drug: "Calamine lotion", indicationOk: true, indicationDetail: "Topical for itch relief", doseOk: true, doseDetail: "Topical as needed", verdict: "PASS", flagReason: null, replacement: null },
    ],
    interactions: [],
    revisedPrescription: null,
    loopCount: 1,
    escalateReason: null,
  },

  // ── Agent 8 — catches Cephalexin (cross-reactivity with Penicillin) ────────
  agent8: {
    status: "FLAG",
    checks: [
      { drug: "Azithromycin", violates: null, classMatch: null, allergySeverity: null, allergyStatus: null, verdict: "PASS", replacement: null },
      {
        drug: "Cephalexin",
        violates: "Penicillin allergy (confirmed, severe)",
        classMatch: "Cephalosporins — cross-reactivity with Penicillin class",
        allergySeverity: "severe",
        allergyStatus: "confirmed",
        verdict: "STRONG_CAUTION",
        replacement: { medicine: "Doxycycline", dosage: "100mg", timing: "after food", frequency: "twice daily", duration: "5 days", condition: "", purpose: "Tetracycline antibiotic — no penicillin cross-reactivity" },
      },
      { drug: "Levocetirizine", violates: null, classMatch: null, allergySeverity: null, allergyStatus: null, verdict: "PASS", replacement: null },
      { drug: "Calamine lotion", violates: null, classMatch: null, allergySeverity: null, allergyStatus: null, verdict: "PASS", replacement: null },
    ],
    revisedPrescription: {
      diagnosis: "Suspected sulfonamide drug reaction — allergic maculopapular rash in a Type 2 Diabetic and Hypertensive patient",
      medicines: [
        { medicine: "Azithromycin", dosage: "500mg", timing: "after food", frequency: "once daily", duration: "3 days", condition: "", purpose: "Macrolide antibiotic — safe for penicillin allergy" },
        { medicine: "Doxycycline", dosage: "100mg", timing: "after food", frequency: "twice daily", duration: "5 days", condition: "", purpose: "Tetracycline antibiotic — no cross-reactivity" },
        { medicine: "Levocetirizine", dosage: "5mg", timing: "at bedtime", frequency: "once daily", duration: "7 days", condition: "", purpose: "Antihistamine to control allergic rash" },
        { medicine: "Calamine lotion", dosage: "topical", timing: "as needed", frequency: "twice daily", duration: "7 days", condition: "Apply to affected skin areas only", purpose: "Soothe itching and cool inflamed skin" },
      ],
      advice: [
        "STOP Cotrimoxazole immediately — suspected cause of the rash",
        "Monitor blood sugar — illness and stress may elevate glucose",
        "Wear loose cotton clothing to reduce skin irritation",
        "Return immediately if rash spreads, blisters form, or breathing difficulty",
        "Continue regular medications (Metformin, Amlodipine) without changes",
      ],
      drugSafetyNote: "Azithromycin and Doxycycline selected — both safe for penicillin-allergic patients with no cephalosporin cross-reactivity risk. Cephalexin removed due to penicillin cross-reactivity concern. NSAIDs avoided. Suspected Sulfonamide allergy flagged for patient record.",
      historySummary: "Patient now has confirmed Penicillin allergy AND suspected Sulfonamide allergy. Two drug classes to avoid going forward.",
    },
    flaggedCount: 1,
    passedCount: 3,
  },

  // ── Agent 9 — detects new Sulfonamides allergy ─────────────────────────────
  agent9: {
    findings: [
      {
        type: "allergy",
        value: "Sulfonamides",
        severity: "mild",
        allergyStatus: "suspected",
        reason: "Patient developed itchy skin rash after taking Cotrimoxazole (a sulfonamide antibiotic). Rash appeared within 24 hours of drug exposure, consistent with drug hypersensitivity reaction. Doctor confirmed this is a suspected sulfonamide allergy.",
        source: "consultation transcript + drug safety note",
        status: "pending",
      },
      {
        type: "lifelong_med",
        value: "Telmisartan 40mg",
        reason: "Patient's blood pressure was uncontrolled on Amlodipine alone (BP 150/96 at previous visit). Telmisartan 40mg was added as a long-term daily antihypertensive in consultation #2 but was never recorded in the patient's medication list.",
        source: "consultation history + prescription analysis",
        status: "pending",
      },
    ],
    newLifelongMeds: 1,
    newAllergies: 1,
  },

  // ── Final flagged drugs (what the doctor sees as red) ──────────────────────
  flaggedDrugs: [
    {
      drug: "Amoxicillin",
      reason: "CRITICAL: Amoxicillin is a Penicillin-class drug. Patient has confirmed SEVERE Penicillin allergy. Hard block.",
      suggestedAlternative: "Azithromycin 500mg",
      flaggedBy: "agent7",
      replacement: { medicine: "Azithromycin", dosage: "500mg", frequency: "once daily", duration: "3 days", purpose: "Macrolide antibiotic — safe for penicillin allergy" },
    },
    {
      drug: "Cephalexin",
      reason: "Cephalexin is a 1st-generation Cephalosporin with ~2% cross-reactivity with Penicillin allergy. Patient has confirmed severe Penicillin allergy — STRONG CAUTION.",
      suggestedAlternative: "Doxycycline 100mg",
      flaggedBy: "agent8",
      replacement: { medicine: "Doxycycline", dosage: "100mg", frequency: "twice daily", duration: "5 days", purpose: "Tetracycline antibiotic — no cross-reactivity" },
    },
  ],
};
