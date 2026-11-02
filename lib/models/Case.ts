import mongoose, { Schema, Document, Model } from "mongoose";
// Register referenced models so .populate() works on cold serverless lambdas (avoids
// MissingSchemaError when this module is loaded without the referenced model).
import "./User";
import "./Appointment";

export interface ICaseMedicine {
  medicine:  string;
  dosage:    string;
  timing:    string;
  frequency: string;
  duration:  string;
  condition?: string;
}

export interface ICase extends Document {
  appointmentRef: mongoose.Types.ObjectId;
  patientRef:     mongoose.Types.ObjectId;
  doctorRef:      mongoose.Types.ObjectId;

  patient: {
    age:                number;
    sex:                string;
    weight:             number;
    height:             number;
    bloodGroup:         string;
    knownConditions:    string[];
    allergies:          string[];
    currentMedications: string[];
  };

  symptoms:    string;
  duration:    string;
  severity:    string;
  additionalNotes: string;
  currentMedications: string;

  vitals?: {
    sbp:               number;
    dbp:               number;
    hr:                number;
    bp_classification: string;
    hr_classification: string;
  };

  transcript:  string;
  diagnosis:   string;
  prescription: ICaseMedicine[];
  advice:      string;

  patientRating?: number;

  isSeedData?: boolean;

  // 768-dim embedding of (patient context + symptoms + transcript) for RAG
  embedding: number[];

  createdAt: Date;
  updatedAt: Date;
}

const CaseMedicineSchema = new Schema<ICaseMedicine>(
  {
    medicine:  { type: String, required: true },
    dosage:    { type: String, required: true },
    timing:    { type: String, required: true },
    frequency: { type: String, required: true },
    duration:  { type: String, required: true },
    condition: { type: String },
  },
  { _id: false }
);

const CaseSchema = new Schema<ICase>(
  {
    appointmentRef: { type: Schema.Types.ObjectId, ref: "Appointment", required: true },
    patientRef:     { type: Schema.Types.ObjectId, ref: "User",        required: true },
    doctorRef:      { type: Schema.Types.ObjectId, ref: "User",        required: true },

    patient: {
      age:                { type: Number, required: true },
      sex:                { type: String, required: true },
      weight:             { type: Number, required: true },
      height:             { type: Number, required: true },
      bloodGroup:         { type: String, default: "" },
      knownConditions:    { type: [String], default: [] },
      allergies:          { type: [String], default: [] },
      currentMedications: { type: [String], default: [] },
    },

    symptoms:           { type: String, required: true },
    duration:           { type: String, default: "" },
    severity:           { type: String, default: "" },
    additionalNotes:    { type: String, default: "" },
    currentMedications: { type: String, default: "" },

    vitals: {
      sbp:               { type: Number },
      dbp:               { type: Number },
      hr:                { type: Number },
      bp_classification: { type: String },
      hr_classification: { type: String },
    },

    transcript:   { type: String, default: "" },
    diagnosis:    { type: String, required: true },
    prescription: { type: [CaseMedicineSchema], default: [] },
    advice:       { type: String, default: "" },

    patientRating: { type: Number, min: 1, max: 5 },

    isSeedData: { type: Boolean, default: false },

    // Stored as a plain number array — Atlas Vector Search indexes this field.
    // Index name: "case_vector_index", dimensions: 3072, similarity: cosine
    embedding: { type: [Number], required: true },
  },
  { timestamps: true }
);

// Prevent model re-registration during dev HMR
if (process.env.NODE_ENV === "development") {
  delete mongoose.models["Case"];
}

const Case: Model<ICase> =
  mongoose.models.Case ||
  mongoose.model<ICase>("Case", CaseSchema);

export default Case;
