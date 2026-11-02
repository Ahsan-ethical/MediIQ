import mongoose, { Schema, Document, Model } from "mongoose";

const TTL_DAYS = 140;

export interface IAgent3Cache extends Document {
  cacheKey: string;
  symptoms: string;
  ageBucket: string;
  conditionsHash: string;
  result: {
    cleanedSymptoms: string;
    topCases: unknown[];
    overallSummary: string;
    searchStats: Record<string, number>;
  };
  expiresAt: Date;
  hitCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const Agent3CacheSchema = new Schema<IAgent3Cache>(
  {
    cacheKey:       { type: String, required: true, unique: true },
    symptoms:       { type: String, required: true },
    ageBucket:      { type: String, default: "" },
    conditionsHash: { type: String, default: "" },
    result:         { type: Schema.Types.Mixed, required: true },
    expiresAt:      { type: Date, required: true },
    hitCount:       { type: Number, default: 0 },
  },
  { timestamps: true },
);

Agent3CacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

if (process.env.NODE_ENV === "development") {
  delete mongoose.models["Agent3SimilarCasesCache"];
}

const Agent3SimilarCasesCache: Model<IAgent3Cache> =
  mongoose.models.Agent3SimilarCasesCache ||
  mongoose.model<IAgent3Cache>("Agent3SimilarCasesCache", Agent3CacheSchema);

export default Agent3SimilarCasesCache;

export function buildCacheKey(
  symptoms: string,
  patientAge?: number,
  patientConditions?: string[],
): string {
  const normalizedSymptoms = symptoms
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(",");

  const ageBucket = patientAge ? `${Math.floor(patientAge / 10) * 10}s` : "na";
  const conditionsHash = (patientConditions ?? [])
    .map(c => c.toLowerCase().trim())
    .sort()
    .join("|") || "none";

  return `${normalizedSymptoms}::${ageBucket}::${conditionsHash}`;
}

export function newExpiresAt(): Date {
  return new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);
}
