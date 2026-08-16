# ADR 0017 — Email arrives by forwarding, not OAuth

- **Status:** Accepted
- **Date:** 2026-08-16
- **Decision by:** the founder, 2026-08-16, on a recommendation with the
  tradeoff stated.

## The choice

Two ways to turn a tenant's support mailbox into tickets:

1. **Gmail OAuth**, as olink-dispatch does. No third-party bill.
2. **A forwarding address** into an inbound-parse service (Postmark, Mailgun,
   SendGrid, Cloudflare Email Routing) that POSTs the parsed mail to us.

**Forwarding.** OAuth requires Google Workspace, and Workspace penetration
among Ethiopian SMEs is low — it would gate every tenant behind an account
most of them do not have. That is not hypothetical: olink-dispatch's second
tenant sat blocked for months on exactly this. A forwarding address does not
care what mail system the customer runs.

## A contract, not an integration

There is no one email API, so `email.ts` defines a shape and accepts what
vendors actually send: `from` / `From` / `FromFull`, `text` / `TextBody` /
`stripped-text` / `body-plain`. **Generous on the way in, strict on
authentication** — field names differ per vendor, credentials do not. The
webhook secret is compared constant-time and fails closed, and an
unconfigured tenant accepts nothing.

Same posture as SMS (ADR 0003): the blocker for a channel is procurement, and
a contract lets the tenant bring whichever supplier they can actually sign
with.

## Threading is the subject token

Outbound mail carries `[#123]`. Every mail client on earth preserves the
subject through a reply, which makes it the one signal that works everywhere —
better than `In-Reply-To` in practice, because a customer who composes a fresh
message quoting the old subject still lands correctly.

It is scoped to the sender's own conversation, so a number lifted from
somebody else's email reaches nothing: a stranger quoting `[#42]` gets their
own ticket, which the drive asserts.

**A reply to a RESOLVED ticket reopens it.** Opening a fresh one would hand an
agent a message with no visible history and make the customer explain
themselves twice.

**The acknowledgement had to carry the token too**, and did not at first. The
very first email a customer ever receives from the desk was the one thing they
could not reply to and have land correctly. Caught by driving it, not by any
test — `channelReply`'s `send` callback now receives the ticket, not just the
text.

## Two refusals that matter more than the happy path

- **An auto-reply is never threaded and never answered.** Getting this wrong
  is not one bad ticket, it is a **mail loop**: our acknowledgement reaches
  their out-of-office, which replies, forever. Checked by the standard headers
  (`Auto-Submitted`, `Precedence`, `X-Autoreply`) and by subject for the
  responders that set none.
- **Everything we decline is still a 200.** A non-2xx tells the inbound
  service to retry, and retrying somebody's out-of-office is the same loop
  from the other direction.

## Quoted history is stripped, but never at the cost of the message

Without stripping, every reply carries the whole thread and every row in the
list previews "On Mon, 16 Aug…". The cut is conservative — only markers that
unambiguously begin quoted text — and **if cutting would leave nothing, the
original is kept.** Losing what somebody wrote is far worse than showing too
much.

## The identity rule changed, and that is the honest part

ADR 0015 said: *a phone number is REQUIRED because it is the identity.* That
was right while every channel was phone-first and **wrong as a universal.** An
email customer has no phone number, and their address is the only durable
identity they have — more durable than a widget session id, which identifies
nobody.

So identity is now **at least one of phone or email**, each unique when
present (Postgres allows many NULLs in a unique index, which is exactly the
semantics wanted). Migration `20260816141500_contact_identity_phone_or_email`.

The payoff is that an email ticket belongs to a **named person from the first
message** — the first channel where that is true.

Two consequences found by driving it:

- `findOrCreateContact` looked up by phone when it had one, so a customer
  already on file **by email** was not found and the create hit the unique
  index. It now matches on **either** identity. That is what lets a customer
  first met by email gain a phone number on the same record instead of a
  second one.
- When both identities are given and they belong to **two different people**,
  it throws rather than choosing: the API answers 409 and the channel spine
  swallows it, so the customer's message still arrives (unidentified) rather
  than being rejected at the webhook. Merging two customers silently is the
  worst thing this table can do.

## Verified

19 unit tests on the parsing (vendor shapes, address case-folding, the
token round-trip, quote stripping in Gmail and Outlook shapes, auto-reply
detection in both directions) and 19 browser/API checks against the production
standalone build, including that it fails closed unconfigured, that a reply
threads rather than duplicating, that a redelivery is a no-op, that an
out-of-office is accepted and acted on by nobody, that an agent's reply leaves
as `Re: … [#n]`, that a stranger quoting a ticket number reaches nothing, and
that one workspace's secret is worthless against another.

## Still needed from the operator, and it is not code

1. An inbound-parse service, pointed at
   `POST /api/webhooks/email/<slug>` with the `X-Email-Secret` header.
2. A **verified sending domain** for replies to come from, or they land in
   spam. Resend is already verified for other products in the fleet and its
   REST shape is what `sendUrl` + `authHeader` expects.
3. Forwarding set on the tenant's support address.

## Not built, deliberately

- **HTML mail.** We take the text part and send plain text. A support reply is
  prose; HTML would add a sanitiser, an XSS surface in the agent console, and
  a second body to keep in step, for formatting nobody has asked for.
- **Attachments.** A customer sending a photo of a damaged parcel is a real
  case, and doing it properly means storage, scanning and retention — a piece
  of work in its own right, not a field on this one.
