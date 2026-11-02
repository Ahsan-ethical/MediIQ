import mongoose, { Schema, Document, Model } from "mongoose";

const TTL_140_DAYS = 140 * 24 * 60 * 60 * 1000;

export type Agent7CacheType =
  | "fda_label"
  | "interaction_pair"
  | "library_context";

export interface IAgent7Cache extends Document {
  cacheType: Agent7CacheType;
  cacheKey: string;
  data: Record<string, unknown>;
  createdAt: Date;
  lastAccessedAt: Date;
  expiresAt: Date;
}

const Agent7CacheSchema = new Schema<IAgent7Cache>(
  {
    cacheType:      { type: String, required: true, enum: ["fda_label", "interaction_pair", "library_context"] },
    cacheKey:       { type: String, required: true },
    data:           { type: Schema.Types.Mixed, required: true },
    lastAccessedAt: { type: Date, required: true },
    expiresAt:      { type: Date, required: true },
  },
  { timestamps: true },
);

Agent7CacheSchema.index({ cacheType: 1, cacheKey: 1 }, { unique: true });
Agent7CacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

if (process.env.NODE_ENV === "development") {
  delete mongoose.models["Agent7DrugMedicCache"];
}

const Agent7DrugMedicCache: Model<IAgent7Cache> =
  mongoose.models.Agent7DrugMedicCache ||
  mongoose.model<IAgent7Cache>("Agent7DrugMedicCache", Agent7CacheSchema, "agent7_drug_medic_cache");

export default Agent7DrugMedicCache;

export function normDrugKey(name: string): string {
  return name.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

export function buildInteractionPairKey(drugA: string, drugB: string): string {
  const a = normDrugKey(drugA);
  const b = normDrugKey(drugB);
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export async function getCache(
  cacheType: Agent7CacheType,
  cacheKey: string,
): Promise<Record<string, unknown> | null> {
  const doc = await Agent7DrugMedicCache.findOne({ cacheType, cacheKey });
  if (!doc) return null;

  const isPermanent = cacheType === "interaction_pair";
  if (isPermanent) {
    await Agent7DrugMedicCache.updateOne(
      { _id: doc._id },
      { $set: { lastAccessedAt: new Date() } },
    );
  } else {
    await Agent7DrugMedicCache.updateOne(
      { _id: doc._id },
      { $set: { lastAccessedAt: new Date(), expiresAt: new Date(Date.now() + TTL_140_DAYS) } },
    );
  }

  return doc.data;
}

export async function setCache(
  cacheType: Agent7CacheType,
  cacheKey: string,
  data: Record<string, unknown>,
): Promise<void> {
  const now = new Date();

  let expiresAt: Date;
  if (cacheType === "interaction_pair") {
    expiresAt = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000);
  } else {
    expiresAt = new Date(Date.now() + TTL_140_DAYS);
  }

  await Agent7DrugMedicCache.updateOne(
    { cacheType, cacheKey },
    {
      $set: {
        cacheType,
        cacheKey,
        data,
        lastAccessedAt: now,
        expiresAt,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );
}
