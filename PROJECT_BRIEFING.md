# Olink Desk — Session Briefing
> Last updated: 2026-08-14 — full channel parity with Bank Assist (all 7 adapters) + USSD built; six languages incl. Swahili; CI on every push (ADRs 0002, 0003).

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
| CI | **`.github/workflows/ci.yml` on every push**: typecheck + build + full test suite against a Postgres 16 service container. Green CI is the verification — no manual local run required. `turbo.json#globalEnv` must list `DATABASE_URL`/`CHANNEL_CONFIG_KEY` (Turbo v2 strict env mode strips undeclared vars) |
| Domain model | Prisma schema v1 + Conversation model (channel-side identity, ADR 0002); Channel enum covers all 8 channels incl. USSD; no migrations generated yet (first `prisma migrate dev` happens when a real DB exists) |
| Channels | **Full Bank Assist parity + USSD (ADRs 0002, 0003).** `packages/channels`: shared `channelReply()` spine, honest catalogue (8 entries, none `planned`), sealed credentials (AES-256-GCM, `CHANNEL_CONFIG_KEY`), constant-time secrets. **Implemented + tested: web, Telegram, Viber, WhatsApp/Messenger/Instagram (one Meta module), SMS (aggregator contract), USSD (synchronous CON/END sessions)** |
| i18n | `packages/i18n`: **six languages (en/am/om/ti/so/sw)**, interpolating `t()`, rules-first `detectLanguage()`, TSV review export. All non-EN strings are drafts pending native review (`packages/i18n/review/strings.tsv`) |
| Tests | 82 passing (vitest): per-adapter contract tests, webhook idempotency, tenant-isolation guard, language parity, signature/crypto fail-closed |
| API routes | Webhooks: `telegram`, `viber`, `meta` (GET handshake + POST), `sms`, `ussd` per-org; web channel POST; admin-guarded catalogue GET, telegram/viber connect, `PUT /api/orgs/[org]/channels/[kind]` credential store (interim `DESK_ADMIN_SECRET` guard until the auth port) |
| Docs | OKM skeleton + market analysis + ADRs 0001–0003 |
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
