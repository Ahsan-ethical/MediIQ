import mongoose, { Schema, Document, Model } from "mongoose";
// Register the referenced User model as a side-effect. Without this, a route that
// imports DoctorProfile but not User (e.g. /api/doctors/available on a cold serverless
// lambda) throws MissingSchemaError when it calls .populate("userRef") — the "no doctors
// found until you refresh a few times" bug.
import "./User";

export interface IDoctorProfile extends Document {
  userRef: mongoose.Types.ObjectId;
  userId: string;
  specialization: string;
  qualification: string;
  experience: number;
  hospital: string;
  city: string;
  registrationNumber: string;
  consultationFee: number;
  verificationStatus: "pending" | "approved" | "rejected";
  rating: number;
  totalRatings: number;
  isLive: boolean;
  signature?: string;  // base64 PNG dataURL of handwritten signature
  schedule: {
    day: string;
    startTime: string;
    endTime: string;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const DoctorProfileSchema = new Schema<IDoctorProfile>(
  {
    userRef: { type: Schema.Types.ObjectId, ref: "User", required: true },
    userId: { type: String, unique: true },
    specialization: { type: String, required: true },
    qualification: { type: String, required: true },
    experience: { type: Number, required: true },
    hospital: { type: String, required: true },
    city: { type: String, required: true },
    registrationNumber: { type: String, required: true, unique: true },
    consultationFee: { type: Number, required: true },
    verificationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    rating: { type: Number, default: 0 },
    totalRatings: { type: Number, default: 0 },
    isLive: { type: Boolean, default: false },
    signature: { type: String },   // base64 PNG dataURL
    schedule: [
      {
        day: String,
        startTime: String,
        endTime: String,
      },
    ],
  },
  { timestamps: true }
);

export function generateDoctorId(): string {
  return `DR-${String(Math.floor(100000 + Math.random() * 900000))}`;
}

const DoctorProfile: Model<IDoctorProfile> =
  mongoose.models.DoctorProfile ||
  mongoose.model<IDoctorProfile>("DoctorProfile", DoctorProfileSchema);

export default DoctorProfile;
