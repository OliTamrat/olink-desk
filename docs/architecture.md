# Olink Desk — architecture

## Shape

pnpm + turbo monorepo, mirroring Onekof's conventions so ported modules drop
in:

```
apps/web/            Next.js 14 App Router — agent console, supervisor console, admin
packages/database/   Prisma schema + generated client (@olink-desk/database)
```

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

## Channel architecture (build order)

1. **Web** (widget + hosted form) — simplest, always available.
2. **Telegram** — per-tenant bot token, one webhook fan-in endpoint that
   resolves token → tenant; inline-button CSAT.
3. **Phone** — no telephony: click-to-log capture UI (<15s), callback queues,
   missed-call follow-up tasks; CDR CSV/API import matches calls to tickets
   after the fact.
4. **SMS** — one `SmsProvider` interface, adapters per aggregator
   (AfroMessage, GeezSMS, FalconVAS). Outbound notifications + CSAT first;
   inbound/shortcodes are enterprise add-ons.
5. **Email**, **WhatsApp BSP**, **USSD** — later phases; same Ticket object.

Channel adapters normalize into TicketMessage; nothing downstream knows which
channel a message came from except by its enum tag.

## Resilience requirements (design inputs, not features)

- Console is a low-bandwidth PWA: queue agent actions locally, sync on
  reconnect; payload budget measured in CI later.
- SMS/voice channels keep working through data shutdowns; the product must
  degrade to call-log-only mode gracefully.
- On-prem tier runs on a LAN with no internet.

## What is deliberately NOT here

- No voice carriage (SIP/PBX) — ADR 0001 and PROJECT_GUIDELINES invariant.
- No CRM pipeline, no social listening — later phases or partners.
