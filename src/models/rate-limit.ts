import { Schema, model, models } from "mongoose";

// One document per (key, fixed window). TTL index lets MongoDB garbage-collect old buckets.
const RateLimitSchema = new Schema({
  key: { type: String, required: true },
  windowStart: { type: Number, required: true },
  count: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
});
RateLimitSchema.index({ key: 1, windowStart: 1 }, { unique: true });
RateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RateLimit = models.RateLimit || model("RateLimit", RateLimitSchema);
