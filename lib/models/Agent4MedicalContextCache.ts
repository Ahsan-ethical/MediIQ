import mongoose, { Schema, Document, Model } from "mongoose";

const TTL_DAYS = 140;

export type Agent4CacheType =
  | "full_output"
  | "medline_summary"
  | "retrieval_queries"
  | "query_embedding";

export interface IAgent4Cache extends Document {
  cacheType: Agent4CacheType;
  cacheKey: string;
  data: Record<string, unknown>;
  createdAt: Date;
  lastAccessedAt: Date;
  expiresAt: Date;
}

const Agent4CacheSchema = new Schema<IAgent4Cache>(
  {
    cacheType:      { type: String, required: true, enum: ["full_output", "medline_summary", "retrieval_queries", "query_embedding"] },
    cacheKey:       { type: String, required: true },
    data:           { type: Schema.Types.Mixed, required: true },
    lastAccessedAt: { type: Date, required: true },
    expiresAt:      { type: Date, required: true },
  },
  { timestamps: true },
);

Agent4CacheSchema.index({ cacheType: 1, cacheKey: 1 }, { unique: true });
Agent4CacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

if (process.env.NODE_ENV === "development") {
  delete mongoose.models["Agent4MedicalContextCache"];
}

const Agent4MedicalContextCache: Model<IAgent4Cache> =
  mongoose.models.Agent4MedicalContextCache ||
  mongoose.model<IAgent4Cache>("Agent4MedicalContextCache", Agent4CacheSchema, "agent4_medical_context_cache");

export default Agent4MedicalContextCache;

export function newExpiresAt(): Date {
  return new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function buildFullOutputKey(symptoms: string[], conditions: string[]): string {
  const s = [...symptoms].map(x => x.toLowerCase().trim()).sort().join(",");
  const c = [...conditions].map(x => x.toLowerCase().trim()).sort().join("|") || "none";
  return `${s}::${c}`;
}

export function buildRetrievalQueryKey(symptoms: string[], conditions: string[]): string {
  return buildFullOutputKey(symptoms, conditions);
}

export function buildQueryEmbeddingKey(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, " ");
}

export async function getCache(
  cacheType: Agent4CacheType,
  cacheKey: string,
): Promise<Record<string, unknown> | null> {
  const doc = await Agent4MedicalContextCache.findOne({ cacheType, cacheKey });
  if (!doc) return null;
  await Agent4MedicalContextCache.updateOne(
    { _id: doc._id },
    { $set: { lastAccessedAt: new Date(), expiresAt: newExpiresAt() } },
  );
  return doc.data;
}

export async function setCache(
  cacheType: Agent4CacheType,
  cacheKey: string,
  data: Record<string, unknown>,
): Promise<void> {
  const now = new Date();
  await Agent4MedicalContextCache.updateOne(
    { cacheType, cacheKey },
    {
      $set: {
        cacheType,
        cacheKey,
        data,
        lastAccessedAt: now,
        expiresAt: newExpiresAt(),
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );
}
