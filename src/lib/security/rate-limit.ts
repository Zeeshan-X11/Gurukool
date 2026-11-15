import "server-only";
import { NextResponse } from "next/server";
import { RateLimit } from "@/models/rate-limit";
import { decide, windowStart, type Decision, type WindowPolicy } from "./sliding-window";

export const POLICIES = {
  loginByIp: { limit: 50, windowMs: 15 * 60_000 },     // slows credential stuffing; generous because campuses share one NAT IP
  loginByEmail: { limit: 8, windowMs: 15 * 60_000 },   // slows password guessing against one account
  register: { limit: 30, windowMs: 60 * 60_000 },     // stops scripted sign-up floods, not a classroom registering together
  ai: { limit: 30, windowMs: 60 * 60_000 },            // protects the paid AI quota per user
} satisfies Record<string, WindowPolicy>;

/**
 * Atomically count this request and decide. Uses a single upsert with $inc (no read-modify-write race),
 * so concurrent requests on several server instances are counted correctly. Requires connectDB() first.
 */
export async function hit(key: string, policy: WindowPolicy, now = Date.now()): Promise<Decision> {
  const start = windowStart(now, policy.windowMs);
  const cur = await RateLimit.findOneAndUpdate(
    { key, windowStart: start },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(start + 2 * policy.windowMs) } },
    { upsert: true, new: true, lean: true }
  );
  const prev = await RateLimit.findOne({ key, windowStart: start - policy.windowMs }).lean<{ count: number }>();
  return decide(policy, now, (cur as { count: number }).count, prev?.count ?? 0);
}

/** Clears counters after a successful login so a user who mistyped is not locked out afterwards. */
export async function reset(key: string) {
  await RateLimit.deleteMany({ key });
}

export function tooMany(d: Decision, what = "attempts") {
  return NextResponse.json(
    { error: `Too many ${what}. Try again in ${Math.max(1, Math.ceil(d.retryAfterS / 60))} minute(s).`, code: "RATE_LIMITED" },
    { status: 429, headers: { "Retry-After": String(d.retryAfterS) } }
  );
}
