# ADR-0004: Session, authorization, rate-limit and CSRF model

**Status:** Accepted

## Decision
- **Passwords:** scrypt (memory-hard, in Node's standard library, no native dependency) with a 16-byte per-user salt and `timingSafeEqual`. Unknown email and wrong password return the same error.
- **Sessions:** a stateless HMAC-SHA256-signed cookie (`httpOnly`, `SameSite=Lax`, `Secure` in production, 7-day expiry). We chose this over JWT libraries to avoid algorithm-confusion pitfalls; there is one algorithm, and it is fixed. A unit test proves that a forged role is rejected.
- **Revocation without server sessions:** every API request re-loads the user (`getPersona`), so suspension, role changes and approval apply on the next request. This costs one indexed lookup by `_id`.
- **Authorization in depth:** middleware gates pages by role, but every route handler also calls `requireRole` and checks ownership (a mentor can act only on their own bookings, a trainer only on their own course). Middleware is never the only check.
- **Rate limiting** (`src/lib/security/`): a sliding-window counter. It is O(1) storage per key, and it closes the 2× burst that a fixed window allows at the boundary (covered by a test). Counters are atomic `$inc` upserts in MongoDB with a TTL index, so the limiter is correct across multiple server instances without Redis.
  - Sign-in is limited per IP (50/15 min) and per account (8/15 min). The per-account counter resets on success, so a user who mistyped isn't locked out later.
  - Registration: 30/hour per IP. Campuses share NAT IPs, so the limit stops floods, not classrooms.
  - AI: 30/hour per user. Exceeding it degrades to the deterministic engine.
- **CSRF:** `SameSite=Lax` already blocks most cross-site POSTs. As defence in depth, middleware rejects state-changing `/api` requests whose `Origin` (or `Referer`) host differs from the request host (the OWASP "verify origin" pattern).
- **Headers:** `X-Frame-Options: DENY` and `frame-ancestors 'none'` (clickjacking), `nosniff`, `Referrer-Policy`, `Permissions-Policy` and HSTS.

## Trade-offs accepted
- **No full script CSP on the app shell.** Next.js injects inline bootstrap scripts and Monaco loads workers from a CDN, so a strict CSP needs per-request nonces. The highest-risk surface, user-submitted code, already runs in an opaque-origin sandboxed iframe with its own `default-src 'none'` CSP. Nonce-based CSP is the next step.
- **Per-account limits allow a targeted lockout** (an attacker can burn a victim's 8 attempts). The window is short (15 min), and per-account limiting is the standard defence against password guessing. CAPTCHA after N failures would be the next step.
- **IP from `X-Forwarded-For`:** this is only trustworthy behind a proxy that sets it (Vercel, Render, Nginx). When running directly, all requests share one bucket.
