// Rate limiting.
//
// Lives beside `lockout.ts` because it is the same family of concern: an
// account lockout stops one password being guessed, and this stops the request
// volume that makes guessing worth trying — plus every other kind of flood a
// public endpoint attracts.
//
// A **token bucket**, not a fixed window. A fixed window lets a caller spend
// its whole allowance in the last second of one window and again in the first
// second of the next — twice the intended rate, at the worst moment. A bucket
// refills continuously, so a burst is allowed once and then paid for.

export interface Bucket {
  /** Tokens remaining, fractional between refills. */
  tokens: number;
  /** When `tokens` was last computed. */
  updatedAt: number;
}

export interface Limit {
  /** Requests allowed in a burst. */
  burst: number;
  /** Sustained rate, per minute, once the burst is spent. */
  perMinute: number;
}

export interface Decision {
  allowed: boolean;
  /** Whole tokens left, for the `X-RateLimit-Remaining` header. */
  remaining: number;
  /** Seconds until one more token exists — the `Retry-After` value. */
  retryAfter: number;
}

/**
 * Spend a token, or refuse.
 *
 * Pure: the caller owns the store, so this is testable without clocks or
 * globals and the same function serves an in-memory Map today and a shared
 * store later without its logic changing.
 */
export function consume(
  bucket: Bucket | undefined,
  limit: Limit,
  now: number,
): { decision: Decision; bucket: Bucket } {
  const refillPerMs = limit.perMinute / 60_000;
  const current = bucket ?? { tokens: limit.burst, updatedAt: now };

  // Refill for the elapsed time, capped at the burst size — an idle caller
  // gets a full bucket back but never more than one.
  const elapsed = Math.max(0, now - current.updatedAt);
  const tokens = Math.min(limit.burst, current.tokens + elapsed * refillPerMs);

  if (tokens < 1) {
    // How long until the next whole token. Rounded UP: a Retry-After that is
    // a fraction short sends a well-behaved client straight back into a
    // refusal, which teaches it to ignore the header.
    const retryAfter = Math.max(1, Math.ceil((1 - tokens) / refillPerMs / 1000));
    return {
      decision: { allowed: false, remaining: 0, retryAfter },
      // `updatedAt` still advances: a refused request must not be able to
      // rewind the clock and hand the caller free refill on the next one.
      bucket: { tokens, updatedAt: now },
    };
  }

  return {
    decision: { allowed: true, remaining: Math.floor(tokens - 1), retryAfter: 0 },
    bucket: { tokens: tokens - 1, updatedAt: now },
  };
}

/**
 * The limits, by what the endpoint costs and what abusing it buys.
 *
 * Not one number for everything: signing in is where credentials get guessed,
 * a widget message is unauthenticated and reaches the database, and a drafting
 * call costs real money at a model provider. A single global limit would be
 * either too loose for the first or too tight for ordinary work.
 */
export const LIMITS = {
  /** Sign in, register, password reset. Tight — this is the guessing surface. */
  auth: { burst: 10, perMinute: 5 },
  /** The public chat widget. Unauthenticated and reaches the database. */
  widget: { burst: 30, perMinute: 20 },
  /** Provider webhooks. Generous: a busy Telegram bot is legitimately noisy. */
  webhook: { burst: 120, perMinute: 300 },
  /** A model call, which costs money per request. */
  ai: { burst: 5, perMinute: 10 },
  /** Everything else a signed-in console does. */
  api: { burst: 120, perMinute: 240 },
} as const satisfies Record<string, Limit>;

export type LimitName = keyof typeof LIMITS;

/** Which limit a path falls under. Order matters: first match wins. */
export function limitFor(pathname: string): LimitName | null {
  if (pathname.startsWith("/api/auth/")) return "auth";
  if (pathname.startsWith("/api/channels/web/")) return "widget";
  if (pathname.startsWith("/api/webhooks/")) return "webhook";
  if (pathname.endsWith("/draft")) return "ai";
  if (pathname.startsWith("/api/")) return "api";
  // Pages, static assets and everything else: not limited here. Throttling a
  // stylesheet costs a real user their page and stops no attack.
  return null;
}

/**
 * The client's address, as far as it can be trusted.
 *
 * `X-Forwarded-For` is `client, proxy1, proxy2…` and a caller can PREPEND
 * whatever it likes — Cloud Run appends the address it actually saw rather
 * than replacing the header. So the **last** entry is the one added by the
 * platform, and the only one a client cannot forge. Taking the first, which is
 * the common advice, would let anyone rotate their own rate-limit key by
 * inventing a new header value per request.
 */
export function clientKey(forwardedFor: string | null, fallback = "unknown"): string {
  if (!forwardedFor) return fallback;
  const parts = forwardedFor
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : fallback;
}

/**
 * A bounded in-memory store.
 *
 * **Per instance, and that is a stated limitation rather than an oversight.**
 * Cloud Run runs several instances under load, so the effective limit is the
 * configured one times the instance count. That is still a hard ceiling where
 * there was none, it needs no Redis to stand up, and moving to a shared store
 * changes only this class — `consume` above is already pure.
 *
 * The cap is what stops the limiter becoming its own denial of service: an
 * attacker rotating addresses would otherwise grow this map until the
 * container dies.
 */
export class MemoryBuckets {
  private readonly map = new Map<string, Bucket>();

  constructor(private readonly maxKeys = 10_000) {}

  check(key: string, limit: Limit, now: number): Decision {
    const { decision, bucket } = consume(this.map.get(key), limit, now);
    if (this.map.size >= this.maxKeys && !this.map.has(key)) {
      // Evict the least recently touched. Cheaper than a full LRU and correct
      // enough: the oldest bucket is the one least likely to be mid-burst.
      let oldestKey: string | null = null;
      let oldest = Infinity;
      for (const [k, b] of this.map) {
        if (b.updatedAt < oldest) {
          oldest = b.updatedAt;
          oldestKey = k;
        }
      }
      if (oldestKey) this.map.delete(oldestKey);
    }
    this.map.set(key, bucket);
    return decision;
  }

  /** Drop buckets that have refilled completely — they carry no information. */
  sweep(limit: Limit, now: number): void {
    const fullAfterMs = (limit.burst / limit.perMinute) * 60_000;
    for (const [k, b] of this.map) {
      if (now - b.updatedAt > fullAfterMs) this.map.delete(k);
    }
  }

  get size(): number {
    return this.map.size;
  }
}
