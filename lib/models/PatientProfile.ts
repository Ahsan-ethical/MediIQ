import mongoose, { Schema, Document, Model } from "mongoose";
// Register referenced models so .populate() works on cold serverless lambdas (avoids
// MissingSchemaError when this module is loaded without the referenced model).
import "./User";

export interface IRecentConsultation {
  date: string;
  type: "doctor" | "ai";
  symptoms: string;
  diagnosis: string;
  medicines: string[];
}

export interface IRunningSummaryMeta {
  generatedAt: Date;
  consultationCount: number;
  latestConsultationDate: string;
}

export interface ILastConsultationSummary {
  appointmentId: string;
  date: string;
  doctorName: string;
  symptoms: string;
  diagnosis: string;
  prescribedDrugs: { name: string; dosage: string; frequency: string; duration: string }[];
  flaggedDrugs: { drug: string; reason: string; flaggedBy: string }[];
  keyAdvice: string;
  warnings: string[];
  transcriptSummary: string;
  generatedAt: Date;
}

export interface IPatientProfile extends Document {
  userRef: mongoose.Types.ObjectId;
  userId: string;
  age: number;
  gender: string;
  weight: number;
  height: number;
  bloodGroup: string;
  city: string;
  state: string;
  country: string;
  knownConditions: string[];
  allergies: string[];
  currentMedications: string[];
  emergencyContact: {
    name: string;
    relation: string;
    phone: string;
  };
  summary: string;
  runningSummary: string;
  runningSummaryMeta: IRunningSummaryMeta | null;
  recentConsultations: IRecentConsultation[];
  lastConsultationSummary: ILastConsultationSummary | null;
  allergyExpansionCache: unknown;
  createdAt: Date;
  updatedAt: Date;
}

const RecentConsultationSchema = new Schema<IRecentConsultation>(
  {
    date:      { type: String, required: true },
    type:      { type: String, enum: ["doctor", "ai"], required: true },
    symptoms:  { type: String, default: "" },
    diagnosis: { type: String, default: "" },
    medicines: { type: [String], default: [] },
  },
  { _id: false },
);

const PatientProfileSchema = new Schema<IPatientProfile>(
  {
    userRef: { type: Schema.Types.ObjectId, ref: "User", required: true },
    userId: { type: String, unique: true },
    age: { type: Number, required: true },
    gender: { type: String, required: true },
    weight: { type: Number, required: true },
    height: { type: Number, required: true },
    bloodGroup: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    country: { type: String, required: true },
    knownConditions: { type: [String], default: [] },
    allergies: { type: [String], default: [] },
    currentMedications: { type: [String], default: [] },
    emergencyContact: {
      name: { type: String, required: true },
      relation: { type: String, required: true },
      phone: { type: String, required: true },
    },
    summary: { type: String, default: "" },
    runningSummary: { type: String, default: "" },
    runningSummaryMeta: { type: Schema.Types.Mixed, default: null },
    recentConsultations: { type: [RecentConsultationSchema], default: [] },
    lastConsultationSummary: { type: Schema.Types.Mixed, default: null },
    allergyExpansionCache: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

export function generatePatientId(): string {
  return `PT-${String(Math.floor(100000 + Math.random() * 900000))}`;
}

const PatientProfile: Model<IPatientProfile> =
  mongoose.models.PatientProfile ||
  mongoose.model<IPatientProfile>("PatientProfile", PatientProfileSchema);

export default PatientProfile;
