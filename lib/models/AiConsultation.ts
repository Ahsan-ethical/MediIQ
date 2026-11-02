import mongoose, { Schema, Document, Model } from "mongoose";
// Register referenced models so .populate() works on cold serverless lambdas (avoids
// MissingSchemaError when this module is loaded without the referenced model).
import "./User";

export interface IAiConsultation extends Document {
  patientRef:   mongoose.Types.ObjectId;
  patientName:  string;
  status: "pre_consultation" | "ready_to_consult" | "in_consultation" | "generating_report" | "report_ready";
  reportStep?: "transcribed" | "patient_history" | "embedding" | "similar_cases" | "drug_check" | "llm_sending" | "llm_success" | "parsing" | "done";
  prefetchStep?: "idle" | "patient_history" | "similar_cases" | "ready";
  prefetchedHistory?:      Record<string, unknown>[];
  prefetchedSimilarCases?: unknown[];
  preConsultation?: {
    symptoms:           string;
    duration:           string;
    severity:           string;
    currentMedications: string;
    additionalNotes:    string;
    vitals?: { sbp?: number; dbp?: number; hr?: number };
    filledAt:           Date;
  };
  aiQuestions:  string[];     // 5 questions Gemini generated before the call
  transcript:   string;       // full VAPI conversation
  report?: {
    diagnosis:      string;
    medicines:      Array<{ medicine: string; dosage: string; timing: string; frequency: string; duration: string; condition?: string; purpose?: string }>;
    advice:         string;
    dosAndDonts:    string[];
    summary:        string;
    drugSafetyNote?: string;
  };
  consultationStartedAt?: Date;
  consultationEndedAt?:   Date;
  reportGeneratedAt?:     Date;
  createdAt: Date;
  updatedAt: Date;
}

const AiConsultationSchema = new Schema<IAiConsultation>(
  {
    patientRef:  { type: Schema.Types.ObjectId, ref: "User", required: true },
    patientName: { type: String, required: true },
    status:      { type: String, default: "pre_consultation",
                   enum: ["pre_consultation","ready_to_consult","in_consultation","generating_report","report_ready"] },
    preConsultation: {
      symptoms:           String,
      duration:           String,
      severity:           String,
      currentMedications: { type: String, default: "" },
      additionalNotes:    { type: String, default: "" },
      vitals: { sbp: Number, dbp: Number, hr: Number },
      filledAt:           Date,
    },
    aiQuestions:  { type: [String], default: [] },
    transcript:   { type: String, default: "" },
    report: {
      diagnosis:   String,
      medicines:   [{
        medicine: String, dosage: String, timing: String,
        frequency: String, duration: String,
        condition: { type: String, default: "" },
        purpose:   { type: String, default: "" },
      }],
      advice:         String,
      dosAndDonts:    [String],
      summary:        String,
      drugSafetyNote: { type: String, default: "" },
    },
    reportStep: {
      type: String,
      enum: ["transcribed","patient_history","embedding","similar_cases","drug_check","llm_sending","llm_success","parsing","done"],
    },
    prefetchStep: {
      type: String,
      enum: ["idle","patient_history","similar_cases","ready"],
    },
    prefetchedHistory:      { type: [Schema.Types.Mixed], default: undefined },
    prefetchedSimilarCases: { type: [Schema.Types.Mixed], default: undefined },
    consultationStartedAt: Date,
    consultationEndedAt:   Date,
    reportGeneratedAt:     Date,
  },
  { timestamps: true },
);

const AiConsultation: Model<IAiConsultation> =
  mongoose.models.AiConsultation ||
  mongoose.model<IAiConsultation>("AiConsultation", AiConsultationSchema);

export default AiConsultation;
