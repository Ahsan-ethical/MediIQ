export type AgentStatus = "ok" | "flag" | "error";

export interface AgentResult<T = unknown> {
  agentId: number;
  agentName: string;
  status: AgentStatus;
  input: unknown;
  output: T | null;
  feedsInto: number[];
  triggeredBy: number[];
  logs: string[];
  durationMs: number;
  error?: string;
}

export type AgentFn<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  onPartial?: (partialText: string) => void,
) => Promise<AgentResult<TOutput>>;

export interface PatientSummary {
  patientId: string;
  name: string;
  age: number;
  gender: string;
  weight: number;
  height: number;
  bloodGroup: string;
  knownConditions: string[];
  allergies: string[];
  currentMedications: string[];
  pastConsultations: ConsultationSummary[];
  profileSummary: string;
  runningSummary: string;
}

export interface ConsultationSummary {
  date: string;
  type: "doctor" | "ai";
  symptoms: string;
  diagnosis: string;
  medicines: string[];
}

export interface TranscriptResult {
  structuredTranscript: TranscriptSegment[];
  chiefComplaint: string;
  mentionedSymptoms: string[];
  mentionedMedications: MedicationMention[];
  mentionedAllergies: string[];
  duration: string;
  severity: string;
}

export interface TranscriptSegment {
  speaker: "doctor" | "patient";
  text: string;
}

export type MedicationMatchStatus = "matched" | "unrecognized";

export interface MedicationMention {
  raw: string;
  rxNormName: string | null;
  rxCUI: string | null;
  status: MedicationMatchStatus;
}

export interface SimilarCase {
  caseId: string;
  similarity: number;
  age: number;
  gender: string;
  symptoms: string;
  duration: string;
  severity: string;
  diagnosis: string;
  medicines: string[];
  advice: string;
  knownConditions: string[];
  relevanceNote: string;
}

export interface SimilarCasesOutput {
  cleanedSymptoms: string;
  topCases: SimilarCase[];
  overallSummary: string;
  searchStats: {
    vectorCandidates: number;
    keywordCandidates: number;
    afterDemographicBoost: number;
    afterRerank: number;
  };
}

export interface MedicalContext {
  guidelines: GuidelineEntry[];
  drugKnowledge: DrugKnowledgeEntry[];
  contraindicationFlags: string[];
}

export interface GuidelineEntry {
  condition: string;
  source: string;
  recommendation: string;
}

export interface DrugKnowledgeEntry {
  drug: string;
  classInfo: string;
  commonDosage: string;
  warnings: string[];
}

// ── Agent 4 types ────────────────────────────────────────────────────────────

export interface Agent4Input {
  patientId: string;
  knownConditions: string[];
  bookingSymptoms: string[];
}

export interface Agent4ConditionEntry {
  inputName: string;
  normalized: string;
  icd10Code: string | null;
  codeSource: "lookup" | "nih_api" | "unresolved";
  medlinePlusUrl: string | null;
  medlinePlusTitle: string | null;
  medlinePlusSummary: string | null;
  conditionSummary: string;
}

export interface Agent4RetrievedChunk {
  text: string;
  score: number;
  source: "openfda" | "medlineplus";
  sourceMeta: Record<string, unknown>;
}

export interface Agent4EvidenceSummary {
  findings: string[];
  possibleDiagnoses: string[];
  differentials: string[];
  redFlags: string[];
  managementConsiderations: string[];
  clinicalInsights: string[];
}

export interface Agent4Output {
  conditions: Agent4ConditionEntry[];
  retrievalQueries: string[];
  retrievedChunks: Agent4RetrievedChunk[];
  evidenceSummary: Agent4EvidenceSummary;
  trace: {
    cacheHits: number;
    nihApiCalls: number;
    connectCalls: number;
    wsearchCalls: number;
    libraryQueriesRun: number;
    timings: Record<string, number>;
    fullOutputCacheHit?: number;
    medlineSummaryCacheHits?: number;
    medlineSummaryCacheMisses?: number;
    retrievalQueryCacheHit?: number;
    queryEmbeddingCacheHits?: number;
    queryEmbeddingCacheMisses?: number;
  };
}

export interface AllergyContext {
  expandedAllergies: ExpandedAllergy[];
  crossReactivityFlags: string[];
}

export interface ExpandedAllergy {
  allergen: string;
  drugClass: string;
  relatedDrugs: string[];
  rxClassSource: string;
}

// ── Agent 5 types ────────────────────────────────────────────────────────────

export type AllergySeverity = "severe" | "mild";
export type AllergyStatus = "confirmed" | "suspected";

export interface AllergyEntry {
  allergen: string;
  severity: AllergySeverity;
  status: AllergyStatus;
  source: "patient_record" | "consultation_mention" | "feedback_suspected";
}

export interface ExpandedAllergyBlock {
  allergen: string;
  severity: AllergySeverity;
  status: AllergyStatus;
  source: string;
  drugClass: string | null;
  classId: string | null;
  avoidDrugs: string[];
  avoidLevel: "hard_block" | "strong_caution" | "likely_block" | "monitor";
  crossReactivity: string[];
  safeAlternatives: string[];
}

export interface Agent5Input {
  patientRef?: string;
  knownAllergies: AllergyEntry[];
  consultationMentions: string[];
  suspectedFromFeedback: AllergyEntry[];
}

export interface Agent5Output {
  allAllergies: AllergyEntry[];
  expanded: ExpandedAllergyBlock[];
  crossReactivityFlags: string[];
  safeAlternativesSummary: Record<string, string[]>;
  trace: {
    rxClassCalls: number;
    rxNormCalls: number;
    libraryQueries: number;
    timings: Record<string, number>;
    fullOutputCacheHit?: number;
    allergenExpansionCacheHits?: number;
    allergenExpansionCacheMisses?: number;
    profileCacheHits?: number;
    embeddingCacheHits?: number;
    embeddingCacheMisses?: number;
  };
}

// ── Agent 6 types ────────────────────────────────────────────────────────────

export interface Agent6Input {
  // From Agent 1
  patient: {
    patientId: string;
    name: string;
    age: number;
    gender: string;
    weight: number;
    height: number;
    bloodGroup: string;
    knownConditions: string[];
    allergies: string[];
    currentMedications: string[];
    profileSummary: string;
    runningSummary: string;
    pastConsultations: ConsultationSummary[];
  };
  // From Agent 2
  transcript: TranscriptResult;
  // From Agent 3 (topCases + overallSummary only, no searchStats)
  similarCases: {
    topCases: SimilarCase[];
    overallSummary: string;
  };
  // From Agent 4 (conditionSummaries + evidenceSummary only, no raw chunks/queries)
  medicalContext: {
    conditionSummaries: { name: string; summary: string }[];
    evidenceSummary: Agent4EvidenceSummary;
  };
  // From Agent 5
  allergyContext: {
    expanded: ExpandedAllergyBlock[];
    crossReactivityFlags: string[];
    safeAlternatives: Record<string, string[]>;
  };
  // Loop context (set by pipeline on re-run after Agent 7/8 flag drugs)
  loopContext?: {
    loopNumber: number;
    flaggedDrugs: Array<{
      drug: string;
      reason: string;
      flaggedBy: "agent7" | "agent8";
      suggestedAlternative?: string;
    }>;
  };
}

export interface Agent6Output {
  prescription: Prescription;
  reasoning: string;
  confidenceNotes: string[];
  provider: "gemini" | "ollama" | "deepseek";
  /** True when Gemini failed and DeepSeek answered (deepseek_gemini mode fallback). */
  geminiFailed?: boolean;
  /** The Gemini error that triggered the DeepSeek fallback, if any. */
  geminiError?: string;
}

export interface Prescription {
  diagnosis: string;
  medicines: PrescriptionMedicine[];
  advice: string[];
  drugSafetyNote: string;
  historySummary: string;
}

export interface PrescriptionMedicine {
  medicine: string;
  dosage: string;
  timing: string;
  frequency: string;
  duration: string;
  condition: string;
  purpose: string;
}

// ── Agent 7 types ────────────────────────────────────────────────────────────

export interface Agent7Input {
  prescription: Prescription;
  diagnosis: string;
  patientMeds: string[];
  patientConditions: string[];
  patientAge: number;
  patientWeight: number;
  patientGender: string;
  // Compact context for Agent 6 re-call if flagged
  patientSummaryShort: string;
  allergyList: string[];
}

export interface Agent7MedicineVerdict {
  drug: string;
  indicationOk: boolean;
  indicationDetail: string;
  doseOk: boolean;
  doseDetail: string;
  verdict: "PASS" | "FLAG";
  flagReason: string | null;
  replacement: PrescriptionMedicine | null;
}

export interface Agent7Interaction {
  drugA: string;
  drugB: string;
  level: "Major" | "Moderate" | "Minor";
  source: "ddinter" | "openfda_fallback";
  note: string;
}

export interface Agent7Output {
  status: "PASS" | "FLAG" | "ESCALATE";
  perMedicine: Agent7MedicineVerdict[];
  interactions: Agent7Interaction[];
  revisedPrescription: Prescription | null;
  loopCount: number;
  escalateReason: string | null;
}

export interface DrugCheckResult {
  approved: boolean;
  issues: DrugIssue[];
  suggestions: string[];
}

export interface DrugIssue {
  type: "wrong_drug" | "wrong_dose" | "interaction" | "contraindication";
  drug: string;
  detail: string;
  severity: "info" | "warning" | "critical";
}

// ── Agent 8 types ────────────────────────────────────────────────────────────

export interface Agent8Input {
  prescription: Prescription;
  diagnosis: string;
  allergyBlocks: ExpandedAllergyBlock[];
  crossReactivityFlags: string[];
  patientSummaryShort: string;
  allergyList: string[];
}

export interface Agent8DrugCheck {
  drug: string;
  violates: string | null;
  classMatch: string | null;
  allergySeverity: AllergySeverity | null;
  allergyStatus: AllergyStatus | null;
  verdict: "PASS" | "HARD_BLOCK" | "STRONG_CAUTION" | "LIKELY_BLOCK" | "MONITOR";
  replacement: PrescriptionMedicine | null;
}

export interface Agent8Output {
  status: "PASS" | "FLAG";
  checks: Agent8DrugCheck[];
  revisedPrescription: Prescription | null;
  flaggedCount: number;
  passedCount: number;
}

export interface AllergyCheckResult {
  safe: boolean;
  conflicts: AllergyConflict[];
}

export interface AllergyConflict {
  medicine: string;
  allergen: string;
  drugClass: string;
  severity: "warning" | "critical";
  detail: string;
}

// ── Agent 9 types ────────────────────────────────────────────────────────────

export interface Agent9Input {
  patientUserId: string;
  existingAllergies: string[];
  existingMedications: string[];
  prescription: Prescription;
  transcript: TranscriptResult;
  feedbackNotes?: string;
}

export interface SystemDetectedFinding {
  type: "lifelong_med" | "allergy";
  value: string;
  severity?: AllergySeverity;
  allergyStatus?: AllergyStatus;
  reason: string;
  source: string;
  status: "pending" | "accepted" | "rejected";
}

export interface Agent9Output {
  findings: SystemDetectedFinding[];
  newLifelongMeds: number;
  newAllergies: number;
}

export interface FindingDetectorResult {
  newLifelongMeds: ProposedFinding[];
  newAllergies: ProposedFinding[];
}

export interface ProposedFinding {
  value: string;
  reason: string;
  confidence: "low" | "medium" | "high";
}
