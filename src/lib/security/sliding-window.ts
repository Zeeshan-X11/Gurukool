// Sliding-window-counter rate limiting (the approximation used by Cloudflare and others).
//
// Two fixed buckets are kept per key: the current window and the previous one. The estimated
// request count over the last `windowMs` is
//
//   estimate = current + previous × (1 − elapsedInCurrentWindow / windowMs)
//
// which smooths the burst a plain fixed window allows at the boundary (2× limit in a few ms)
// while needing O(1) storage per key instead of a log of every request timestamp.
export type WindowPolicy = { limit: number; windowMs: number };
export type Decision = { allowed: boolean; remaining: number; retryAfterS: number; estimate: number };

export const windowStart = (now: number, windowMs: number) => Math.floor(now / windowMs) * windowMs;

/** Pure decision function: `current` already includes the request being evaluated. */
export function decide(policy: WindowPolicy, now: number, current: number, previous: number): Decision {
  const start = windowStart(now, policy.windowMs);
  const elapsed = (now - start) / policy.windowMs;
  const estimate = current + previous * (1 - elapsed);
  const allowed = estimate <= policy.limit;
  // If blocked, the estimate falls as the previous window's weight decays; the earliest moment it can
  // drop to the limit is when previous×(1−t) = limit − current, or the next window at the latest.
  let retryAfterMs = 0;
  if (!allowed) {
    const needT = previous > 0 ? 1 - (policy.limit - current) / previous : 1;
    retryAfterMs = current > policy.limit || needT >= 1 ? start + policy.windowMs - now : Math.max(0, start + needT * policy.windowMs - now);
  }
  return { allowed, remaining: Math.max(0, Math.floor(policy.limit - estimate)), retryAfterS: Math.ceil(retryAfterMs / 1000), estimate };
}
