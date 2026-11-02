import type {
  PatientSummary,
  ConsultationSummary,
  TranscriptResult,
  SimilarCase,
  MedicalContext,
  AllergyContext,
  Prescription,
  DrugCheckResult,
  AllergyCheckResult,
  FindingDetectorResult,
} from "./types";

const pastConsultations: ConsultationSummary[] = [
  {
    date: "2026-05-10",
    type: "doctor",
    symptoms: "Persistent headache, blurred vision",
    diagnosis: "Hypertensive urgency",
    medicines: ["Amlodipine 5mg", "Telmisartan 40mg"],
  },
  {
    date: "2026-04-02",
    type: "ai",
    symptoms: "Fatigue, increased thirst, frequent urination",
    diagnosis: "Uncontrolled Type 2 Diabetes Mellitus",
    medicines: ["Metformin 500mg", "Glimepiride 1mg"],
  },
  {
    date: "2026-02-18",
    type: "doctor",
    symptoms: "Seasonal cold, mild fever",
    diagnosis: "Acute Upper Respiratory Tract Infection",
    medicines: ["Paracetamol 650mg", "Cetirizine 10mg", "Steam inhalation"],
  },
];

export const MOCK_PATIENT_SUMMARY: PatientSummary = {
  patientId: "PT-100234",
  name: "Rajesh Kumar",
  age: 48,
  gender: "Male",
  weight: 82,
  height: 170,
  bloodGroup: "B+",
  knownConditions: ["Type 2 Diabetes Mellitus", "Hypertension Stage 1"],
  allergies: ["Penicillin", "Sulfonamides"],
  currentMedications: ["Metformin 500mg BD", "Amlodipine 5mg OD", "Telmisartan 40mg OD"],
  pastConsultations,
  profileSummary:
    "Rajesh Kumar is a 48-year-old male (BMI 28.4, overweight) with Type 2 Diabetes Mellitus " +
    "and Stage 1 Hypertension. Blood group B+. Known allergies to Penicillin and Sulfonamides. " +
    "Currently on Metformin 500mg BD, Amlodipine 5mg OD, and Telmisartan 40mg OD.",
  runningSummary:
    "48yo male with T2DM and HTN Stage 1. On Metformin + Amlodipine + Telmisartan. " +
    "Last visit (May 2026) was hypertensive urgency — BP stabilized. " +
    "Diabetes control suboptimal (HbA1c unknown, symptoms of polyuria in April). " +
    "Known penicillin and sulfonamide allergy. No surgical history.",
};

export const MOCK_TRANSCRIPT =
  "Doctor: Good morning, Rajesh. What brings you in today?\n" +
  "Patient: Good morning, doctor. I've had a fever for two days now, around 101°F. " +
  "I also have a bad cough with some yellowish phlegm, and my body is aching all over.\n" +
  "Doctor: When did the cough start?\n" +
  "Patient: The cough started about three days ago, but the fever only came two days back. " +
  "I've also been feeling very tired.\n" +
  "Doctor: Any shortness of breath or chest pain?\n" +
  "Patient: No chest pain, but I do feel a bit breathless when I climb stairs.\n" +
  "Doctor: Are you still taking your regular medications — the Metformin, Amlodipine, Telmisartan?\n" +
  "Patient: Yes, I haven't missed any doses.\n" +
  "Doctor: Any changes in your blood sugar readings?\n" +
  "Patient: It's been a bit higher than usual — around 180 fasting yesterday.\n" +
  "Doctor: Okay. Any sore throat or nasal congestion?\n" +
  "Patient: Mild sore throat, yes. Nose is a little blocked.\n" +
  "Doctor: Have you taken anything for the fever?\n" +
  "Patient: Just Paracetamol 500mg, it helps for a few hours then the fever comes back.\n" +
  "Doctor: Alright. Let me examine you and we'll go from there.";

export const MOCK_TRANSCRIPT_RESULT: TranscriptResult = {
  structuredTranscript: [
    { speaker: "doctor", text: "Good morning, Rajesh. What brings you in today?" },
    {
      speaker: "patient",
      text: "Good morning, doctor. I've had a fever for two days now, around 101°F. I also have a bad cough with some yellowish phlegm, and my body is aching all over.",
    },
    { speaker: "doctor", text: "When did the cough start?" },
    {
      speaker: "patient",
      text: "The cough started about three days ago, but the fever only came two days back. I've also been feeling very tired.",
    },
    { speaker: "doctor", text: "Any shortness of breath or chest pain?" },
    { speaker: "patient", text: "No chest pain, but I do feel a bit breathless when I climb stairs." },
    {
      speaker: "doctor",
      text: "Are you still taking your regular medications — the Metformin, Amlodipine, Telmisartan?",
    },
    { speaker: "patient", text: "Yes, I haven't missed any doses." },
    { speaker: "doctor", text: "Any changes in your blood sugar readings?" },
    { speaker: "patient", text: "It's been a bit higher than usual — around 180 fasting yesterday." },
    { speaker: "doctor", text: "Okay. Any sore throat or nasal congestion?" },
    { speaker: "patient", text: "Mild sore throat, yes. Nose is a little blocked." },
    { speaker: "doctor", text: "Have you taken anything for the fever?" },
    {
      speaker: "patient",
      text: "Just Paracetamol 500mg, it helps for a few hours then the fever comes back.",
    },
    { speaker: "doctor", text: "Alright. Let me examine you and we'll go from there." },
  ],
  chiefComplaint: "Fever (101°F) for 2 days with productive cough (yellowish phlegm) and body ache",
  mentionedSymptoms: [
    "Fever 101°F (2 days)",
    "Productive cough with yellow phlegm (3 days)",
    "Body ache",
    "Fatigue",
    "Mild dyspnea on exertion",
    "Sore throat",
    "Nasal congestion",
    "Elevated fasting blood sugar (180 mg/dL)",
  ],
  mentionedMedications: [
    { raw: "Metformin", rxNormName: "Metformin 500 MG Oral Tablet", rxCUI: "861004", status: "matched" as const },
    { raw: "Amlodipine", rxNormName: "Amlodipine 5 MG Oral Tablet", rxCUI: "329528", status: "matched" as const },
    { raw: "Telmisartan", rxNormName: "Telmisartan 40 MG Oral Tablet", rxCUI: "999967", status: "matched" as const },
    { raw: "Paracetamol 500mg", rxNormName: "Acetaminophen 500 MG Oral Tablet", rxCUI: "198440", status: "matched" as const },
  ],
  mentionedAllergies: [],
  duration: "2–3 days",
  severity: "moderate",
};

export const MOCK_SIMILAR_CASES: SimilarCase[] = [
  {
    caseId: "CASE-0042", similarity: 0.91, age: 52, gender: "Male",
    symptoms: "High fever, productive cough, body ache", duration: "3 days", severity: "moderate",
    diagnosis: "Acute Bronchitis", medicines: ["Azithromycin 500mg", "Paracetamol 650mg", "Ambroxol 30mg"],
    advice: "Rest, hydrate, complete antibiotics", knownConditions: [],
    relevanceNote: "Similar respiratory symptoms + fever pattern in a middle-aged male",
  },
  {
    caseId: "CASE-0078", similarity: 0.87, age: 45, gender: "Female",
    symptoms: "Fever, cough with sputum, sore throat, fatigue", duration: "4 days", severity: "moderate",
    diagnosis: "Viral URTI with secondary bacterial suspicion", medicines: ["Amoxicillin 500mg", "Paracetamol 500mg", "Cetirizine 10mg"],
    advice: "Rest, warm fluids", knownConditions: [],
    relevanceNote: "Overlapping URTI symptoms — note: Amoxicillin is a penicillin (patient allergic)",
  },
  {
    caseId: "CASE-0015", similarity: 0.84, age: 50, gender: "Male",
    symptoms: "Fever with chills, dry cough, generalized weakness", duration: "2 days", severity: "moderate",
    diagnosis: "Influenza-like Illness", medicines: ["Oseltamivir 75mg", "Paracetamol 650mg", "ORS"],
    advice: "Isolate, hydrate, rest", knownConditions: [],
    relevanceNote: "Seasonal flu pattern in similar demographic",
  },
  {
    caseId: "CASE-0091", similarity: 0.81, age: 55, gender: "Male",
    symptoms: "Fever, body ache, nasal congestion, headache", duration: "3 days", severity: "mild",
    diagnosis: "Acute Viral Fever", medicines: ["Paracetamol 650mg", "Cetirizine 10mg", "Vitamin C"],
    advice: "Supportive care, hydrate", knownConditions: ["Hypertension"],
    relevanceNote: "Simple viral fever with supportive management only",
  },
  {
    caseId: "CASE-0033", similarity: 0.78, age: 47, gender: "Male",
    symptoms: "Persistent cough, low-grade fever, fatigue, diabetic patient", duration: "5 days", severity: "moderate",
    diagnosis: "Lower Respiratory Tract Infection in Diabetic", medicines: ["Levofloxacin 500mg", "Montelukast 10mg", "Paracetamol 650mg"],
    advice: "Monitor blood sugar, complete antibiotic course", knownConditions: ["Type 2 Diabetes"],
    relevanceNote: "Diabetic patient with respiratory infection — antibiotic choice accounts for comorbidity",
  },
];

export const MOCK_MEDICAL_CONTEXT: MedicalContext = {
  guidelines: [
    {
      condition: "Acute Bronchitis",
      source: "NICE CKS 2024",
      recommendation:
        "Most acute bronchitis is viral and self-limiting. Antibiotics only if high-risk (comorbidities, immunocompromised). Diabetes is a risk factor warranting antibiotic consideration.",
    },
    {
      condition: "Fever in Diabetic Patient",
      source: "ADA Standards of Care 2026",
      recommendation:
        "Infection-related hyperglycemia is common. Monitor blood sugar more frequently. Avoid NSAIDs — use Paracetamol for antipyresis. Consider early antibiotics.",
    },
  ],
  drugKnowledge: [
    {
      drug: "Azithromycin",
      classInfo: "Macrolide antibiotic",
      commonDosage: "500mg Day 1, then 250mg Days 2–5",
      warnings: ["QT prolongation risk", "Hepatotoxicity (rare)", "Not a penicillin — safe for penicillin-allergic patients"],
    },
    {
      drug: "Levofloxacin",
      classInfo: "Fluoroquinolone antibiotic",
      commonDosage: "500mg OD for 5–7 days",
      warnings: ["Tendon rupture risk", "QT prolongation", "May affect blood sugar in diabetics"],
    },
    {
      drug: "Paracetamol",
      classInfo: "Analgesic / Antipyretic",
      commonDosage: "500–650mg every 4–6 hours, max 4g/day",
      warnings: ["Hepatotoxic in overdose", "Safe in diabetes and hypertension"],
    },
  ],
  contraindicationFlags: [
    "Avoid NSAIDs (Ibuprofen, Diclofenac) — patient has diabetes + hypertension",
    "Avoid Penicillins (Amoxicillin, Ampicillin) — patient is allergic",
    "Avoid Sulfonamides (Co-trimoxazole) — patient is allergic",
  ],
};

export const MOCK_ALLERGY_CONTEXT: AllergyContext = {
  expandedAllergies: [
    {
      allergen: "Penicillin",
      drugClass: "Beta-Lactam Antibiotics — Penicillins",
      relatedDrugs: [
        "Amoxicillin",
        "Ampicillin",
        "Piperacillin",
        "Flucloxacillin",
        "Amoxicillin-Clavulanate (Augmentin)",
      ],
      rxClassSource: "RxClass: N0000011281",
    },
    {
      allergen: "Sulfonamides",
      drugClass: "Sulfonamide Antibiotics",
      relatedDrugs: [
        "Sulfamethoxazole",
        "Co-trimoxazole (Bactrim)",
        "Sulfasalazine",
        "Dapsone (cross-reactivity possible)",
      ],
      rxClassSource: "RxClass: N0000175882",
    },
  ],
  crossReactivityFlags: [
    "Penicillin allergy: ~2% cross-reactivity with Cephalosporins (use with caution or avoid 1st-gen)",
    "Sulfonamide antibiotics vs. non-antibiotic sulfonamides (Furosemide, Thiazides): low cross-reactivity but document",
  ],
};

export const MOCK_PRESCRIPTION: Prescription = {
  diagnosis: "Acute Bronchitis with secondary bacterial suspicion in a Type 2 Diabetic + Hypertensive patient",
  medicines: [
    {
      medicine: "Azithromycin",
      dosage: "500mg",
      timing: "After food",
      frequency: "Once daily",
      duration: "3 days",
      condition: "",
      purpose: "Macrolide antibiotic — safe for penicillin-allergic patients, covers atypical bacteria",
    },
    {
      medicine: "Paracetamol",
      dosage: "650mg",
      timing: "After food",
      frequency: "Three times daily",
      duration: "5 days",
      condition: "SOS: Take only if temperature > 100.4°F",
      purpose: "Antipyretic and analgesic — preferred over NSAIDs due to diabetes and hypertension",
    },
    {
      medicine: "Ambroxol",
      dosage: "30mg",
      timing: "After food",
      frequency: "Twice daily",
      duration: "5 days",
      condition: "",
      purpose: "Mucolytic to thin and clear yellowish phlegm",
    },
    {
      medicine: "Cetirizine",
      dosage: "10mg",
      timing: "At bedtime",
      frequency: "Once daily",
      duration: "5 days",
      condition: "",
      purpose: "Antihistamine for nasal congestion and sore throat relief",
    },
  ],
  advice: [
    "Monitor blood sugar more frequently during the infection — hyperglycemia is expected",
    "Continue all current medications (Metformin, Amlodipine, Telmisartan) without changes",
    "Stay well hydrated — aim for 2.5–3L of fluids daily",
    "Steam inhalation twice daily to relieve congestion",
    "Return if fever persists beyond 5 days, or if breathlessness worsens",
  ],
  drugSafetyNote:
    "Azithromycin selected over Amoxicillin due to confirmed Penicillin allergy. " +
    "Paracetamol used instead of Ibuprofen to avoid NSAID risks in diabetic + hypertensive patient. " +
    "No sulfonamide-containing drugs prescribed (patient allergic to Sulfonamides).",
  historySummary:
    "Recurring respiratory infections (Feb 2026 URTI, current bronchitis). " +
    "Diabetes control suboptimal (FBS 180). Consider HbA1c check and possible Metformin dose adjustment at follow-up.",
};

export const MOCK_DRUG_CHECK: DrugCheckResult = {
  approved: true,
  issues: [
    {
      type: "interaction",
      drug: "Azithromycin",
      detail: "Minor interaction with Amlodipine: both may prolong QT interval. Risk is low at standard doses — monitor.",
      severity: "info",
    },
  ],
  suggestions: [
    "Consider adding Pantoprazole 40mg if patient reports gastric discomfort from Azithromycin",
  ],
};

export const MOCK_ALLERGY_CHECK: AllergyCheckResult = {
  safe: true,
  conflicts: [],
};

export const MOCK_FINDING_DETECTOR: FindingDetectorResult = {
  newLifelongMeds: [],
  newAllergies: [],
};

export function getMockInputForAgent(agentId: number): unknown {
  switch (agentId) {
    case 1:
      return {
        patientId: MOCK_PATIENT_SUMMARY.patientId,
        patientProfile: {
          name: MOCK_PATIENT_SUMMARY.name,
          age: MOCK_PATIENT_SUMMARY.age,
          gender: MOCK_PATIENT_SUMMARY.gender,
          weight: MOCK_PATIENT_SUMMARY.weight,
          height: MOCK_PATIENT_SUMMARY.height,
          bloodGroup: MOCK_PATIENT_SUMMARY.bloodGroup,
          knownConditions: MOCK_PATIENT_SUMMARY.knownConditions,
          allergies: MOCK_PATIENT_SUMMARY.allergies,
          currentMedications: MOCK_PATIENT_SUMMARY.currentMedications,
        },
      };
    case 2:
      return { rawTranscript: MOCK_TRANSCRIPT };
    case 3:
      return {
        symptoms: "Fever, productive cough with yellow phlegm, body ache",
        severity: "moderate",
        duration: "2–3 days",
        patientAge: MOCK_PATIENT_SUMMARY.age,
        patientConditions: MOCK_PATIENT_SUMMARY.knownConditions,
      };
    case 4:
      return {
        patientId: MOCK_PATIENT_SUMMARY.patientId,
        knownConditions: MOCK_PATIENT_SUMMARY.knownConditions,
        bookingSymptoms: ["Fever", "Productive cough with yellow phlegm", "Body ache"],
      };
    case 5:
      return {
        knownAllergies: [
          { allergen: "Penicillin", severity: "severe", status: "confirmed", source: "patient_record" },
          { allergen: "Sulfonamides", severity: "mild", status: "confirmed", source: "patient_record" },
        ],
        consultationMentions: [],
        suspectedFromFeedback: [],
      };
    case 6:
      return {
        patient: {
          patientId: MOCK_PATIENT_SUMMARY.patientId,
          name: MOCK_PATIENT_SUMMARY.name,
          age: MOCK_PATIENT_SUMMARY.age,
          gender: MOCK_PATIENT_SUMMARY.gender,
          weight: MOCK_PATIENT_SUMMARY.weight,
          height: MOCK_PATIENT_SUMMARY.height,
          bloodGroup: MOCK_PATIENT_SUMMARY.bloodGroup,
          knownConditions: MOCK_PATIENT_SUMMARY.knownConditions,
          allergies: MOCK_PATIENT_SUMMARY.allergies,
          currentMedications: MOCK_PATIENT_SUMMARY.currentMedications,
          profileSummary: MOCK_PATIENT_SUMMARY.profileSummary,
          runningSummary: MOCK_PATIENT_SUMMARY.runningSummary,
          pastConsultations: MOCK_PATIENT_SUMMARY.pastConsultations,
        },
        transcript: MOCK_TRANSCRIPT_RESULT,
        similarCases: {
          topCases: MOCK_SIMILAR_CASES,
          overallSummary: "Dominant treatment pattern: macrolide antibiotics for respiratory infections in penicillin-allergic patients, paracetamol for fever/pain (NSAIDs avoided due to hypertension).",
        },
        medicalContext: {
          conditionSummaries: MOCK_MEDICAL_CONTEXT.guidelines.map((g) => ({ name: g.condition, summary: g.recommendation })),
          evidenceSummary: {
            findings: ["Acute bronchitis commonly viral but bacterial suspected with yellow phlegm"],
            possibleDiagnoses: ["Acute Bronchitis", "URTI with secondary bacterial infection"],
            differentials: ["Pneumonia", "Influenza"],
            redFlags: ["Avoid NSAIDs in diabetic + hypertensive patients", "Avoid penicillin class — confirmed allergy"],
            managementConsiderations: ["Azithromycin safe for penicillin-allergic patients", "Monitor blood sugar during infection"],
            clinicalInsights: ["Diabetic patient with respiratory infection may have elevated blood sugar — monitor closely"],
          },
        },
        allergyContext: {
          expanded: MOCK_ALLERGY_CONTEXT.expandedAllergies.map((a) => ({
            allergen: a.allergen,
            severity: "severe" as const,
            status: "confirmed" as const,
            source: "patient_record",
            drugClass: a.drugClass,
            classId: null,
            avoidDrugs: a.relatedDrugs,
            avoidLevel: "hard_block" as const,
            crossReactivity: [],
            safeAlternatives: [],
          })),
          crossReactivityFlags: MOCK_ALLERGY_CONTEXT.crossReactivityFlags,
          safeAlternatives: { "Penicillin": ["Macrolides (Azithromycin)", "Fluoroquinolones (Levofloxacin)"] },
        },
      };
    case 7:
      return {
        prescription: MOCK_PRESCRIPTION,
        diagnosis: MOCK_PRESCRIPTION.diagnosis,
        patientMeds: MOCK_PATIENT_SUMMARY.currentMedications,
        patientConditions: MOCK_PATIENT_SUMMARY.knownConditions,
        patientAge: MOCK_PATIENT_SUMMARY.age,
        patientWeight: MOCK_PATIENT_SUMMARY.weight,
        patientGender: MOCK_PATIENT_SUMMARY.gender,
        patientSummaryShort: `${MOCK_PATIENT_SUMMARY.name}, ${MOCK_PATIENT_SUMMARY.age}yo ${MOCK_PATIENT_SUMMARY.gender}, conditions: ${MOCK_PATIENT_SUMMARY.knownConditions.join(", ")}`,
        allergyList: MOCK_PATIENT_SUMMARY.allergies,
      };
    case 8:
      return {
        prescription: MOCK_PRESCRIPTION,
        diagnosis: MOCK_PRESCRIPTION.diagnosis,
        allergyBlocks: MOCK_ALLERGY_CONTEXT.expandedAllergies.map((a) => ({
          allergen: a.allergen,
          severity: "severe" as const,
          status: "confirmed" as const,
          source: "patient_record",
          drugClass: a.drugClass,
          classId: null,
          avoidDrugs: a.relatedDrugs,
          avoidLevel: "hard_block" as const,
          crossReactivity: [],
          safeAlternatives: [],
        })),
        crossReactivityFlags: MOCK_ALLERGY_CONTEXT.crossReactivityFlags,
        patientSummaryShort: `${MOCK_PATIENT_SUMMARY.name}, ${MOCK_PATIENT_SUMMARY.age}yo ${MOCK_PATIENT_SUMMARY.gender}, allergies: ${MOCK_PATIENT_SUMMARY.allergies.join(", ")}`,
        allergyList: MOCK_PATIENT_SUMMARY.allergies,
      };
    case 9:
      return {
        patientUserId: "000000000000000000000000",
        existingAllergies: MOCK_PATIENT_SUMMARY.allergies,
        existingMedications: MOCK_PATIENT_SUMMARY.currentMedications,
        prescription: MOCK_PRESCRIPTION,
        transcript: MOCK_TRANSCRIPT_RESULT,
      };
    default:
      return {};
  }
}
