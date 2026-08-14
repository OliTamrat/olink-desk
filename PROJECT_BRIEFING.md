# Olink Desk — Session Briefing
> Last updated: 2026-08-14 — Bank Assist channel framework ported; Telegram + web channels live in code (ADR 0002).

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

## Current status (2026-08-14)

| Area | Status |
|---|---|
| Repository | Monorepo (pnpm + turbo): apps/web, packages/database, packages/channels, packages/i18n. `pnpm install` + `pnpm build` verified green |
| Domain model | Prisma schema v1 + Conversation model (channel-side identity, ADR 0002); Channel enum covers all 7 channels; no migrations generated yet (first `prisma migrate dev` happens when a real DB exists) |
| Channels | **Framework ported from Bank Assist (ADR 0002).** `packages/channels`: shared `channelReply()` spine, honest catalogue, sealed credentials (AES-256-GCM, `CHANNEL_CONFIG_KEY`), constant-time secrets. **Telegram + web adapters implemented and tested**; Viber/Meta/SMS are `planned` catalogue entries with reference implementations finished in Bank Assist |
| i18n | `packages/i18n`: 5-language tables (en/am/om/ti/so), interpolating `t()`, rules-first `detectLanguage()`, TSV review export. AM/OM/TI/SO strings are drafts pending native review (`packages/i18n/review/strings.tsv`) |
| Tests | 44 passing (vitest): adapter contract, webhook idempotency, tenant-isolation guard, language parity. DB tests run against local Postgres via `prisma db push` + `DATABASE_URL` + `CHANNEL_CONFIG_KEY` |
| API routes | `POST /api/webhooks/telegram/[org]`, `POST /api/channels/web/[org]`, admin-guarded `GET /api/orgs/[org]/channels` + `POST .../channels/telegram/connect` (interim `DESK_ADMIN_SECRET` guard until the auth port) |
| Docs | OKM skeleton + market analysis + ADR 0001 + ADR 0002 |
| Everything else | Not started (auth port, agent console, CRUD UI, SLA, billing) |

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
