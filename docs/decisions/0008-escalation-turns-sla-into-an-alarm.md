# ADR 0008 — Escalation turns the SLA from a number into an alarm

- **Status:** Accepted
- **Date:** 2026-08-16
- **Context:** First slice taken under full product ownership. Chosen over
  more Zendesk feature parity because it closes an architectural hole in a
  feature already shipped, rather than adding a new one.

## The hole

ADR 0006 built the SLA engine and was right that breach must be **derived at
read time** so no cron can make the numbers stale. What it did not say is
that derivation alone tells nobody anything.

The breach logic lived **inside the wallboard route**. So the only thing in
the product that knew a promise had been missed was a screen a human had to
be looking at. A ticket that breached at 2am breached silently, and the desk
found out whenever somebody next opened a tab. An SLA nobody is told about is
not a promise; it is a column.

That is a half-built feature, not a missing feature — which is why it ranked
above tags, CSAT and the rest of the Zendesk list.

## Decision

Three parts, in the order they depend on each other.

**1. One place decides what "breached" means.** `packages/sla/src/state.ts`
holds `slaState()`, pure, with `now` passed in. The wallboard now reads it
instead of its own inline copy. Two consumers computing breach separately
would eventually disagree, and the one that disagreed quietly would be the
alarm.

The first-response clock takes precedence while unmet: a desk that has not
spoken to the customer at all is in worse trouble than one that is late
finishing, and showing the resolve clock first hides that.

**2. What deserves an alarm is a pure function, not route code.**
`escalationsFor()` in `packages/sla/src/escalation.ts`. Three rules, each
arguable and each tested:

- *A breach outranks a warning.* A ticket past due yields only the breach.
  Emitting both would make every breach arrive twice, which is how people
  learn to ignore notifications.
- *An SLA problem outranks an ownership problem.* Late needs action now; who
  owns it is a detail of how that action happens.
- *Alarms follow the owner and fall back to everyone.* An assigned ticket's
  alarm is addressed to its assignee. An unowned one is addressed to **nobody**
  — `userId: null` is not "no recipient", it is "the workspace", and
  addressing it to an individual would hide a ticket nobody owns behind one
  person's list.

**3. The record is what makes it idempotent.** `Notification` carries
`@@unique([ticketId, kind])`. The cron does not remember what it has already
raised; the constraint does, via `createMany({ skipDuplicates: true })`. A
pass every five minutes therefore cannot tell a supervisor the same thing
twelve times an hour, and the schedule can be tightened without touching the
code. Deliberately no second dedupe layer in `escalationsFor` — two
mechanisms answering one question eventually give two answers.

## What stays true from ADR 0006

**The cron is not in the truth path.** The wallboard and the ticket rail still
derive health live. If the schedule stops firing, the product degrades to
"nobody is told" — never to "the numbers are wrong". That is the whole reason
the derivation was not moved into stored state.

## Security

`/api/cron/escalate` is the only unauthenticated surface in the product and
it crosses tenants, so it is the one that deserved the most care:

- **`X-Cron-Secret`, compared constant-time, failing closed.** An unset secret
  rejects everything. The tempting alternative — allow it when unconfigured —
  turns a deploy mistake into an open endpoint, and fails in the direction
  where nobody finds out. Ported verbatim from Bank Assist's
  `_require_cron_secret`.
- **A signed-in admin session does NOT open it.** It is machine-only; a human
  credential must never be a second door into a cross-tenant route.
- Rows are grouped back to a tenant by **the ticket's own organizationId**,
  never by anything a caller said.

Drive-tested against no header, an empty secret, a wrong secret, a prefix, the
secret plus a byte, and an admin session — all 403.

## Two bugs, and what caught each

**The panel hung off the edge of the screen.** Right-anchored to a bell inside
a 220px sidebar, a 320px panel is simply clipped. A scroll-overflow check —
which every previous screen in this product was verified with — **cannot see
it**: content clipped at negative x adds no `scrollWidth`. The screenshot
caught it. The check is now the panel's own bounding box against the viewport.

**The fix was then wrong on mobile**, and the new check caught that on the
next run: the bell is not the rightmost control in the phone header, so a
bell-anchored panel still ran off (`left: -134`). On a phone it spans the
viewport instead, which is what a phone wanted anyway.

The transferable part: *a check that has passed on every screen so far can
still be the wrong check.* Overflow was the right question for a wide table
and the wrong question for a floating panel.

## Verified

14 browser checks against the production standalone build, including a
genuinely expiring promise — the desk is set to 24/7 with a one-minute
first-response target and the script waits for the real due date to pass,
because editing the database would test my SQL and mocking the clock would
test the mock.

## Not in this slice

**Email and push delivery.** The notification record is the substrate; sending
it somewhere is a separate change needing a Resend key, and the sandbox cannot
reach Resend — shipping an unverifiable delivery path alongside a verified one
would put both beyond proof. In-app is honest on its own: an agent working the
desk has the console open.

**Scheduling.** Cloud Scheduler must be pointed at `POST /api/cron/escalate`
with the `X-Cron-Secret` header, and `CRON_SECRET` set in Secret Manager.
Until then the endpoint is correct and dormant — the same posture Bank Assist
took with its expiry cron.
