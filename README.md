# Olink Desk

### Customer Support, Task & Call Tracking for Ethiopian Organizations

**A multi-tenant support desk — omnichannel ticketing, call tracking, and task
management — built for the way Ethiopian organizations actually serve their
customers: Telegram-first, phone-heavy, SMS-fallback, in five languages, billed
in Birr, hosted in-country.**

Built by **Olink Technologies PLC**. Standalone product in the Olink fleet
(alongside Onekof PM, Olink Dispatch, Olink School Bus), sold to any
organization that runs a service desk.

---

## What it does

One place to receive, track, assign, and resolve every customer interaction —
whatever channel it arrives on — and to manage the internal tasks those
interactions create.

1. **Omnichannel ticketing** — Telegram bot, phone call log, SMS, web
   widget/form, email, and walk-in entry all create the same ticket object with
   one unified interaction timeline.
2. **Call tracking** — inbound/outbound call logging with disposition codes,
   callback queues, agent assignment, duration, outcome, and follow-up tasks.
   Calls are carried on the customer's existing lines (GSM, hotline, Ethio
   Telecom CCaaS); Olink Desk is the system of record, not the carrier.
3. **Task tracking** — tickets convert to tasks with assignees, due dates,
   SLAs, and escalation. Non-support teams (operations, field service,
   government service desks) use the same engine for request tracking.

## Why Ethiopia needs it built this way

| Reality | Product answer |
|---|---|
| Telegram beats WhatsApp; banks and Ethio Telecom do support there | First-class Telegram bot per tenant |
| ~15% smartphone penetration — support is phone calls | Call logging + callback queues, 15-second capture |
| No card-on-file payment rail exists (no Stripe/PayPal) | Chapa + Telebirr push-payment billing, invoice renewals, ETB pricing |
| Proclamation 1321/2024 Art. 22 — data stays in Ethiopia | Ethio Telecom ECS / on-prem deployment by default |
| ~30 internet shutdowns 2016–2024 | SMS/voice redundancy, offline-tolerant console, on-prem option |
| Agent wages 6,000–16,000 ETB/mo | Per-agent pricing far below Western norms |
| Amharic, Afaan Oromo, Tigrinya, Somali + English | Full i18n with Ge'ez script, Ethiopian calendar, July fiscal year |

The founding market analysis lives at
`docs/business/ETHIOPIA_SUPPORT_CALL_TRACKING_MARKET_ANALYSIS.md`.

## Stack

- **Web:** Next.js 14 (App Router), TypeScript strict, Tailwind
- **DB:** PostgreSQL 15 + Prisma (multi-tenant: every tenant-data query filters by `organizationId`)
- **Deploy:** single Docker image; Ethio Telecom ECS (Tier 1), on-premise (Tier 2), EU cloud for non-Ethiopian tenants (Tier 3)
- **Channels:** Telegram Bot API, local SMS aggregators (AfroMessage/GeezSMS/FalconVAS adapters), CDR import
- **Billing:** Chapa (primary), Telebirr direct (fallback), proforma invoice (enterprise)

Proven patterns are ported from the Olink fleet rather than reinvented: auth/RBAC
and tenant isolation, i18n infrastructure and reviewed locales, audit logging,
residency gating, and the subscription/renewal-wall architecture. See
`docs/decisions/0001` for why this is a standalone repository and not an Onekof
fork or module.

## Repository map

```
apps/web/            Next.js app (agent console, supervisor console, admin)
packages/database/   Prisma schema + client (the domain model)
docs/                OKM knowledge base: overview, architecture, decisions/, business/
```

## Getting started

```bash
pnpm install
cp .env.example .env      # fill in DATABASE_URL at minimum
pnpm --filter @olink-desk/database prisma:generate
pnpm dev
```

## Rules that don't bend

1. **Multi-tenancy from day one.** Every query touching tenant data filters by
   `organizationId`. Guard tests enforce it.
2. **Never carry voice traffic.** Logging and orchestration only, until an
   explicit licensed-operator agreement exists (see ADR 0001 and the ECA
   licensing section of the market analysis).
3. **No secrets in the repo.** `.env.example` is the template.
4. **Migrations are append-only.** Never edit a committed migration.
5. **Audit everything an agent does.** Structured `AuditLog` writes with actor,
   action, entity, metadata.

---

**License:** Proprietary — Olink Technologies PLC. Do not redistribute.
