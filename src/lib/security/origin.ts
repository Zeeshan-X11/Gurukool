// CSRF defence for cookie-authenticated JSON APIs.
// The session cookie is SameSite=Lax, which already blocks most cross-site POSTs; this check adds
// defence in depth by requiring that every state-changing request comes from our own origin
// (OWASP "verify origin with standard headers"). Browsers always send Origin on cross-origin POSTs.
export const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isSameOrigin(method: string, origin: string | null, referer: string | null, host: string | null): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return true;
  if (!host) return false;
  const source = origin && origin !== "null" ? origin : referer;
  if (!source) return true; // non-browser clients (curl, server-to-server) send neither; they also carry no ambient cookie
  try {
    return new URL(source).host === host;
  } catch {
    return false;
  }
}

/** First hop of X-Forwarded-For (set by the hosting proxy), else a constant bucket. */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "local";
}
