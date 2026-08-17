import { describe, expect, it } from "vitest";

import {
  clientKey,
  consume,
  limitFor,
  LIMITS,
  MemoryBuckets,
} from "../src/rate-limit";

const limit = { burst: 5, perMinute: 60 }; // one token per second

describe("consume", () => {
  it("allows a burst, then refuses", () => {
    let bucket;
    for (let i = 0; i < 5; i += 1) {
      const r = consume(bucket, limit, 1_000);
      expect(r.decision.allowed).toBe(true);
      bucket = r.bucket;
    }
    expect(consume(bucket, limit, 1_000).decision.allowed).toBe(false);
  });

  it("refills continuously rather than in windows", () => {
    // The fixed-window flaw: spend everything at the end of one window and
    // again at the start of the next, for twice the intended rate at the
    // worst possible moment. A bucket cannot do that.
    let bucket = { tokens: 0, updatedAt: 0 };
    expect(consume(bucket, limit, 0).decision.allowed).toBe(false);
    // One second later, exactly one token exists.
    const r = consume(bucket, limit, 1_000);
    expect(r.decision.allowed).toBe(true);
    expect(r.decision.remaining).toBe(0);
  });

  it("never refills past the burst size, however long it idles", () => {
    const r = consume({ tokens: 0, updatedAt: 0 }, limit, 86_400_000);
    expect(r.bucket.tokens).toBe(limit.burst - 1);
  });

  it("advances the clock even when it refuses", () => {
    // Otherwise a caller that keeps getting refused accumulates elapsed time
    // it never spends, and its next allowed request arrives with a full
    // bucket — free burst for the one caller being throttled.
    const refused = consume({ tokens: 0, updatedAt: 0 }, limit, 500);
    expect(refused.decision.allowed).toBe(false);
    expect(refused.bucket.updatedAt).toBe(500);
  });

  it("gives a Retry-After that actually works when obeyed", () => {
    const { decision } = consume({ tokens: 0, updatedAt: 0 }, limit, 0);
    expect(decision.retryAfter).toBeGreaterThanOrEqual(1);
    // Waiting exactly that long must succeed — a value that is a fraction
    // short sends an obedient client straight back into a refusal, which
    // teaches it to ignore the header.
    const after = consume({ tokens: 0, updatedAt: 0 }, limit, decision.retryAfter * 1000);
    expect(after.decision.allowed).toBe(true);
  });

  it("starts a first-time caller with a full bucket", () => {
    expect(consume(undefined, limit, 0).decision.allowed).toBe(true);
  });

  it("does not go backwards if a clock skews", () => {
    const r = consume({ tokens: 2, updatedAt: 10_000 }, limit, 5_000);
    expect(r.decision.allowed).toBe(true);
    expect(r.bucket.tokens).toBe(1);
  });
});

describe("limitFor", () => {
  it("puts the guessing surface on the tightest limit", () => {
    expect(limitFor("/api/auth/login")).toBe("auth");
    expect(limitFor("/api/auth/register")).toBe("auth");
  });

  it("separates the unauthenticated widget from the console", () => {
    expect(limitFor("/api/channels/web/acme")).toBe("widget");
    expect(limitFor("/api/tickets")).toBe("api");
  });

  it("gives provider webhooks room — a busy bot is legitimately noisy", () => {
    expect(limitFor("/api/webhooks/meta/acme")).toBe("webhook");
    expect(LIMITS.webhook.perMinute).toBeGreaterThan(LIMITS.api.perMinute);
  });

  it("throttles the model call hardest of the signed-in routes", () => {
    expect(limitFor("/api/tickets/abc/draft")).toBe("ai");
    expect(LIMITS.ai.perMinute).toBeLessThan(LIMITS.api.perMinute);
  });

  it("leaves pages and assets alone", () => {
    // Throttling a stylesheet costs a real user their page and stops no attack.
    expect(limitFor("/inbox")).toBeNull();
    expect(limitFor("/_next/static/chunk.js")).toBeNull();
  });

  it("auth wins over the generic api rule regardless of order", () => {
    expect(limitFor("/api/auth/me")).toBe("auth");
  });
});

describe("clientKey", () => {
  it("takes the LAST entry — the one the platform appended", () => {
    // A caller can prepend anything; Cloud Run appends what it actually saw.
    // Taking the first, which is the common advice, would let anyone rotate
    // their own rate-limit key by inventing a header value per request.
    expect(clientKey("1.2.3.4, 9.9.9.9")).toBe("9.9.9.9");
    expect(clientKey("evil-spoof, 203.0.113.7")).toBe("203.0.113.7");
  });

  it("handles a single address and whitespace", () => {
    expect(clientKey("203.0.113.7")).toBe("203.0.113.7");
    expect(clientKey("  203.0.113.7  ,  198.51.100.2 ")).toBe("198.51.100.2");
  });

  it("falls back rather than throwing when the header is absent", () => {
    expect(clientKey(null)).toBe("unknown");
    expect(clientKey("")).toBe("unknown");
    expect(clientKey(",, ,")).toBe("unknown");
  });
});

describe("MemoryBuckets", () => {
  it("limits per key, independently", () => {
    const b = new MemoryBuckets();
    for (let i = 0; i < 5; i += 1) expect(b.check("a", limit, 0).allowed).toBe(true);
    expect(b.check("a", limit, 0).allowed).toBe(false);
    // A different caller is unaffected — the whole point.
    expect(b.check("b", limit, 0).allowed).toBe(true);
  });

  it("is bounded, so the limiter cannot become its own denial of service", () => {
    // An attacker rotating addresses would otherwise grow this until the
    // container dies of memory.
    const b = new MemoryBuckets(50);
    for (let i = 0; i < 500; i += 1) b.check(`k${i}`, limit, i);
    expect(b.size).toBeLessThanOrEqual(50);
  });

  it("sweeps buckets that have fully refilled", () => {
    const b = new MemoryBuckets();
    b.check("a", limit, 0);
    b.sweep(limit, 60_000);
    expect(b.size).toBe(0);
  });
});
