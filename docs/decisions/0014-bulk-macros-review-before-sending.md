# ADR 0014 — Bulk macros: the review is the feature, not the send

- **Status:** Accepted
- **Date:** 2026-08-16
- **Context:** An outage, a delayed shipment, a public holiday. Forty people
  ask the same thing and all of them deserve an answer now rather than in the
  order somebody can type. Applying one macro to a whole selection is the
  obvious fix — and it is the most dangerous button in the product.

## What makes it dangerous is specific

A single-ticket macro fills a composer. The agent reads the text, edits it,
then sends. **In bulk there is no composer.** Nothing stands between choosing
a macro from a dropdown and text arriving on forty strangers' phones.

That is not a hypothetical: the natural implementation is one `POST` that
renders and sends, and it would be shorter than this one.

## Three safeguards, each closing a specific way it goes wrong

### 1. Preview is a separate, non-mutating call — and commit is opt-IN

`POST /api/tickets/bulk/macro` previews unless the body carries
`commit: true`. A caller that forgets the flag previews; the opposite default
would mean a caller that forgets it messages everybody. The preview path
returns before any write, so it cannot deliver by accident, and the drive
asserts that against the database: zero outbound rows and zero status changes
after previewing seven tickets.

### 2. The preview groups by LANGUAGE

This is the part that is not obvious, and it is the reason this ADR exists.

A macro renders in each ticket's own language (ADR 0007). So **one button
sends several different texts**, and the agent pressing it reads at most one
of them fluently. A count alone — "6 customers" — hides exactly the thing
they cannot check.

The preview therefore shows one group per language actually used, with its
size and a **real rendered sample**: placeholders already filled, so it is
literally what somebody receives, not the template with `{{customer.name}}`
in it.

**A fallback is named by the language the customer WROTE in, not the one they
are about to receive.** The first version printed the group's own language —
"1 of them have no English text" about the person being *given* English. That
is false, and worse, useless: what an agent would act on is *write a Somali
body*. Caught by looking at the rendered screen, not by any test that passed.

### 3. Undeliverable tickets are named, not skipped

A walk-in or a logged phone call has no channel to reply on. Dropping those
silently would report "6 sent" when 5 went out. They are listed before the
send and excluded from the count on the button.

## A partial send is reported as a partial send

Delivery is **sequential, not `Promise.all`** — forty simultaneous requests to
a third-party channel API is how a rate limit turns a partial success into an
unpredictable one. Slower and reportable beats faster and ambiguous.

And the macro's status is applied **per ticket, after that ticket's own
delivery succeeded**. Applying it to the whole batch up front would mark a
customer's ticket resolved on the strength of a message they never received —
which is worse than not sending, because it also hides them from the queue.

The drive proves this with a Telegram ticket whose channel is not connected:
5 delivered and resolved, 1 failed, named in the result and left `NEW`.

## The cap is 50, not 100

Other bulk actions allow 100. Re-prioritising 100 tickets is reversible;
messaging 100 customers is not.

## Verified

23 browser checks against the production standalone build, driven through the
real console: that previewing sends nothing and changes no status, that the
groups and their counts are right across a mixed English/Amharic/Somali
selection, that the Amharic customer receives the Amharic text, that no
placeholder reaches a customer, that a foreign workspace's ticket id is not in
the batch, that the failure is reported and its ticket not resolved, that the
undeliverable walk-in is left alone, and that a read-only auditor gets 403.

## Not built, deliberately

**No scheduling, and no undo.** An undo that only stops the un-sent remainder
would be a button that promises more than it does. If this needs to become
reversible the honest version is a queued send with a visible delay before the
first message leaves — a different feature, not a flag on this one.
