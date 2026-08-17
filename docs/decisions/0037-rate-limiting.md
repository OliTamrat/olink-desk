# ADR 0037 — Rate limiting, in middleware

- **Status:** Accepted
- **Date:** 2026-08-17
- **Context:** A security review of the running product found **no rate
  limiting anywhere** — not on sign-in, not on the public widget, not on
  webhooks. A single script could hammer any endpoint. This was the most urgent
  of the gaps found and the cheapest to close.

## Middleware, not per-route

A limiter added route by route protects the routes somebody remembered. **The
next endpoint anyone adds is unprotected by default**, and nobody notices until
it is the one being hammered.

In middleware, every request passes through and `limitFor(pathname)` decides —
so a route added tomorrow is covered the moment it exists. That is the whole
argument, and it is why this is not five decorators.

## A token bucket, not a fixed window

A fixed window lets a caller spend its entire allowance in the last second of
one window and again in the first second of the next: **twice the intended rate
at the worst possible moment**. A bucket refills continuously, so a burst is
allowed once and then paid for.

Two details that are easy to get wrong and are tested:

- **A refused request still advances the clock.** Otherwise a caller being
  throttled accumulates elapsed time it never spends, and its next allowed
  request arrives with a full bucket — free burst for the one caller you are
  trying to slow down.
- **`Retry-After` is rounded up.** A value a fraction short sends an obedient
  client straight back into a refusal, which teaches it to ignore the header.
  The test waits exactly the advertised time and asserts it succeeds.

## Five limits, because one number cannot be right

Signing in is where credentials get guessed. The widget is unauthenticated and
reaches the database. A webhook from a busy Telegram bot is legitimately noisy.
A drafting call costs real money at a model provider. One global number would
be either too loose for the first or too tight for ordinary work.

| Limit | Burst | Per minute | Why |
|---|---|---|---|
| `auth` | 10 | 5 | The guessing surface |
| `widget` | 30 | 20 | Unauthenticated, hits the database |
| `webhook` | 120 | 300 | A busy bot is not an attack |
| `ai` | 5 | 10 | Each call costs money |
| `api` | 120 | 240 | Ordinary console work |

Pages and static assets are **not** limited. Throttling a stylesheet costs a
real user their page and stops no attack.

## The client key takes the LAST forwarded address

`X-Forwarded-For` is `client, proxy1, proxy2…` and **a caller can prepend
whatever it likes** — Cloud Run appends the address it actually saw rather than
replacing the header. So the last entry is the one the platform added, and the
only one a client cannot forge.

Taking the first, which is the common advice, would let anyone rotate their own
rate-limit key by inventing a header value per request — a limiter that limits
nobody. Driven for real: a request whose first entry is spoofed still lands in
the same bucket and still gets a 429.

Keys are scoped by limit **and** caller, so spending the auth allowance does not
throttle that person's ordinary console traffic, and a shared office NAT cannot
have one user's failed logins stop everyone else working.

## What this is not

**Per instance.** Cloud Run runs several under load, so the effective ceiling is
the configured limit times the instance count. That is still a hard ceiling
where there was none, it needs no Redis, and `consume` is pure — moving to a
shared store changes the store and nothing else.

**Not a defence against a distributed attack** from thousands of addresses.
That needs Cloud Armor in front, which is infrastructure rather than code.
Written in the file itself so nobody reads it and concludes the problem is
solved.

The store is **bounded** (10,000 keys, oldest evicted). Unbounded, an attacker
rotating addresses would grow it until the container died — the limiter
becoming its own denial of service.

## Verified

19 unit tests on the arithmetic. Driven against the production standalone
build: 15 rapid sign-in attempts returned `401 ×10` then `429 ×5`; the refusal
carried `Retry-After: 12`, `X-RateLimit-*` and `Cache-Control: no-store`; a
different address was unaffected; and **a spoofed leading `X-Forwarded-For`
entry did not get a fresh bucket**.
