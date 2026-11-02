import mongoose, { Schema, Document, Model } from "mongoose";
// Register referenced models so .populate() works on cold serverless lambdas (avoids
// MissingSchemaError when this module is loaded without the referenced model).
import "./User";

export interface IChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  provider?: "gemini" | "ollama" | "deepseek";
  cachesUsed?: string[];
}

export interface IChatDetection {
  drug: string;
  reactionType: string;
  severity: "severe" | "mild";
  drugClass: string;
  suggestedTests: string[];
  writtenToSystemDetected: boolean;
  systemDetectedId?: mongoose.Types.ObjectId;
}

export interface IChatConversation extends Document {
  patientRef: mongoose.Types.ObjectId;
  startedAt: Date;
  lastMessageAt: Date;
  status: "active" | "closed";
  messages: IChatMessage[];
  detections: IChatDetection[];
  contextSnapshot: {
    symptoms: string;
    diagnosis: string;
    drugs: string[];
    knownAllergies: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}

const ChatMessageSchema = new Schema<IChatMessage>(
  {
    role:       { type: String, enum: ["user", "assistant"], required: true },
    content:    { type: String, required: true },
    timestamp:  { type: Date, default: Date.now },
    provider:   { type: String, enum: ["gemini", "ollama"] },
    cachesUsed: { type: [String], default: [] },
  },
  { _id: false },
);

const ChatDetectionSchema = new Schema<IChatDetection>(
  {
    drug:                    { type: String, required: true },
    reactionType:            { type: String, required: true },
    severity:                { type: String, enum: ["severe", "mild"], required: true },
    drugClass:               { type: String, default: "" },
    suggestedTests:          { type: [String], default: [] },
    writtenToSystemDetected: { type: Boolean, default: false },
    systemDetectedId:        { type: Schema.Types.ObjectId },
  },
  { _id: false },
);

const ChatConversationSchema = new Schema<IChatConversation>(
  {
    patientRef:    { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    startedAt:     { type: Date, default: Date.now },
    lastMessageAt: { type: Date, default: Date.now },
    status:        { type: String, enum: ["active", "closed"], default: "active" },
    messages:      { type: [ChatMessageSchema], default: [] },
    detections:    { type: [ChatDetectionSchema], default: [] },
    contextSnapshot: {
      symptoms:       { type: String, default: "" },
      diagnosis:      { type: String, default: "" },
      drugs:          { type: [String], default: [] },
      knownAllergies: { type: [String], default: [] },
    },
  },
  { timestamps: true },
);

ChatConversationSchema.index({ patientRef: 1, status: 1 });
ChatConversationSchema.index({ patientRef: 1, lastMessageAt: -1 });

if (process.env.NODE_ENV === "development") {
  delete mongoose.models["ChatConversation"];
}

const ChatConversation: Model<IChatConversation> =
  mongoose.models.ChatConversation ||
  mongoose.model<IChatConversation>("ChatConversation", ChatConversationSchema);

export default ChatConversation;
