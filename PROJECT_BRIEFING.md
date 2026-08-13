# Olink Desk — Session Briefing
> Last updated: 2026-08-13 — repository founded; scaffold + domain model committed.

Read `PROJECT_GUIDELINES.md` for standing rules (IP/attribution, invariants).
The founding market analysis is
`docs/business/ETHIOPIA_SUPPORT_CALL_TRACKING_MARKET_ANALYSIS.md` — read it
before making product decisions; it carries the Ethiopia-specific constraints
(channels, payments, regulation, pricing) with confidence flags.

## What Olink Desk is

Standalone multi-tenant customer-support / task / call-tracking SaaS for the
Ethiopian market (with on-prem option). Launches alongside Onekof PM
(~3 months out) as Onekof's own live support desk, then sells to anyone:
fintech/banks/MFIs, ride-hailing/delivery, BPOs, government service desks,
utilities. Decision record: standalone repo, NOT an Onekof fork or module —
see `docs/decisions/0001`.

## Current status (2026-08-13 — day one)

| Area | Status |
|---|---|
| Repository | Scaffolded: monorepo (pnpm + turbo), apps/web, packages/database |
| Domain model | Prisma schema v1: Organization, User, Contact, Ticket, TicketMessage, CallLog, Task, Queue, SlaPolicy, DispositionCode, AuditLog |
| Docs | OKM skeleton + founding market analysis + ADR 0001 |
| GitHub | **Repo `OliTamrat/olink-desk` must be created by founder** (integration cannot create repos); push pending |
| Dependencies | NOT yet installed/built — first `pnpm install` + `pnpm build` verification is the next engineering step |
| Everything else | Not started |

## Build plan (3 months, aligned to Onekof launch)

**Month 1 — engineering:** auth (port Onekof bcrypt/JWT/lockout pattern),
tenant-isolation middleware + guard tests, ticket/contact/task CRUD + agent
console, web channel (widget + hosted form), Telegram bot MVP (per-tenant bot
tokens, webhook fan-in), call logging UX.

**Month 1 — founder:** create GitHub repo; ECA written inquiry + class-license
application (Call Center vs VAS — 35,000 ETB/yr); Chapa merchant onboarding and
first-hand verification of recurring-billing mechanics; startup-labeling
application (Proclamation 1396/2025); SMS aggregator quotes (AfroMessage
first).

**Month 2:** SMS integration (send + CSAT), SLA engine + Ethiopian
business-hours/holidays, supervisor console + wallboard, analytics v1, billing
(Chapa + Telebirr + invoice mode, ported from Olink Dispatch subscription
architecture), AM/EN locales complete. Pilot recruitment: 3–5 design partners
(one ride-hailing/delivery, one MFI/fintech, one BPO) + internal Olink/DAPS
desks.

**Month 3:** hardening, audit logging, OM/TI/SO locales, CDR import, on-prem
Docker build, INSA readiness pack (reuse Onekof P1–P6 baseline), low-bandwidth
load/perf. Dogfood as the live Onekof support desk. Launch.

## What ports from the fleet (copy the module, keep the tests)

| From | What |
|---|---|
| onekof-platform | auth/RBAC + lockout, tenant middleware + guard tests, i18n framework + 5 locales + Abyssinica SIL, audit logging, residency/tier gating (`residency.ts` pattern), single-image Docker pipeline |
| olink-dispatch | subscription lifecycle (status/period-end/enforcement, idempotent renewal webhook, expiry cron, renewal walls), approval-queue UX patterns, cron-secret pattern (`hmac.compare_digest`, fail closed) |

## Known gotchas inherited from the fleet (do not relearn these)

- `AuditLog.entityId` is TEXT — always pass `String(uuid)`, never a raw UUID.
- Idempotent webhooks: claim the event id in the same transaction as side
  effects, before them.
- Notification/email failure must never fail a webhook (retry storms).
- pgBouncer transaction mode: no SAVEPOINTs; per-operation try/commit.
- FormData uploads: never set `Content-Type: application/json` manually.

## Open decisions

1. Domain name (olinkdesk.com / .et — check availability; olinkgo.us pattern
   exists in the fleet).
2. Bundle IDs when mobile ships (fleet pattern: `us.olinkgo.*`).
3. Whether ECA license is Call Center, VAS, or unnecessary — pending directive
   full text + written inquiry (market analysis §5.5, §10).
