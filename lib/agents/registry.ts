export interface AgentMeta {
  id: number;
  name: string;
  purpose: string;
  phase: "gather" | "prescribe" | "verify" | "detect";
  consumes: string[];
  produces: string;
  feedsInto: number[];
  triggeredBy: number[];
  dataSources: string[];
}

export const AGENT_REGISTRY: AgentMeta[] = [
  {
    id: 1,
    name: "Patient Summary Agent",
    purpose: "Maintains a running patient summary from profile + past consultations",
    phase: "gather",
    consumes: ["PatientProfile", "Past Consultations"],
    produces: "PatientSummary",
    feedsInto: [6],
    triggeredBy: [],
    dataSources: ["MongoDB: patientprofiles", "MongoDB: appointments", "MongoDB: aiconsultations"],
  },
  {
    id: 2,
    name: "Transcribe Agent",
    purpose: "Structures the consultation transcript + RxNorm drug-name normalization",
    phase: "gather",
    consumes: ["Raw Transcript"],
    produces: "TranscriptResult",
    feedsInto: [4, 5, 6],
    triggeredBy: [],
    dataSources: ["Call Transcript", "RxNorm API"],
  },
  {
    id: 3,
    name: "Similar Cases Agent",
    purpose: "Hybrid vector search + rerank over the case library",
    phase: "gather",
    consumes: ["Symptoms", "Severity", "Duration"],
    produces: "SimilarCase[]",
    feedsInto: [6],
    triggeredBy: [],
    dataSources: ["MongoDB: cases (Atlas Vector Search)", "Gemini embedding-001"],
  },
  {
    id: 4,
    name: "Medical Context Agent",
    purpose: "Resolves ICD-10 codes, fetches MedlinePlus summaries, retrieves drug/condition knowledge from the embedded library",
    phase: "gather",
    consumes: ["Known Conditions (patient profile)", "Booking Symptoms (pre-consultation form)"],
    produces: "Agent4Output (conditions + retrievedChunks + evidenceSummary)",
    feedsInto: [6, 7],
    triggeredBy: [2],
    dataSources: ["ConditionLookUp (ICD-10)", "NIH Clinical Tables API", "MedlinePlus Connect", "medicalcontexts (vector)", "NLM wsearch", "Gemini 2.5 Flash"],
  },
  {
    id: 5,
    name: "Allergy Context Agent",
    purpose: "Expands patient allergies into full drug-class avoid-lists via RxClass, with severity weighting and safe alternatives",
    phase: "gather",
    consumes: ["Patient Allergies (record)", "Consultation Mentions (Agent 2)", "Suspected Allergies (Agent 1 feedback)"],
    produces: "Agent5Output (expanded allergy blocks + cross-reactivity + safe alternatives)",
    feedsInto: [6, 8],
    triggeredBy: [2],
    dataSources: ["RxClass API", "RxNorm API", "openFDA contraindications (medicalcontexts)", "Patient Record"],
  },
  {
    id: 6,
    name: "Reasoning Agent",
    purpose: "Takes all gathered data from Agents 1-5, reasons about the case, and generates a complete prescription suggestion",
    phase: "prescribe",
    consumes: ["Agent1: Patient + Summary + History", "Agent2: Transcript", "Agent3: Similar Cases", "Agent4: Evidence Summary", "Agent5: Allergy Context"],
    produces: "Agent6Output (Prescription + reasoning + confidence notes)",
    feedsInto: [7, 8],
    triggeredBy: [1, 2, 3, 4, 5],
    dataSources: ["Gemini 2.5 Flash / Ollama qwen3:8b (parallel race)"],
  },
  {
    id: 7,
    name: "Drug Medic Agent",
    purpose: "Safety gate: verifies right drug (openFDA indications), right dose (openFDA dosing), drug interactions (DDInter DB), and requests replacements for flagged drugs",
    phase: "verify",
    consumes: ["Prescription (Agent 6)", "Patient meds + conditions"],
    produces: "Agent7Output (per-medicine verdicts + interactions + revised prescription)",
    feedsInto: [6, 9],
    triggeredBy: [6],
    dataSources: ["openFDA Drug Label API (live)", "DDInter DB (MongoDB)", "Gemini/Ollama for interpretation"],
  },
  {
    id: 8,
    name: "Allergy Agent",
    purpose: "Final safety gate: deterministic class-membership check of every prescribed drug against expanded allergy classes, with batch replacement for violations",
    phase: "verify",
    consumes: ["Prescription (Agent 6/7)", "Allergy Blocks (Agent 5)"],
    produces: "Agent8Output (per-drug allergy verdict + revised prescription)",
    feedsInto: [6, 9],
    triggeredBy: [6],
    dataSources: ["RxNorm API (RxCUI resolution)", "RxClass API (class membership)", "Gemini/Ollama (replacements only)"],
  },
  {
    id: 9,
    name: "Finding Detector Agent",
    purpose: "Detects new lifelong meds + new allergies from consultation, writes proposals to SystemDetected for patient confirmation",
    phase: "detect",
    consumes: ["Prescription (final)", "Transcript (Agent 2)", "Existing patient allergies + meds"],
    produces: "Agent9Output (findings posted to SystemDetected collection as pending)",
    feedsInto: [],
    triggeredBy: [7, 8],
    dataSources: ["Gemini/Ollama (parallel race)", "MongoDB: SystemDetected"],
  },
];

export function getAgentMeta(agentId: number): AgentMeta | undefined {
  return AGENT_REGISTRY.find((a) => a.id === agentId);
}
