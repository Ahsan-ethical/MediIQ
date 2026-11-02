import mongoose, { Schema, Document, Model } from "mongoose";

const TTL_DAYS = 140;

export type Agent5CacheType =
  | "full_output"
  | "allergen_expansion"
  | "query_embedding";

export interface IAgent5Cache extends Document {
  cacheType: Agent5CacheType;
  cacheKey: string;
  data: Record<string, unknown>;
  createdAt: Date;
  lastAccessedAt: Date;
  expiresAt: Date;
}

const Agent5CacheSchema = new Schema<IAgent5Cache>(
  {
    cacheType:      { type: String, required: true, enum: ["full_output", "allergen_expansion", "query_embedding"] },
    cacheKey:       { type: String, required: true },
    data:           { type: Schema.Types.Mixed, required: true },
    lastAccessedAt: { type: Date, required: true },
    expiresAt:      { type: Date, required: true },
  },
  { timestamps: true },
);

Agent5CacheSchema.index({ cacheType: 1, cacheKey: 1 }, { unique: true });
Agent5CacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

if (process.env.NODE_ENV === "development") {
  delete mongoose.models["Agent5AllergyContextCache"];
}

const Agent5AllergyContextCache: Model<IAgent5Cache> =
  mongoose.models.Agent5AllergyContextCache ||
  mongoose.model<IAgent5Cache>("Agent5AllergyContextCache", Agent5CacheSchema, "agent5_allergy_context_cache");

export default Agent5AllergyContextCache;

function newExpiresAt(): Date {
  return new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function buildFullOutputKey(input: {
  knownAllergies?: Array<{ allergen: string }>;
  consultationMentions?: string[];
  suspectedFromFeedback?: Array<{ allergen: string }>;
}): string {
  const known = (input.knownAllergies ?? []).map(a => a.allergen.toLowerCase().trim()).sort().join(",") || "none";
  const mentions = (input.consultationMentions ?? []).map(m => m.toLowerCase().trim()).sort().join(",") || "none";
  const feedback = (input.suspectedFromFeedback ?? []).map(a => a.allergen.toLowerCase().trim()).sort().join(",") || "none";
  return `${known}::${mentions}::${feedback}`;
}

export function buildAllergenExpansionKey(allergen: string): string {
  return allergen.toLowerCase().trim();
}

export function buildQueryEmbeddingKey(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, " ");
}

export async function getCache(
  cacheType: Agent5CacheType,
  cacheKey: string,
): Promise<Record<string, unknown> | null> {
  const doc = await Agent5AllergyContextCache.findOne({ cacheType, cacheKey });
  if (!doc) return null;
  await Agent5AllergyContextCache.updateOne(
    { _id: doc._id },
    { $set: { lastAccessedAt: new Date(), expiresAt: newExpiresAt() } },
  );
  return doc.data;
}

export async function setCache(
  cacheType: Agent5CacheType,
  cacheKey: string,
  data: Record<string, unknown>,
): Promise<void> {
  const now = new Date();
  await Agent5AllergyContextCache.updateOne(
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
