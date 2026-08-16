# Olink Desk — architecture

## Shape

pnpm + turbo monorepo, mirroring Onekof's conventions so ported modules drop
in:

```
apps/web/            Next.js 14 App Router — agent console, supervisor console,
                     admin, the customer widget, and every channel webhook
packages/database/   Prisma schema + generated client (@olink-desk/database)
packages/auth/       Password hashing, session tokens, org registration, lockout
packages/channels/   Channel adapters + the shared inbound spine (channelReply)
packages/i18n/       The six-language string tables and language detection
packages/sla/        Business-hours arithmetic and per-priority policies
packages/macros/     Macro rendering — the customer-language pick and placeholders
packages/tickets/    Opening a ticket (numbers + SLA clocks) and customer
                     identity — phone normalisation and find-or-create
packages/csat/       Satisfaction scores: parsing a reply, and when to ask
packages/reports/    The statistics the two reports are built from
packages/retrieval/  BM25 search over the knowledge base, with the gate
```

A package earns its own directory when it holds logic that must be testable
without a browser or a Next request. `apps/web` has no test script by design:
anything worth a unit test belongs in a package.

## Domain model (schema v1 — `packages/database/prisma/schema.prisma`)

- **Organization** — the tenant. Carries subscription state
  (tier/status/periodEnd/interval/enforced — the Olink Dispatch lifecycle) and
  locale defaults.
- **User** — agents/supervisors/admins/auditors, org-scoped, role enum.
- **Contact** — phone-number-first identity (phone is the primary key of
  Ethiopian customer identity); Telegram id, language, consent flags. Unique
  per (organizationId, phone).
- **Ticket** — the center of the product. Channel enum
  (TELEGRAM/PHONE/SMS/WEB/EMAIL/WHATSAPP/WALK_IN), per-org ticket number,
  status/priority, assignee + queue, SLA timers (due/actual for first response
  and resolution), CSAT, merge support.
- **TicketMessage** — the unified timeline: every inbound/outbound
  message/note across channels, one thread per ticket.
- **CallLog** — direction, number, agent, duration, disposition code, outcome,
  optional follow-up Task, optional CDR reference for imported records.
- **Task** — assignee, due date, status; standalone or ticket-linked. The
  Onekof-integration surface (ticket → project task) hangs here later.
- **Queue** — team/routing bucket.
- **SlaPolicy** — first-response/resolve minutes, business-hours JSON
  (Ethiopian holidays, configurable work week), escalation JSON.
- **DispositionCode** — per-tenant call outcome vocabulary.
- **Conversation** — one row per (organization, channel, external user): the
  channel-side identity a webhook can actually see. A Telegram chat id is not
  a Contact — the person's phone is unknown until they share it — so Contact
  linkage is optional and attached later. Tickets thread through this row, and
  its sticky `language` is what a macro renders into.
- **ChannelAccount** — per-tenant channel credentials, encrypted at rest.
- **Macro** — a saved reply carrying one body per language (`bodies` JSONB),
  an optional post-send status, and a usage count. See ADR 0007.
- **AuditLog** — actor, action, entityType, entityId (TEXT — always pass
  `String(uuid)`), metadata JSON. Every agent action writes one.

## Multi-tenancy

Every tenant-data model carries `organizationId` with an index, and every
query filters by it. This is enforced two ways, both mandatory:

1. Data-access helpers take the org context; raw model access from route
   handlers is a review flag.
2. A guard test (ported pattern from Onekof) walks the schema and asserts
   every tenant model has the column + index, and integration tests assert
   cross-tenant reads fail.

## Channel architecture

This was written as a build order; the adapters are now **all built** (ADR
0003), so it reads as a state list. What still needs arranging per tenant is
credentials and business verification, not code.

- **Web** (widget + embed snippet) — always available, nothing to connect.
- **Telegram** — per-tenant bot token pasted in the console; one webhook
  fan-in endpoint resolves token → tenant. Self-serve.
- **Viber** — self-serve, same shape.
- **WhatsApp / Messenger / Instagram** — one adapter (the Meta trio share a
  webhook contract); awaiting each tenant's business verification.
- **SMS** — one provider interface, adapters per aggregator; awaiting an
  aggregator agreement.
- **USSD** — session-per-request over a gateway callback: every reply is a
  complete screen, prefixed CON (session continues) or END (session over).
  There is no async push, so nothing can be promised "later in this chat".
- **Phone** — no telephony: click-to-log capture, callback queues,
  missed-call follow-up tasks; CDR import matches calls to tickets after
  the fact.

**An adapter is transport only.** Everything a message goes through after
arrival — conversation identity, ticket threading, language detection, SLA
clocks, auto-acknowledgement — lives in the shared `channelReply` spine, so a
new channel cannot accidentally get different behaviour. Adapters normalize
into TicketMessage; nothing downstream knows which channel a message came
from except by its enum tag.

## Resilience requirements (design inputs, not features)

- Console is a low-bandwidth PWA: queue agent actions locally, sync on
  reconnect; payload budget measured in CI later.
- SMS/voice channels keep working through data shutdowns; the product must
  degrade to call-log-only mode gracefully.
- On-prem tier runs on a LAN with no internet.

## What is deliberately NOT here

- No voice carriage (SIP/PBX) — ADR 0001 and PROJECT_GUIDELINES invariant.
- No CRM pipeline, no social listening — later phases or partners.
