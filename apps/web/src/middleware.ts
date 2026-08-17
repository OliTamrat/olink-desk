// Rate limiting, in one place.
//
// Middleware rather than per-route, for a reason that matters more than tidiness:
// a limiter added route by route protects the routes somebody remembered. The
// next endpoint anyone adds is unprotected by default, and nobody notices until
// it is the one being hammered. Here every request passes through, and
// `limitFor` decides — so a new route is covered the moment it exists.
//
// **What this is and is not.** It is a hard ceiling where there was none, it
// needs no Redis, and it stops the flood that makes credential guessing worth
// attempting. It is NOT a defence against a distributed attack from thousands
// of addresses — that needs Cloud Armor in front, which is infrastructure
// rather than code. Stated so nobody reads this file and concludes the problem
// is solved.
import { clientKey, limitFor, LIMITS, MemoryBuckets } from "@olink-desk/auth";
import { NextResponse, type NextRequest } from "next/server";

// Per instance. Cloud Run runs several under load, so the effective ceiling is
// this times the instance count — still a ceiling, and the arithmetic in
// `consume` is pure, so moving to a shared store changes only the store.
const buckets = new MemoryBuckets();

// Swept on a timer rather than per request: a sweep walks every key, and doing
// that on the hot path would make the limiter the slow thing about a fast
// endpoint.
const SWEEP_MS = 5 * 60_000;
let lastSweep = 0;

export function middleware(req: NextRequest) {
  const name = limitFor(req.nextUrl.pathname);
  if (!name) return NextResponse.next();

  const limit = LIMITS[name];
  const now = Date.now();

  if (now - lastSweep > SWEEP_MS) {
    lastSweep = now;
    buckets.sweep(limit, now);
  }

  // Keyed by limit AND caller, so spending the auth allowance does not also
  // throttle that person's ordinary console traffic — and so a shared office
  // NAT cannot have one user's login attempts stop everyone else working.
  const key = `${name}:${clientKey(req.headers.get("x-forwarded-for"))}`;
  const decision = buckets.check(key, limit, now);

  if (!decision.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down and try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(decision.retryAfter),
          "X-RateLimit-Limit": String(limit.perMinute),
          "X-RateLimit-Remaining": "0",
          // A throttled response must never be cached and served to somebody
          // else — a shared cache would turn one caller's 429 into everyone's.
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const res = NextResponse.next();
  res.headers.set("X-RateLimit-Limit", String(limit.perMinute));
  res.headers.set("X-RateLimit-Remaining", String(decision.remaining));
  return res;
}

export const config = {
  // Only the API. Pages and static assets are excluded deliberately:
  // throttling a stylesheet costs a real user their page and stops no attack,
  // and Next serves a lot of them per navigation.
  matcher: ["/api/:path*"],
};
