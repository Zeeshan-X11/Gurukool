import { describe, expect, it } from "vitest";
import { decide, windowStart } from "@/lib/security/sliding-window";
import { clientIp, isSameOrigin } from "@/lib/security/origin";

const P = { limit: 10, windowMs: 60_000 };

describe("sliding-window rate limit", () => {
  it("allows up to the limit in a fresh window", () => {
    expect(decide(P, 0, 10, 0).allowed).toBe(true);
    expect(decide(P, 0, 11, 0).allowed).toBe(false);
  });

  it("weights the previous window by the remaining overlap", () => {
    // 25% into the window: 75% of the previous 8 requests still count → 2 + 6 = 8.
    expect(decide(P, 15_000, 2, 8).estimate).toBeCloseTo(8);
  });

  it("prevents the 2× burst a fixed window allows at the boundary", () => {
    // 10 requests just before the boundary, then 10 more just after: a fixed window would allow both.
    expect(decide(P, 60_001, 10, 10).allowed).toBe(false);
  });

  it("computes a Retry-After that actually unblocks", () => {
    const now = 10_000;
    const d = decide(P, now, 5, 10);
    expect(d.allowed).toBe(false);
    const later = now + d.retryAfterS * 1000;
    expect(windowStart(later, P.windowMs)).toBe(0);
    expect(decide(P, later, 5, 10).allowed).toBe(true);
  });

  it("waits for the next window when the current one alone is over the limit", () => {
    const d = decide(P, 30_000, 12, 0);
    expect(d.retryAfterS).toBe(30);
  });
});

describe("CSRF origin check", () => {
  it("allows safe methods from anywhere", () => expect(isSameOrigin("GET", "https://evil.com", null, "gurukool.app")).toBe(true));
  it("allows same-origin writes", () => expect(isSameOrigin("POST", "https://gurukool.app", null, "gurukool.app")).toBe(true));
  it("blocks cross-origin writes", () => expect(isSameOrigin("DELETE", "https://evil.com", null, "gurukool.app")).toBe(false));
  it("falls back to Referer", () => expect(isSameOrigin("POST", null, "https://evil.com/x", "gurukool.app")).toBe(false));
  it("treats an opaque origin as untrusted", () => expect(isSameOrigin("POST", "null", "https://evil.com", "gurukool.app")).toBe(false));
  it("reads the first X-Forwarded-For hop", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(clientIp(new Headers())).toBe("local");
  });
});
