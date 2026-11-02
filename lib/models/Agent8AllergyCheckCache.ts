import mongoose, { Schema, Document, Model } from "mongoose";

export type Agent8CacheType =
  | "rxcui_resolution"
  | "class_member_cuis";

export interface IAgent8Cache extends Document {
  cacheType: Agent8CacheType;
  cacheKey: string;
  data: Record<string, unknown>;
  createdAt: Date;
  lastAccessedAt: Date;
  expiresAt: Date;
}

const Agent8CacheSchema = new Schema<IAgent8Cache>(
  {
    cacheType:      { type: String, required: true, enum: ["rxcui_resolution", "class_member_cuis"] },
    cacheKey:       { type: String, required: true },
    data:           { type: Schema.Types.Mixed, required: true },
    lastAccessedAt: { type: Date, required: true },
    expiresAt:      { type: Date, required: true },
  },
  { timestamps: true },
);

Agent8CacheSchema.index({ cacheType: 1, cacheKey: 1 }, { unique: true });
Agent8CacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

if (process.env.NODE_ENV === "development") {
  delete mongoose.models["Agent8AllergyCheckCache"];
}

const Agent8AllergyCheckCache: Model<IAgent8Cache> =
  mongoose.models.Agent8AllergyCheckCache ||
  mongoose.model<IAgent8Cache>("Agent8AllergyCheckCache", Agent8CacheSchema, "agent8_allergy_check_cache");

export default Agent8AllergyCheckCache;

// Permanent TTL (10 years) — drug identifiers and class memberships don't change
const PERMANENT_TTL = 10 * 365 * 24 * 60 * 60 * 1000;

export function normDrugKey(name: string): string {
  return name.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

export async function getCache(
  cacheType: Agent8CacheType,
  cacheKey: string,
): Promise<Record<string, unknown> | null> {
  const doc = await Agent8AllergyCheckCache.findOne({ cacheType, cacheKey });
  if (!doc) return null;
  await Agent8AllergyCheckCache.updateOne(
    { _id: doc._id },
    { $set: { lastAccessedAt: new Date() } },
  );
  return doc.data;
}

export async function setCache(
  cacheType: Agent8CacheType,
  cacheKey: string,
  data: Record<string, unknown>,
): Promise<void> {
  const now = new Date();
  await Agent8AllergyCheckCache.updateOne(
    { cacheType, cacheKey },
    {
      $set: {
        cacheType,
        cacheKey,
        data,
        lastAccessedAt: now,
        expiresAt: new Date(Date.now() + PERMANENT_TTL),
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );
}
