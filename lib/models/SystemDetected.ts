import mongoose, { Schema, Document, Model } from "mongoose";
// Register referenced models so .populate() works on cold serverless lambdas (avoids
// MissingSchemaError when this module is loaded without the referenced model).
import "./User";

export interface ISystemDetected extends Document {
  patientRef: mongoose.Types.ObjectId;
  type: "lifelong_med" | "allergy";
  value: string;
  severity?: "severe" | "mild";
  allergyStatus?: "confirmed" | "suspected";
  reason: string;
  source: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: Date;
  updatedAt: Date;
}

const SystemDetectedSchema = new Schema<ISystemDetected>(
  {
    patientRef: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["lifelong_med", "allergy"], required: true },
    value: { type: String, required: true },
    severity: { type: String, enum: ["severe", "mild"] },
    allergyStatus: { type: String, enum: ["confirmed", "suspected"] },
    reason: { type: String, required: true },
    source: { type: String, required: true },
    status: { type: String, enum: ["pending", "accepted", "rejected"], default: "pending" },
  },
  { timestamps: true },
);

SystemDetectedSchema.index({ patientRef: 1, status: 1 });
SystemDetectedSchema.index({ patientRef: 1, type: 1, value: 1 }, { unique: true });

if (process.env.NODE_ENV === "development") {
  delete mongoose.models["SystemDetected"];
}

const SystemDetected: Model<ISystemDetected> =
  mongoose.models.SystemDetected ||
  mongoose.model<ISystemDetected>("SystemDetected", SystemDetectedSchema);

export default SystemDetected;
