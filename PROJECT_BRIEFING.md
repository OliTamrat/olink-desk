# Olink Desk — Session Briefing
> Last updated: 2026-08-15 — Staging is LIVE on Cloud Run. Console slice 1 shipped: /login + /channels with the paste-a-token Telegram connect and a self-diagnosing status card (ADR 0005). Next slice: inbox + ticket timeline.

## Staging (live)

- **Service URL:** `https://olink-desk-894460273330.us-east1.run.app`
  (APP_BASE_URL alias: `https://olink-desk-dadh353x6a-ue.a.run.app`)
- GCP project `olink-desk` (dedicated, Olink billing), region `us-east1`,
  deployer/runtime SA split, secrets in Secret Manager, Supabase Postgres.
- `GET /api/health` answers "is main actually live?" in one request; the
  deploy pipeline fails its run if this is not green (smoke gate).
- Demo tenant: org slug `demo` (Olink Demo), admin `olitamrat@gmail.com`.
- **Connecting Telegram is a screen, not a script:** sign in → Channels →
  paste the BotFather token → Connect. The card shows token validity,
  webhook registration and Telegram's last delivery error live (ADR 0005).
  If the token is ever revoked in BotFather, paste the new one there.

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
| Auth | `packages/auth` — Onekof pattern ported: bcrypt (bcryptjs, cost 12), progressive lockout (5 free attempts, doubling lock, 60m cap), stateless HS256 JWT sessions (`JWT_SECRET` fails closed), org registration (first user = ACTIVE ADMIN). Routes: register/login/logout/me. `requireUser()` guard scopes every staff route by the SESSION's organizationId, re-reading the user row per request so disable/role changes bite immediately |
| Outbound replies | `sendAgentReply()` in packages/channels: delivers on the ticket's own channel (Telegram/Viber/WhatsApp/Messenger/Instagram/SMS; WEB = recorded + widget polls `GET /api/channels/web/[org]/messages`; USSD/PHONE/EMAIL/WALK_IN refuse — no transport). Records OUTBOUND only when the channel accepted; sets firstRespondedAt; NEW→OPEN |
| Migrations | Real Prisma migrations from `init` (20260815022918); CI applies the chain to an empty DB every run (`migrate deploy`, no more db push) |
| Deploy | `deploy.yml` — Bank Assist pattern: fires off CI-green on main; skips cleanly until `GCP_SA_KEY`/`GCP_PROJECT_ID` exist. **Founder runbook: `docs/runbooks/gcp-staging-setup.md`** (dedicated GCP project on the Olink billing account, deployer/runtime SA split, Secret Manager). Dockerfile = Next standalone on node:20-slim, port 8080, cloud-agnostic (ADR 0004) |
| Tests | 119 passing (12 auth + 82 channels + 15 i18n + 10 sla — the CI run is the exact count) |
| Console | **Slice 1 live:** `/login` + `/channels` — Telegram paste-token connect card with live self-diagnosis (`GET …/channels/telegram/status`: getMe + getWebhookInfo, token never returned). Org admin routes take session auth (ADMIN of the URL's org); `x-desk-admin` kept as the automation door (ADR 0005). Console chrome strings: `ui_strings.json` + `tUi()`, six languages, own review TSV |
| SLA | `packages/sla` — business-hours clock (Mon–Sat 08:30–17:30 Africa/Addis_Ababa, Ethiopian holidays, fixed-offset arithmetic), per-priority policies seeded lazily (URGENT 15m/4h … LOW 1bd/5bd). Clocks stored at ticket creation, recomputed on re-prioritize. **Breach derived at read time** — no cron in the truth path (ADR 0006) |
| Lifecycle | `PATCH /api/tickets/[id]` — status/priority/assignee/queue with per-change audit; resolution stamps set on entry, cleared on reopen. Queues + staff-roster APIs |
| Workspace | **v2 (the global platforms agent-console shape).** Two sidebar layers: app nav + a contextual panel holding **views with live counts**. The list is a **sortable table** (status/subject/requester/channel/requested/priority/assignee) with row checkboxes and a **bulk action bar** (assign-to-me, status, priority — priority recomputes each ticket's SLA from its own creation). Opening a ticket gives it the whole width in **three columns**: properties (assignee + take-it, status, priority, queue) · conversation · customer + **interaction history**. The composer toggles **Public reply / Internal note**; a NOTE is stored staff-only and never touches a channel — a browser test asserts it cannot appear in the customer widget. `/inbox` is the agent workspace, benchmarked against a live the global platforms console (ADR 0006): saved-views rail (My work / Unassigned / All open / Recently solved / Everything), header count + search (ticket number, subject, customer, message text), Status/Channel/Assignee filters, per-view empty states, and a customer+ticket context rail. Tickets carry a **subject** from the customer's first words so a list row identifies the ticket instead of repeating the auto-ack. Panes fill the viewport and scroll internally; views collapse to a select under 1400px, the context rail under 1120px, one pane under 820px |
| Wallboard | `/wallboard` (SUPERVISOR/ADMIN/AUDITOR): totals, per-queue open/unassigned/at-risk/breached/oldest-wait, agent load, today's medians. 10s poll |
| Docs | OKM skeleton + market analysis + ADRs 0001–0006 (0006 = industry benchmark + desktop-first decision + SLA model) |
| Next slice | ~~Inbox + timeline + reply~~ **shipped in console v2** (dark token design system, shell, /dashboard KPIs, /inbox two-pane with reply-on-channel). Then: remaining channel-connect screens (Viber/Meta/SMS/USSD, web embed); then Phase 3 (SLA, queues, wallboard). Known i18n gap: catalogue names/blurbs are English-only literals (pre-existing, tracked in ADR 0005) |

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
